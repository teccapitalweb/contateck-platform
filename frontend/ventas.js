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
// ============================================================
(function () {
  "use strict";

  const METODOS = ["SPEI / Transferencia", "Efectivo", "Tarjeta de crédito", "Tarjeta de débito", "Depósito en efectivo", "Otro"];
  const BANCOS = ["BBVA", "Santander", "Banorte", "Citibanamex", "HSBC", "Scotiabank", "Banco Azteca", "Otro"];
  const ESTADOS = {
    pendiente: { txt: "Pendiente", cls: "v-badge--warn" },
    revision: { txt: "En revisión", cls: "v-badge--warn" },
    confirmado: { txt: "Confirmado", cls: "v-badge--ok" },
    rechazado: { txt: "Rechazado", cls: "v-badge--bad" },
  };
  const ROLES_VALIDADORES = ["contador", "admin", "director"];

  // ---------- Backend / sesión ----------
  function backendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
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

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hoy() { return new Date().toISOString().slice(0, 10); }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(f + (f.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d)) return f;
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }
  function idCorto(id) { return id ? String(id).slice(0, 8) + "…" : "—"; }
  function uuidCliente() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------- Toast ----------
  function toast(msg, tipo) {
    let t = document.createElement("div");
    t.className = "v-toast v-toast--" + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------- Supabase Storage (directo, sin pasar por el backend) ----------
  function storageCfg() { return window.SUPABASE_CONFIG || null; }
  async function subirComprobante(file, empresaId) {
    const cfg = storageCfg();
    const t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) throw new Error("Sesión o configuración de Storage no disponible.");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = empresaId + "/ventas/" + uuidCliente() + "/comprobante." + ext;
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
  async function cargarVentas() {
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
          </div>
        </div>
        <div style="overflow-x:auto">
          <table class="tbl v-tbl">
            <thead><tr><th>Folio</th><th>Cliente</th><th>Concepto</th><th>Consultora</th><th style="text-align:right">Importe</th><th>Vendedor</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody data-v-rows></tbody>
          </table>
        </div>
      </div>`;
    await Promise.all([cargarVentas(), esperarPerfil()]);
    renderKpis();
    renderRows();
  }

  function renderKpis() {
    const cont = document.querySelector("[data-v-kpis]");
    if (!cont) return;
    const arr = ventasCache;
    const pend = arr.filter((v) => v.estado === "pendiente");
    const enRev = arr.filter((v) => v.estado === "revision");
    const conf = arr.filter((v) => v.estado === "confirmado");
    const montoConf = conf.reduce((s, v) => s + Number(v.importe || 0), 0);
    const montoPend = pend.concat(enRev).reduce((s, v) => s + Number(v.importe || 0), 0);
    cont.innerHTML = `
      <div class="v-kpi"><span class="v-kpi__l">Pendientes + en revisión</span><b class="v-kpi__n">${pend.length + enRev.length}</b><span class="v-kpi__s">${money(montoPend)} por validar</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Confirmados</span><b class="v-kpi__n">${conf.length}</b><span class="v-kpi__s">${money(montoConf)} ingresado</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Total registros</span><b class="v-kpi__n">${arr.length}</b><span class="v-kpi__s">esta empresa</span></div>
      <div class="v-kpi v-kpi--accent"><span class="v-kpi__l">Ingreso confirmado</span><b class="v-kpi__n">${money(montoConf)}</b><span class="v-kpi__s">pagos validados</span></div>`;
  }

  function accionesFila(v) {
    let acciones = `<button class="v-mini" data-v-ver="${v.id}">Ver</button>`;
    const soyCreador = v.created_by === miId();
    if (!esValidador() || soyCreador) return acciones; // sin permiso o es su propio registro
    if (v.estado === "pendiente") {
      acciones += `<button class="v-mini v-mini--ok" data-v-tomar="${v.id}">Tomar para revisión</button>`;
    } else if (v.estado === "revision") {
      acciones += `<button class="v-mini v-mini--ok" data-v-conf="${v.id}">Confirmar</button><button class="v-mini v-mini--bad" data-v-rech="${v.id}">Rechazar</button>`;
    }
    return acciones;
  }

  function renderRows() {
    const tb = document.querySelector("[data-v-rows]");
    if (!tb) return;
    let arr = ventasCache.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filtroActual !== "todos") arr = arr.filter((v) => v.estado === filtroActual);
    if (!arr.length) {
      tb.innerHTML = `<tr><td colspan="9" class="v-empty">Sin pagos registrados. Da clic en "Nueva venta" para empezar.</td></tr>`;
      return;
    }
    tb.innerHTML = arr.map((v) => {
      const e = ESTADOS[v.estado] || ESTADOS.pendiente;
      return `<tr>
        <td><b>${v.folio}</b></td>
        <td>${v.cliente || "—"}</td>
        <td>${v.concepto || "—"}</td>
        <td>${v.consultora_id ? idCorto(v.consultora_id) : "—"}</td>
        <td style="text-align:right">${money(v.importe)}</td>
        <td>${v.vendedor_id ? idCorto(v.vendedor_id) : "—"}</td>
        <td>${fmtFecha(v.fecha_pago)}</td>
        <td><span class="v-badge ${e.cls}">${e.txt}</span></td>
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
  function openNuevaVenta() {
    archivoSeleccionado = null;
    openModal(`
      <h2 class="v-h2">Nueva venta / Registro de pago</h2>
      <p class="v-sub">El pago quedará <b>Pendiente</b> hasta que alguien de administración lo tome para revisión.</p>
      <div class="v-grid2">
        <div class="v-field"><label>Cliente</label><input class="v-inp" id="v-cliente" placeholder="Nombre del cliente"></div>
        <div class="v-field"><label>Concepto</label><input class="v-inp" id="v-concepto" placeholder="Servicio, curso o concepto"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Consultora</label><input class="v-inp" id="v-consultora" placeholder="Ej. IMDAC"></div>
        <div class="v-field"><label>Importe</label><input class="v-inp" id="v-importe" type="number" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Fecha de pago</label><input class="v-inp" id="v-fecha" type="date" value="${hoy()}"></div>
        <div class="v-field"><label>Método de pago</label><select class="v-inp" id="v-metodo">${METODOS.map((m) => `<option>${m}</option>`).join("")}</select></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Referencia / Folio</label><input class="v-inp" id="v-ref" placeholder="0001234567"></div>
        <div class="v-field"><label>Banco emisor</label><select class="v-inp" id="v-banco">${BANCOS.map((b) => `<option>${b}</option>`).join("")}</select></div>
      </div>
      <div class="v-field">
        <label>Comprobante (imagen o PDF)</label>
        <div class="v-file" data-v-file><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></svg><span data-v-file-txt>Adjuntar imagen, PDF o captura</span><input type="file" id="v-comprobante" accept="image/*,application/pdf" hidden></div>
      </div>
      <div class="v-field"><label>Notas (opcional)</label><textarea class="v-inp" id="v-notas" rows="2" placeholder="Comentarios..."></textarea></div>
      <div class="v-modal__foot">
        <button class="btn btn--ghost" data-v-close>Cancelar</button>
        <button class="btn btn--primary" data-v-guardar>Guardar registro</button>
      </div>`);
  }

  async function guardarVenta() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const cliente = g("v-cliente"), concepto = g("v-concepto"), importe = parseFloat(g("v-importe")) || 0;
    if (!cliente) { toast("Captura el nombre del cliente", "warn"); return; }
    if (!concepto) { toast("Captura el concepto o servicio", "warn"); return; }
    if (!importe) { toast("Captura el importe del pago", "warn"); return; }

    const btn = document.querySelector("[data-v-guardar]");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

    try {
      let comprobantePath = null;
      const perfil = await esperarPerfil();
      const empresa = miEmpresa();
      const empresaId = empresa && empresa.id;
      if (archivoSeleccionado && !empresaId) {
        toast("No se pudo determinar tu empresa todavía; el comprobante NO se subió. Espera unos segundos, recarga la página e inténtalo de nuevo.", "warn");
      } else if (archivoSeleccionado && empresaId) {
        comprobantePath = await subirComprobante(archivoSeleccionado, empresaId);
      }

      const resp = await fetch(backendUrl() + "/api/ventas", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          cliente, concepto,
          consultoraId: null, // OT-0014: consultora sigue como texto por ahora
          importe,
          fechaPago: g("v-fecha"),
          metodoPago: g("v-metodo"),
          referencia: g("v-ref"),
          banco: g("v-banco"),
          notas: g("v-notas"),
          comprobantePath,
        }),
      });
      const data = await resp.json();
      if (!data.ok) { toast("No se pudo guardar: " + (data.error || "error"), "warn"); return; }

      closeModal();
      toast("Pago registrado · queda Pendiente");
      await render();
    } catch (e) {
      toast("Error al guardar: " + e.message, "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Guardar registro"; }
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
    if (esValidador() && !soyCreador) {
      if (v.estado === "pendiente") acciones = `<button class="btn btn--primary" data-v-tomar="${v.id}">Tomar para revisión</button>`;
      else if (v.estado === "revision") acciones = `<button class="btn btn--ghost v-btn-bad" data-v-rech="${v.id}">Rechazar</button><button class="btn btn--primary" data-v-conf="${v.id}">Confirmar pago</button>`;
    }
    openModal(`
      <h2 class="v-h2">Pago ${v.folio}</h2>
      <span class="v-badge ${e.cls}" style="margin-bottom:.8rem;display:inline-block">${e.txt}</span>
      <div class="v-det">
        ${detRow("Cliente", v.cliente)}${detRow("Concepto", v.concepto)}${detRow("Consultora", v.consultora_id ? idCorto(v.consultora_id) : "")}
        ${detRow("Importe", money(v.importe))}${detRow("Fecha de pago", fmtFecha(v.fecha_pago))}${detRow("Método", v.metodo_pago)}
        ${detRow("Referencia", v.referencia)}${detRow("Banco", v.banco)}
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
        else if (v.comprobante_path.toLowerCase().endsWith(".pdf")) host.innerHTML = `<a class="btn btn--ghost" href="${url}" target="_blank">Abrir comprobante PDF</a>`;
        else host.innerHTML = `<img class="v-evi" src="${url}" alt="comprobante">`;
      }
    } else {
      const host = document.querySelector("[data-v-evi]");
      if (host) host.innerHTML = `<p class="v-noevi">Sin comprobante adjunto</p>`;
    }
  }
  function detRow(k, v) { return `<div class="v-det__row"><span>${k}</span><b>${v || "—"}</b></div>`; }

  // ---------- Transiciones ----------
  async function accionVenta(endpoint, id, msgOk) {
    try {
      const resp = await fetch(backendUrl() + "/api/ventas/" + id + "/" + endpoint, { method: "POST", headers: authHeaders(true) });
      const data = await resp.json();
      if (!data.ok) { toast(data.error || "No se pudo completar la acción", "warn"); return; }
      closeModal();
      toast(msgOk);
      await render();
      document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
    } catch (e) {
      toast("Error: " + e.message, "warn");
    }
  }
  function tomar(id) { return accionVenta("tomar", id, "Venta tomada para revisión"); }
  function confirmar(id) { return accionVenta("confirmar", id, "Pago confirmado ✓"); }
  function rechazar(id) { return accionVenta("rechazar", id, "Pago rechazado"); }

  // ---------- API pública para otros módulos ----------
  window.CTVentas = {
    getVentas: () => ventasCache.slice(),
    getConfirmadas: () => ventasCache.filter((v) => v.estado === "confirmado"),
  };

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-v-nueva]")) { openNuevaVenta(); return; }
    if (e.target.closest("[data-v-guardar]")) { guardarVenta(); return; }
    const ver = e.target.closest("[data-v-ver]"); if (ver) { verDetalle(ver.getAttribute("data-v-ver")); return; }
    const tom = e.target.closest("[data-v-tomar]"); if (tom) { tomar(tom.getAttribute("data-v-tomar")); return; }
    const conf = e.target.closest("[data-v-conf]"); if (conf) { confirmar(conf.getAttribute("data-v-conf")); return; }
    const rech = e.target.closest("[data-v-rech]"); if (rech) { rechazar(rech.getAttribute("data-v-rech")); return; }
    const chip = e.target.closest("[data-f]");
    if (chip) {
      filtroActual = chip.getAttribute("data-f");
      document.querySelectorAll("[data-v-filtros] .v-chip").forEach((c) => c.classList.toggle("is-on", c === chip));
      renderRows();
      return;
    }
    const file = e.target.closest("[data-v-file]");
    if (file) { const inp = document.getElementById("v-comprobante"); if (inp) inp.click(); return; }
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
    select.v-inp{cursor:pointer}
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
