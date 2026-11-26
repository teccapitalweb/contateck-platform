// ============================================================
//  CONTATECK · Módulo Ventas y Pagos
//  OT-0014 · Épica 2 — Ya NO usa localStorage.
//  - El vendedor registra la venta (nace en "pendiente") + sube
//    comprobante a Supabase Storage.
//  - Un validador (contador/admin/director, nunca quien la
//    registró) la "Toma para revisión" de forma manual -> "revision".
//  - Desde "revision": Confirmar -> "confirmado" | Rechazar -> "rechazado".
//  Todo el CRUD real vive en el backend (/api/ventas); el archivo
//  se sube directo a Supabase Storage (bucket "documentos").
//
//  OT-0029 · Pulido: datos de usuario escapados (XSS), fecha local,
//  validaciones, rechazo con motivo, póliza ligada a la venta con
//  botón "Generar póliza" para reintentar, KPIs/filtros del mes.
// ============================================================
(function () {
  "use strict";

  // OT-0029: todo dato escrito por una persona se escapa antes de ir a innerHTML.
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const LIMITE_LISTA = 300; // mismo tope que el backend (listarVentas)

  const METODOS = ["SPEI / Transferencia", "Efectivo", "Tarjeta de crédito", "Tarjeta de débito", "Depósito en efectivo", "Otro"];
  const BANCOS = ["BBVA", "Santander", "Banorte", "Citibanamex", "HSBC", "Scotiabank", "Banco Azteca", "Otro"];
  const ESTADOS = {
    pendiente: { txt: "Pendiente", cls: "v-badge--warn" },
    revision: { txt: "En revisión", cls: "v-badge--warn" },
    confirmado: { txt: "Confirmado", cls: "v-badge--ok" },
    rechazado: { txt: "Rechazado", cls: "v-badge--bad" },
    cancelado: { txt: "Cancelado", cls: "v-badge--mute" }, // OT-0072: corregido/anulado por quien lo registró antes de revisión
  };
  const ROLES_VALIDADORES = ["contador", "admin", "director"];
  const ROLES_REGISTRO = ["vendedor", "contador", "admin", "director"]; // OT-0072: mismos que el backend
  // OT-mejoras-ventas: mismo criterio que el backend — admin/director
  // pueden validar su propio registro (excepción a la separación de
  // funciones); "contador" a secas se queda sin esta excepción.
  const ROLES_AUTOVALIDAN = ["admin", "director"];

  // ---------- Backend / sesión ----------
  // OT-0029: ya no hay URL de respaldo a un dominio fijo — si app-config.js no
  // cargó, mejor fallar a la vista que mandar el token a otro servidor.
  function backendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "";
  }
  function authHeaders(conJson) {
    const h = conJson ? { "Content-Type": "application/json" } : {};
    const t = window.CONTATECK_SUPABASE_TOKEN;
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }
  function miPerfil() { return window.CONTATECK_PERFIL_PG || null; }
  function miEmpresa() { return window.CONTATECK_EMPRESA_PG || null; }
  async function esperarPerfil(maxMs = 5000) {
    const start = Date.now();
    while ((!window.CONTATECK_PERFIL_PG || !window.CONTATECK_EMPRESA_PG) && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return window.CONTATECK_PERFIL_PG || null;
  }
  function miId() { const p = miPerfil(); return p ? p.id : null; }
  function miRol() { const p = miPerfil(); return p ? p.rol : null; }
  function esValidador() { return ROLES_VALIDADORES.indexOf(miRol()) !== -1; }
  // OT-0071: el estado contable de las ventas ("sin póliza") no es asunto del vendedor: ni el aviso, ni el filtro, ni la etiqueta.
  function veAvisosContables() { return miRol() !== "vendedor"; }
  function puedeAutovalidar() { return ROLES_AUTOVALIDAN.indexOf(miRol()) !== -1; }

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  // OT-0029: fecha LOCAL (toISOString da la de UTC y después de ~18:00 en México ya es "mañana").
  function hoy() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(f + (f.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d)) return esc(f);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }
  function idCorto(id) { return id ? String(id).slice(0, 8) + "…" : "—"; }

  // ---------- Buscador de Cliente (sugiere de ventas anteriores) ----------
  // No existe un catálogo real de "Clientes" en ningún lado del sistema
  // (Contabilidad solo tiene la cuenta contable 105, no una tabla de
  // personas) — así que las sugerencias salen de los nombres que ya se
  // usaron antes en este mismo módulo. Sigue siendo texto libre: si no
  // hay coincidencia, se guarda tal cual lo que la persona escriba.
  function clientesUsados() {
    const set = new Set();
    ventasCache.forEach((v) => { if (v.cliente) set.add(v.cliente); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  // ---------- Combo propio (reemplaza <select> nativo) ----------
  // Un <select> nativo no se puede pintar oscuro por dentro — los
  // <option> los dibuja el sistema operativo, no el CSS del sitio.
  // Este combo es un desplegable propio, mismo patrón visual que ya usa
  // Contabilidad (fac-sat-field), con soporte para "Otro" (revela un
  // campo de texto libre cuando se elige esa opción).
  // OT-0029: sin valor preseleccionado — el usuario debe elegir (antes
  // quedaba "BBVA"/"SPEI" aunque el pago fuera en efectivo).
  function comboHTML(id, opciones, placeholder) {
    return `
      <div class="v-combo" data-v-combo="${id}">
        <button type="button" class="v-inp v-combo__btn" data-v-combo-toggle="${id}">
          <span data-v-combo-label="${id}" style="color:var(--faint,#5b6677)">${esc(placeholder)}</span>
          <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="v-combo__list" data-v-combo-list="${id}">
          ${opciones.map((o) => `<div class="v-combo__opt" data-v-combo-opt="${id}::${esc(o)}">${esc(o)}</div>`).join("")}
        </div>
      </div>
      <input type="hidden" id="v-${id}" value="">`;
  }
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------- Toast ----------
  function toast(msg, tipo, ms) {
    let t = document.createElement("div");
    t.className = "v-toast v-toast--" + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms || 2600);
  }

  // ---------- Supabase Storage (directo, sin pasar por el backend) ----------
  function storageCfg() { return window.SUPABASE_CONFIG || null; }
  async function subirComprobante(file, empresaId) {
    const cfg = storageCfg();
    const t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) throw new Error("Sesión o configuración de Storage no disponible.");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = empresaId + "/ventas/" + uuid() + "/comprobante." + ext;
    const resp = await fetch(cfg.url + "/storage/v1/object/documentos/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error("No se pudo subir el comprobante (" + resp.status + "). " + txt.slice(0, 200));
    }
    return path;
  }
  async function urlFirmadaComprobante(path) {
    const cfg = storageCfg();
    const t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) return null;
    try {
      const resp = await fetch(cfg.url + "/storage/v1/object/sign/documentos/" + path, {
        method: "POST",
        headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.signedURL) return null;
      return cfg.url + "/storage/v1" + data.signedURL;
    } catch (e) { return null; }
  }

  // ---------- Datos (backend real) ----------
  let ventasCache = [];
  let nombresCache = {};
  let configContable = null; // { listo, faltantes } — OT-0029
  async function cargarVentas() {
    if (!backendUrl()) { ventasCache = []; toast("Falta la configuración del backend (app-config.js).", "warn"); return; }
    try {
      const resp = await fetch(backendUrl() + "/api/ventas", { headers: authHeaders(false) });
      const data = await resp.json();
      ventasCache = data.ok ? (data.ventas || []) : [];
      if (!data.ok) toast("No se pudieron cargar las ventas (" + (data.error || "error") + ")", "warn");
    } catch (e) {
      ventasCache = [];
      toast("Sin conexión con el backend.", "warn");
    }
  }
  // OT-0029: ¿la empresa tiene las cuentas contables para que la confirmación genere póliza?
  async function cargarConfigContable() {
    try {
      const resp = await fetch(backendUrl() + "/api/ventas/config-contable", { headers: authHeaders(false) });
      const data = await resp.json();
      configContable = data.ok ? { listo: !!data.listo, faltantes: data.faltantes || [] } : null;
    } catch (e) { configContable = null; }
  }
  // Si el script database/OT-0029-ventas.sql aún no se corrió, las ventas no traen
  // poliza_id: en ese caso no se muestran avisos de "sin póliza" (serían falsos).
  function soportaLigaPoliza() {
    return ventasCache.length === 0 || Object.prototype.hasOwnProperty.call(ventasCache[0], "poliza_id");
  }
  function sinPoliza(v) { return v.estado === "confirmado" && soportaLigaPoliza() && !v.poliza_id; }
  // OT-mejoras-ventas: antes Vendedor mostraba el UUID crudo (ej.
  // "ab450fa5…") — nadie lo reconoce. Se resuelve contra /api/equipo/nombres
  // (ruta ligera, sin candado de rol) para mostrar el nombre real.
  async function cargarNombresEquipo() {
    try {
      const resp = await fetch(backendUrl() + "/api/equipo/nombres", { headers: authHeaders(false) });
      const data = await resp.json();
      nombresCache = {};
      if (data.ok) (data.equipo || []).forEach((p) => { nombresCache[p.id] = p.nombre; });
    } catch (e) { /* si falla, se cae al UUID corto como respaldo — no bloquea la pantalla */ }
  }
  function nombreVendedor(id) {
    if (!id) return "—";
    return nombresCache[id] || idCorto(id);
  }

  // ---------- Render principal ----------
  let filtroActual = "todos";
  async function render() {
    const root = document.querySelector("[data-ventas-root]");
    if (!root) return;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Ventas y Pagos</h1><p>Registro de pagos y validación de comprobantes</p></div>
        <div class="page-head__actions">
          <button class="btn btn--primary" data-v-nueva><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nueva venta</button>
        </div>
      </div>
      <div data-v-avisos></div>
      <div class="v-kpis" data-v-kpis></div>
      <div class="card">
        <div class="card__head">
          <h3>Bandeja de pagos</h3>
          <div class="v-filtros" data-v-filtros>
            <button class="v-chip is-on" data-f="todos">Todos</button>
            <button class="v-chip" data-f="pendiente">Pendientes</button>
            <button class="v-chip" data-f="revision">En revisión</button>
            <button class="v-chip" data-f="confirmado">Confirmados</button>
            <button class="v-chip" data-f="rechazado">Rechazados</button>
            <button class="v-chip" data-f="cancelado">Cancelados</button>
            <button class="v-chip" data-f="sinpoliza" data-v-chip-sinpoliza style="display:none">Sin póliza</button>
          </div>
        </div>
        <div class="v-toolbar">
          <input class="v-inp" id="v-buscar" type="search" placeholder="Buscar por folio, cliente, concepto o referencia" autocomplete="off">
          <input class="v-inp" id="v-mes" type="month" title="Filtrar por mes de la fecha de pago">
        </div>
        <div style="overflow-x:auto">
          <table class="tbl v-tbl">
            <thead><tr><th>Folio</th><th>Cliente</th><th>Concepto</th><th style="text-align:right">Importe</th><th>Registrado por</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody data-v-rows></tbody>
          </table>
        </div>
      </div>`;
    await Promise.all([cargarVentas(), esperarPerfil(), cargarNombresEquipo(), cargarConfigContable()]);
    renderAvisos();
    renderKpis();
    renderRows();
  }

  // OT-mejoras-ventas: version ligera de render() para usar DESPUÉS de
  // una acción (registrar/tomar/confirmar/rechazar) — antes se llamaba
  // a render() completo, que reconstruye TODA la pantalla desde cero y
  // vuelve a pedir el equipo (nombresCache, que casi nunca cambia) y
  // espera el perfil otra vez — 3 llamadas de red por cada clic cuando
  // solo hacía falta 1 (traer las ventas actualizadas). Con esto los
  // botones responden mucho más rápido, sin parpadeo de toda la pantalla.
  async function recargarDatos() {
    await Promise.all([cargarVentas(), cargarConfigContable()]);
    renderAvisos();
    renderKpis();
    renderRows();
  }

  // OT-0029: avisos persistentes (no toasts de 2 s) sobre lo que pide atención.
  function renderAvisos() {
    const cont = document.querySelector("[data-v-avisos]");
    if (!cont) return;
    let html = "";
    if (ventasCache.length >= LIMITE_LISTA) {
      html += `<div class="v-aviso v-aviso--info">Se muestran las ${LIMITE_LISTA} ventas más recientes; las anteriores no aparecen en esta lista ni en los totales.</div>`;
    }
    if (esValidador() && configContable && !configContable.listo) {
      html += `<div class="v-aviso v-aviso--warn"><b>Configuración contable incompleta:</b> falta ${configContable.faltantes.map(esc).join(", ")}. Puedes confirmar pagos, pero no se generará su póliza hasta configurar las cuentas (Contabilidad → Configuración contable); después usa "Generar póliza".</div>`;
    }
    const nSin = veAvisosContables() ? ventasCache.filter(sinPoliza).length : 0;
    const chip = document.querySelector("[data-v-chip-sinpoliza]");
    if (chip) chip.style.display = nSin ? "" : "none";
    if (nSin) {
      html += `<div class="v-aviso v-aviso--warn"><b>${nSin} venta${nSin === 1 ? "" : "s"} confirmada${nSin === 1 ? "" : "s"} sin póliza contable.</b> El ingreso aún no está en Contabilidad. ${esValidador() ? 'Ábrela con "Ver" y usa "Generar póliza".' : "Avísale a administración."} <a href="#" data-f-link="sinpoliza">Ver cuáles</a></div>`;
    }
    cont.innerHTML = html;
  }

  function renderKpis() {
    const cont = document.querySelector("[data-v-kpis]");
    if (!cont) return;
    const cancelados = ventasCache.filter((v) => v.estado === "cancelado").length;
    const arr = ventasCache.filter((v) => v.estado !== "cancelado"); // OT-0072: lo cancelado no cuenta
    const pend = arr.filter((v) => v.estado === "pendiente");
    const enRev = arr.filter((v) => v.estado === "revision");
    const conf = arr.filter((v) => v.estado === "confirmado");
    const montoConf = conf.reduce((s, v) => s + Number(v.importe || 0), 0);
    const montoPend = pend.concat(enRev).reduce((s, v) => s + Number(v.importe || 0), 0);
    // OT-0029: la 4a tarjeta repetía el monto de "Confirmados"; ahora es el del mes en curso.
    const mesActual = hoy().slice(0, 7);
    const confMes = conf.filter((v) => String(v.fecha_pago || "").slice(0, 7) === mesActual);
    const montoMes = confMes.reduce((s, v) => s + Number(v.importe || 0), 0);
    cont.innerHTML = `
      <div class="v-kpi"><span class="v-kpi__l">Pendientes + en revisión</span><b class="v-kpi__n">${pend.length + enRev.length}</b><span class="v-kpi__s">${money(montoPend)} por validar</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Confirmados</span><b class="v-kpi__n">${conf.length}</b><span class="v-kpi__s">${money(montoConf)} ingresado</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Total registros</span><b class="v-kpi__n">${arr.length}</b><span class="v-kpi__s">${(ventasCache.length >= LIMITE_LISTA ? "las " + LIMITE_LISTA + " más recientes" : "de tu empresa") + (cancelados ? " · " + cancelados + " cancelado" + (cancelados === 1 ? "" : "s") + " aparte" : "")}</span></div>
      <div class="v-kpi v-kpi--accent"><span class="v-kpi__l">Confirmado este mes</span><b class="v-kpi__n">${money(montoMes)}</b><span class="v-kpi__s">${confMes.length} pago${confMes.length === 1 ? "" : "s"} con fecha de este mes</span></div>`;
  }

  // OT-0072: corregir/cancelar un pago PENDIENTE. Editar: solo quien lo registró. Cancelar: quien lo registró o Admin/Director.
  function puedeEditar(v) { return v.estado === "pendiente" && v.created_by === miId() && ROLES_REGISTRO.indexOf(miRol()) !== -1; }
  function puedeCancelar(v) { return v.estado === "pendiente" && ROLES_REGISTRO.indexOf(miRol()) !== -1 && (v.created_by === miId() || puedeAutovalidar()); }

  function accionesFila(v) {
    let acciones = `<button class="v-mini" data-v-ver="${esc(v.id)}">Ver</button>`;
    if (puedeEditar(v)) acciones += `<button class="v-mini" data-v-editar="${esc(v.id)}">Editar</button>`;
    if (puedeCancelar(v)) acciones += `<button class="v-mini v-mini--bad" data-v-cancelar="${esc(v.id)}">Cancelar</button>`;
    const soyCreador = v.created_by === miId();
    // Bloquea solo si es su propio registro Y su rol no tiene la
    // excepción de auto-validar (admin/director sí pueden).
    if (!esValidador() || (soyCreador && !puedeAutovalidar())) return acciones;
    if (v.estado === "pendiente") {
      acciones += `<button class="v-mini v-mini--ok" data-v-tomar="${esc(v.id)}">Tomar para revisión</button>`;
    } else if (v.estado === "revision") {
      acciones += `<button class="v-mini v-mini--ok" data-v-conf="${esc(v.id)}">Confirmar</button><button class="v-mini v-mini--bad" data-v-rech="${esc(v.id)}">Rechazar</button>`;
    }
    return acciones;
  }

  // OT-0029: filtros combinados — estado/“sin póliza” + búsqueda de texto + mes de la fecha de pago.
  function ventasFiltradas() {
    let arr = ventasCache.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filtroActual === "sinpoliza") arr = arr.filter(sinPoliza);
    else if (filtroActual !== "todos") arr = arr.filter((v) => v.estado === filtroActual);
    const q = ((document.getElementById("v-buscar") || {}).value || "").trim().toLowerCase();
    if (q) {
      arr = arr.filter((v) => [v.folio, v.cliente, v.concepto, v.referencia].some((x) => String(x || "").toLowerCase().includes(q)));
    }
    const mes = (document.getElementById("v-mes") || {}).value || "";
    if (mes) arr = arr.filter((v) => String(v.fecha_pago || "").slice(0, 7) === mes);
    return arr;
  }

  function renderRows() {
    const tb = document.querySelector("[data-v-rows]");
    if (!tb) return;
    const arr = ventasFiltradas();
    if (!arr.length) {
      const hayDatos = ventasCache.length > 0;
      tb.innerHTML = `<tr><td colspan="8" class="v-empty">${hayDatos ? "Ningún pago coincide con los filtros." : 'Sin pagos registrados. Da clic en "Nueva venta" para empezar.'}</td></tr>`;
      return;
    }
    tb.innerHTML = arr.map((v) => {
      const e = ESTADOS[v.estado] || ESTADOS.pendiente;
      const badgePol = veAvisosContables() && sinPoliza(v) ? ` <span class="v-badge v-badge--warn" title="Confirmada, pero su póliza contable no se ha generado">Sin póliza</span>` : "";
      return `<tr>
        <td><b>${esc(v.folio)}</b></td>
        <td>${esc(v.cliente) || "—"}</td>
        <td>${esc(v.concepto) || "—"}</td>
        <td style="text-align:right">${money(v.importe)}</td>
        <td>${esc(nombreVendedor(v.vendedor_id))}</td>
        <td>${fmtFecha(v.fecha_pago)}</td>
        <td><span class="v-badge ${e.cls}">${e.txt}</span>${badgePol}</td>
        <td><div class="v-acc">${accionesFila(v)}</div></td>
      </tr>`;
    }).join("");
  }

  // ---------- Modal genérico ----------
  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "v-modal";
    modal.innerHTML = `<div class="v-modal__box"><button class="v-modal__x" data-v-close>&times;</button><div data-v-content></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest("[data-v-close]")) closeModal(); });
    return modal;
  }
  function openModal(html) { ensureModal(); modal.querySelector("[data-v-content]").innerHTML = html; modal.classList.add("show"); }
  function closeModal() { if (modal) modal.classList.remove("show"); }

  // ---------- Nueva venta ----------
  let archivoSeleccionado = null;
  let editandoId = null; // OT-0072: id del pago que se está corrigiendo (null = alta nueva)
  function openNuevaVenta(venta) {
    archivoSeleccionado = null;
    editandoId = venta ? venta.id : null;
    openModal(`
      <h2 class="v-h2">${venta ? "Editar pago " + esc(venta.folio) : "Nueva venta / Registro de pago"}</h2>
      <p class="v-sub">${venta
        ? "Corrige lo que haga falta. Sigue <b>Pendiente</b>: mientras nadie lo tome para revisión puedes editarlo o cancelarlo."
        : "El pago quedará <b>Pendiente</b> hasta que alguien de administración lo tome para revisión."}</p>
      <div class="v-grid2">
        <div class="v-field">
          <label>Cliente</label>
          <div class="v-search" data-v-search="cliente">
            <input class="v-inp" id="v-cliente" placeholder="Nombre del cliente" autocomplete="off">
            <div class="v-search__list" data-v-search-list="cliente"></div>
          </div>
        </div>
        <div class="v-field"><label>Concepto</label><input class="v-inp" id="v-concepto" placeholder="Servicio o concepto"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Importe</label><input class="v-inp v-inp--money" id="v-importe" type="number" min="0.01" step="0.01" placeholder="0.00" inputmode="decimal"></div>
        <div class="v-field"><label>¿Incluye IVA?</label>
          <div class="v-combo" data-v-combo="iva">
            <button type="button" class="v-inp v-combo__btn" data-v-combo-toggle="iva">
              <span data-v-combo-label="iva">Sí (16%)</span>
              <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="v-combo__list" data-v-combo-list="iva">
              <div class="v-combo__opt is-active" data-v-combo-opt="iva::si">Sí (16%)</div>
              <div class="v-combo__opt" data-v-combo-opt="iva::no">No (exento)</div>
            </div>
          </div>
          <input type="hidden" id="v-iva" value="si">
        </div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Fecha de pago</label><input class="v-inp" id="v-fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
        <div></div>
      </div>
      <div class="v-grid2">
        <div class="v-field">
          <label>Método de pago</label>
          ${comboHTML("metodo", METODOS, "Selecciona el método")}
          <div class="v-field" data-v-otro-wrap="metodo" style="display:none;margin-top:.5rem">
            <input class="v-inp" id="v-metodo-otro" placeholder="Especifica el método de pago">
          </div>
        </div>
        <div class="v-field"><label>Referencia / Folio</label><input class="v-inp" id="v-ref" placeholder="Número de rastreo del banco (opcional en efectivo)"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field" data-v-banco-wrap>
          <label>Banco emisor</label>
          ${comboHTML("banco", BANCOS, "Selecciona el banco")}
          <div class="v-field" data-v-otro-wrap="banco" style="display:none;margin-top:.5rem">
            <input class="v-inp" id="v-banco-otro" placeholder="Especifica el banco">
          </div>
        </div>
        <div></div>
      </div>
      ${venta ? `<div class="v-aviso v-aviso--info">El comprobante adjunto se conserva tal cual. Para cambiarlo, cancela este registro y captúralo de nuevo con el comprobante correcto.</div>` : `<div class="v-field">
        <label>Comprobante (imagen o PDF)</label>
        <div class="v-file" data-v-file><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></svg><span data-v-file-txt>Adjuntar imagen, PDF o captura</span><input type="file" id="v-comprobante" accept="image/*,application/pdf" hidden></div>
      </div>`}
      <div class="v-field"><label>Notas (opcional)</label><textarea class="v-inp" id="v-notas" rows="2" placeholder="Comentarios..."></textarea></div>
      <div class="v-modal__foot">
        <button class="btn btn--ghost" data-v-close>Cancelar</button>
        <button class="btn btn--primary" data-v-guardar>${venta ? "Guardar cambios" : "Guardar registro"}</button>
      </div>`);
    if (venta) precargarFormulario(venta);
  }

  // OT-0072: llena el formulario con los datos actuales (incluye los combos propios y el "Otro" de método/banco).
  function precargarFormulario(v) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? "" : val; };
    set("v-cliente", v.cliente); set("v-concepto", v.concepto); set("v-importe", v.importe);
    set("v-fecha", String(v.fecha_pago || "").slice(0, 10) || hoy()); set("v-ref", v.referencia); set("v-notas", v.notas);
    const fijarCombo = (id, valor) => {
      const label = document.querySelector(`[data-v-combo-label="${id}"]`);
      if (label) { label.textContent = valor; label.style.color = ""; }
      document.querySelectorAll(`[data-v-combo-opt^="${id}::"]`).forEach((o) => o.classList.toggle("is-active", o.getAttribute("data-v-combo-opt") === id + "::" + valor));
    };
    const poner = (id, lista, actual, otroId) => {
      if (!actual) return;
      const enLista = lista.indexOf(actual) !== -1;
      set("v-" + id, enLista ? actual : "Otro");
      fijarCombo(id, enLista ? actual : "Otro");
      const otroWrap = document.querySelector(`[data-v-otro-wrap="${id}"]`);
      if (!enLista) { set(otroId, actual); if (otroWrap) otroWrap.style.display = ""; }
    };
    poner("metodo", METODOS, v.metodo_pago, "v-metodo-otro");
    if (v.metodo_pago === "Efectivo") { const bw = document.querySelector("[data-v-banco-wrap]"); if (bw) bw.style.display = "none"; }
    else poner("banco", BANCOS, v.banco, "v-banco-otro");
    const sinIva = v.incluye_iva === false;
    set("v-iva", sinIva ? "no" : "si");
    fijarCombo("iva", sinIva ? "No (exento)" : "Sí (16%)");
    document.querySelectorAll('[data-v-combo-opt^="iva::"]').forEach((o) => o.classList.toggle("is-active", o.getAttribute("data-v-combo-opt") === "iva::" + (sinIva ? "no" : "si")));
  }

  async function guardarVenta() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const cliente = g("v-cliente"), concepto = g("v-concepto"), importe = parseFloat(g("v-importe")) || 0;
    if (!cliente) { toast("Captura el nombre del cliente", "warn"); return; }
    if (!concepto) { toast("Captura el concepto o servicio", "warn"); return; }
    if (!(importe > 0)) { toast("Captura un importe mayor a cero", "warn"); return; }
    const fecha = g("v-fecha");
    if (!fecha) { toast("Captura la fecha de pago", "warn"); return; }
    if (fecha > hoy()) { toast("La fecha de pago no puede ser futura", "warn"); return; }

    // Si eligieron "Otro" en Método/Banco, se manda lo que escribieron en
    // vez del literal "Otro" — y es obligatorio especificar cuál.
    // OT-0029: ya no hay valor por defecto, así que el método es obligatorio;
    // el banco también, salvo en pagos en efectivo.
    let metodoPago = g("v-metodo");
    if (!metodoPago) { toast("Selecciona el método de pago", "warn"); return; }
    if (metodoPago === "Otro") {
      metodoPago = g("v-metodo-otro");
      if (!metodoPago) { toast("Especifica el método de pago", "warn"); return; }
    }
    const esEfectivo = metodoPago === "Efectivo";
    let banco = esEfectivo ? "" : g("v-banco");
    if (!esEfectivo && !banco) { toast("Selecciona el banco emisor", "warn"); return; }
    if (banco === "Otro") {
      banco = g("v-banco-otro");
      if (!banco) { toast("Especifica el banco emisor", "warn"); return; }
    }

    const btn = document.querySelector("[data-v-guardar]");
    const textoBtn = btn ? btn.textContent : "Guardar registro";
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

    try {
      // OT-0072: corrección de un pago pendiente (PUT); el comprobante no se toca.
      if (editandoId) {
        const respE = await fetch(backendUrl() + "/api/ventas/" + encodeURIComponent(editandoId), {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify({ cliente, concepto, importe, incluyeIva: g("v-iva") === "si", fechaPago: fecha, metodoPago, referencia: g("v-ref"), banco, notas: g("v-notas") }),
        });
        const dataE = await respE.json();
        if (!dataE.ok) { toast("No se pudo guardar: " + (dataE.error || "error"), "warn", 6000); return; }
        editandoId = null;
        closeModal();
        toast("Pago actualizado ✓ · sigue Pendiente");
        await recargarDatos();
        document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
        return;
      }
      let comprobantePath = null;
      await esperarPerfil();
      const empresa = miEmpresa();
      const empresaId = empresa && empresa.id;
      // OT-0029: si adjuntó comprobante y no se puede subir, NO se guarda la venta
      // (antes se guardaba "sin comprobante" y el validador no veía la evidencia).
      if (archivoSeleccionado && !empresaId) {
        toast("No se pudo determinar tu empresa todavía; el comprobante NO se subió y el registro no se guardó. Espera unos segundos, recarga la página e inténtalo de nuevo.", "warn", 6000);
        return;
      }
      if (archivoSeleccionado) {
        comprobantePath = await subirComprobante(archivoSeleccionado, empresaId);
      }

      const resp = await fetch(backendUrl() + "/api/ventas", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          cliente, concepto,
          importe,
          incluyeIva: g("v-iva") === "si",
          fechaPago: fecha,
          metodoPago,
          referencia: g("v-ref"),
          banco,
          notas: g("v-notas"),
          comprobantePath,
        }),
      });
      const data = await resp.json();
      if (!data.ok) { toast("No se pudo guardar: " + (data.error || "error"), "warn"); return; }

      closeModal();
      toast("Pago registrado · queda Pendiente");
      await recargarDatos();
    } catch (e) {
      toast("Error al guardar: " + e.message, "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
    }
  }

  // ---------- Ver detalle ----------
  async function verDetalle(id) {
    const v = ventasCache.find((x) => x.id === id);
    if (!v) return;
    const e = ESTADOS[v.estado] || ESTADOS.pendiente;
    let evidencia = `<p class="v-noevi">Cargando comprobante...</p>`;
    let acciones = "";
    const soyCreador = v.created_by === miId();
    if (esValidador() && (!soyCreador || puedeAutovalidar())) {
      if (v.estado === "pendiente") acciones = `<button class="btn btn--primary" data-v-tomar="${esc(v.id)}">Tomar para revisión</button>`;
      else if (v.estado === "revision") acciones = `<button class="btn btn--ghost v-btn-bad" data-v-rech="${esc(v.id)}">Rechazar</button><button class="btn btn--primary" data-v-conf="${esc(v.id)}">Confirmar pago</button>`;
    }
    // OT-0072: quien lo registró puede corregirlo o cancelarlo mientras siga pendiente.
    const accionesPropias = (puedeCancelar(v) ? `<button class="btn btn--ghost v-btn-bad" data-v-cancelar="${esc(v.id)}">Cancelar pago</button>` : "")
      + (puedeEditar(v) ? `<button class="btn btn--ghost" data-v-editar="${esc(v.id)}">Editar</button>` : "");
    if (accionesPropias) acciones = accionesPropias + (acciones || '<button class="btn btn--ghost" data-v-close>Cerrar</button>');
    // OT-0029: póliza ligada a la venta (o aviso + reintento si no se generó) y motivo de rechazo.
    let bloquePoliza = "";
    if (v.estado === "confirmado" && soportaLigaPoliza()) {
      if (v.poliza_id) {
        const folioPol = v.poliza_folio
          ? `<button type="button" class="v-mini v-mini--ok" data-v-verpol="${esc(v.poliza_id)}" data-v-verpol-folio="${esc(v.poliza_folio)}" title="Abrir esta póliza en Contabilidad → Pólizas"><b>${esc(v.poliza_folio)}</b> · Ver póliza →</button>`
          : `<b>generada</b>`;
        bloquePoliza = `<div class="v-aviso v-aviso--ok">Póliza contable: ${folioPol}</div>`;
      } else {
        bloquePoliza = `<div class="v-aviso v-aviso--warn"><b>Sin póliza contable.</b> El pago está confirmado pero su ingreso aún no está en Contabilidad.${esValidador() ? ` <button class="v-mini v-mini--ok" data-v-genpol="${esc(v.id)}">Generar póliza</button>` : ""}</div>`;
      }
    }
    const bloqueMotivo = v.estado === "rechazado" && v.motivo_rechazo
      ? `<div class="v-aviso v-aviso--bad"><b>Motivo del rechazo:</b> ${esc(v.motivo_rechazo)}</div>`
      : (v.estado === "cancelado" && v.motivo_rechazo ? `<div class="v-aviso"><b>Motivo de la cancelación:</b> ${esc(v.motivo_rechazo)}</div>` : "");
    openModal(`
      <h2 class="v-h2">Pago ${esc(v.folio)}</h2>
      <span class="v-badge ${e.cls}" style="margin-bottom:.8rem;display:inline-block">${e.txt}</span>
      ${bloquePoliza}${bloqueMotivo}
      <div class="v-det">
        ${detRow("Cliente", v.cliente)}${detRow("Concepto", v.concepto)}
        ${detRow(v.incluye_iva === false ? "Importe" : "Importe (con IVA incluido)", money(v.importe))}${detRow("IVA", v.incluye_iva === false ? "No (exento)" : "Sí (16%) — ya incluido en el importe, no se suma aparte")}${detRow("Fecha de pago", fmtFecha(v.fecha_pago))}${detRow("Método", v.metodo_pago)}
        ${detRow("Referencia", v.referencia)}${detRow("Banco", v.banco)}${detRow("Registrado por", nombreVendedor(v.vendedor_id))}
        ${v.notas ? detRow("Notas", v.notas) : ""}
      </div>
      <div class="v-evi-wrap"><label class="v-evi-lbl">Comprobante</label><div data-v-evi>${evidencia}</div></div>
      <div class="v-modal__foot">${acciones || '<button class="btn btn--ghost" data-v-close>Cerrar</button>'}</div>`);

    // Comprobante: carga la URL firmada aparte (no bloquea el resto del modal)
    if (v.comprobante_path) {
      const url = await urlFirmadaComprobante(v.comprobante_path);
      const host = document.querySelector("[data-v-evi]");
      if (host) {
        if (!url) host.innerHTML = `<p class="v-noevi">No se pudo cargar el comprobante</p>`;
        else if (v.comprobante_path.toLowerCase().endsWith(".pdf")) host.innerHTML = `<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir comprobante PDF</a>`;
        else host.innerHTML = `<img class="v-evi" src="${esc(url)}" alt="comprobante">`;
      }
    } else {
      const host = document.querySelector("[data-v-evi]");
      if (host) host.innerHTML = `<p class="v-noevi">Sin comprobante adjunto</p>`;
    }
  }
  // OT-0029: salto Ventas → Contabilidad → Pólizas con el detalle de la póliza abierto.
  // Reutiliza window.CTCont (getPolizas / verPoliza). Si la póliza aún no está en
  // memoria, pide a Contabilidad que se sincronice (evento ventas-cambio) y espera.
  async function irAPoliza(polizaId, folio) {
    closeModal();
    const nav = document.querySelector('.nav-item[data-view="contabilidad"]');
    if (nav) nav.click();
    const tab = document.querySelector('[data-tabs="cont"] .tab[data-tab="polizas"]');
    if (tab) tab.click();
    const CT = window.CTCont;
    if (!CT || !CT.getPolizas || !CT.verPoliza) { toast("Abre Contabilidad → Pólizas para ver " + folio, "warn"); return; }
    const buscar = () => CT.getPolizas().find((p) => p.pgId === polizaId || p.folio === folio);
    let pol = buscar();
    if (!pol) {
      document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
      for (let i = 0; i < 20 && !pol; i++) { await new Promise((r) => setTimeout(r, 250)); pol = buscar(); }
    }
    if (pol) { CT.verPoliza(pol.id); return; }
    // Respaldo: filtra la lista por el folio.
    const buscador = document.querySelector('[data-search="polizas"]');
    if (buscador) { buscador.value = folio; buscador.dispatchEvent(new Event("input", { bubbles: true })); }
    toast("La póliza " + folio + " aún no se sincroniza; filtré la lista por su folio.", "warn");
  }
  function detRow(k, v) { return `<div class="v-det__row"><span>${esc(k)}</span><b>${esc(v) || "—"}</b></div>`; }

  // ---------- Transiciones ----------
  // OT-0029: mientras una acción está en curso se ignoran más clics y los
  // botones se deshabilitan (antes el doble clic mandaba dos peticiones).
  let accionEnCurso = false;
  function bloquearBotones(bloquear) {
    document.querySelectorAll("[data-v-tomar],[data-v-conf],[data-v-rech],[data-v-genpol],[data-v-rech-ok],[data-v-cancelar],[data-v-editar],[data-v-canc-ok]").forEach((b) => { b.disabled = bloquear; });
  }
  async function accionVenta(endpoint, id, msgOk, body) {
    if (accionEnCurso) return;
    accionEnCurso = true;
    bloquearBotones(true);
    try {
      const resp = await fetch(backendUrl() + "/api/ventas/" + encodeURIComponent(id) + "/" + endpoint, {
        method: "POST", headers: authHeaders(true), body: body ? JSON.stringify(body) : undefined,
      });
      const data = await resp.json();
      if (!data.ok) { toast(data.error || "No se pudo completar la acción", "warn", 6000); return; }
      closeModal();
      toast(msgOk);
      // Conexión Ventas↔Contabilidad: si la venta se confirmó pero la
      // póliza no se pudo generar, se muestra una advertencia larga (queda
      // además la marca "Sin póliza" y el botón "Generar póliza").
      if (data.polizaWarning) {
        setTimeout(function () { toast("⚠ Pago confirmado, pero la póliza no se generó: " + data.polizaWarning + " Puedes reintentarlo con \"Generar póliza\".", "warn", 12000); }, 500);
      }
      await recargarDatos();
      document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
    } catch (e) {
      toast("Error: " + e.message, "warn", 6000);
    } finally {
      accionEnCurso = false;
      bloquearBotones(false);
    }
  }
  function tomar(id) { return accionVenta("tomar", id, "Venta tomada para revisión"); }
  function confirmar(id) { return accionVenta("confirmar", id, "Pago confirmado ✓"); }
  function generarPoliza(id) { return accionVenta("generar-poliza", id, "Póliza generada ✓"); }
  // OT-0029: rechazar pide un motivo (queda guardado y lo ve quien registró el pago).
  function rechazar(id) {
    openModal(`
      <h2 class="v-h2">Rechazar pago</h2>
      <p class="v-sub">Escribe el motivo; quedará registrado y lo verá quien capturó el pago.</p>
      <div class="v-field"><label>Motivo del rechazo</label><textarea class="v-inp" id="v-motivo" rows="3" maxlength="500" placeholder="Ej. El comprobante no coincide con el importe"></textarea></div>
      <div class="v-modal__foot">
        <button class="btn btn--ghost" data-v-close>Cancelar</button>
        <button class="btn btn--primary v-btn-bad" data-v-rech-ok="${esc(id)}">Rechazar pago</button>
      </div>`);
  }
  // OT-0072: cancelar un pago pendiente pide motivo (queda en el registro y en la auditoría).
  function cancelarPago(id) {
    const v = ventasCache.find((x) => x.id === id);
    openModal(`
      <h2 class="v-h2">Cancelar pago ${esc(v ? v.folio : "")}</h2>
      <p class="v-sub">El registro <b>no se borra</b>: queda como Cancelado con el motivo, fuera de los totales. Solo se puede cancelar mientras esté Pendiente.</p>
      <div class="v-field"><label>Motivo de la cancelación</label><textarea class="v-inp" id="v-motivo-canc" rows="3" maxlength="500" placeholder="Ej. Lo registré dos veces / el cliente se equivocó de cuenta"></textarea></div>
      <div class="v-modal__foot">
        <button class="btn btn--ghost" data-v-close>Volver</button>
        <button class="btn btn--primary v-btn-bad" data-v-canc-ok="${esc(id)}">Cancelar pago</button>
      </div>`);
  }
  function cancelarConfirmado(id) {
    const motivo = ((document.getElementById("v-motivo-canc") || {}).value || "").trim();
    if (motivo.length < 3) { toast("Escribe el motivo de la cancelación", "warn"); return; }
    return accionVenta("cancelar", id, "Pago cancelado", { motivo });
  }
  function rechazarConfirmado(id) {
    const motivo = ((document.getElementById("v-motivo") || {}).value || "").trim();
    if (motivo.length < 3) { toast("Escribe el motivo del rechazo", "warn"); return; }
    return accionVenta("rechazar", id, "Pago rechazado", { motivo });
  }

  // ---------- Eventos ----------
  function aplicarFiltroEstado(f) {
    filtroActual = f;
    document.querySelectorAll("[data-v-filtros] .v-chip").forEach((c) => c.classList.toggle("is-on", c.getAttribute("data-f") === f));
    renderRows();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-v-nueva]")) { openNuevaVenta(); return; }
    if (e.target.closest("[data-v-guardar]")) { guardarVenta(); return; }
    const ver = e.target.closest("[data-v-ver]"); if (ver) { verDetalle(ver.getAttribute("data-v-ver")); return; }
    const tom = e.target.closest("[data-v-tomar]"); if (tom) { tomar(tom.getAttribute("data-v-tomar")); return; }
    const conf = e.target.closest("[data-v-conf]"); if (conf) { confirmar(conf.getAttribute("data-v-conf")); return; }
    const rech = e.target.closest("[data-v-rech]"); if (rech) { rechazar(rech.getAttribute("data-v-rech")); return; }
    const rechOk = e.target.closest("[data-v-rech-ok]"); if (rechOk) { rechazarConfirmado(rechOk.getAttribute("data-v-rech-ok")); return; }
    const edi = e.target.closest("[data-v-editar]");
    if (edi) { const v = ventasCache.find((x) => x.id === edi.getAttribute("data-v-editar")); if (v && puedeEditar(v)) openNuevaVenta(v); return; }
    const can = e.target.closest("[data-v-cancelar]"); if (can) { cancelarPago(can.getAttribute("data-v-cancelar")); return; }
    const canOk = e.target.closest("[data-v-canc-ok]"); if (canOk) { cancelarConfirmado(canOk.getAttribute("data-v-canc-ok")); return; }
    const genPol = e.target.closest("[data-v-genpol]"); if (genPol) { generarPoliza(genPol.getAttribute("data-v-genpol")); return; }
    const verPol = e.target.closest("[data-v-verpol]"); if (verPol) { irAPoliza(verPol.getAttribute("data-v-verpol"), verPol.getAttribute("data-v-verpol-folio")); return; }
    const chip = e.target.closest("[data-f]");
    if (chip) { aplicarFiltroEstado(chip.getAttribute("data-f")); return; }
    const linkF = e.target.closest("[data-f-link]");
    if (linkF) { e.preventDefault(); aplicarFiltroEstado(linkF.getAttribute("data-f-link")); return; }
    const file = e.target.closest("[data-v-file]");
    if (file) { const inp = document.getElementById("v-comprobante"); if (inp) inp.click(); return; }
    // ---------- Combo propio (Método de pago / Banco) ----------
    const toggle = e.target.closest("[data-v-combo-toggle]");
    if (toggle) {
      const id = toggle.getAttribute("data-v-combo-toggle");
      const list = document.querySelector(`[data-v-combo-list="${id}"]`);
      const abierta = list && list.classList.contains("is-open");
      cerrarCombos();
      if (list && !abierta) list.classList.add("is-open");
      return;
    }
    const opt = e.target.closest("[data-v-combo-opt]");
    if (opt) {
      const [id, valor] = opt.getAttribute("data-v-combo-opt").split("::");
      const hidden = document.getElementById("v-" + id);
      const label = document.querySelector(`[data-v-combo-label="${id}"]`);
      if (hidden) hidden.value = valor;
      if (label) { label.textContent = valor; label.style.color = ""; }
      document.querySelectorAll(`[data-v-combo-opt^="${id}::"]`).forEach((o) => o.classList.toggle("is-active", o === opt));
      cerrarCombos();
      // OT-0029: pago en efectivo → no hay banco emisor que capturar.
      if (id === "metodo") {
        const bancoWrap = document.querySelector("[data-v-banco-wrap]");
        if (bancoWrap) bancoWrap.style.display = valor === "Efectivo" ? "none" : "";
      }
      // "Otro" revela un campo de texto libre para especificar — sin
      // esto, elegir "Otro" no dejaba forma de decir cuál era.
      const otroWrap = document.querySelector(`[data-v-otro-wrap="${id}"]`);
      if (otroWrap) otroWrap.style.display = valor === "Otro" ? "" : "none";
      return;
    }
    if (!e.target.closest(".v-combo")) cerrarCombos();
  });
  function cerrarCombos() {
    document.querySelectorAll(".v-combo__list.is-open").forEach((l) => l.classList.remove("is-open"));
  }

  // ---------- Buscador de Cliente: filtra mientras se escribe ----------
  document.addEventListener("input", (e) => {
    // OT-0029: los filtros de la bandeja reaccionan al escribir/cambiar el mes.
    if (e.target.id === "v-buscar" || e.target.id === "v-mes") { renderRows(); return; }
    if (e.target.id !== "v-cliente") return;
    const texto = e.target.value.trim().toLowerCase();
    const list = document.querySelector('[data-v-search-list="cliente"]');
    if (!list) return;
    if (!texto) { list.classList.remove("is-open"); list.innerHTML = ""; return; }
    const coincidencias = clientesUsados().filter((c) => c.toLowerCase().includes(texto)).slice(0, 6);
    if (!coincidencias.length) { list.classList.remove("is-open"); list.innerHTML = ""; return; }
    list.innerHTML = coincidencias.map((c) => `<div class="v-combo__opt" data-v-search-opt="${esc(c)}">${esc(c)}</div>`).join("");
    list.classList.add("is-open");
  });
  document.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-v-search-opt]");
    if (opt) {
      const input = document.getElementById("v-cliente");
      if (input) input.value = opt.getAttribute("data-v-search-opt");
      const list = document.querySelector('[data-v-search-list="cliente"]');
      if (list) { list.classList.remove("is-open"); list.innerHTML = ""; }
      return;
    }
    if (!e.target.closest(".v-search")) {
      const list = document.querySelector('[data-v-search-list="cliente"]');
      if (list) list.classList.remove("is-open");
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "v-comprobante") {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast("El archivo no debe pasar de 3 MB", "warn"); e.target.value = ""; return; }
      archivoSeleccionado = f;
      const txt = document.querySelector("[data-v-file-txt]");
      if (txt) txt.textContent = f.name + " ✓";
    }
  });

  // Render cuando se entra a la vista (el nav cambia las clases)
  function maybeRender() {
    const sec = document.querySelector('section[data-view="ventas"]');
    if (sec && sec.classList.contains("is-active")) render();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('.nav-item[data-view="ventas"]')) setTimeout(render, 30);
  });

  // Primer render por si ya está activa o para tener la data lista
  if (document.readyState !== "loading") setTimeout(maybeRender, 50);
  else document.addEventListener("DOMContentLoaded", () => setTimeout(maybeRender, 50));

  // ---------- CSS ----------
  const css = document.createElement("style");
  css.textContent = `
    [data-ventas-root] .v-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.2rem}
    @media(max-width:900px){[data-ventas-root] .v-kpis{grid-template-columns:repeat(2,1fr)}}
    .v-kpi{background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.07));border-radius:14px;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.2rem}
    .v-kpi__l{font-size:.78rem;color:var(--muted,#8b98ad)}
    .v-kpi__n{font-size:1.6rem;font-weight:700;color:var(--text,#fff);line-height:1.1}
    .v-kpi__s{font-size:.72rem;color:var(--faint,#5b6677)}
    .v-kpi--accent{background:linear-gradient(135deg,rgba(110,139,255,.16),rgba(110,139,255,.04));border-color:rgba(110,139,255,.3)}
    .v-filtros{display:flex;gap:.4rem;flex-wrap:wrap}
    .v-chip{padding:.35rem .8rem;border-radius:999px;border:1px solid var(--line,rgba(255,255,255,.1));background:transparent;color:var(--muted,#8b98ad);font-size:.8rem;cursor:pointer;font-family:inherit;transition:.15s}
    .v-chip.is-on{background:var(--brand,#6E8BFF);color:#fff;border-color:var(--brand,#6E8BFF)}
    .v-tbl td{vertical-align:middle}
    .v-badge{display:inline-block;padding:.22rem .6rem;border-radius:999px;font-size:.74rem;font-weight:600}
    .v-badge--warn{background:rgba(242,184,75,.16);color:#F2B84B}
    .v-badge--ok{background:rgba(52,211,153,.16);color:#34D399}
    .v-badge--bad{background:rgba(251,113,133,.16);color:#FB7185}
    .v-badge--mute{background:rgba(139,152,173,.16);color:var(--muted,#8b98ad)}
    .v-mini--bad{border-color:rgba(251,113,133,.4);color:#FB7185}
    .v-acc{display:flex;gap:.35rem;justify-content:flex-end}
    .v-mini{padding:.3rem .6rem;border-radius:8px;border:1px solid var(--line,rgba(255,255,255,.12));background:transparent;color:var(--text,#cfd6e2);font-size:.76rem;cursor:pointer;font-family:inherit;white-space:nowrap}
    .v-mini--ok{border-color:rgba(52,211,153,.4);color:#34D399}
    .v-mini--bad{border-color:rgba(251,113,133,.4);color:#FB7185}
    .v-mini:hover{filter:brightness(1.2)}
    .v-empty{text-align:center;color:var(--faint,#5b6677);padding:2rem!important}
    /* Modal */
    .v-modal{position:fixed;inset:0;background:rgba(4,8,15,.66);backdrop-filter:blur(5px);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:3vh 1rem;opacity:0;pointer-events:none;transition:.2s;overflow-y:auto}
    .v-modal.show{opacity:1;pointer-events:auto}
    .v-modal__box{background:var(--card,#0e1420);border:1px solid var(--line,rgba(255,255,255,.09));border-radius:18px;max-width:620px;width:100%;padding:1.6rem;position:relative;box-shadow:0 30px 80px rgba(0,0,0,.5)}
    .v-modal__x{position:absolute;top:1rem;right:1.1rem;background:none;border:none;color:var(--muted,#8b98ad);font-size:1.6rem;cursor:pointer;line-height:1}
    .v-h2{font-size:1.25rem;margin:0 0 .2rem;color:var(--text,#fff)}
    .v-sub{font-size:.85rem;color:var(--muted,#8b98ad);margin:0 0 1.1rem}
    .v-grid2{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:.2rem}
    @media(max-width:560px){.v-grid2{grid-template-columns:1fr}}
    .v-field{margin-bottom:.8rem;display:flex;flex-direction:column;gap:.3rem}
    .v-field label{font-size:.78rem;color:var(--muted,#8b98ad);font-weight:500}
    .v-inp{background:var(--inp,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:.6rem .75rem;color:var(--text,#fff);font-family:inherit;font-size:.9rem;width:100%}
    .v-inp:focus{outline:none;border-color:var(--brand,#6E8BFF);box-shadow:0 0 0 3px rgba(110,139,255,.14)}
    .v-toolbar{display:flex;gap:.6rem;flex-wrap:wrap;padding:0 1.2rem .9rem}
    .v-toolbar #v-buscar{flex:1 1 260px;min-width:0}
    .v-toolbar #v-mes{flex:0 0 auto;width:auto}
    .v-aviso{padding:.7rem 1rem;border-radius:10px;font-size:.85rem;margin-bottom:.9rem;border:1px solid var(--line,rgba(255,255,255,.1));color:var(--text,#cfd6e2)}
    .v-aviso--warn{background:rgba(242,184,75,.1);border-color:rgba(242,184,75,.35)}
    .v-aviso--ok{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.3)}
    .v-aviso--bad{background:rgba(251,113,133,.08);border-color:rgba(251,113,133,.35)}
    .v-aviso--info{background:rgba(110,139,255,.08);border-color:rgba(110,139,255,.3)}
    .v-aviso a{color:var(--brand,#6E8BFF)}
    .v-mini:disabled,.btn:disabled{opacity:.5;cursor:not-allowed}
    /* Importe: se quitan las flechitas nativas del navegador — solo
       sumaban/restaban centavos con cada clic, poco útil para un monto
       y se veía inconsistente con el resto del formulario. */
    .v-inp--money::-webkit-outer-spin-button,.v-inp--money::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .v-inp--money{-moz-appearance:textfield}
    /* Combo propio (Método de pago / Banco) — reemplaza <select> nativo
       porque el navegador dibuja las <option> con estilo del sistema
       operativo, no con el CSS del sitio (por eso se veían blancas). */
    .v-combo{position:relative}
    .v-search{position:relative}
    .v-search__list{display:none;position:absolute;top:100%;left:0;right:0;z-index:30;max-height:220px;overflow-y:auto;
      background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:10px;margin-top:.3rem;box-shadow:0 20px 50px -15px rgba(0,0,0,.6)}
    .v-search__list.is-open{display:block}
    .v-combo__btn{display:flex;align-items:center;justify-content:space-between;gap:.5rem;text-align:left;cursor:pointer}
    .v-combo__btn svg{flex-shrink:0;color:var(--muted,#8b98ad)}
    .v-combo__list{display:none;position:absolute;top:100%;left:0;right:0;z-index:30;max-height:220px;overflow-y:auto;
      background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:10px;margin-top:.3rem;box-shadow:0 20px 50px -15px rgba(0,0,0,.6)}
    .v-combo__list.is-open{display:block}
    .v-combo__opt{padding:.55rem .75rem;cursor:pointer;font-size:.86rem;color:var(--text,#cfd6e2);border-bottom:1px solid var(--line,rgba(255,255,255,.06))}
    .v-combo__opt:last-child{border-bottom:0}
    .v-combo__opt:hover,.v-combo__opt.is-active{background:var(--brand,#6E8BFF);color:#fff}
    .v-file{display:flex;align-items:center;gap:.6rem;padding:.7rem .8rem;border:1.5px dashed var(--line,rgba(255,255,255,.18));border-radius:10px;color:var(--muted,#8b98ad);cursor:pointer;font-size:.86rem;transition:.15s}
    .v-file:hover{border-color:var(--brand,#6E8BFF);color:var(--text,#fff)}
    .v-modal__foot{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem}
    .v-det{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .9rem;margin-bottom:1rem}
    @media(max-width:560px){.v-det{grid-template-columns:1fr}}
    .v-det__row{display:flex;flex-direction:column;gap:.1rem;padding:.4rem .6rem;background:rgba(255,255,255,.025);border-radius:8px}
    .v-det__row span{font-size:.72rem;color:var(--faint,#5b6677)}
    .v-det__row b{font-size:.88rem;color:var(--text,#e8edf6);font-weight:600}
    .v-evi-wrap{margin-bottom:.5rem}
    .v-evi-lbl{font-size:.78rem;color:var(--muted,#8b98ad);display:block;margin-bottom:.4rem}
    .v-evi{max-width:100%;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.1))}
    .v-noevi{color:var(--faint,#5b6677);font-size:.85rem;font-style:italic}
    .v-btn-bad{color:#FB7185;border-color:rgba(251,113,133,.4)}
    /* Toast */
    .v-toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(20px);background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.12));color:var(--text,#fff);padding:.8rem 1.2rem;border-radius:12px;font-size:.88rem;z-index:9500;opacity:0;transition:.3s;box-shadow:0 16px 40px rgba(0,0,0,.4)}
    .v-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .v-toast--ok{border-left:3px solid #34D399}
    .v-toast--warn{border-left:3px solid #F2B84B}`;
  document.head.appendChild(css);
})();
