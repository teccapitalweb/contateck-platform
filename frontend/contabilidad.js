/* ============================================================
   CONTATECK · Módulo 01 · Contabilidad General
   Catálogo de cuentas · Pólizas (Debe/Haber) · Libro Mayor · Balanza
   Datos en el navegador (localStorage). Toma control del módulo
   "contabilidad" del dashboard, reemplazando los datos de ejemplo.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hoyISO = () => {
    try { return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  };
  const fechaCorta = (iso) => {
    const m = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const p = String(iso || "").split("-");
    if (p.length !== 3) return iso || "";
    return `${parseInt(p[2], 10)} ${m[parseInt(p[1], 10) - 1] || ""}`;
  };
  // OT-0020: toast local — data-firestore.js tiene la suya pero es módulo
  // ES (no global), así que este archivo necesita su propia copia. Usa el
  // mismo contenedor [data-toasts] y las mismas clases CSS del dashboard.
  function toast(msg, type = "info", ms = 3200) {
    const wrap = document.querySelector("[data-toasts]");
    if (!wrap) { try { console.log("[toast:" + type + "]", msg); } catch (e) {} return; }
    const iconos = {
      ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
      warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
      err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    };
    const el = document.createElement("div");
    el.className = "toast toast--" + type;
    el.innerHTML = (iconos[type] || iconos.info) + "<span>" + msg + "</span>";
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 320); }, ms);
  }

  /* ---------- Persistencia ---------- */
  // OT-Cuentas: el catálogo ya NO vive en localStorage — cada empresa
  // tiene su propio catálogo real y compartido en Postgres (mismo
  // patrón que ya usan las pólizas en este mismo archivo: un caché en
  // memoria que se alimenta de Postgres al cargar, y cada escritura va
  // directo al backend). localStorage solo queda como respaldo mientras
  // carga la primera vez, para no mostrar la pantalla vacía un instante.
  const K_POLIZAS = "contateck_polizas";
  const K_FOLIOS  = "contateck_folios";
  const K_CUENTAS_CACHE = "contateck_cuentas_cache"; // solo respaldo de lectura, nunca la fuente de verdad

  let _cuentasCache = null; // null = todavía no ha cargado de Postgres

  function leerCuentas() {
    if (_cuentasCache) return _cuentasCache;
    try {
      const raw = JSON.parse(localStorage.getItem(K_CUENTAS_CACHE) || "null");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) {}
    return [];
  }
  function guardarCuentas(arr) {
    _cuentasCache = arr || [];
    try { localStorage.setItem(K_CUENTAS_CACHE, JSON.stringify(_cuentasCache)); } catch (e) {}
    return true;
  }

  // Convierte una fila de Postgres (snake_case, minúsculas) al formato
  // que usa el resto de este archivo (nat: "Deudora"/"Acreedora"), e
  // infiere "padre" por el primer dígito del código (100→mayor de 101,
  // 102... — mismo Código Agrupador del SAT que ya usa el Dashboard).
  function desdePostgres(filas) {
    const mayores = filas.filter((c) => c.nivel === 1);
    return filas.map((c) => {
      const padre = c.nivel === 1 ? null : (mayores.find((m) => m.codigo[0] === c.codigo[0]) || {}).codigo || null;
      return { id: c.id, codigo: c.codigo, nombre: c.nombre, nat: c.naturaleza === "deudora" ? "Deudora" : "Acreedora", nivel: c.nivel, padre, activo: c.activo !== false };
    }).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  }

  async function cargarCatalogoReal() {
    try {
      // Espera a que auth-guard.js termine de poner el token de sesión —
      // sin esto, si esta función corre antes de que la sesión cargue
      // (variable de una recarga a otra), se rendía en silencio sin ni
      // siquiera intentar preguntarle a Postgres.
      const inicio = Date.now();
      while (!window.CONTATECK_SUPABASE_TOKEN && Date.now() - inicio < 4000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
      if (!cfg || !t) return false;
      const resp = await fetch(cfg.url + "/rest/v1/cuentas_contables?select=*&order=codigo.asc", {
        headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey },
      });
      const data = await resp.json();
      if (!Array.isArray(data)) return false;
      guardarCuentas(desdePostgres(data));
      return true;
    } catch (e) { return false; }
  }
  function leerPolizas() {
    try {
      const raw = JSON.parse(localStorage.getItem(K_POLIZAS) || "null");
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    return [];
  }
  function guardarPolizas(arr) {
    try { localStorage.setItem(K_POLIZAS, JSON.stringify(arr || [])); return true; }
    catch (e) { return false; }
  }
  // OT-0012: el folio "de verdad" ahora lo genera Postgres de forma atómica
  // dentro de crear_poliza_completa (ver siguiente_folio en la base) —
  // así dos dispositivos/usuarios de la misma empresa nunca repiten folio.
  // Esta función local queda SOLO como respaldo cuando no hay sesión de
  // Postgres (modo local puro): el prefijo LOCAL- deja claro que ese
  // folio no es definitivo y no debe usarse para reportes fiscales.
  function siguienteFolioLocal(tipo) {
    let folios = {};
    try { folios = JSON.parse(localStorage.getItem(K_FOLIOS) || "{}") || {}; } catch (e) {}
    const letra = tipo === "Ingreso" ? "I" : tipo === "Egreso" ? "E" : "D";
    const n = (folios[letra] || 0) + 1;
    folios[letra] = n;
    try { localStorage.setItem(K_FOLIOS, JSON.stringify(folios)); } catch (e) {}
    return `LOCAL-${letra}-${String(n).padStart(5, "0")}`;
  }

  /* ---------- API de datos ---------- */
  function getCuentas() { return leerCuentas().slice(); }
  function getCuentasAfectables() { return getCuentas().filter((c) => c.nivel === 2 && c.activo !== false); }
  function getCuentaPorCodigo(codigo) { return getCuentas().find((c) => c.codigo === codigo) || null; }
  function getCuentaPorId(id) { return id ? getCuentas().find((c) => c.id === id) || null : null; }

  // ---------- OT-0020: Configuración contable de la empresa ----------
  // Reemplaza los códigos de cuenta que antes estaban quemados en el
  // código (102, 105, 201, 401, 209, 118, 601). Cada empresa mapea sus
  // propias cuentas reales una sola vez, en Configuración contable.
  const ROLES_CONFIG_CONTABLE = {
    bancos: "cuenta_bancos_id", clientes: "cuenta_clientes_id", proveedores: "cuenta_proveedores_id",
    ventas: "cuenta_ventas_id", ivaTrasladado: "cuenta_iva_trasladado_id", ivaAcreditable: "cuenta_iva_acreditable_id",
    gastos: "cuenta_gastos_id",
  };
  function configContable() { return window.CONTATECK_CONFIG_CONTABLE_PG || {}; }
  // Regresa la cuenta configurada para ese rol, o null si la empresa
  // todavía no la configuró — NUNCA una cuenta adivinada de respaldo.
  function cuentaRol(rol) {
    const campo = ROLES_CONFIG_CONTABLE[rol];
    if (!campo) return null;
    return getCuentaPorId(configContable()[campo]);
  }
  const NOMBRES_ROL = {
    bancos: "Bancos", clientes: "Clientes", proveedores: "Proveedores", ventas: "Ventas y servicios",
    ivaTrasladado: "IVA trasladado", ivaAcreditable: "IVA acreditable", gastos: "Gastos de operación",
  };
  // Mensaje de error con botón directo a la pantalla de configuración —
  // el handler global de [data-cont-config-contable] ya lo escucha.
  function errorConfigHTML(texto) {
    const esConfig = /Falta configurar|no está configurada/i.test(texto || "");
    return `<div class="cont-err">${esc(texto)}${esConfig
      ? `<div style="margin-top:.5rem"><button type="button" class="btn btn--sm btn--primary" data-cont-config-contable>Abrir Configuración contable</button></div>` : ""}</div>`;
  }
  async function saveCuenta(cuenta) {
    cuenta = cuenta || {};
    const payload = { codigo: cuenta.codigo, nombre: cuenta.nombre, naturaleza: cuenta.nat === "Deudora" ? "deudora" : "acreedora", nivel: cuenta.nivel };
    let r;
    if (cuenta.id) r = await window.CTPostgres.actualizar("cuentas_contables", cuenta.id, payload);
    else r = await window.CTPostgres.crear("cuentas_contables", payload);
    if (!r.ok) return { ok: false, error: r.error || "No se pudo guardar la cuenta." };
    await cargarCatalogoReal(); // refresca el caché con lo que Postgres de verdad tiene
    return { ok: true, cuenta: r.registro };
  }
  async function deleteCuenta(id) {
    const r = await window.CTPostgres.eliminar("cuentas_contables", id);
    if (!r.ok) return { ok: false, error: r.error || "No se pudo desactivar la cuenta." };
    await cargarCatalogoReal();
    return { ok: true };
  }
  async function reactivarCuenta(id) {
    const r = await window.CTPostgres.reactivar("cuentas_contables", id);
    if (!r.ok) return { ok: false, error: r.error || "No se pudo reactivar la cuenta." };
    await cargarCatalogoReal();
    return { ok: true };
  }
  function getPolizas() {
    return leerPolizas().slice().sort((a, b) => (b.creada || 0) - (a.creada || 0));
  }
  async function savePoliza(poliza) {
    const arr = leerPolizas();
    poliza = poliza || {};
    // OT-0010: ahora se manda la póliza COMPLETA (encabezado + partidas) a
    // Postgres — el cuadre Debe=Haber lo valida la función de la base,
    // no solo el frontend.
    const asientos = poliza.asientos || [];
    const partidasPayload = asientos.map((a, i) => ({
      codigo: a.codigo, debe: num(a.debe), haber: num(a.haber), descripcion: a.descripcion || null, orden: i,
    }));
    let pgError = null;
    if (!poliza.id) {
      poliza.id = "p" + Date.now() + Math.floor(Math.random() * 1000);
      poliza.creada = Date.now();
      let rechazado = false;
      if (window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN) {
        try {
          // OT-0012: NO se manda folio — Postgres lo genera de forma
          // atómica y lo regresa junto con el id.
          const r = await window.CTPostgres.crearPolizaCompleta({
            tipo: poliza.tipo, fecha: poliza.fecha, concepto: poliza.concepto, partidas: partidasPayload,
          });
          if (r.ok) { poliza.pgId = r.id; poliza.folio = r.folio; poliza.origen = "postgres"; }
          else { pgError = r.error; rechazado = true; }
        } catch (e) { pgError = e.message; poliza.origen = "local"; }
      } else { poliza.origen = "local"; }
      // Solo cae al folio local (marcado LOCAL-) si de plano no hubo
      // sesión de Postgres — nunca como fallback silencioso de un error.
      if (!poliza.folio) poliza.folio = siguienteFolioLocal(poliza.tipo);
      if (!rechazado) arr.push(poliza);
    } else {
      const i = arr.findIndex((p) => p.id === poliza.id);
      const existente = i >= 0 ? arr[i] : null;
      if (existente && existente.pgId && window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN) {
        try {
          const r = await window.CTPostgres.actualizarPolizaCompleta(existente.pgId, {
            tipo: poliza.tipo, fecha: poliza.fecha, concepto: poliza.concepto, partidas: partidasPayload,
          });
          if (!r.ok) pgError = r.error;
        } catch (e) { pgError = e.message; }
      }
      if (!pgError) {
        if (i >= 0) arr[i] = { ...arr[i], ...poliza };
        else arr.push(poliza);
        guardarPolizas(arr);
      }
      return { poliza: pgError ? existente : poliza, pgError };
    }
    guardarPolizas(arr);
    return { poliza, pgError };
  }
  async function deletePoliza(id) {
    const arr = leerPolizas();
    const existente = arr.find((p) => p.id === id);
    if (existente && existente.pgId && window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN) {
      const r = await window.CTPostgres.eliminar("polizas", existente.pgId);
      if (!r.ok) return { ok: false, error: r.error };
    }
    guardarPolizas(arr.filter((p) => p.id !== id));
    return { ok: true };
  }

  /* ---------- Cálculos contables ---------- */
  // Movimientos (cargos/abonos) de una cuenta de detalle, de las pólizas del periodo.
  function movimientosCuenta(codigo) {
    let debe = 0, haber = 0; const movs = [];
    polizasDelPeriodo().forEach((p) => {
      (p.asientos || []).forEach((a) => {
        if (a.codigo === codigo) {
          const d = num(a.debe), h = num(a.haber);
          debe += d; haber += h;
          movs.push({ fecha: p.fecha, folio: p.folio, concepto: p.concepto, debe: d, haber: h });
        }
      });
    });
    movs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return { debe: round2(debe), haber: round2(haber), movs };
  }
  // Saldo de una cuenta según su naturaleza.
  function saldoCuenta(cuenta) {
    if (cuenta.nivel === 1) {
      // Mayor: suma de los saldos de sus cuentas hijas.
      return round2(getCuentas()
        .filter((c) => c.padre === cuenta.codigo)
        .reduce((s, c) => s + saldoCuenta(c), 0));
    }
    const { debe, haber } = movimientosCuenta(cuenta.codigo);
    return round2(cuenta.nat === "Deudora" ? debe - haber : haber - debe);
  }
  // Balanza de comprobación: una fila por cuenta afectable con cargos/abonos/saldo.
  function balanza() {
    const filas = getCuentasAfectables().map((c) => {
      const { debe, haber } = movimientosCuenta(c.codigo);
      const saldo = c.nat === "Deudora" ? debe - haber : haber - debe;
      return {
        codigo: c.codigo, nombre: c.nombre, nat: c.nat,
        debe: round2(debe), haber: round2(haber),
        saldoDeudor: c.nat === "Deudora" ? round2(Math.max(saldo, 0)) : (saldo < 0 ? round2(-saldo) : 0),
        saldoAcreedor: c.nat === "Acreedora" ? round2(Math.max(saldo, 0)) : (saldo < 0 ? round2(-saldo) : 0),
      };
    });
    const tot = filas.reduce((t, f) => ({
      debe: t.debe + f.debe, haber: t.haber + f.haber,
      saldoDeudor: t.saldoDeudor + f.saldoDeudor, saldoAcreedor: t.saldoAcreedor + f.saldoAcreedor,
    }), { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0 });
    Object.keys(tot).forEach((k) => (tot[k] = round2(tot[k])));
    return { filas, tot, cuadra: Math.abs(tot.debe - tot.haber) < 0.01 };
  }

  /* ============================================================
     BLOQUE 1 · Pólizas automáticas desde CFDI
     Conecta el módulo de Facturación con la Contabilidad.
     ============================================================ */
  const K_CONTAB = "contateck_cfdi_contab"; // CFDIs ya contabilizados (evita duplicar)

  // Deriva subtotal/IVA/total de un CFDI. El sistema factura al 16%,
  // así que si no viene desglosado se calcula de forma exacta.
  function montosCfdi(cfdi) {
    const total = round2(num(cfdi.total));
    let subtotal = round2(num(cfdi.subtotal)), iva = round2(num(cfdi.iva));
    if (!subtotal && !iva && total) {
      subtotal = round2(total / 1.16);
      iva = round2(total - subtotal);
    }
    return { subtotal, iva, total };
  }
  function fechaISOcfdi(cfdi) {
    if (cfdi && cfdi.createdAt) {
      try { return new Date(cfdi.createdAt).toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); } catch (e) {}
    }
    return hoyISO();
  }
  function cfdiKey(cfdi) { return String(cfdi.uuidFull || cfdi.id || cfdi.folio || ""); }

  // Genera el objeto póliza (sin guardar) a partir de un CFDI emitido.
  // OT-0020: las cuentas ya NO están quemadas — salen de Configuración
  // contable. Si falta alguna, regresa { error } en vez de adivinar.
  function cfdiAPoliza(cfdi) {
    const { subtotal, iva, total } = montosCfdi(cfdi);
    const folioRef = cfdi.folio || (cfdi.uuidFull ? cfdi.uuidFull.slice(0, 8) : "CFDI");
    const cli = cfdi.cliente || "Cliente";
    const base = { fecha: fechaISOcfdi(cfdi), cfdiUuid: cfdi.uuidFull || "", origen: "cfdi" };
    const cBancos = cuentaRol("bancos"), cClientes = cuentaRol("clientes"),
          cVentas = cuentaRol("ventas"), cIvaTrasladado = cuentaRol("ivaTrasladado");
    const faltantes = [];
    if (!cBancos) faltantes.push(NOMBRES_ROL.bancos);
    if (!cClientes) faltantes.push(NOMBRES_ROL.clientes);
    if (cfdi.tipo !== "P" && !cVentas) faltantes.push(NOMBRES_ROL.ventas);
    if (cfdi.tipo !== "P" && !cIvaTrasladado) faltantes.push(NOMBRES_ROL.ivaTrasladado);
    if (faltantes.length) {
      return { error: `Falta configurar: ${faltantes.join(", ")}. Ve a Configuración contable antes de importar.` };
    }
    if (cfdi.tipo === "P") { // REP: pago recibido → Bancos / Clientes
      return Object.assign(base, { tipo: "Ingreso", concepto: `Cobro CFDI ${folioRef} · ${cli}`,
        asientos: [
          { codigo: cBancos.codigo, nombre: cBancos.nombre, debe: total, haber: 0 },
          { codigo: cClientes.codigo, nombre: cClientes.nombre, debe: 0, haber: total },
        ] });
    }
    if (cfdi.tipo === "E") { // Nota de crédito: reversa de venta
      return Object.assign(base, { tipo: "Egreso", concepto: `Nota de crédito ${folioRef} · ${cli}`,
        asientos: [
          { codigo: cVentas.codigo, nombre: cVentas.nombre, debe: subtotal, haber: 0 },
          { codigo: cIvaTrasladado.codigo, nombre: cIvaTrasladado.nombre, debe: iva, haber: 0 },
          { codigo: cClientes.codigo, nombre: cClientes.nombre, debe: 0, haber: total },
        ] });
    }
    // Factura de ingreso (tipo I): Clientes / Ventas + IVA trasladado
    return Object.assign(base, { tipo: "Ingreso", concepto: `Factura ${folioRef} · ${cli}`,
      asientos: [
        { codigo: cClientes.codigo, nombre: cClientes.nombre, debe: total, haber: 0 },
        { codigo: cVentas.codigo, nombre: cVentas.nombre, debe: 0, haber: subtotal },
        { codigo: cIvaTrasladado.codigo, nombre: cIvaTrasladado.nombre, debe: 0, haber: iva },
      ] });
  }

  function getContabilizados() {
    try { const a = JSON.parse(localStorage.getItem(K_CONTAB) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function marcarContabilizado(key) {
    const arr = getContabilizados();
    if (key && arr.indexOf(key) < 0) { arr.push(key); try { localStorage.setItem(K_CONTAB, JSON.stringify(arr)); } catch (e) {} }
  }
  function leerCfdis() {
    try { return (window.CTData && window.CTData.getCfdis) ? window.CTData.getCfdis() : []; }
    catch (e) { return []; }
  }
  function cfdisPendientes() {
    const cont = getContabilizados();
    return leerCfdis().filter((c) => c && c.estado !== "cancelada" && cont.indexOf(cfdiKey(c)) < 0);
  }
  function contabilizarCfdi(cfdi) {
    const poliza = cfdiAPoliza(cfdi);
    if (poliza.error) return poliza.error; // el llamador decide cómo mostrarlo
    savePoliza(poliza);
    marcarContabilizado(cfdiKey(cfdi));
    return null;
  }

  /* ---------- Importar CFDI recibido (XML de proveedor) ---------- */
  function findByLocal(root, local) {
    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === local) return all[i];
    return null;
  }
  function parsearCfdiXml(xmlText) {
    let doc;
    try { doc = new DOMParser().parseFromString(xmlText, "text/xml"); } catch (e) { return null; }
    if (!doc || doc.getElementsByTagName("parsererror").length) return null;
    const comp = findByLocal(doc, "Comprobante");
    if (!comp) return null;
    const ga = (el, a) => (el ? el.getAttribute(a) || "" : "");
    const emisor = findByLocal(doc, "Emisor");
    const tfd = findByLocal(doc, "TimbreFiscalDigital");
    const impTotal = findByLocal(doc, "Impuestos");
    const total = round2(num(ga(comp, "Total")));
    let subtotal = round2(num(ga(comp, "SubTotal")));
    const descuento = round2(num(ga(comp, "Descuento")));
    if (descuento) subtotal = round2(subtotal - descuento);
    let iva = round2(num(ga(impTotal, "TotalImpuestosTrasladados")));
    if (!iva && total && subtotal) iva = round2(total - subtotal);
    if (!subtotal && total) { subtotal = round2(total / 1.16); iva = round2(total - subtotal); }
    return {
      total, subtotal, iva,
      rfcEmisor: ga(emisor, "Rfc"), nombreEmisor: ga(emisor, "Nombre"),
      uuid: ga(tfd, "UUID"), fecha: (ga(comp, "Fecha") || "").slice(0, 10) || hoyISO(),
      // OT-0023: para persistir la factura como documento propio y
      // distinguir PUE/PPD igual que ya se hace con las emitidas (OT-0019).
      serie: ga(comp, "Serie") || "", folio: ga(comp, "Folio") || "",
      metodoPago: ga(comp, "MetodoPago") || "", formaPago: ga(comp, "FormaPago") || "",
    };
  }
  function xmlAPolizaGasto(d) {
    const total = d.total, subtotal = d.subtotal, iva = d.iva;
    const ref = d.uuid ? d.uuid.slice(0, 8) : (d.rfcEmisor || "XML");
    // OT-0020: cuentas desde Configuración contable, nunca quemadas.
    const cGastos = cuentaRol("gastos"), cIvaA = cuentaRol("ivaAcreditable"), cProv = cuentaRol("proveedores");
    const faltantes = [!cGastos && NOMBRES_ROL.gastos, !cIvaA && NOMBRES_ROL.ivaAcreditable, !cProv && NOMBRES_ROL.proveedores].filter(Boolean);
    if (faltantes.length) {
      return { error: `Falta configurar: ${faltantes.join(", ")}. Ve a Configuración contable antes de importar el XML.` };
    }
    return {
      tipo: "Egreso", fecha: d.fecha || hoyISO(), cfdiUuid: d.uuid || "", origen: "cfdi-recibido",
      proveedorRfc: d.rfcEmisor || "", proveedorNombre: d.nombreEmisor || "",
      concepto: `Gasto CFDI ${ref} · ${d.nombreEmisor || d.rfcEmisor || "Proveedor"}`,
      asientos: [
        { codigo: cGastos.codigo, nombre: cGastos.nombre, debe: subtotal, haber: 0 },
        { codigo: cIvaA.codigo,   nombre: cIvaA.nombre,   debe: iva, haber: 0 },
        { codigo: cProv.codigo,   nombre: cProv.nombre,   debe: 0, haber: total },
      ],
    };
  }

  /* ============================================================
     BLOQUE 4 (parte) · Periodos contables
     Filtra los cálculos por mes/ejercicio. null = todo el ejercicio.
     ============================================================ */
  let periodoActivo = null; // { mes:1-12, anio } o null
  function setPeriodo(p) { periodoActivo = p; }
  function getPeriodo() { return periodoActivo; }
  function polizasDelPeriodo() {
    const all = leerPolizas();
    if (!periodoActivo) return all;
    return all.filter((p) => {
      const parts = String(p.fecha || "").split("-");
      return parts.length === 3 && parseInt(parts[0], 10) === periodoActivo.anio && parseInt(parts[1], 10) === periodoActivo.mes;
    });
  }
  function periodosDisponibles() {
    const meses = {};
    leerPolizas().forEach((p) => {
      const parts = String(p.fecha || "").split("-");
      if (parts.length === 3) meses[parts[0] + "-" + parts[1]] = { anio: parseInt(parts[0], 10), mes: parseInt(parts[1], 10) };
    });
    return Object.keys(meses).sort().reverse().map((k) => meses[k]);
  }

  /* ============================================================
     BLOQUE 2 · Estados financieros
     ============================================================ */
  function grupoDetalle(codMayor) {
    return getCuentas().filter((c) => c.padre === codMayor)
      .map((c) => ({ codigo: c.codigo, nombre: c.nombre, saldo: Math.abs(saldoCuenta(c)) }))
      .filter((x) => x.saldo !== 0);
  }
  // Estado de Resultados: Ingresos − Costos y gastos = Utilidad
  function estadoResultados() {
    const ingresos = grupoDetalle("400");
    const gastos = grupoDetalle("500");
    const totalIngresos = round2(ingresos.reduce((s, x) => s + x.saldo, 0));
    const totalGastos = round2(gastos.reduce((s, x) => s + x.saldo, 0));
    return { ingresos, gastos, totalIngresos, totalGastos, utilidad: round2(totalIngresos - totalGastos) };
  }
  // Balance General: Activo = Pasivo + Capital (+ utilidad del ejercicio)
  function balanceGeneral() {
    const activo = grupoDetalle("100");
    const pasivo = grupoDetalle("200");
    const capital = grupoDetalle("300");
    const totalActivo = round2(activo.reduce((s, x) => s + x.saldo, 0));
    const totalPasivo = round2(pasivo.reduce((s, x) => s + x.saldo, 0));
    const utilidad = estadoResultados().utilidad;
    const totalCapital = round2(capital.reduce((s, x) => s + x.saldo, 0) + utilidad);
    const totalPasivoCapital = round2(totalPasivo + totalCapital);
    return { activo, pasivo, capital, totalActivo, totalPasivo, totalCapital, utilidad,
      totalPasivoCapital, cuadra: Math.abs(totalActivo - totalPasivoCapital) < 0.01 };
  }

  /* ============================================================
     BLOQUE 3 · Contabilidad Electrónica SAT · IVA · DIOT
     ============================================================ */
  const K_RFC = "contateck_rfc_emisor";
  function getRfcEmisor() { try { return localStorage.getItem(K_RFC) || ""; } catch (e) { return ""; } }
  function setRfcEmisor(v) { try { localStorage.setItem(K_RFC, String(v || "")); } catch (e) {} }

  // XML Catálogo de cuentas (esquema SAT catalogocuentas 1.3)
  function xmlCatalogoSAT(rfc, mes, anio) {
    const ctas = getCuentas().map((c) =>
      `    <catalogocuentas:Ctas CodAgrup="${esc(c.codigo)}" NumCta="${esc(c.codigo)}" Desc="${esc(c.nombre)}" Nivel="${c.nivel}" Natur="${c.nat === "Deudora" ? "D" : "A"}"${c.padre ? ` SubCtaDe="${esc(c.padre)}"` : ""}/>`
    ).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="1.3" RFC="${esc(rfc)}" Mes="${String(mes).padStart(2, "0")}" Anio="${anio}">
${ctas}
</catalogocuentas:Catalogo>`;
  }
  // XML Balanza de comprobación (esquema SAT BCE 1.3)
  function xmlBalanzaSAT(rfc, mes, anio) {
    const b = balanza();
    const ctas = b.filas.map((f) => {
      const saldoFin = round2(f.saldoDeudor + f.saldoAcreedor); // uno de los dos es 0
      return `    <BCE:Ctas NumCta="${esc(f.codigo)}" SaldoIni="0.00" Debe="${f.debe.toFixed(2)}" Haber="${f.haber.toFixed(2)}" SaldoFin="${saldoFin.toFixed(2)}"/>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="1.3" RFC="${esc(rfc)}" Mes="${String(mes).padStart(2, "0")}" Anio="${anio}" TipoEnvio="N">
${ctas}
</BCE:Balanza>`;
  }

  // Determinación de IVA del periodo
  function determinacionIVA() {
    const cT = cuentaRol("ivaTrasladado"), cA = cuentaRol("ivaAcreditable");
    const trasladado = cT ? Math.abs(saldoCuenta(cT)) : 0;
    const acreditable = cA ? Math.abs(saldoCuenta(cA)) : 0;
    const resultado = round2(trasladado - acreditable);
    return { trasladado: round2(trasladado), acreditable: round2(acreditable), resultado,
      aCargo: resultado > 0 ? resultado : 0, aFavor: resultado < 0 ? round2(-resultado) : 0,
      configurado: !!(cT && cA) };
  }

  // DIOT: operaciones con proveedores (de pólizas de gasto contabilizadas desde CFDI recibido)
  function diot() {
    const provs = {};
    polizasDelPeriodo().forEach((p) => {
      if (p.origen !== "cfdi-recibido") return;
      const rfc = p.proveedorRfc || "—";
      const nom = p.proveedorNombre || (p.concepto || "").split("·").pop().trim();
      const ivaA = (p.asientos || []).filter((a) => a.codigo === (cuentaRol("ivaAcreditable") || {}).codigo).reduce((s, a) => s + num(a.debe), 0);
      // OT-0020: "base" clasifica gasto por 4 códigos distintos (601, 602,
      // 603, 501) — no es un solo rol de configuracion_contable, es una
      // clasificación de "qué cuentas cuentan como gasto deducible para
      // DIOT" más amplia. Se deja tal cual por ahora — needs su propia
      // conversación con la contadora sobre qué cuentas debe incluir.
      const base = (p.asientos || []).filter((a) => a.codigo === "601" || a.codigo === "602" || a.codigo === "603" || a.codigo === "501").reduce((s, a) => s + num(a.debe), 0);
      if (!provs[rfc]) provs[rfc] = { rfc, nombre: nom, base: 0, iva: 0, ops: 0 };
      provs[rfc].base = round2(provs[rfc].base + base);
      provs[rfc].iva = round2(provs[rfc].iva + ivaA);
      provs[rfc].ops += 1;
    });
    return Object.keys(provs).map((k) => provs[k]);
  }

  // Exponer API por si otros módulos la necesitan.
  window.CTCont = {
    getCuentas, getCuentasAfectables, getCuentaPorCodigo, saveCuenta, deleteCuenta,
    getPolizas, savePoliza, deletePoliza, movimientosCuenta, saldoCuenta, balanza,
    cfdiAPoliza, cfdisPendientes, contabilizarCfdi, parsearCfdiXml, xmlAPolizaGasto,
    estadoResultados, balanceGeneral, xmlCatalogoSAT, xmlBalanzaSAT, determinacionIVA, diot,
    setPeriodo, getPeriodo, periodosDisponibles, getRfcEmisor, setRfcEmisor,
  };

  /* ====================== PARTE 2 · UI ====================== */

  const ICO_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const ICO_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  const ICO_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICO_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

  /* ---------- CSS ---------- */
  const css = `
    .fac-sat-field{position:relative}
    .fac-sat-results{display:none;position:absolute;top:100%;left:0;right:0;z-index:20;max-height:280px;overflow-y:auto;
      background:var(--ink-800,#0d1322);border:1px solid var(--line,#1a2540);border-radius:10px;margin-top:.3rem;box-shadow:0 20px 50px -15px rgba(0,0,0,.6)}
    .fac-sat-results.is-open{display:block}
    .fac-sat-opt{padding:.55rem .75rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--line,#1a2540);line-height:1.3}
    .fac-sat-opt:last-child{border-bottom:0}
    .fac-sat-opt:hover,.fac-sat-opt.is-active{background:var(--brand-soft,rgba(110,139,255,.1))}
    .fac-sat-opt b{color:var(--brand,#6E8BFF);font-family:var(--mono,monospace);font-size:.78rem}
    .fac-sat-hint{padding:.55rem .75rem;font-size:.78rem;color:var(--faint,#5b6680)}
    .cont-modal{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:1.2rem;background:rgba(2,6,15,.6);backdrop-filter:blur(4px)}
    .cont-modal.is-open{display:flex}
    .cont-modal__card{background:var(--ink-800,#0d1322);border:1px solid var(--line,#1a2540);border-radius:18px;
      width:100%;max-width:680px;max-height:90vh;overflow:auto;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);transition:max-width .15s ease}
    .cont-modal--wide .cont-modal__card{max-width:1040px}
    .cont-modal__head{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.3rem;border-bottom:1px solid var(--line,#1a2540);position:sticky;top:0;background:var(--ink-800,#0d1322);z-index:2}
    .cont-modal__head h3{margin:0;font-size:1.05rem}
    .cont-modal__x{background:none;border:0;color:var(--muted,#8a93a6);cursor:pointer;padding:.3rem;border-radius:8px;width:30px;height:30px;font-size:1rem}
    .cont-modal__x:hover{background:var(--line,#1a2540);color:var(--text,#e8ecf3)}
    .cont-modal__body{padding:1.3rem}
    .cont-modal .field{margin-bottom:.8rem}
    .cont-modal .field label{display:block;font-size:.78rem;color:var(--muted,#8a93a6);margin-bottom:.35rem;font-weight:500}
    .cont-grid3{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
    .cont-asientos-head{display:grid;grid-template-columns:1fr 120px 120px 32px;gap:.5rem;margin:.6rem 0 .35rem;
      font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--faint,#5b6680)}
    .cont-asientos-head span:nth-child(2),.cont-asientos-head span:nth-child(3){text-align:right;padding-right:.4rem}
    .cont-asiento{display:grid;grid-template-columns:1fr 120px 120px 32px;gap:.5rem;margin-bottom:.45rem;align-items:center}
    .cont-as-debe,.cont-as-haber{text-align:right}
    .cont-as-debe::-webkit-outer-spin-button,.cont-as-debe::-webkit-inner-spin-button,
    .cont-as-haber::-webkit-outer-spin-button,.cont-as-haber::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .cont-as-debe,.cont-as-haber{-moz-appearance:textfield;appearance:textfield}
    .no-spin::-webkit-outer-spin-button,.no-spin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .no-spin{-moz-appearance:textfield;appearance:textfield}
    .cont-as-x{background:none;border:0;color:var(--down,#FB7185);cursor:pointer;font-size:1rem;border-radius:7px;height:38px}
    .cont-as-x:hover{background:rgba(251,113,133,.12)}
    .cont-totales{margin-top:1rem;padding:1rem;border:1px solid var(--line,#1a2540);border-radius:12px;background:var(--ink-900,rgba(255,255,255,.02))}
    .cont-totales-row{display:flex;justify-content:space-between;align-items:center;font-size:.9rem;margin-bottom:.4rem}
    .cont-totales-row b{font-family:var(--mono,monospace);font-size:1.05rem}
    .cont-cuadre{text-align:center;font-weight:700;font-size:.9rem;padding:.55rem;border-radius:9px;margin-top:.5rem}
    .cont-cuadre.is-ok{color:var(--up,#34D399);background:var(--up-soft,rgba(52,211,153,.12))}
    .cont-cuadre.is-bad{color:var(--gold,#F2B84B);background:var(--gold-soft,rgba(242,184,75,.12))}
    .cont-foot{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.2rem}
    .cont-modal .btn:disabled,.cont-modal .btn[disabled]{opacity:.4;cursor:not-allowed;filter:grayscale(.4);box-shadow:none}
    .cont-modo-tabs{display:flex;gap:.4rem;margin-bottom:1.1rem;background:var(--ink-900,rgba(255,255,255,.03));padding:.3rem;border-radius:11px}
    .cont-modo{flex:1;padding:.6rem;border:none;background:transparent;color:var(--muted,#9aa);font-weight:600;border-radius:8px;cursor:pointer;font-size:.86rem;transition:.15s}
    .cont-modo.is-active{background:var(--brand,#6E8BFF);color:#fff}
    .cont-hint{color:var(--muted,#9aa);font-size:.88rem;margin:0 0 1rem}
    .cont-plantillas{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
    @media(max-width:560px){.cont-plantillas{grid-template-columns:1fr}}
    .cont-plantilla{text-align:left;padding:1rem;border:1px solid var(--line,#1a2540);border-radius:12px;background:var(--ink-900,rgba(255,255,255,.02));cursor:pointer;transition:.15s;display:flex;flex-direction:column;gap:.25rem}
    .cont-plantilla:hover{border-color:var(--brand,#6E8BFF);background:var(--brand-soft,rgba(110,139,255,.08));transform:translateY(-1px)}
    .cont-plantilla.is-bloqueada{cursor:not-allowed;opacity:.72}
    .cont-plantilla.is-bloqueada:hover{border-color:var(--line,#1a2540);background:var(--ink-900,rgba(255,255,255,.02));transform:none}
    .cont-badge-metodo{display:inline-block;font-size:.68rem;font-weight:700;padding:.08rem .4rem;border-radius:6px;margin-left:.35rem;vertical-align:middle}
    .cont-badge-metodo.is-pue{background:rgba(60,180,100,.15);color:#3cb464}
    .cont-badge-metodo.is-ppd{background:rgba(224,160,48,.15);color:#e0a030}
    .cont-plantilla b{font-size:.94rem}
    .cont-plantilla span{font-size:.78rem;color:var(--muted,#9aa)}
    .cont-rapido-card{margin-top:1rem;padding:1.1rem;border:1px solid var(--brand,#6E8BFF);border-radius:12px;background:var(--brand-soft,rgba(110,139,255,.05))}
    .cont-rapido-titulo{font-weight:700;font-size:1.02rem;margin-bottom:.8rem;color:var(--brand,#6E8BFF)}
    .cont-check{display:flex;align-items:center;gap:.5rem;font-size:.88rem;cursor:pointer;margin:.5rem 0}
    .cont-check input{width:auto;margin:0}
    .cont-err{background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.3);color:var(--down,#FB7185);
      padding:.7rem .9rem;border-radius:10px;font-size:.85rem;margin-top:.7rem}
    .cont-verhead,.cont-mayor-head{display:flex;gap:1.5rem;align-items:flex-end;flex-wrap:wrap}
    .cont-verhead div span,.cont-mayor-saldo span{display:block;font-size:.74rem;color:var(--faint,#5b6680);text-transform:uppercase;letter-spacing:.05em}
    .cont-verhead div b{font-size:1rem}
    .cont-mayor-head{justify-content:space-between}
    .cont-mayor-saldo{text-align:right}
    .cont-mayor-saldo b{font-family:var(--mono,monospace);font-size:1.3rem;color:var(--brand,#6E8BFF)}
    .cont-balanza-estado{margin-top:1rem;text-align:center;font-weight:700;padding:.6rem;border-radius:10px}
    .cont-balanza-estado.is-ok{color:var(--up,#34D399);background:var(--up-soft,rgba(52,211,153,.12))}
    .cont-balanza-estado.is-bad{color:var(--gold,#F2B84B);background:var(--gold-soft,rgba(242,184,75,.12))}
    .tbl tfoot td{border-top:2px solid var(--line-strong,#22304d);padding:.7rem;font-family:var(--mono,monospace)}
    .btn--sm{padding:.45rem .8rem;font-size:.82rem}
    .cont-ef-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    @media(max-width:900px){.cont-ef-grid{grid-template-columns:1fr}}
    .cont-ef-titulo{margin:0 0 .8rem;font-size:1rem}
    .cont-ef-sec td{font-weight:700;color:var(--brand,#6E8BFF);padding-top:.9rem!important;text-transform:uppercase;font-size:.72rem;letter-spacing:.05em}
    .cont-ef-sub td{font-weight:600;border-top:1px solid var(--line,#1a2540)}
    .cont-ef-total td{font-weight:700;font-size:1rem;border-top:2px solid var(--line-strong,#22304d);padding-top:.7rem;font-family:var(--mono,monospace)}
    .cont-ef-total td:first-child{font-family:inherit}
    .cont-sat-row{display:flex;gap:.7rem;flex-wrap:wrap;align-items:flex-end}
    .cont-xml-drop{border:2px dashed var(--line-strong,#22304d);border-radius:12px;padding:1.6rem;text-align:center}`;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Modal propio ---------- */
  const modal = document.createElement("div");
  modal.className = "cont-modal";
  modal.innerHTML = `<div class="cont-modal__card">
    <div class="cont-modal__head"><h3 data-cont-title>Registro</h3>
      <button class="cont-modal__x" data-cont-close aria-label="Cerrar">✕</button></div>
    <div class="cont-modal__body" data-cont-body></div></div>`;
  document.body.appendChild(modal);
  const cbody = modal.querySelector("[data-cont-body]");
  const ctitle = modal.querySelector("[data-cont-title]");
  const openModal = (t) => { ctitle.textContent = t; modal.classList.add("is-open"); };
  const closeModal = () => { modal.classList.remove("is-open"); modal.classList.remove("cont-modal--wide"); };

  // ---------- Confirmación/aviso propios (nunca el confirm()/alert() del
  // navegador — se ven genéricos, muestran la URL técnica, y no combinan
  // con el resto de la app) ----------
  function ctConfirm(mensaje, textoBoton) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "cont-modal is-open";
      el.innerHTML = `<div class="cont-modal__card" style="max-width:420px">
        <div class="cont-modal__body" style="padding-top:1.4rem">
          <p style="margin:0 0 1.3rem;color:var(--text,#e8ecf3);font-size:.95rem;line-height:1.5">${esc(mensaje)}</p>
          <div class="cont-foot"><button class="btn btn--ghost" data-ct-no>Cancelar</button>
            <button class="btn btn--primary" data-ct-si>${esc(textoBoton || "Aceptar")}</button></div>
        </div></div>`;
      document.body.appendChild(el);
      const cerrar = (val) => { document.body.removeChild(el); resolve(val); };
      el.addEventListener("click", (e) => {
        if (e.target === el || e.target.closest("[data-ct-no]")) cerrar(false);
        else if (e.target.closest("[data-ct-si]")) cerrar(true);
      });
    });
  }
  function ctAlert(mensaje) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "cont-modal is-open";
      el.innerHTML = `<div class="cont-modal__card" style="max-width:420px">
        <div class="cont-modal__body" style="padding-top:1.4rem">
          <p style="margin:0 0 1.3rem;color:var(--text,#e8ecf3);font-size:.95rem;line-height:1.5">${esc(mensaje)}</p>
          <div class="cont-foot"><button class="btn btn--primary" data-ct-ok>Entendido</button></div>
        </div></div>`;
      document.body.appendChild(el);
      el.addEventListener("click", (e) => {
        if (e.target === el || e.target.closest("[data-ct-ok]")) { document.body.removeChild(el); resolve(); }
      });
    });
  }

  /* ---------- Render: KPIs ---------- */
  function renderStats() {
    const el = document.querySelector("[data-cont-stats]");
    if (!el) return;
    const b = balanza();
    const cards = [
      { label: "Pólizas registradas", valor: String(getPolizas().length) },
      { label: "Cuentas afectables", valor: String(getCuentasAfectables().length) },
      { label: "Movimiento (cargos)", valor: "$" + fmt(b.tot.debe) },
      { label: "Balanza", valor: b.cuadra ? "Cuadra" : "Descuadre", tono: b.cuadra ? "" : "warn" },
    ];
    el.innerHTML = cards.map((s) => `<div class="stat${s.tono === "warn" ? " is-warn" : ""}"><span>${s.label}</span><b>${s.valor}</b></div>`).join("");
  }

  /* ---------- Render: catálogo de cuentas ---------- */
  const ICO_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';

  function renderCatalogo() {
    const el = document.querySelector("[data-cuentas]");
    if (!el) return;
    el.innerHTML = getCuentas().map((c) => {
      const esMayor = c.nivel === 1;
      const inactiva = c.activo === false;
      const acciones = esMayor ? "" :
        `<button class="ract" data-cont-mayor="${c.codigo}" title="Libro mayor">${ICO_BOOK}</button>` +
        `<button class="ract" data-cont-edit-cta="${c.id}" title="Editar">${ICO_EDIT}</button>` +
        (inactiva
          ? `<button class="ract" data-cont-reactivar-cta="${c.id}" title="Reactivar">${ICO_UNDO}</button>`
          : `<button class="ract ract--del" data-cont-del-cta="${c.id}" title="Desactivar">${ICO_DEL}</button>`);
      return `<tr${esMayor ? ' style="background:var(--ink-900,rgba(255,255,255,.02))"' : (inactiva ? ' style="opacity:.5"' : "")}>
        <td class="num"${esMayor ? ' style="font-weight:700"' : ""}>${esc(c.codigo)}</td>
        <td style="${esMayor ? "font-weight:700" : "padding-left:1.7rem"}">${esc(c.nombre)}${inactiva ? ' <span class="pill pill--late" style="margin-left:.4rem">Inactiva</span>' : ""}</td>
        <td>${c.nat}</td>
        <td class="num" style="text-align:right${esMayor ? ";font-weight:700" : ""}">$${fmt(saldoCuenta(c))}</td>
        <td class="row-act">${acciones}</td></tr>`;
    }).join("");
  }

  /* ---------- Render: tabla de pólizas ---------- */
  function renderPolizasTabla() {
    const el = document.querySelector("[data-polizas]");
    if (!el) return;
    const pol = getPolizas();
    if (!pol.length) { el.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:2.2rem">Aún no hay pólizas. Crea la primera con <b>Nueva póliza</b>.</td></tr>`; return; }
    el.innerHTML = pol.map((p) => {
      // FIX 2: pólizas nacidas en Postgres (ej. cobranza) llegan sin
      // asientos locales — se usa el monto que ya manda el backend.
      const monto = (p.asientos || []).reduce((s, a) => s + num(a.debe), 0) || num(p.monto);
      return `<tr>
        <td class="num">${esc(p.folio)}</td>
        <td>${esc(p.tipo)}</td>
        <td>${esc(fechaCorta(p.fecha))}</td>
        <td>${esc(p.concepto)}</td>
        <td class="num" style="text-align:right">$${fmt(monto)}</td>
        <td><span class="pill pill--ok">Cuadrada</span></td>
        <td class="row-act">
          <button class="ract" data-cont-ver="${p.id}" title="Ver">${ICO_EYE}</button>
          ${p.pgId
            ? ``
            : `<button class="ract ract--del" data-cont-del-pol="${p.id}" title="Eliminar (solo local)">${ICO_DEL}</button>`}</td></tr>`;
    }).join("");
  }

  /* ---------- Render: Libro Mayor ---------- */
  function renderMayor(codigoSel) {
    const pane = document.querySelector('[data-pane="mayor"]');
    if (!pane) return;
    const ctas = getCuentasAfectables();
    const sel = codigoSel || (ctas[0] && ctas[0].codigo) || "";
    const ctaSel = getCuentaPorCodigo(sel);
    const cta = getCuentaPorCodigo(sel);
    let saldoAcum = 0;
    const movs = sel ? movimientosCuenta(sel).movs : [];
    const filas = movs.length ? movs.map((m) => {
      saldoAcum += (cta && cta.nat === "Deudora") ? (m.debe - m.haber) : (m.haber - m.debe);
      return `<tr><td>${esc(fechaCorta(m.fecha))}</td><td class="num">${esc(m.folio)}</td><td>${esc(m.concepto)}</td>
        <td class="num" style="text-align:right">${m.debe ? "$" + fmt(m.debe) : "—"}</td>
        <td class="num" style="text-align:right">${m.haber ? "$" + fmt(m.haber) : "—"}</td>
        <td class="num" style="text-align:right;font-weight:600">$${fmt(round2(saldoAcum))}</td></tr>`;
    }).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--faint);padding:2rem">Esta cuenta no tiene movimientos.</td></tr>`;
    pane.innerHTML = `<div class="card">
      <div class="cont-mayor-head">
        <div class="field fac-sat-field" style="margin:0;max-width:360px"><label>Cuenta</label>
          <input class="input cuenta-busca mayor-cuenta-busca" placeholder="Escribe para buscar…" autocomplete="off" value="${ctaSel ? esc(ctaSel.codigo + " · " + ctaSel.nombre) : ""}">
          <input type="hidden" data-mayor-cuenta value="${esc(sel)}">
          <div class="fac-sat-results"></div>
        </div>
        ${cta ? `<div class="cont-mayor-saldo"><span>Saldo actual</span><b>$${fmt(saldoCuenta(cta))}</b></div>` : ""}
      </div>
      <div style="overflow-x:auto;margin-top:1rem">
        <table class="tbl"><thead><tr><th>Fecha</th><th>Folio</th><th>Concepto</th>
          <th style="text-align:right">Debe</th><th style="text-align:right">Haber</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>${filas}</tbody></table></div></div>`;
  }

  /* ---------- Render: Balanza de comprobación ---------- */
  /* ================================================================
     OT-0024 · Tab "Cuentas por Pagar" — todas las facturas de
     proveedor (pagadas o no), cada una con acceso a su historial de
     pagos y comprobante PDF. Espejo de lo que ya existe para clientes
     en Facturación, adaptado al patrón de tabs de Contabilidad.
     ================================================================ */
  const HIST_FORMAS_PAGO = { "01": "Efectivo", "02": "Cheque nominativo", "03": "Transferencia", "04": "Tarjeta de crédito", "28": "Tarjeta de débito", "99": "Otro" };
  let provHistState = null; // { factura, pagos } mientras el modal de historial está abierto
  function fechaCortaHist(iso) {
    if (!iso) return "—";
    try { const d = new Date(iso); return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return iso; }
  }
  function fechaHoraHist(iso) {
    if (!iso) return "—";
    try { const d = new Date(iso); return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso; }
  }
  function nombreArchivoHist(path) { return path ? (path.split("/").pop() || path) : null; }
  async function firmarComprobanteHist(path) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t || !path) return null;
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
  const pillEstadoPagoHist = (p) => p.estado === "confirmado" ? '<span class="pill pill--ok">Confirmado</span>'
    : p.estado === "cancelado" ? '<span class="pill pill--late">Cancelado</span>' : '<span class="pill pill--pend">Registrado</span>';

  let provFacturasCache = []; // OT-0024 fix: evita re-pedir todo el listado nada más para abrir un historial
  async function renderProveedores() {
    const pane = document.querySelector('[data-pane="proveedores"]');
    if (!pane) return;
    pane.innerHTML = `<div class="card"><p class="cont-hint">Cargando facturas de proveedor…</p></div>`;
    const r = (window.CTPostgres && window.CTPostgres.listarCfdisProveedorTodas)
      ? await window.CTPostgres.listarCfdisProveedorTodas()
      : { ok: false, error: "Sin conexión con el backend." };
    if (!r.ok) { pane.innerHTML = `<div class="card"><div class="cont-err">${esc(r.error || "No se pudieron cargar las facturas.")}</div></div>`; return; }
    // Pendientes primero — así lo más accionable queda arriba, y ver una
    // "Liquidada" hasta abajo no contradice lo que el usuario esperaba.
    const facturas = (r.facturas || []).sort((a, b) => {
      const pa = num(a.saldo_pendiente) > 0 ? 0 : 1, pb = num(b.saldo_pendiente) > 0 ? 0 : 1;
      return pa - pb;
    });
    provFacturasCache = facturas;
    const fila = (f) => {
      const esPPD = f.metodo_pago === "PPD";
      const badge = f.metodo_pago ? `<span class="cont-badge-metodo ${esPPD ? "is-ppd" : "is-pue"}">${esc(f.metodo_pago)}</span>` : "";
      const liquidada = num(f.saldo_pendiente) <= 0;
      return `<tr>
        <td class="num" style="white-space:nowrap">${esc(f.folio || "—")}</td>
        <td>${esc(f.emisor_nombre || "Proveedor")}</td>
        <td style="white-space:nowrap">${esc(fechaCortaHist(f.fecha))} ${badge}</td>
        <td class="num" style="text-align:right;white-space:nowrap">$${fmt(num(f.total))}</td>
        <td class="num" style="text-align:right;white-space:nowrap">$${fmt(num(f.saldo_pendiente))}</td>
        <td style="white-space:nowrap">${liquidada ? '<span class="pill pill--ok">Liquidada</span>' : '<span class="pill pill--pend">Pendiente</span>'}</td>
        <td><button class="ract" data-provhist-abrir="${esc(f.cfdi_proveedor_id)}" title="Historial de pagos"><svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></button></td></tr>`;
    };
    pane.innerHTML = `<div class="card">
      <h3 style="margin:0 0 .2rem;font-size:.95rem">Auxiliar de facturas</h3>
      <p class="cont-hint" style="margin-top:0">Historial completo por factura — pendientes y ya liquidadas. El saldo total que le debes a proveedores (la cuenta de control) vive en Libro Mayor, cuenta <b>201 · Proveedores</b>.</p>
      <div class="toolbar"><div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg><input data-provbusca placeholder="Buscar por folio o proveedor…"></div></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Folio</th><th>Proveedor</th><th>Fecha</th><th style="text-align:right">Total</th><th style="text-align:right">Saldo</th><th>Estado</th><th></th></tr></thead>
        <tbody data-provfilas>${facturas.length ? facturas.map(fila).join("") : `<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:2.2rem">Aún no hay facturas de proveedor. Impórtalas desde Pólizas → "Importar XML recibido".</td></tr>`}</tbody>
      </table></div></div>`;
    const busca = pane.querySelector("[data-provbusca]");
    if (busca) busca.addEventListener("input", () => {
      const q = busca.value.trim().toLowerCase();
      const filtradas = q ? facturas.filter((f) => (f.folio || "").toLowerCase().includes(q) || (f.emisor_nombre || "").toLowerCase().includes(q)) : facturas;
      pane.querySelector("[data-provfilas]").innerHTML = filtradas.length ? filtradas.map(fila).join("") : `<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:2rem">Sin resultados para "${esc(busca.value)}".</td></tr>`;
    });
  }

  async function abrirHistorialProveedor(cfdiProveedorId) {
    // OT-0024 fix: la factura ya está en memoria (se acaba de renderizar
    // la tabla) — antes se volvía a pedir TODO el listado al backend
    // solo para encontrar una que ya teníamos, por eso tardaba.
    const f = provFacturasCache.find((x) => x.cfdi_proveedor_id === cfdiProveedorId) || {};
    openModal("Historial de pagos · " + (f.folio || ""));
    modal.classList.add("cont-modal--wide");
    cbody.innerHTML = `<p class="cont-hint">Cargando pagos…</p>`;
    const rp = (window.CTPostgres && window.CTPostgres.listarPagosProveedor)
      ? await window.CTPostgres.listarPagosProveedor(cfdiProveedorId)
      : { ok: false, error: "Sin conexión con el backend." };
    if (!rp.ok) {
      cbody.innerHTML = `<div class="cont-err">${esc(rp.error || "No se pudieron cargar los pagos.")}</div>
        <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
      return;
    }
    provHistState = { factura: f, pagos: rp.pagos || [] };
    renderProvHistLista();
  }

  function renderProvHistLista() {
    if (!provHistState) return;
    const { factura: f, pagos } = provHistState;
    openModal("Historial de pagos · " + (f.folio || ""));
    const totalPagado = pagos.filter((p) => p.estado === "confirmado").reduce((s, p) => s + num(p.monto), 0);
    const totalFactura = num(f.total);
    const saldo = round2(totalFactura - totalPagado);
    const filas = pagos.map((p, i) => {
      const quien = (p.registradoPor ? "Registró: " + esc(p.registradoPor) : "") + (p.confirmadoPor ? (p.registradoPor ? " · " : "") + "Confirmó: " + esc(p.confirmadoPor) : "");
      return `<tr>
        <td class="num" style="white-space:nowrap">${fechaCortaHist(p.fechaPago)}</td>
        <td class="num" style="text-align:right;white-space:nowrap">$${fmt(num(p.monto))}</td>
        <td style="white-space:nowrap">${esc(HIST_FORMAS_PAGO[p.formaPago] || p.formaPago || "—")}</td>
        <td style="white-space:nowrap">${pillEstadoPagoHist(p)}</td>
        <td class="num" style="white-space:nowrap">${p.polizaFolio ? esc(p.polizaFolio) : '<span style="color:var(--faint);font-size:.78rem">Pendiente</span>'}</td>
        <td style="font-size:.78rem;color:var(--muted)">${quien || "—"}</td>
        <td><button class="ract" data-provhist-det="${i}" title="Ver detalle del pago"><svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 15c.7-1.2 1.1-2.2 1.1-3 0-3-4.5-7-10.3-7S1.7 9 1.7 12s4.5 7 10.3 7c1.6 0 3.1-.3 4.4-.8"/><circle cx="12" cy="12" r="3"/></svg></button></td></tr>`;
    }).join("");
    cbody.innerHTML = `
      <div style="background:var(--ink-900,rgba(255,255,255,.03));border-radius:10px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.88rem">
        <div><b>${esc(f.folio || "—")}</b> · ${esc(f.emisor_nombre || "")} ${f.metodo_pago ? " · <b>" + esc(f.metodo_pago) + "</b>" : ""}</div>
        <div style="margin-top:.3rem">Total: $${fmt(totalFactura)} &nbsp;·&nbsp; Pagado: $${fmt(totalPagado)} &nbsp;·&nbsp; <b>Saldo: $${fmt(saldo)}</b></div></div>
      ${pagos.length
        ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Fecha</th><th style="text-align:right">Monto</th><th>Forma</th><th>Estado</th><th>Póliza</th><th>Trazabilidad</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : `<p class="cont-hint">Esta factura todavía no tiene pagos registrados.</p>`}
      <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
  }

  function renderProvHistDetalle(idx) {
    if (!provHistState) return;
    const { factura: f, pagos } = provHistState;
    const p = pagos[idx];
    if (!p) return;
    openModal("Detalle del pago " + (p.folioPago || "") + " · " + (f.folio || ""));
    const filaDato = (etiqueta, valor) => `<div style="display:flex;justify-content:space-between;gap:1rem;padding:.45rem 0;border-bottom:1px solid var(--line,#1a2540)"><span style="color:var(--muted);font-size:.84rem">${etiqueta}</span><span style="text-align:right">${valor}</span></div>`;
    const nombreComp = nombreArchivoHist(p.comprobantePath);
    const btnMini = (attrs, texto) => `<button class="btn btn--ghost" style="padding:.15rem .6rem;font-size:.76rem" ${attrs}>${texto}</button>`;
    const docRow = (nombre, tipo, acciones) => `<tr><td style="font-size:.84rem">${nombre}</td><td style="font-size:.78rem;color:var(--muted)">${tipo}</td><td style="white-space:nowrap">${acciones}</td></tr>`;
    const documentosHTML = `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Documento</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>` +
      (p.comprobantePath
        ? docRow("📎 " + esc(nombreComp), "Evidencia adjunta",
            btnMini(`data-provhist-comprobante="${esc(p.comprobantePath)}" data-comp-modo="ver"`, "Ver") + " " +
            btnMini(`data-provhist-comprobante="${esc(p.comprobantePath)}" data-comp-modo="descargar" data-comp-nombre="${esc(nombreComp)}"`, "Descargar"))
        : docRow("📎 Sin evidencia adjunta", "Evidencia adjunta", `<span style="color:var(--faint);font-size:.76rem">No adjuntada</span>`)) +
      docRow("📄 Comprobante de pago " + esc(p.folioPago || ""), "Generado por Contateck",
        btnMini(`data-provcomp-interno="${esc(p.id)}" data-ci-modo="ver"`, "Ver") + " " +
        btnMini(`data-provcomp-interno="${esc(p.id)}" data-ci-modo="descargar"`, "Descargar")) +
      `</tbody></table></div>`;
    cbody.innerHTML = `
      <button class="btn btn--ghost" data-provhist-volver style="margin-bottom:1rem;padding:.3rem .8rem">← Volver al historial</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem">
        <div>
          <h4 style="margin:.2rem 0 .6rem;font-size:.8rem;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">Datos del pago</h4>
          ${filaDato("Monto", "<b>$" + fmt(num(p.monto)) + "</b>")}
          ${filaDato("Fecha del pago", esc(fechaCortaHist(p.fechaPago)))}
          ${filaDato("Forma de pago", esc(HIST_FORMAS_PAGO[p.formaPago] || p.formaPago || "—"))}
          ${filaDato("Cuenta de origen", p.cuentaOrigen ? esc(p.cuentaOrigen) : "—")}
          ${filaDato("Referencia", p.referencia ? esc(p.referencia) : "—")}
          ${filaDato("Notas", p.notas ? esc(p.notas) : "—")}
          ${filaDato("Estado", pillEstadoPagoHist(p))}
          <h4 style="margin:1.1rem 0 .4rem;font-size:.8rem;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">Documentos de la operación</h4>
          ${documentosHTML}
          <div data-provci-preview style="display:none;margin-top:.6rem"></div>
          ${p.comprobantePath ? `<div style="margin-top:.6rem"><div style="font-size:.72rem;color:var(--faint);margin-bottom:.25rem">Vista previa de la evidencia adjunta: <b>${esc(nombreComp)}</b></div><div data-provcomp-preview style="border:1px solid var(--line,#1a2540);border-radius:10px;min-height:60px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--ink-900,rgba(255,255,255,.02))"><span style="color:var(--faint);font-size:.8rem">Cargando…</span></div></div>` : ""}
        </div>
        <div>
          <h4 style="margin:.2rem 0 .6rem;font-size:.8rem;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">Información contable</h4>
          ${filaDato("Póliza relacionada", p.polizaFolio ? "<b>" + esc(p.polizaFolio) + "</b>" : '<span style="color:var(--faint)">Póliza contable pendiente</span>')}
          <h4 style="margin:1.1rem 0 .6rem;font-size:.8rem;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">Documento fiscal (factura del proveedor)</h4>
          ${filaDato("Factura (CFDI)", esc(f.folio || "—") + (f.metodo_pago ? " · " + esc(f.metodo_pago) : ""))}
          <h4 style="margin:1.1rem 0 .6rem;font-size:.8rem;letter-spacing:.06em;color:var(--faint);text-transform:uppercase">Trazabilidad</h4>
          ${filaDato("Registrado por", (p.registradoPor ? esc(p.registradoPor) : "—") + '<br><span style="color:var(--faint);font-size:.76rem">' + fechaHoraHist(p.creadoEn) + '</span>')}
          ${filaDato("Confirmado por", p.confirmadoPor ? (esc(p.confirmadoPor) + '<br><span style="color:var(--faint);font-size:.76rem">' + fechaHoraHist(p.confirmadoEn) + '</span>') : '<span style="color:var(--faint)">Aún sin confirmar</span>')}
        </div>
      </div>
      <div class="cont-foot" style="margin-top:1.2rem"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
    if (p.comprobantePath) cargarPreviewComprobanteProv(p.comprobantePath);
  }

  async function cargarPreviewComprobanteProv(path) {
    const box = cbody.querySelector("[data-provcomp-preview]");
    if (!box) return;
    const url = await firmarComprobanteHist(path);
    if (!url) { box.innerHTML = `<span style="color:var(--faint);font-size:.8rem;padding:.8rem">No se pudo cargar la vista previa.</span>`; return; }
    const ext = (path.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp"].indexOf(ext) >= 0) box.innerHTML = `<img src="${url}" alt="Comprobante" style="max-width:100%;max-height:340px;display:block">`;
    else if (ext === "pdf") box.innerHTML = `<embed src="${url}" type="application/pdf" style="width:100%;height:340px">`;
    else box.innerHTML = `<span style="color:var(--faint);font-size:.8rem;padding:.8rem">Vista previa no disponible para .${esc(ext)}.</span>`;
  }

  async function abrirComprobanteInternoProv(pagoId, modo, btn) {
    const box = cbody.querySelector("[data-provci-preview]");
    try {
      if (btn) btn.disabled = true;
      if (modo === "ver" && box) { box.style.display = "block"; box.innerHTML = `<span style="color:var(--faint);font-size:.8rem">Generando comprobante…</span>`; }
      const resp = await fetch(((window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app") + "/api/pagos-proveedor/" + pagoId + "/comprobante-pdf", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      if (!resp.ok) {
        let detalle = ""; try { const j = await resp.json(); detalle = [j.error, j.details].filter(Boolean).join(" — "); } catch (e2) {}
        throw new Error("(" + resp.status + ") " + (detalle || "PDF no disponible."));
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (modo === "descargar") {
        const a = document.createElement("a"); a.href = url; a.download = "ComprobantePagoProveedor_" + pagoId.slice(0, 8) + ".pdf";
        document.body.appendChild(a); a.click(); a.remove();
      } else if (box) {
        box.innerHTML = `<div style="font-size:.72rem;color:var(--faint);margin-bottom:.25rem">Comprobante de pago generado por Contateck</div><embed src="${url}" type="application/pdf" style="width:100%;height:480px;border:1px solid var(--line,#1a2540);border-radius:10px">`;
      }
    } catch (e) {
      const msg = "No se pudo generar el comprobante: " + e.message;
      if (box && modo === "ver") { box.style.display = "block"; box.innerHTML = `<div style="color:#FB7185;font-size:.82rem;padding:.5rem 0">${esc(msg)}</div>`; }
      toast(msg, "error", 6000);
    } finally { if (btn) btn.disabled = false; }
  }

  function renderBalanza() {
    const pane = document.querySelector('[data-pane="balanza"]');
    if (!pane) return;
    const b = balanza();
    const filas = b.filas.map((f) => `<tr>
      <td class="num">${esc(f.codigo)}</td><td>${esc(f.nombre)}</td>
      <td class="num" style="text-align:right">$${fmt(f.debe)}</td>
      <td class="num" style="text-align:right">$${fmt(f.haber)}</td>
      <td class="num" style="text-align:right">${f.saldoDeudor ? "$" + fmt(f.saldoDeudor) : "—"}</td>
      <td class="num" style="text-align:right">${f.saldoAcreedor ? "$" + fmt(f.saldoAcreedor) : "—"}</td></tr>`).join("");
    pane.innerHTML = `<div class="card">
      <div style="overflow-x:auto">
        <table class="tbl"><thead><tr><th>Código</th><th>Cuenta</th>
          <th style="text-align:right">Cargos</th><th style="text-align:right">Abonos</th>
          <th style="text-align:right">Saldo deudor</th><th style="text-align:right">Saldo acreedor</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="6" style="text-align:center;color:var(--faint);padding:2rem">Sin movimientos todavía.</td></tr>`}</tbody>
        <tfoot><tr style="font-weight:700"><td colspan="2" style="text-align:right">Totales</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.debe)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.haber)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.saldoDeudor)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.saldoAcreedor)}</td></tr></tfoot></table></div>
      <div class="cont-balanza-estado ${b.cuadra ? "is-ok" : "is-bad"}">${b.cuadra ? "✓ La balanza cuadra" : "⚠ La balanza no cuadra"}</div></div>`;
  }

  /* ---------- Descargar archivo (XML/texto) ---------- */
  function descargarTexto(nombre, contenido, mime) {
    try {
      const blob = new Blob([contenido], { type: mime || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
    } catch (e) {}
  }

  /* ---------- Render: Estados financieros (Bloque 2) ---------- */
  function renderEstados() {
    const pane = document.querySelector('[data-pane="estados"]');
    if (!pane) return;
    const er = estadoResultados(), bg = balanceGeneral();
    const fila = (x) => `<tr><td class="num">${esc(x.codigo)}</td><td>${esc(x.nombre)}</td><td class="num" style="text-align:right">$${fmt(x.saldo)}</td></tr>`;
    pane.innerHTML = `<div class="cont-ef-grid">
      <div class="card">
        <h3 class="cont-ef-titulo">Estado de Resultados</h3>
        <table class="tbl"><tbody>
          <tr class="cont-ef-sec"><td colspan="3">Ingresos</td></tr>
          ${er.ingresos.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">Sin ingresos en el periodo</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total de ingresos</td><td class="num" style="text-align:right">$${fmt(er.totalIngresos)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Costos y gastos</td></tr>
          ${er.gastos.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">Sin gastos en el periodo</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total de gastos</td><td class="num" style="text-align:right">$${fmt(er.totalGastos)}</td></tr>
        </tbody><tfoot><tr class="cont-ef-total"><td colspan="2">${er.utilidad >= 0 ? "Utilidad" : "Pérdida"} del ejercicio</td>
          <td class="num" style="text-align:right">$${fmt(Math.abs(er.utilidad))}</td></tr></tfoot></table>
      </div>
      <div class="card">
        <h3 class="cont-ef-titulo">Balance General</h3>
        <table class="tbl"><tbody>
          <tr class="cont-ef-sec"><td colspan="3">Activo</td></tr>
          ${bg.activo.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">—</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total activo</td><td class="num" style="text-align:right">$${fmt(bg.totalActivo)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Pasivo</td></tr>
          ${bg.pasivo.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">—</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total pasivo</td><td class="num" style="text-align:right">$${fmt(bg.totalPasivo)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Capital</td></tr>
          ${bg.capital.map(fila).join("")}
          <tr><td class="num">305</td><td>Resultado del ejercicio</td><td class="num" style="text-align:right">$${fmt(bg.utilidad)}</td></tr>
          <tr class="cont-ef-sub"><td colspan="2">Total capital</td><td class="num" style="text-align:right">$${fmt(bg.totalCapital)}</td></tr>
        </tbody><tfoot><tr class="cont-ef-total"><td colspan="2">Pasivo + Capital</td>
          <td class="num" style="text-align:right">$${fmt(bg.totalPasivoCapital)}</td></tr></tfoot></table>
        <div class="cont-balanza-estado ${bg.cuadra ? "is-ok" : "is-bad"}">${bg.cuadra ? "✓ Activo = Pasivo + Capital" : "⚠ El balance no cuadra"}</div>
      </div></div>`;
  }

  /* ---------- Render: SAT / Declaraciones (Bloque 3) ---------- */
  function renderSAT() {
    const pane = document.querySelector('[data-pane="sat"]');
    if (!pane) return;
    const iva = determinacionIVA(), dt = diot(), rfc = getRfcEmisor(), per = getPeriodo();
    const mes = per ? per.mes : (new Date().getMonth() + 1), anio = per ? per.anio : new Date().getFullYear();
    const diotFilas = dt.length ? dt.map((d) => `<tr><td class="num">${esc(d.rfc)}</td><td>${esc(d.nombre)}</td>
      <td class="num" style="text-align:right">$${fmt(d.base)}</td><td class="num" style="text-align:right">$${fmt(d.iva)}</td></tr>`).join("")
      : '<tr><td colspan="4" style="text-align:center;color:var(--faint);padding:1.5rem">Importa CFDI de proveedores (en Pólizas) para poblar la DIOT.</td></tr>';
    pane.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <h3 class="cont-ef-titulo">Contabilidad Electrónica · XML para el SAT</h3>
        <p style="color:var(--muted);font-size:.88rem;margin:.3rem 0 1rem">Genera los archivos que el SAT exige mensualmente: catálogo de cuentas y balanza de comprobación.</p>
        <div class="cont-sat-row">
          <div class="field" style="margin:0"><label>RFC del emisor</label><input class="input" data-sat-rfc placeholder="XAXX010101000" value="${esc(rfc)}"></div>
          <div class="field" style="margin:0;max-width:110px"><label>Mes</label><input class="input" data-sat-mes type="number" min="1" max="12" value="${mes}"></div>
          <div class="field" style="margin:0;max-width:120px"><label>Año</label><input class="input" data-sat-anio type="number" min="2020" max="2035" value="${anio}"></div>
        </div>
        <div class="cont-foot" style="justify-content:flex-start;margin-top:.8rem">
          <button class="btn btn--primary" data-sat-xml-cat>Descargar XML Catálogo</button>
          <button class="btn btn--primary" data-sat-xml-bal>Descargar XML Balanza</button>
        </div>
      </div>
      <div class="cont-ef-grid">
        <div class="card">
          <h3 class="cont-ef-titulo">Determinación de IVA</h3>
          <table class="tbl"><tbody>
            <tr><td>IVA trasladado (cobrado)</td><td class="num" style="text-align:right">$${fmt(iva.trasladado)}</td></tr>
            <tr><td>IVA acreditable (pagado)</td><td class="num" style="text-align:right">$${fmt(iva.acreditable)}</td></tr>
          </tbody><tfoot><tr class="cont-ef-total"><td>${iva.aCargo > 0 ? "IVA a cargo del periodo" : "IVA a favor del periodo"}</td>
            <td class="num" style="text-align:right">$${fmt(iva.aCargo > 0 ? iva.aCargo : iva.aFavor)}</td></tr></tfoot></table>
        </div>
        <div class="card">
          <h3 class="cont-ef-titulo">DIOT · Operaciones con terceros</h3>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>RFC</th><th>Proveedor</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th></tr></thead>
            <tbody>${diotFilas}</tbody></table></div>
        </div>
      </div>`;
  }

  /* ---------- Selector de periodo (Bloque 4) ---------- */
  function renderPeriodoSelector() {
    const host = document.querySelector("[data-cont-periodo]");
    if (!host) return;
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const per = getPeriodo();
    const opts = periodosDisponibles().map((p) => {
      const val = p.anio + "-" + p.mes, sel = per && per.anio === p.anio && per.mes === p.mes;
      return `<option value="${val}"${sel ? " selected" : ""}>${meses[p.mes - 1]} ${p.anio}</option>`;
    }).join("");
    host.innerHTML = `<select class="input" data-periodo-sel style="min-width:170px">
      <option value=""${!per ? " selected" : ""}>Todo el ejercicio</option>${opts}</select>`;
  }

  function renderTodo() {
    renderPeriodoSelector();
    renderStats(); renderCatalogo(); renderPolizasTabla(); renderBalanza(); renderMayor(); renderProveedores();
    renderEstados(); renderSAT();
  }

  /* ---------- Modal: cuenta ---------- */
  function mayorOptions(sel) {
    return `<option value="">— es cuenta de mayor —</option>` + getCuentas().filter((c) => c.nivel === 1)
      .map((c) => `<option value="${c.codigo}"${c.codigo === sel ? " selected" : ""}>${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join("");
  }
  function openCuentaForm(id) {
    const c = id ? (getCuentas().find((x) => x.id === id) || {}) : {};
    openModal(id ? "Editar cuenta" : "Nueva cuenta");
    cbody.innerHTML = `
      <div class="cont-grid3">
        <div class="field"><label>Código</label><input class="input" id="cta-codigo" placeholder="Ej. 103" value="${esc(c.codigo || "")}"></div>
        <div class="field"><label>Naturaleza</label><select class="input" id="cta-nat">
          <option${c.nat === "Deudora" ? " selected" : ""}>Deudora</option>
          <option${c.nat === "Acreedora" ? " selected" : ""}>Acreedora</option></select></div>
      </div>
      <div class="field"><label>Nombre de la cuenta</label><input class="input" id="cta-nombre" placeholder="Ej. Bancos USD" value="${esc(c.nombre || "")}"></div>
      <div class="field"><label>Pertenece a (cuenta de mayor)</label><select class="input" id="cta-padre">${mayorOptions(c.padre || "")}</select></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-guardar-cta="${id || ""}">Guardar cuenta</button></div>`;
  }
  async function guardarCuentaForm(id) {
    const codigo = cbody.querySelector("#cta-codigo").value.trim();
    const nombre = cbody.querySelector("#cta-nombre").value.trim();
    const nat = cbody.querySelector("#cta-nat").value;
    const padre = cbody.querySelector("#cta-padre").value || null;
    const msg = cbody.querySelector("[data-cont-msg]");
    if (!codigo || !nombre) { msg.innerHTML = `<div class="cont-err">Captura código y nombre.</div>`; return; }
    const dup = getCuentas().find((x) => x.codigo === codigo && x.id !== id);
    if (dup) { msg.innerHTML = `<div class="cont-err">Ya existe una cuenta con el código ${esc(codigo)}.</div>`; return; }
    const cuenta = { codigo, nombre, nat, nivel: padre ? 2 : 1, padre };
    if (id) cuenta.id = id;
    const btn = cbody.querySelector("[data-cont-guardar-cta]");
    if (btn) btn.disabled = true;
    const r = await saveCuenta(cuenta);
    if (!r.ok) {
      msg.innerHTML = `<div class="cont-err">${esc(r.error)}</div>`;
      if (btn) btn.disabled = false;
      return;
    }
    closeModal();
    renderTodo();
  }

  /* ---------- Modal: Configuración contable (OT-0020) ---------- */
  // Cada empresa define UNA VEZ qué cuenta de su propio catálogo juega
  // cada rol (Bancos, Clientes, etc.). Sin esto configurado, las
  // funciones que generan pólizas automáticas se bloquean con mensaje
  // claro — nunca adivinan una cuenta.
  function openConfigContable() {
    openModal("Configuración contable");
    const cfg = configContable();
    const campoRol = (rol) => {
      const campo = ROLES_CONFIG_CONTABLE[rol];
      const cta = getCuentaPorId(cfg[campo]);
      return `<div class="field fac-sat-field"><label>${esc(NOMBRES_ROL[rol])}</label>
        <input class="input cuenta-busca" placeholder="Escribe para buscar…" autocomplete="off" value="${cta ? esc(cta.codigo + " · " + cta.nombre) : ""}">
        <input type="hidden" data-config-rol="${esc(rol)}" value="${cta ? esc(cta.codigo) : ""}">
        <div class="fac-sat-results"></div>
      </div>`;
    };
    cbody.innerHTML = `
      <p class="cont-hint">Indica qué cuenta de tu catálogo corresponde a cada rol. El sistema usa esta configuración para armar las pólizas automáticas (Captura Rápida, importar facturas, cobranza) — mientras un rol esté vacío, las operaciones que lo necesiten se bloquean en vez de adivinar.</p>
      ${Object.keys(ROLES_CONFIG_CONTABLE).map(campoRol).join("")}
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-config-contable-guardar>Guardar configuración</button></div>`;
  }
  async function guardarConfigContableForm() {
    const msg = cbody.querySelector("[data-cont-msg]");
    const btn = cbody.querySelector("[data-config-contable-guardar]");
    const payload = {};
    cbody.querySelectorAll("[data-config-rol]").forEach((h) => {
      const rol = h.getAttribute("data-config-rol");
      const campo = ROLES_CONFIG_CONTABLE[rol];
      if (!campo) return;
      // El buscador unificado guarda el CÓDIGO en el hidden — aquí se
      // convierte al id (uuid) que es lo que la tabla realmente guarda.
      const cta = h.value ? getCuentaPorCodigo(h.value) : null;
      payload[campo] = cta ? cta.id : null;
    });
    if (btn) btn.disabled = true;
    const r = await window.CTPostgres.guardarConfigContable(payload);
    if (!r.ok) {
      msg.innerHTML = `<div class="cont-err">${esc(r.error || "No se pudo guardar la configuración.")}</div>`;
      if (btn) btn.disabled = false;
      return;
    }
    window.CONTATECK_CONFIG_CONTABLE_PG = r.config || payload;
    toast("Configuración contable guardada", "ok");
    closeModal();
  }

  /* ---------- Modal: póliza ---------- */
  // OT-0018: la línea de asiento ya no usa <select> plano — usa el mismo
  // buscador tipo autocomplete que Captura Rápida y Libro Mayor, para que
  // las 3 pantallas de Contabilidad se sientan del mismo sistema.
  function asientoRow(a) {
    a = a || {};
    const ctaSel = a.codigo ? getCuentaPorCodigo(a.codigo) : null;
    return `<div class="cont-asiento">
      <div class="field fac-sat-field" style="margin:0">
        <input class="input cuenta-busca" placeholder="Buscar cuenta…" autocomplete="off" value="${ctaSel ? esc(ctaSel.codigo + " · " + ctaSel.nombre) : ""}">
        <input type="hidden" class="cont-as-cta" value="${esc(a.codigo || "")}">
        <div class="fac-sat-results"></div>
      </div>
      <input class="input cont-as-debe" type="number" min="0" step="0.01" placeholder="0.00" value="${a.debe || ""}">
      <input class="input cont-as-haber" type="number" min="0" step="0.01" placeholder="0.00" value="${a.haber || ""}">
      <button class="cont-as-x" data-cont-as-del title="Quitar línea">✕</button></div>`;
  }
  function recalcCuadre() {
    let debe = 0, haber = 0;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      debe += num(row.querySelector(".cont-as-debe").value);
      haber += num(row.querySelector(".cont-as-haber").value);
    });
    debe = round2(debe); haber = round2(haber);
    const dif = round2(debe - haber);
    const elD = cbody.querySelector("[data-tot-debe]"), elH = cbody.querySelector("[data-tot-haber]");
    const elE = cbody.querySelector("[data-cuadre]"), btn = cbody.querySelector("[data-cont-guardar-pol]");
    if (elD) elD.textContent = "$" + fmt(debe);
    if (elH) elH.textContent = "$" + fmt(haber);
    const cuadra = Math.abs(dif) < 0.01 && debe > 0;
    if (elE) {
      elE.textContent = cuadra ? "✓ Cuadrada · lista para guardar" : (debe === 0 && haber === 0 ? "Captura los importes" : `Diferencia $${fmt(Math.abs(dif))} — iguala Debe y Haber`);
      elE.className = "cont-cuadre " + (cuadra ? "is-ok" : "is-bad");
    }
    if (btn) btn.disabled = !cuadra;
  }
  /* ---------- Plantillas de captura rápida (sin saber Debe/Haber) ---------- */
  const PLANTILLAS = [
    { id: "venta",    label: "Vendí / cobré de contado", desc: "Entró dinero por una venta",        iva: true },
    { id: "cobro",    label: "Me pagó un cliente",        desc: "Cobro de una factura anterior",      iva: false },
    { id: "gasto",    label: "Pagué un gasto",            desc: "Salió dinero por un gasto o compra", iva: true },
    { id: "pagoprov", label: "Le pagué a un proveedor",   desc: "Pago de una factura de proveedor",   iva: false },
  ];
  function plantillaAPoliza(tipoId, total, concepto, conIva, fecha, cuentaBanco) {
    total = round2(total);
    const sub = conIva ? round2(total / 1.16) : total, iva = conIva ? round2(total - sub) : 0;
    const base = { fecha: fecha || hoyISO(), concepto: concepto, origen: "rapida" };
    const A = (codigo, nombre, debe, haber) => ({ codigo, nombre, debe, haber });
    const cb = cuentaBanco || cuentaRol("bancos"); // respaldo si no se eligió nada en el campo
    if (!cb) return { error: `Falta configurar: ${NOMBRES_ROL.bancos}. Ve a Configuración contable antes de capturar.` };
    const bc = (debe, haber) => A(cb.codigo, cb.nombre, debe, haber);
    if (tipoId === "venta") {
      const cVentas = cuentaRol("ventas"), cIva = cuentaRol("ivaTrasladado");
      if (!cVentas || (conIva && !cIva)) return { error: `Falta configurar: ${[!cVentas && NOMBRES_ROL.ventas, conIva && !cIva && NOMBRES_ROL.ivaTrasladado].filter(Boolean).join(", ")}. Ve a Configuración contable.` };
      return Object.assign(base, { tipo: "Ingreso", asientos: conIva
        ? [bc(total, 0), A(cVentas.codigo, cVentas.nombre, 0, sub), A(cIva.codigo, cIva.nombre, 0, iva)]
        : [bc(total, 0), A(cVentas.codigo, cVentas.nombre, 0, total)] });
    }
    if (tipoId === "gasto") {
      const cGastos = cuentaRol("gastos"), cIvaA = cuentaRol("ivaAcreditable");
      if (!cGastos || (conIva && !cIvaA)) return { error: `Falta configurar: ${[!cGastos && NOMBRES_ROL.gastos, conIva && !cIvaA && NOMBRES_ROL.ivaAcreditable].filter(Boolean).join(", ")}. Ve a Configuración contable.` };
      return Object.assign(base, { tipo: "Egreso", asientos: conIva
        ? [A(cGastos.codigo, cGastos.nombre, sub, 0), A(cIvaA.codigo, cIvaA.nombre, iva, 0), bc(0, total)]
        : [A(cGastos.codigo, cGastos.nombre, total, 0), bc(0, total)] });
    }
    // OT-0023: "pagoprov" ya no es captura libre — plantillaAPoliza ya
    // no la maneja, ver renderProveedorForm/confirmarProveedor.
    return null;
  }

  /* ---------- Modal: registrar movimiento (rápido + avanzado) ---------- */
  let editandoId = null; // OT-0009: id de la póliza en edición, null si es nueva.
  function openPolizaForm() {
    editandoId = null;
    openModal("Registrar movimiento");
    cbody.innerHTML = `
      <div class="cont-modo-tabs">
        <button class="cont-modo is-active" data-modo="rapido">Captura rápida</button>
        <button class="cont-modo" data-modo="avanzado">Avanzado · Debe / Haber</button>
      </div>
      <div data-modo-body></div>`;
    renderModoRapido();
  }
  function renderModoRapido() {
    const body = cbody.querySelector("[data-modo-body]");
    body.innerHTML = `
      <p class="cont-hint">Elige qué pasó y pon el monto. El sistema arma la contabilidad por ti — sin Debe ni Haber.</p>
      <div class="cont-plantillas">
        ${PLANTILLAS.map((t) => `<button class="cont-plantilla" data-plantilla="${t.id}"><b>${t.label}</b><span>${t.desc}</span></button>`).join("")}
      </div>
      <div data-rapido-form></div>`;
  }
  function renderRapidoForm(tipoId) {
    const t = PLANTILLAS.find((x) => x.id === tipoId);
    if (!t) return;
    // OT-0020: "Me pagó un cliente" ya no es captura libre — siempre
    // parte de elegir la factura con saldo pendiente. Flujo aparte.
    if (tipoId === "cobro") { renderCobroForm(); return; }
    // OT-0023: mismo criterio para "Le pagué a un proveedor" — parte de
    // elegir la factura de proveedor con saldo por pagar. "Pagué un
    // gasto" SÍ sigue siendo captura libre a propósito (no todo gasto
    // tiene una factura de proveedor detrás — ver conversación de OT-0023).
    if (tipoId === "pagoprov") { renderProveedorForm(); return; }
    const ph = tipoId === "gasto" ? "Pago de renta de oficina" : tipoId === "venta" ? "Venta de consultoría" : "Factura A-123";
    const bancoDefault = cuentaRol("bancos") || getCuentasAfectables()[0];
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">${t.label}</div>
        ${tipoId === "venta" ? `<button type="button" class="btn btn--ghost btn--sm" data-rapido-importar-cfdi="${tipoId}" style="margin-bottom:.8rem">⇩ Importar desde factura timbrada</button>` : ""}
        <div class="field"><label>Monto total ($)</label><input class="input no-spin" id="rap-monto" type="number" min="0" step="0.01" placeholder="0.00"></div>
        <div class="field"><label>Concepto (¿de qué fue?)</label><input class="input" id="rap-concepto" placeholder="Ej. ${ph}"></div>
        ${tipoId === "venta" ? `
        <div class="field fac-sat-field"><label>Cliente (opcional)</label>
          <input class="input rap-cliente-busca" placeholder="Escribe para buscar…" autocomplete="off">
          <input type="hidden" id="rap-cliente-id" value="">
          <div class="fac-sat-results"></div>
        </div>` : ""}
        <div class="field"><label>Fecha</label><input class="input" id="rap-fecha" type="date" value="${hoyISO()}"></div>
        <div class="field fac-sat-field"><label>¿A qué cuenta entró/salió el dinero?</label>
          <input class="input cuenta-busca" placeholder="Escribe para buscar… (ej. bancos, caja)" autocomplete="off" value="${bancoDefault ? esc(bancoDefault.codigo + " · " + bancoDefault.nombre) : ""}">
          <input type="hidden" id="rap-cuenta" value="${bancoDefault ? esc(bancoDefault.codigo) : ""}">
          <div class="fac-sat-results"></div>
        </div>
        ${t.iva ? `<label class="cont-check"><input type="checkbox" id="rap-iva" checked> El monto incluye IVA 16%</label>` : ""}
        <div data-cont-msg></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-rapido-volver>← Cambiar</button>
          <button class="btn btn--primary" data-rapido-guardar="${tipoId}">Guardar movimiento</button></div>
      </div>`;
    const mi = cbody.querySelector("#rap-monto"); if (mi) mi.focus();
  }

  /* ================================================================
     OT-0020 · "Me pagó un cliente" — flujo de cobranza real:
     lista (facturas con saldo) → captura (datos del pago) →
     resumen (Debe/Haber propuesto) → confirmar (genera póliza).
     Estado del wizard vive en cobroState mientras el modal está abierto.
     ================================================================ */
  let cobroState = null;

  function getCfdisSaldoLista() {
    const raw = window.CONTATECK_CFDIS_SALDO_PG || [];
    // FIX 1: la vista ya trae los campos planos (sin objeto cfdis anidado).
    return raw.map((r) => ({
      cfdiId: r.cfdi_id, total: num(r.total), pagado: num(r.pagado), saldo: num(r.saldo_pendiente),
      folio: r.folio || "—", cliente: r.receptor_nombre || "Cliente", fecha: r.fecha || "",
      metodoPago: r.metodo_pago || null, estatus: r.estatus || "vigente",
    })).filter((c) => c.estatus !== "cancelado" && c.saldo > 0);
  }

  function renderCobroForm() {
    cobroState = { paso: "lista" };
    const facturas = getCfdisSaldoLista();
    const filaFactura = (f) => {
      const esPPD = f.metodoPago === "PPD";
      const badge = f.metodoPago ? `<span class="cont-badge-metodo ${esPPD ? "is-ppd" : "is-pue"}">${esc(f.metodoPago)}</span>` : "";
      return `<div class="cont-plantilla" data-cobro-factura="${esc(f.cfdiId)}" style="text-align:left">
        <b>${esc(f.folio)} · ${esc(f.cliente)} ${badge}</b>
        <span>Saldo: $${fmt(f.saldo)} <small style="color:var(--muted)">de $${fmt(f.total)}</small></span></div>`;
    };
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Me pagó un cliente</div>
        ${!facturas.length
          ? `<p class="cont-hint">No hay facturas con saldo pendiente de cobro.</p>`
          : `<p class="cont-hint" style="margin-top:0">Elige la factura que te pagaron.</p>
             <input class="input" data-cobro-busca placeholder="Buscar por folio o cliente…" autocomplete="off" style="margin-bottom:.8rem">
             <div style="display:grid;gap:.5rem;max-height:340px;overflow:auto" data-cobro-lista>${facturas.map(filaFactura).join("")}</div>`}
        <div class="cont-foot"><button class="btn btn--ghost" data-rapido-volver>← Cambiar</button></div>
      </div>`;
    const busca = cbody.querySelector("[data-cobro-busca]");
    if (busca) busca.addEventListener("input", () => {
      const q = busca.value.trim().toLowerCase();
      const lista = cbody.querySelector("[data-cobro-lista]");
      const filtradas = q ? facturas.filter((f) => f.folio.toLowerCase().includes(q) || f.cliente.toLowerCase().includes(q)) : facturas;
      lista.innerHTML = filtradas.length ? filtradas.map(filaFactura).join("") : `<p class="cont-hint">Sin resultados para "${esc(busca.value)}".</p>`;
    });
  }

  function renderCobroCaptura(f) {
    cobroState = { paso: "captura", factura: f };
    const cBanco = cuentaRol("bancos");
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Me pagó un cliente</div>
        <div class="cont-cfdi-resumen" style="background:var(--ink-900,rgba(255,255,255,.03));border-radius:10px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.88rem">
          <div><b>${esc(f.folio)}</b> · ${esc(f.cliente)} · ${esc(fechaCorta(f.fecha))}</div>
          <div style="margin-top:.3rem">Total factura: $${fmt(f.total)} &nbsp;·&nbsp; Pagado: $${fmt(f.pagado)}</div>
          <div style="margin-top:.2rem;font-weight:700;color:var(--brand,#6E8BFF)">Saldo pendiente: $${fmt(f.saldo)}</div>
        </div>
        <div class="field"><label>Monto que está pagando ($)</label>
          <input class="input no-spin" id="cobro-monto" type="number" min="0.01" max="${f.saldo}" step="0.01" value="${f.saldo}"></div>
        <div class="field"><label>Fecha del pago</label><input class="input" id="cobro-fecha" type="date" value="${hoyISO()}"></div>
        <div class="field"><label>Forma de pago</label><select class="input" id="cobro-forma">
          <option value="03">Transferencia electrónica</option><option value="01">Efectivo</option>
          <option value="02">Cheque nominativo</option><option value="04">Tarjeta de crédito</option>
          <option value="28">Tarjeta de débito</option><option value="99">Otro</option></select></div>
        <div class="field fac-sat-field"><label>¿A qué cuenta entró el dinero?</label>
          <input class="input cuenta-busca" placeholder="Escribe para buscar… (ej. bancos, caja)" autocomplete="off" value="${cBanco ? esc(cBanco.codigo + " · " + cBanco.nombre) : ""}">
          <input type="hidden" id="cobro-cuenta" value="${cBanco ? esc(cBanco.codigo) : ""}">
          <div class="fac-sat-results"></div>
        </div>
        <div class="field"><label>Referencia (opcional)</label><input class="input" id="cobro-referencia" placeholder="Ej. folio de transferencia"></div>
        <div class="field"><label>Notas (opcional)</label><input class="input" id="cobro-notas" placeholder="Observaciones"></div>
        <div class="field"><label>Comprobante de pago (opcional)</label><input class="input" id="cobro-comprobante" type="file" accept="image/*,.pdf"></div>
        <div data-cont-msg></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-cobro-volver-lista>← Elegir otra factura</button>
          <button class="btn btn--primary" data-cobro-continuar>Continuar</button></div>
      </div>`;
  }

  // Mismo patrón de Storage que ya usan en ventas.js — bucket "documentos",
  // carpeta por empresa, sin pasar el archivo por el backend.
  async function subirComprobantePago(file) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    const empresaId = (window.CONTATECK_EMPRESA_PG || {}).id;
    if (!cfg || !t || !empresaId) throw new Error("Sesión o configuración de Storage no disponible.");
    // OT-0022: se conserva el nombre real del archivo (sanitizado) para
    // que el historial muestre "recibo-bbva-enero.pdf" y no un genérico.
    const nombreLimpio = (file.name || "comprobante.bin")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = empresaId + "/cobranza/" + Date.now() + Math.floor(Math.random() * 1000) + "/" + nombreLimpio;
    const resp = await fetch(cfg.url + "/storage/v1/object/documentos/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!resp.ok) throw new Error("No se pudo subir el comprobante (" + resp.status + ").");
    return path;
  }

  async function continuarCobro() {
    const f = cobroState.factura;
    const msg = cbody.querySelector("[data-cont-msg]");
    const monto = num(cbody.querySelector("#cobro-monto").value);
    const fecha = cbody.querySelector("#cobro-fecha").value || hoyISO();
    const forma = cbody.querySelector("#cobro-forma").value;
    const cuentaCodigo = (cbody.querySelector("#cobro-cuenta") || {}).value || "";
    const referencia = cbody.querySelector("#cobro-referencia").value.trim();
    const notas = cbody.querySelector("#cobro-notas").value.trim();
    const fileInput = cbody.querySelector("#cobro-comprobante");
    const cuenta = getCuentaPorCodigo(cuentaCodigo);
    if (monto <= 0) { msg.innerHTML = `<div class="cont-err">Pon un monto mayor a cero.</div>`; return; }
    if (monto > f.saldo) { msg.innerHTML = `<div class="cont-err">El monto no puede ser mayor al saldo pendiente ($${fmt(f.saldo)}).</div>`; return; }
    if (!cuenta) { msg.innerHTML = `<div class="cont-err">Elige a qué cuenta entró el dinero.</div>`; return; }
    const btn = cbody.querySelector("[data-cobro-continuar]"); if (btn) btn.disabled = true;
    msg.innerHTML = "";
    try {
      let comprobanteUrl = null;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        comprobanteUrl = await subirComprobantePago(fileInput.files[0]);
      }
      const r = await window.CTPostgres.registrarPagoCliente({
        cfdiId: f.cfdiId, monto, fechaPago: fecha, formaPago: forma,
        cuentaDestinoId: cuenta.id, referencia: referencia || null, notas: notas || null, comprobanteUrl,
      });
      if (!r.ok) { msg.innerHTML = `<div class="cont-err">${esc(r.error || "No se pudo registrar el pago.")}</div>`; if (btn) btn.disabled = false; return; }
      renderCobroResumen({ pagoId: r.pagoId, factura: f, monto, cuenta });
    } catch (e) {
      msg.innerHTML = `<div class="cont-err">${esc(e.message || "Ocurrió un error.")}</div>`;
      if (btn) btn.disabled = false;
    }
  }

  function renderCobroResumen({ pagoId, factura, monto, cuenta }) {
    cobroState = { paso: "resumen", pagoId, factura, monto, cuenta };
    const cClientes = cuentaRol("clientes");
    const saldoPosterior = round2(factura.saldo - monto);
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Resumen de la operación</div>
        <div style="font-size:.9rem;line-height:1.7">
          <div>Factura: <b>${esc(factura.folio)}</b></div>
          <div>Cliente: <b>${esc(factura.cliente)}</b></div>
          <div>Monto recibido: <b>$${fmt(monto)}</b></div>
          <div>Saldo anterior: $${fmt(factura.saldo)}</div>
          <div>Saldo posterior: <b>$${fmt(saldoPosterior)}</b></div>
        </div>
        <div class="cont-asientos-head" style="margin-top:1rem"><span>Así se registrará contablemente</span><span></span><span></span><span></span></div>
        <div style="font-size:.88rem;padding:.6rem 0;border-top:1px solid var(--line,#1a2540);border-bottom:1px solid var(--line,#1a2540)">
          <div><b>Debe</b> — ${esc(cuenta.codigo)} · ${esc(cuenta.nombre)} — $${fmt(monto)}</div>
          <div style="margin-top:.3rem"><b>Haber</b> — ${cClientes ? esc(cClientes.codigo) + " · " + esc(cClientes.nombre) : "⚠ Clientes no configurado"} — $${fmt(monto)}</div>
        </div>
        ${factura.metodoPago === "PPD" ? `<div style="margin-top:.8rem;padding:.6rem .8rem;border-radius:8px;background:rgba(224,160,48,.1);color:#e0a030;font-size:.83rem">
          <b>Complemento de Pago (REP):</b> quedará como <b>Pendiente</b>. Este registro es la parte contable — el complemento fiscal ante el SAT se timbrará por separado cuando ese flujo esté habilitado. No se marcará nada como timbrado sin que realmente lo esté.
        </div>` : ""}
        <div data-cont-msg style="margin-top:.8rem"></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-cobro-cancelar>Cancelar</button>
          <button class="btn btn--primary" data-cobro-confirmar>Confirmar pago y generar póliza</button></div>
      </div>`;
  }

  async function confirmarCobro() {
    const msg = cbody.querySelector("[data-cont-msg]");
    const btn = cbody.querySelector("[data-cobro-confirmar]"); if (btn) btn.disabled = true;
    const r = await window.CTPostgres.confirmarPagoCliente(cobroState.pagoId);
    if (!r.ok) {
      msg.innerHTML = errorConfigHTML(r.error || "No se pudo confirmar el pago.");
      if (btn) btn.disabled = false;
      return;
    }
    closeModal();
    toast("Pago confirmado — póliza " + r.folio, "ok");
    // FIX 2: la póliza aparece al instante en la tabla, sin esperar a
    // recargar (nace en Postgres, así que se refleja localmente con sus
    // asientos para que el monto y el detalle se vean completos).
    try {
      const f2 = cobroState.factura, cCli = cuentaRol("clientes");
      const arr2 = leerPolizas();
      arr2.unshift({
        id: "pg-" + r.polizaId, pgId: r.polizaId, folio: r.folio, tipo: "Ingreso",
        fecha: hoyISO(), creada: Date.now(), origen: "postgres", estado: "ok",
        concepto: "Cobro CFDI " + (f2.folio || "") + " · " + (f2.cliente || ""),
        monto: cobroState.monto,
        asientos: [
          { codigo: cobroState.cuenta.codigo, nombre: cobroState.cuenta.nombre, debe: cobroState.monto, haber: 0 },
          cCli ? { codigo: cCli.codigo, nombre: cCli.nombre, debe: 0, haber: cobroState.monto } : null,
        ].filter(Boolean),
      });
      guardarPolizas(arr2);
    } catch (e2) { /* no crítico: se sincroniza al recargar */ }
    // Refresca la lista de saldos sin recargar toda la sesión.
    try {
      const resp = await fetch(((window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app") + "/api/cfdis-saldo", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      const data = await resp.json();
      if (data.ok) window.CONTATECK_CFDIS_SALDO_PG = data.facturas || [];
    } catch (e) { /* silencioso: no crítico, se refresca solo al recargar */ }
    renderTodo();
  }

  /* ================================================================
     OT-0023 · Flujo "Le pagué a un proveedor" — espejo exacto del
     flujo de cobro, con la dirección del dinero invertida: la cuenta
     elegida es de dónde SALE el dinero, y el Debe es Proveedores
     (baja el pasivo) en vez de Haber Clientes.
     lista (facturas con saldo por pagar) → captura → resumen → confirmar.
     ================================================================ */
  let provState = null;
  function getCfdisProveedorSaldoLista() {
    const raw = window.CONTATECK_CFDIS_PROVEEDOR_SALDO_PG || [];
    return raw.map((r) => ({
      cfdiProveedorId: r.cfdi_proveedor_id, total: num(r.total), pagado: num(r.pagado), saldo: num(r.saldo_pendiente),
      folio: r.folio || "—", proveedor: r.emisor_nombre || "Proveedor", fecha: r.fecha || "",
      metodoPago: r.metodo_pago || null, estatus: r.estatus || "vigente",
    })).filter((c) => c.estatus !== "cancelado" && c.saldo > 0);
  }

  function renderProveedorForm() {
    provState = { paso: "lista" };
    const facturas = getCfdisProveedorSaldoLista();
    const filaFactura = (f) => {
      const esPPD = f.metodoPago === "PPD";
      const badge = f.metodoPago ? `<span class="cont-badge-metodo ${esPPD ? "is-ppd" : "is-pue"}">${esc(f.metodoPago)}</span>` : "";
      return `<div class="cont-plantilla" data-prov-factura="${esc(f.cfdiProveedorId)}" style="text-align:left">
        <b>${esc(f.folio)} · ${esc(f.proveedor)} ${badge}</b>
        <span>Saldo: $${fmt(f.saldo)} <small style="color:var(--muted)">de $${fmt(f.total)}</small></span></div>`;
    };
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Le pagué a un proveedor</div>
        ${!facturas.length
          ? `<p class="cont-hint">No hay facturas de proveedor con saldo pendiente. Impórtalas primero desde "Importar XML recibido".</p>`
          : `<p class="cont-hint" style="margin-top:0">Elige la factura que le estás pagando.</p>
             <input class="input" data-prov-busca placeholder="Buscar por folio o proveedor…" autocomplete="off" style="margin-bottom:.8rem">
             <div style="display:grid;gap:.5rem;max-height:340px;overflow:auto" data-prov-lista>${facturas.map(filaFactura).join("")}</div>`}
        <div class="cont-foot"><button class="btn btn--ghost" data-rapido-volver>← Cambiar</button></div>
      </div>`;
    const busca = cbody.querySelector("[data-prov-busca]");
    if (busca) busca.addEventListener("input", () => {
      const q = busca.value.trim().toLowerCase();
      const lista = cbody.querySelector("[data-prov-lista]");
      const filtradas = q ? facturas.filter((f) => f.folio.toLowerCase().includes(q) || f.proveedor.toLowerCase().includes(q)) : facturas;
      lista.innerHTML = filtradas.length ? filtradas.map(filaFactura).join("") : `<p class="cont-hint">Sin resultados para "${esc(busca.value)}".</p>`;
    });
  }

  function renderProveedorCaptura(f) {
    provState = { paso: "captura", factura: f };
    const cBanco = cuentaRol("bancos");
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Le pagué a un proveedor</div>
        <div class="cont-cfdi-resumen" style="background:var(--ink-900,rgba(255,255,255,.03));border-radius:10px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.88rem">
          <div><b>${esc(f.folio)}</b> · ${esc(f.proveedor)} · ${esc(fechaCorta(f.fecha))}</div>
          <div style="margin-top:.3rem">Total factura: $${fmt(f.total)} &nbsp;·&nbsp; Pagado: $${fmt(f.pagado)}</div>
          <div style="margin-top:.2rem;font-weight:700;color:var(--brand,#6E8BFF)">Saldo pendiente: $${fmt(f.saldo)}</div>
        </div>
        <div class="field"><label>Monto que estás pagando ($)</label>
          <input class="input no-spin" id="prov-monto" type="number" min="0.01" max="${f.saldo}" step="0.01" value="${f.saldo}"></div>
        <div class="field"><label>Fecha del pago</label><input class="input" id="prov-fecha" type="date" value="${hoyISO()}"></div>
        <div class="field"><label>Forma de pago</label><select class="input" id="prov-forma">
          <option value="03">Transferencia electrónica</option><option value="01">Efectivo</option>
          <option value="02">Cheque nominativo</option><option value="04">Tarjeta de crédito</option>
          <option value="28">Tarjeta de débito</option><option value="99">Otro</option></select></div>
        <div class="field fac-sat-field"><label>¿De qué cuenta salió el dinero?</label>
          <input class="input cuenta-busca" placeholder="Escribe para buscar… (ej. bancos, caja)" autocomplete="off" value="${cBanco ? esc(cBanco.codigo + " · " + cBanco.nombre) : ""}">
          <input type="hidden" id="prov-cuenta" value="${cBanco ? esc(cBanco.codigo) : ""}">
          <div class="fac-sat-results"></div>
        </div>
        <div class="field"><label>Referencia (opcional)</label><input class="input" id="prov-referencia" placeholder="Ej. folio de transferencia"></div>
        <div class="field"><label>Notas (opcional)</label><input class="input" id="prov-notas" placeholder="Observaciones"></div>
        <div class="field"><label>Comprobante de pago (opcional)</label><input class="input" id="prov-comprobante" type="file" accept="image/*,.pdf"></div>
        <div data-cont-msg></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-prov-volver-lista>← Elegir otra factura</button>
          <button class="btn btn--primary" data-prov-continuar>Continuar</button></div>
      </div>`;
  }

  // Mismo bucket/patrón de Storage que subirComprobantePago (cobro),
  // solo cambia la carpeta para no mezclar evidencias de cobro y pago.
  async function subirComprobantePagoProveedor(file) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    const empresaId = (window.CONTATECK_EMPRESA_PG || {}).id;
    if (!cfg || !t || !empresaId) throw new Error("Sesión o configuración de Storage no disponible.");
    const nombreLimpio = (file.name || "comprobante.bin")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = empresaId + "/pagos-proveedor/" + Date.now() + Math.floor(Math.random() * 1000) + "/" + nombreLimpio;
    const resp = await fetch(cfg.url + "/storage/v1/object/documentos/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!resp.ok) throw new Error("No se pudo subir el comprobante (" + resp.status + ").");
    return path;
  }

  async function continuarProveedor() {
    const f = provState.factura;
    const msg = cbody.querySelector("[data-cont-msg]");
    const monto = num(cbody.querySelector("#prov-monto").value);
    const fecha = cbody.querySelector("#prov-fecha").value || hoyISO();
    const forma = cbody.querySelector("#prov-forma").value;
    const cuentaCodigo = (cbody.querySelector("#prov-cuenta") || {}).value || "";
    const referencia = cbody.querySelector("#prov-referencia").value.trim();
    const notas = cbody.querySelector("#prov-notas").value.trim();
    const fileInput = cbody.querySelector("#prov-comprobante");
    const cuenta = getCuentaPorCodigo(cuentaCodigo);
    if (monto <= 0) { msg.innerHTML = `<div class="cont-err">Pon un monto mayor a cero.</div>`; return; }
    if (monto > f.saldo) { msg.innerHTML = `<div class="cont-err">El monto no puede ser mayor al saldo pendiente ($${fmt(f.saldo)}).</div>`; return; }
    if (!cuenta) { msg.innerHTML = `<div class="cont-err">Elige de qué cuenta salió el dinero.</div>`; return; }
    const btn = cbody.querySelector("[data-prov-continuar]"); if (btn) btn.disabled = true;
    msg.innerHTML = "";
    try {
      let comprobanteUrl = null;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        comprobanteUrl = await subirComprobantePagoProveedor(fileInput.files[0]);
      }
      const r = await window.CTPostgres.registrarPagoProveedor({
        cfdiProveedorId: f.cfdiProveedorId, monto, fechaPago: fecha, formaPago: forma,
        cuentaOrigenId: cuenta.id, referencia: referencia || null, notas: notas || null, comprobanteUrl,
      });
      if (!r.ok) { msg.innerHTML = `<div class="cont-err">${esc(r.error || "No se pudo registrar el pago.")}</div>`; if (btn) btn.disabled = false; return; }
      renderProveedorResumen({ pagoId: r.pagoId, factura: f, monto, cuenta });
    } catch (e) {
      msg.innerHTML = `<div class="cont-err">${esc(e.message || "Ocurrió un error.")}</div>`;
      if (btn) btn.disabled = false;
    }
  }

  function renderProveedorResumen({ pagoId, factura, monto, cuenta }) {
    provState = { paso: "resumen", pagoId, factura, monto, cuenta };
    const cProv = cuentaRol("proveedores");
    const saldoPosterior = round2(factura.saldo - monto);
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">Resumen de la operación</div>
        <div style="font-size:.9rem;line-height:1.7">
          <div>Factura: <b>${esc(factura.folio)}</b></div>
          <div>Proveedor: <b>${esc(factura.proveedor)}</b></div>
          <div>Monto pagado: <b>$${fmt(monto)}</b></div>
          <div>Saldo anterior: $${fmt(factura.saldo)}</div>
          <div>Saldo posterior: <b>$${fmt(saldoPosterior)}</b></div>
        </div>
        <div class="cont-asientos-head" style="margin-top:1rem"><span>Así se registrará contablemente</span><span></span><span></span><span></span></div>
        <div style="font-size:.88rem;padding:.6rem 0;border-top:1px solid var(--line,#1a2540);border-bottom:1px solid var(--line,#1a2540)">
          <div><b>Debe</b> — ${cProv ? esc(cProv.codigo) + " · " + esc(cProv.nombre) : "⚠ Proveedores no configurado"} — $${fmt(monto)}</div>
          <div style="margin-top:.3rem"><b>Haber</b> — ${esc(cuenta.codigo)} · ${esc(cuenta.nombre)} — $${fmt(monto)}</div>
        </div>
        <div data-cont-msg style="margin-top:.8rem"></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-prov-cancelar>Cancelar</button>
          <button class="btn btn--primary" data-prov-confirmar>Confirmar pago y generar póliza</button></div>
      </div>`;
  }

  async function confirmarProveedor() {
    const msg = cbody.querySelector("[data-cont-msg]");
    const btn = cbody.querySelector("[data-prov-confirmar]"); if (btn) btn.disabled = true;
    const r = await window.CTPostgres.confirmarPagoProveedor(provState.pagoId);
    if (!r.ok) {
      msg.innerHTML = errorConfigHTML(r.error || "No se pudo confirmar el pago.");
      if (btn) btn.disabled = false;
      return;
    }
    closeModal();
    toast("Pago a proveedor confirmado — póliza " + r.folio, "ok");
    try {
      const f2 = provState.factura, cProv = cuentaRol("proveedores");
      const arr2 = leerPolizas();
      arr2.unshift({
        id: "pg-" + r.polizaId, pgId: r.polizaId, folio: r.folio, tipo: "Egreso",
        fecha: hoyISO(), creada: Date.now(), origen: "postgres", estado: "ok",
        concepto: "Pago a proveedor " + (f2.folio || "") + " · " + (f2.proveedor || ""),
        monto: provState.monto,
        asientos: [
          cProv ? { codigo: cProv.codigo, nombre: cProv.nombre, debe: provState.monto, haber: 0 } : null,
          { codigo: provState.cuenta.codigo, nombre: provState.cuenta.nombre, debe: 0, haber: provState.monto },
        ].filter(Boolean),
      });
      guardarPolizas(arr2);
    } catch (e2) { /* no crítico: se sincroniza al recargar */ }
    try {
      const resp = await fetch(((window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app") + "/api/cfdis-proveedor-saldo", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      const data = await resp.json();
      if (data.ok) window.CONTATECK_CFDIS_PROVEEDOR_SALDO_PG = data.facturas || [];
    } catch (e) { /* silencioso */ }
    renderTodo();
  }

  // ---------- Buscador de cliente (opcional) dentro de Captura rápida ----------
  async function buscarRapCliente(input) {
    const field = input.closest(".fac-sat-field");
    if (!field) return;
    const box = field.querySelector(".fac-sat-results");
    const q = input.value.trim();
    if (q.length < 2) { box.classList.remove("is-open"); box.innerHTML = ""; return; }
    try {
      const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
      if (!cfg || !t) return;
      const resp = await fetch(cfg.url + "/rest/v1/clientes?select=id,nombre,rfc&nombre=ilike.*" + encodeURIComponent(q) + "*&limit=8", {
        headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey },
      });
      const data = await resp.json();
      const lista = Array.isArray(data) ? data : [];
      box.innerHTML = lista.length
        ? lista.map((c) => `<div class="fac-sat-opt" data-id="${esc(c.id)}" data-nombre="${esc(c.nombre)}"><b>${esc(c.nombre)}</b>${c.rfc ? " · " + esc(c.rfc) : ""}</div>`).join("")
        : `<div class="fac-sat-hint">Sin clientes que coincidan con "${esc(q)}".</div>`;
      box.classList.add("is-open");
    } catch (e) { /* silencioso: es un campo opcional */ }
  }

  // ---------- Importar desde factura timbrada (solo "Me pagó un cliente") ----------
  function abrirImportarCfdiRapido(tipoId) {
    const cfdis = leerCfdis().filter((c) => c && c.estado !== "cancelada" && c.tipo !== "P");
    const host = document.createElement("div");
    host.className = "cont-modal is-open";
    if (!cfdis.length) {
      host.innerHTML = `<div class="cont-modal__card" style="max-width:420px"><div class="cont-modal__body" style="padding-top:1.4rem">
        <p style="margin:0 0 1.2rem;color:var(--text)">No hay facturas timbradas disponibles para importar.</p>
        <div class="cont-foot"><button class="btn btn--primary" data-ct-ok>Entendido</button></div></div></div>`;
      document.body.appendChild(host);
      host.addEventListener("click", (e) => { if (e.target === host || e.target.closest("[data-ct-ok]")) document.body.removeChild(host); });
      return;
    }
    const filaCfdi = (c) => {
      const m = montosCfdi(c);
      // OT-0019: una PPD (pago diferido/parcialidades) no se puede importar
      // igual que una PUE — el cobro real todavía no ocurrió ante el SAT,
      // haría falta un REP que este sistema todavía no genera. Se muestra
      // en la lista (para que quede claro que existe) pero no se deja
      // elegir hasta que la contadora confirme cómo debe registrarse.
      const esPPD = c.metodoPago === "PPD";
      const etiqueta = c.metodoPago ? `<span class="cont-badge-metodo ${esPPD ? "is-ppd" : "is-pue"}">${esc(c.metodoPago)}</span>` : "";
      return `<div class="cont-plantilla${esPPD ? " is-bloqueada" : ""}" data-cfdi-pick="${esc(cfdiKey(c))}" data-ppd="${esPPD ? "1" : "0"}" style="text-align:left">
        <b>${esc(c.folio || "—")} · ${esc(c.cliente || "Cliente")} ${etiqueta}</b><span>$${fmt(m.total)}</span>
        ${esPPD ? `<small style="display:block;color:var(--warn,#e0a030);font-weight:400">Pago diferido — pendiente de confirmar con la contadora</small>` : ""}</div>`;
    };
    host.innerHTML = `<div class="cont-modal__card" style="max-width:520px"><div class="cont-modal__body" style="padding-top:1.4rem">
      <p style="margin:0 0 .8rem;color:var(--muted);font-size:.85rem">Elige la factura ${tipoId === "venta" ? "que timbraste" : "que te pagaron"} — se rellenan el monto${tipoId === "venta" ? ", el IVA" : ""} y el concepto solos.</p>
      <input class="input" data-cfdi-import-busca placeholder="Buscar por folio o cliente…" autocomplete="off" style="margin-bottom:.8rem">
      <div style="display:grid;gap:.5rem;max-height:340px;overflow:auto" data-cfdi-import-lista>${cfdis.slice(0, 30).map(filaCfdi).join("")}</div>
      <div class="cont-foot"><button class="btn btn--ghost" data-ct-no>Cerrar</button></div></div></div>`;
    document.body.appendChild(host);
    const busca = host.querySelector("[data-cfdi-import-busca]");
    const lista = host.querySelector("[data-cfdi-import-lista]");
    busca.addEventListener("input", () => {
      const q = busca.value.trim().toLowerCase();
      const filtradas = q ? cfdis.filter((c) => (c.folio || "").toLowerCase().includes(q) || (c.cliente || "").toLowerCase().includes(q)) : cfdis;
      lista.innerHTML = filtradas.length ? filtradas.slice(0, 30).map(filaCfdi).join("")
        : `<p style="color:var(--faint);font-size:.82rem;padding:.6rem 0;text-align:center">Sin resultados para "${esc(busca.value)}".</p>`;
    });
    setTimeout(() => busca.focus(), 50);
    host.addEventListener("click", (e) => {
      if (e.target === host || e.target.closest("[data-ct-no]")) { document.body.removeChild(host); return; }
      const pick = e.target.closest("[data-cfdi-pick]");
      if (pick) {
        // OT-0019: si es PPD, no se importa — se explica por qué y se
        // deja el modal abierto para que elija otra factura si quiere.
        if (pick.getAttribute("data-ppd") === "1") {
          const aviso = pick.querySelector("small");
          if (aviso) { aviso.style.color = "var(--danger,#e05252)"; aviso.textContent = "Esta factura es PPD — no se puede importar todavía, pídele a Jorge que confirme el flujo con la contadora."; }
          return;
        }
        const key = pick.getAttribute("data-cfdi-pick");
        const cfdi = cfdis.find((c) => cfdiKey(c) === key);
        if (cfdi) {
          const m = montosCfdi(cfdi);
          const mi = cbody.querySelector("#rap-monto"), ci = cbody.querySelector("#rap-concepto");
          if (mi) mi.value = m.total;
          if (tipoId === "venta") {
            if (ci) ci.value = `Venta CFDI ${cfdi.folio || ""} · ${cfdi.cliente || "Cliente"}`.trim();
            const ivaChk = cbody.querySelector("#rap-iva");
            if (ivaChk) { ivaChk.checked = true; ivaChk.disabled = true; } // ya no hay nada que adivinar: el IVA viene real de la factura
          } else {
            if (ci) ci.value = `Cobro CFDI ${cfdi.folio || ""} · ${cfdi.cliente || "Cliente"}`.trim();
          }
        }
        document.body.removeChild(host);
      }
    });
  }
  async function guardarRapido(tipoId) {
    const monto = num(cbody.querySelector("#rap-monto").value);
    let concepto = cbody.querySelector("#rap-concepto").value.trim();
    const fecha = cbody.querySelector("#rap-fecha").value || hoyISO();
    const ivaChk = cbody.querySelector("#rap-iva"), conIva = ivaChk ? ivaChk.checked : false;
    const cuentaCodigo = (cbody.querySelector("#rap-cuenta") || {}).value || "";
    const clienteNombreEl = cbody.querySelector(".rap-cliente-busca");
    const msg = cbody.querySelector("[data-cont-msg]");
    if (monto <= 0) { msg.innerHTML = `<div class="cont-err">Pon un monto mayor a cero.</div>`; return; }
    if (!concepto) { msg.innerHTML = `<div class="cont-err">Escribe de qué fue el movimiento.</div>`; return; }
    if (!cuentaCodigo) { msg.innerHTML = `<div class="cont-err">Elige a qué cuenta (Banco/Caja) entró o salió el dinero.</div>`; return; }
    const cuentaBanco = getCuentaPorCodigo(cuentaCodigo);
    if (!cuentaBanco) { msg.innerHTML = `<div class="cont-err">Esa cuenta ya no existe o fue desactivada — elige otra.</div>`; return; }
    if (clienteNombreEl && clienteNombreEl.value.trim() && concepto.indexOf(clienteNombreEl.value.trim()) < 0) {
      concepto = concepto + " · " + clienteNombreEl.value.trim();
    }
    const pol = plantillaAPoliza(tipoId, monto, concepto, conIva, fecha, cuentaBanco);
    if (!pol) { msg.innerHTML = `<div class="cont-err">No se pudo crear el movimiento.</div>`; return; }
    // OT-0020: si falta configuración contable, se explica y se ofrece
    // el botón para abrirla ahí mismo — sin que el usuario tenga que
    // saber dónde está esa pantalla.
    if (pol.error) { msg.innerHTML = errorConfigHTML(pol.error); return; }
    const btn = cbody.querySelector("[data-rapido-guardar]"); if (btn) btn.disabled = true;
    const { pgError } = await savePoliza(pol);
    if (pgError) {
      msg.innerHTML = `<div class="cont-err">${pgError}</div>`;
      if (btn) btn.disabled = false;
      return;
    }
    closeModal(); renderTodo();
  }
  function renderModoAvanzado(p) {
    p = p || {};
    const filas = (p.asientos && p.asientos.length) ? p.asientos.map((a) => asientoRow(a)).join("") : asientoRow() + asientoRow();
    cbody.querySelector("[data-modo-body]").innerHTML = `
      <div class="cont-grid3">
        <div class="field"><label>Tipo</label><select class="input" id="pol-tipo">
          <option${p.tipo === "Ingreso" ? " selected" : ""}>Ingreso</option><option${p.tipo === "Egreso" ? " selected" : ""}>Egreso</option><option${!p.tipo || p.tipo === "Diario" ? " selected" : ""}>Diario</option></select></div>
        <div class="field"><label>Fecha</label><input class="input" id="pol-fecha" type="date" value="${esc(p.fecha || hoyISO())}"></div>
      </div>
      <div class="field"><label>Concepto</label><input class="input" id="pol-concepto" placeholder="Ej. Provisión de nómina 2a quincena" value="${esc(p.concepto || "")}"></div>
      <div class="cont-asientos-head"><span>Cuenta</span><span>Debe</span><span>Haber</span><span></span></div>
      <div data-cont-asientos>${filas}</div>
      <button class="btn btn--ghost btn--sm" data-cont-as-add style="margin-top:.4rem">+ Agregar línea</button>
      <div class="cont-totales">
        <div class="cont-totales-row"><span>Total Debe</span><b data-tot-debe>$0.00</b></div>
        <div class="cont-totales-row"><span>Total Haber</span><b data-tot-haber>$0.00</b></div>
        <button class="btn btn--ghost btn--sm" data-cont-cuadrar style="width:100%;margin:.4rem 0 .2rem">Cuadrar automáticamente</button>
        <div class="cont-cuadre is-bad" data-cuadre>Captura los importes</div></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-guardar-pol disabled>${editandoId ? "Guardar cambios" : "Guardar póliza"}</button></div>`;
    recalcCuadre();
  }
  // Pone la diferencia en una línea vacía para cuadrar al instante.
  function cuadrarAuto() {
    let debe = 0, haber = 0;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      debe += num(row.querySelector(".cont-as-debe").value);
      haber += num(row.querySelector(".cont-as-haber").value);
    });
    const dif = round2(debe - haber);
    if (Math.abs(dif) < 0.01) return;
    let target = null;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      const d = num(row.querySelector(".cont-as-debe").value), h = num(row.querySelector(".cont-as-haber").value);
      if (!target && d === 0 && h === 0) target = row;
    });
    if (!target) {
      const cont = cbody.querySelector("[data-cont-asientos]");
      cont.insertAdjacentHTML("beforeend", asientoRow());
      target = cont.lastElementChild;
    }
    if (dif > 0) target.querySelector(".cont-as-haber").value = dif.toFixed(2);
    else target.querySelector(".cont-as-debe").value = Math.abs(dif).toFixed(2);
    recalcCuadre();
  }
  async function guardarPolizaForm() {
    const tipo = cbody.querySelector("#pol-tipo").value;
    const fecha = cbody.querySelector("#pol-fecha").value || hoyISO();
    const concepto = cbody.querySelector("#pol-concepto").value.trim();
    const msg = cbody.querySelector("[data-cont-msg]");
    if (!concepto) { msg.innerHTML = `<div class="cont-err">Escribe un concepto para la póliza.</div>`; return; }
    const asientos = []; let debe = 0, haber = 0, faltaCuenta = false;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      const cod = row.querySelector(".cont-as-cta").value;
      const d = num(row.querySelector(".cont-as-debe").value), h = num(row.querySelector(".cont-as-haber").value);
      if (d === 0 && h === 0) return;
      if (!cod) { faltaCuenta = true; return; }
      const cta = getCuentaPorCodigo(cod);
      asientos.push({ codigo: cod, nombre: cta ? cta.nombre : "", debe: round2(d), haber: round2(h) });
      debe += d; haber += h;
    });
    if (faltaCuenta) { msg.innerHTML = `<div class="cont-err">Hay líneas con importe pero sin cuenta seleccionada.</div>`; return; }
    if (asientos.length < 2) { msg.innerHTML = `<div class="cont-err">Una póliza necesita al menos 2 movimientos.</div>`; return; }
    if (Math.abs(round2(debe - haber)) >= 0.01) { msg.innerHTML = `<div class="cont-err">La póliza no cuadra: Debe ≠ Haber.</div>`; return; }
    if (round2(debe) <= 0) { msg.innerHTML = `<div class="cont-err">El importe debe ser mayor a cero.</div>`; return; }
    const btn = cbody.querySelector("[data-cont-guardar-pol]"); if (btn) btn.disabled = true;
    const payload = { tipo, fecha, concepto, asientos };
    if (editandoId) payload.id = editandoId;
    const { pgError } = await savePoliza(payload);
    if (pgError) {
      msg.innerHTML = `<div class="cont-err">${pgError}</div>`;
      if (btn) btn.disabled = false;
      return;
    }
    editandoId = null;
    closeModal(); renderTodo();
  }

  function abrirEditarPoliza(id) {
    const p = getPolizas().find((x) => x.id === id);
    if (!p) return;
    // OT-0020 FIX 3: si la póliza vive en Postgres y aún no tenemos sus
    // partidas, se cargan ANTES de abrir el editor — abrirlo vacío y
    // guardar habría borrado las partidas reales de la base.
    if (p.pgId && (!p.asientos || !p.asientos.length)) {
      openModal(`Editar póliza ${p.folio}`);
      cbody.innerHTML = `<p class="cont-hint">Cargando partidas…</p>`;
      asegurarAsientosPg(p).then((p2) => {
        if (!p2.asientos || !p2.asientos.length) {
          cbody.innerHTML = `<div class="cont-err">No se pudieron cargar las partidas de esta póliza — no se puede editar sin verlas (guardar en blanco borraría el contenido real). Revisa la conexión con el backend e intenta de nuevo.</div>
            <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
          return;
        }
        abrirEditarPoliza(id);
      });
      return;
    }
    editandoId = id;
    openModal(`Editar póliza ${p.folio}`);
    cbody.innerHTML = `<div data-modo-body></div>`;
    renderModoAvanzado(p);
  }

  /* ---------- Modal: ver póliza ---------- */
  // OT-0020 FIX 3: pólizas que viven en Postgres pero llegaron a este
  // navegador sin asientos (ej. las generadas por cobranza, o creadas en
  // otro dispositivo) — se piden al backend una sola vez y se guardan.
  async function asegurarAsientosPg(p) {
    if (!p || !p.pgId || (p.asientos && p.asientos.length)) return p;
    if (!window.CTPostgres || !window.CONTATECK_SUPABASE_TOKEN) return p;
    const r = await window.CTPostgres.obtenerPartidasPoliza(p.pgId);
    if (r.ok && r.partidas && r.partidas.length) {
      const arr = leerPolizas();
      const local = arr.find((x) => x.id === p.id);
      if (local) { local.asientos = r.partidas; guardarPolizas(arr); }
      p.asientos = r.partidas;
    }
    return p;
  }

  function verPoliza(id) {
    const p = getPolizas().find((x) => x.id === id);
    if (!p) return;
    openModal(`Póliza ${p.folio}`);
    if (p.pgId && (!p.asientos || !p.asientos.length)) {
      cbody.innerHTML = `<p class="cont-hint">Cargando partidas…</p>`;
      asegurarAsientosPg(p).then(() => verPoliza(id));
      return;
    }
    const filas = (p.asientos || []).map((a) => `<tr>
      <td class="num">${esc(a.codigo)}</td><td>${esc(a.nombre)}</td>
      <td class="num" style="text-align:right">${num(a.debe) ? "$" + fmt(a.debe) : "—"}</td>
      <td class="num" style="text-align:right">${num(a.haber) ? "$" + fmt(a.haber) : "—"}</td></tr>`).join("");
    const debe = (p.asientos || []).reduce((s, a) => s + num(a.debe), 0);
    const haber = (p.asientos || []).reduce((s, a) => s + num(a.haber), 0);
    cbody.innerHTML = `
      <div class="cont-verhead">
        <div><span>Tipo</span><b>${esc(p.tipo)}</b></div>
        <div><span>Fecha</span><b>${esc(fechaCorta(p.fecha))}</b></div>
        <div><span>Folio</span><b>${esc(p.folio)}</b></div></div>
      <p style="margin:.6rem 0 1rem;color:var(--muted)">${esc(p.concepto)}</p>
      <div style="overflow-x:auto">
      <table class="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="2" style="text-align:right">Totales</td>
        <td class="num" style="text-align:right">$${fmt(debe)}</td><td class="num" style="text-align:right">$${fmt(haber)}</td></tr></tfoot></table></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cerrar</button>
        <button class="btn btn--primary" data-cont-editar-pol="${esc(p.id)}">Editar</button></div>`;
  }

  /* ---------- Modal: Contabilizar CFDI emitidos (Bloque 1) ---------- */
  function openContabilizarCfdi() {
    const pend = cfdisPendientes();
    openModal("Contabilizar facturas (CFDI)");
    if (!pend.length) {
      cbody.innerHTML = `<p style="color:var(--muted);text-align:center;padding:1.8rem">No hay CFDI pendientes. Todas tus facturas timbradas ya tienen su póliza. ✓</p>
        <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
      return;
    }
    const filas = pend.map((c, i) => {
      const m = montosCfdi(c);
      const tipoTxt = c.tipo === "P" ? "Pago (REP)" : c.tipo === "E" ? "Nota crédito" : "Factura";
      return `<tr>
        <td><input type="checkbox" class="cont-chk" data-idx="${i}" checked></td>
        <td class="num">${esc(c.folio || "—")}</td>
        <td>${esc(c.cliente || "—")}</td>
        <td>${tipoTxt}</td>
        <td class="num" style="text-align:right">$${fmt(m.total)}</td></tr>`;
    }).join("");
    cbody.innerHTML = `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:.8rem">Estas facturas timbradas aún no tienen póliza. Genera sus asientos automáticamente (Clientes / Ventas + IVA trasladado).</p>
      <div style="overflow:auto;max-height:340px"><table class="tbl">
        <thead><tr><th style="width:30px"></th><th>Folio</th><th>Cliente</th><th>Tipo</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-contab-go>Contabilizar seleccionadas</button></div>`;
    cbody._pendientes = pend;
  }
  function ejecutarContabilizar() {
    const pend = cbody._pendientes || []; let n = 0;
    const msg = cbody.querySelector("[data-cont-msg]");
    let errorConfig = null;
    cbody.querySelectorAll(".cont-chk").forEach((chk) => {
      if (errorConfig || !chk.checked) return;
      const c = pend[parseInt(chk.getAttribute("data-idx"), 10)];
      if (!c) return;
      const err = contabilizarCfdi(c);
      if (err) errorConfig = err; else n++;
    });
    if (errorConfig) {
      // Falta configuración contable: se explica en el modal con acceso
      // directo, en vez de cerrar como si todo hubiera salido bien.
      if (msg) msg.innerHTML = errorConfigHTML(errorConfig);
      if (n) renderTodo();
      return;
    }
    closeModal(); renderTodo();
  }

  /* ---------- Modal: Importar CFDI recibido (XML de proveedor) ---------- */
  function openImportarXml() {
    openModal("Importar CFDI recibido (XML)");
    cbody.innerHTML = `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:.8rem">Sube los XML de las facturas que te emitieron tus proveedores. Cada uno genera su póliza de gasto (Gastos + IVA acreditable / Proveedores).</p>
      <div class="cont-xml-drop">
        <input type="file" accept=".xml,text/xml" multiple data-xml-file style="display:none">
        <button class="btn btn--ghost" data-xml-pick>Seleccionar archivos XML</button>
        <p style="font-size:.78rem;color:var(--faint);margin-top:.5rem">Puedes elegir varios a la vez.</p>
      </div>
      <div data-xml-preview></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cerrar</button>
        <button class="btn btn--primary" data-xml-go disabled>Contabilizar</button></div>`;
    cbody._xmlPolizas = [];
  }
  function procesarArchivosXml(files) {
    if (!files || !files.length) return;
    const polizas = []; let pendientes = files.length, errores = 0;
    Array.prototype.forEach.call(files, (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parsearCfdiXml(reader.result);
        if (parsed && parsed.total > 0) polizas.push({ parsed, poliza: xmlAPolizaGasto(parsed), nombre: file.name });
        else errores++;
        if (--pendientes === 0) mostrarPreviewXml(polizas, errores);
      };
      reader.onerror = () => { errores++; if (--pendientes === 0) mostrarPreviewXml(polizas, errores); };
      reader.readAsText(file);
    });
  }
  function mostrarPreviewXml(polizas, errores) {
    const preview = cbody.querySelector("[data-xml-preview]"), btn = cbody.querySelector("[data-xml-go]");
    cbody._xmlPolizas = polizas;
    if (!polizas.length) {
      if (preview) preview.innerHTML = `<div class="cont-err">No se pudo leer ningún CFDI válido${errores ? ` (${errores} con error)` : ""}.</div>`;
      if (btn) btn.disabled = true; return;
    }
    // OT-0020: si falta configuración contable, todas las pólizas vienen
    // con { error } — se explica una sola vez y no se deja contabilizar.
    const conError = polizas.find((x) => x.poliza && x.poliza.error);
    if (conError) {
      if (preview) preview.innerHTML = errorConfigHTML(conError.poliza.error);
      if (btn) btn.disabled = true; return;
    }
    const filas = polizas.map((x) => `<tr>
      <td>${esc(x.parsed.nombreEmisor || x.parsed.rfcEmisor || "—")}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.subtotal)}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.iva)}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.total)}</td></tr>`).join("");
    if (preview) preview.innerHTML = `<div style="margin-top:1rem;overflow-x:auto"><table class="tbl">
      <thead><tr><th>Proveedor</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      ${errores ? `<p style="color:var(--gold);font-size:.8rem;margin-top:.5rem">${errores} archivo(s) no se pudieron leer.</p>` : ""}`;
    if (btn) btn.disabled = false;
  }
  async function ejecutarImportarXml() {
    const btnGo = cbody.querySelector("[data-xml-go]");
    // Evita que un doble clic (o el usuario esperando y volviendo a
    // darle porque tardó) contabilice la misma factura dos veces.
    if (btnGo && btnGo.dataset.procesando) return;
    if (btnGo) { btnGo.disabled = true; btnGo.dataset.procesando = "1"; btnGo.textContent = "Contabilizando…"; }
    const items = cbody._xmlPolizas || [];
    for (const x of items) {
      const r = await savePoliza(x.poliza);
      // OT-0023: la factura queda guardada como documento propio, ligada
      // a la póliza de causación que se acaba de crear — de aquí en
      // adelante se puede consultar y pagarle saldo, ya no se pierde
      // después del import.
      if (window.CTPostgres && window.CTPostgres.guardarCfdiProveedor) {
        try {
          const rp = await window.CTPostgres.guardarCfdiProveedor(x.parsed, (r && r.poliza && r.poliza.pgId) || null);
          // La póliza de causación ya quedó bien aunque esto falle — pero
          // si falla, "Le pagué a un proveedor" no la va a poder encontrar
          // después, así que se avisa en vez de fallar en silencio.
          if (!rp.ok) toast("Póliza generada, pero la factura no quedó guardada para seguimiento de pagos: " + (rp.error || "motivo desconocido"), "error", 6000);
        } catch (e) {
          toast("Póliza generada, pero la factura no quedó guardada para seguimiento de pagos: " + e.message, "error", 6000);
        }
      }
    }
    // OT-0023: refresca la lista de facturas con saldo EN MEMORIA —
    // antes solo se cargaba una vez al abrir la página, así que una
    // factura recién importada no aparecía en "Le pagué a un proveedor"
    // hasta recargar todo el sitio.
    try {
      const resp = await fetch(((window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app") + "/api/cfdis-proveedor-saldo", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      const data = await resp.json();
      if (data.ok) window.CONTATECK_CFDIS_PROVEEDOR_SALDO_PG = data.facturas || [];
    } catch (e) { /* silencioso: no crítico, se refresca solo al recargar */ }
    closeModal(); renderTodo();
  }

  /* ---------- Eventos ---------- */
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-cont-close]")) { closeModal(); return; }
    // OT-0024: historial de pagos a proveedor (dentro del modal, 2 niveles)
    const provDet = e.target.closest("[data-provhist-det]");
    if (provDet) { e.preventDefault(); renderProvHistDetalle(parseInt(provDet.getAttribute("data-provhist-det"), 10)); return; }
    if (e.target.closest("[data-provhist-volver]")) { e.preventDefault(); renderProvHistLista(); return; }
    const provComp = e.target.closest("[data-provhist-comprobante]");
    if (provComp) {
      e.preventDefault();
      (async () => {
        provComp.style.opacity = ".5";
        const url = await firmarComprobanteHist(provComp.getAttribute("data-provhist-comprobante"));
        provComp.style.opacity = "";
        if (!url) { toast("No se pudo abrir el comprobante.", "error"); return; }
        if (provComp.getAttribute("data-comp-modo") === "descargar") {
          const a = document.createElement("a"); a.href = url + "&download=" + encodeURIComponent(provComp.getAttribute("data-comp-nombre") || "comprobante");
          a.download = provComp.getAttribute("data-comp-nombre") || "comprobante";
          document.body.appendChild(a); a.click(); a.remove();
        } else window.open(url, "_blank");
      })();
      return;
    }
    const provCi = e.target.closest("[data-provcomp-interno]");
    if (provCi) { e.preventDefault(); abrirComprobanteInternoProv(provCi.getAttribute("data-provcomp-interno"), provCi.getAttribute("data-ci-modo"), provCi); return; }
    if (e.target.closest("[data-cont-as-add]")) {
      const cont = cbody.querySelector("[data-cont-asientos]");
      if (cont) { cont.insertAdjacentHTML("beforeend", asientoRow()); recalcCuadre(); }
      return;
    }
    const asDel = e.target.closest("[data-cont-as-del]");
    if (asDel) {
      const rows = cbody.querySelectorAll(".cont-asiento");
      const row = asDel.closest(".cont-asiento");
      if (rows.length > 2) row.remove();
      else { row.querySelector(".cont-as-debe").value = ""; row.querySelector(".cont-as-haber").value = ""; }
      recalcCuadre();
      return;
    }
    if (e.target.closest("[data-cont-guardar-pol]")) { guardarPolizaForm(); return; }
    const modoBtn = e.target.closest("[data-modo]");
    if (modoBtn) {
      cbody.querySelectorAll(".cont-modo").forEach((b) => b.classList.toggle("is-active", b === modoBtn));
      if (modoBtn.getAttribute("data-modo") === "rapido") renderModoRapido(); else renderModoAvanzado();
      return;
    }
    const plant = e.target.closest("[data-plantilla]");
    if (plant) { renderRapidoForm(plant.getAttribute("data-plantilla")); return; }
    if (e.target.closest("[data-rapido-volver]")) { renderModoRapido(); return; }
    const rapGuardar = e.target.closest("[data-rapido-guardar]");
    if (rapGuardar) { guardarRapido(rapGuardar.getAttribute("data-rapido-guardar")); return; }
    // OT-0020: flujo de cobranza — elegir factura, continuar, volver, confirmar.
    const cobroFactura = e.target.closest("[data-cobro-factura]");
    if (cobroFactura) {
      const cfdiId = cobroFactura.getAttribute("data-cobro-factura");
      const f = getCfdisSaldoLista().find((x) => x.cfdiId === cfdiId);
      if (f) renderCobroCaptura(f);
      return;
    }
    if (e.target.closest("[data-cobro-volver-lista]")) { renderCobroForm(); return; }
    if (e.target.closest("[data-cobro-continuar]")) { continuarCobro(); return; }
    if (e.target.closest("[data-cobro-cancelar]")) { renderCobroForm(); return; }
    if (e.target.closest("[data-cobro-confirmar]")) { confirmarCobro(); return; }
    // OT-0023: flujo de pago a proveedor — mismo patrón que cobranza.
    const provFactura = e.target.closest("[data-prov-factura]");
    if (provFactura) {
      const cfdiProveedorId = provFactura.getAttribute("data-prov-factura");
      const f = getCfdisProveedorSaldoLista().find((x) => x.cfdiProveedorId === cfdiProveedorId);
      if (f) renderProveedorCaptura(f);
      return;
    }
    if (e.target.closest("[data-prov-volver-lista]")) { renderProveedorForm(); return; }
    if (e.target.closest("[data-prov-continuar]")) { continuarProveedor(); return; }
    if (e.target.closest("[data-prov-cancelar]")) { renderProveedorForm(); return; }
    if (e.target.closest("[data-prov-confirmar]")) { confirmarProveedor(); return; }
    if (e.target.closest("[data-cont-cuadrar]")) { cuadrarAuto(); return; }
    const gCta = e.target.closest("[data-cont-guardar-cta]");
    if (gCta) { guardarCuentaForm(gCta.getAttribute("data-cont-guardar-cta")); return; }
    if (e.target.closest("[data-config-contable-guardar]")) { guardarConfigContableForm(); return; }
    if (e.target.closest("[data-cont-contab-go]")) { ejecutarContabilizar(); return; }
    if (e.target.closest("[data-xml-pick]")) { const inp = cbody.querySelector("[data-xml-file]"); if (inp) inp.click(); return; }
    if (e.target.closest("[data-xml-go]")) { ejecutarImportarXml(); return; }
  });
  // Archivos XML seleccionados dentro del modal de importación.
  cbody.addEventListener("change", (e) => {
    if (e.target.matches("[data-xml-file]")) procesarArchivosXml(e.target.files);
  });
  // Enter en la captura rápida = guardar al instante (más veloz).
  cbody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const rapBtn = cbody.querySelector("[data-rapido-guardar]");
    if (rapBtn && (e.target.id === "rap-monto" || e.target.id === "rap-concepto")) {
      e.preventDefault();
      guardarRapido(rapBtn.getAttribute("data-rapido-guardar"));
    }
  });

  // Descarga de XML para el SAT (lee RFC/mes/año del panel SAT).
  function descargarXmlSAT(tipo) {
    const pane = document.querySelector('[data-pane="sat"]');
    if (!pane) return;
    const rfc = (pane.querySelector("[data-sat-rfc]").value || "XAXX010101000").toUpperCase().trim();
    const mes = parseInt(pane.querySelector("[data-sat-mes]").value, 10) || 1;
    const anio = parseInt(pane.querySelector("[data-sat-anio]").value, 10) || new Date().getFullYear();
    setRfcEmisor(rfc);
    const suf = `${rfc}_${anio}${String(mes).padStart(2, "0")}.xml`;
    if (tipo === "catalogo") descargarTexto("Catalogo_" + suf, xmlCatalogoSAT(rfc, mes, anio), "application/xml");
    else descargarTexto("Balanza_" + suf, xmlBalanzaSAT(rfc, mes, anio), "application/xml");
  }
  cbody.addEventListener("input", (e) => {
    if (e.target.classList.contains("cont-as-debe") || e.target.classList.contains("cont-as-haber")) {
      const row = e.target.closest(".cont-asiento");
      if (row) {
        if (e.target.classList.contains("cont-as-debe") && num(e.target.value) > 0) row.querySelector(".cont-as-haber").value = "";
        if (e.target.classList.contains("cont-as-haber") && num(e.target.value) > 0) row.querySelector(".cont-as-debe").value = "";
      }
      recalcCuadre();
    }
  });

  // Navegación con flechas/Enter/Escape — genérica para cualquier buscador
  // de esta pantalla (Libro Mayor, cuenta de captura rápida, cliente).
  // Mismo criterio que ya usa Facturación: nunca dejar un buscador nuevo
  // sin esto, para no tener que corregirlo cada vez que se agrega uno.
  document.addEventListener("keydown", (e) => {
    const field = e.target.closest && e.target.closest(".fac-sat-field");
    if (!field) return;
    const box = field.querySelector(".fac-sat-results");
    if (!box || !box.classList.contains("is-open")) return;
    const opts = Array.from(box.querySelectorAll(".fac-sat-opt"));
    if (!opts.length) return;
    let idx = parseInt(box.dataset.activeIndex || "-1", 10);

    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, opts.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === "Enter") {
      if (idx >= 0 && opts[idx]) { e.preventDefault(); opts[idx].click(); }
      return;
    } else if (e.key === "Escape") { box.classList.remove("is-open"); return; }
    else return;

    opts.forEach((o) => o.classList.remove("is-active"));
    opts[idx].classList.add("is-active");
    opts[idx].scrollIntoView({ block: "nearest" });
    box.dataset.activeIndex = String(idx);
  });

  // ---------- Buscador inteligente: Libro Mayor ----------
  // OT-0018: buscador de cuenta ÚNICO y compartido — antes había una copia
  // casi idéntica de esta función por cada pantalla (Libro Mayor, Captura
  // Rápida, y ahora también Modo Avanzado). Cualquier campo con clase
  // "cuenta-busca" dentro de un ".fac-sat-field" usa esta misma lógica.
  // OT-0020 fix: al abrir un buscador se cierran los demás (antes se
  // apilaban varios "Sin resultados" abiertos en la pantalla de
  // Configuración contable). mostrarTodo=true ignora el texto ya
  // seleccionado ("102 · Bancos") y enseña la lista completa — el texto
  // queda seleccionado para que al escribir se reemplace solo.
  function cerrarBuscadores(excepto) {
    document.querySelectorAll(".fac-sat-results.is-open").forEach((b) => { if (b !== excepto) b.classList.remove("is-open"); });
  }
  function buscarCuenta(input, mostrarTodo) {
    const field = input.closest(".fac-sat-field");
    if (!field) return;
    const box = field.querySelector(".fac-sat-results");
    const q = mostrarTodo ? "" : input.value.trim().toLowerCase();
    const ctas = getCuentasAfectables();
    const filtradas = q ? ctas.filter((c) => c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)) : ctas;
    box.innerHTML = filtradas.length
      ? filtradas.map((c) => `<div class="fac-sat-opt" data-codigo="${esc(c.codigo)}" data-txt="${esc(c.codigo + " · " + c.nombre)}"><b>${esc(c.codigo)}</b> · ${esc(c.nombre)}</div>`).join("")
      : `<div class="fac-sat-hint">Sin resultados para "${esc(input.value)}".</div>`;
    cerrarBuscadores(box);
    box.classList.add("is-open");
  }
  let clienteBuscaTimer = null;
  document.addEventListener("input", (e) => {
    if (!e.target.classList) return;
    if (e.target.classList.contains("cuenta-busca")) buscarCuenta(e.target);
    if (e.target.classList.contains("rap-cliente-busca")) {
      clearTimeout(clienteBuscaTimer);
      const input = e.target;
      clienteBuscaTimer = setTimeout(() => buscarRapCliente(input), 300);
    }
  });
  document.addEventListener("focusin", (e) => {
    if (!e.target.classList) return;
    if (e.target.classList.contains("cuenta-busca")) { buscarCuenta(e.target, true); e.target.select(); }
  });
  document.addEventListener("click", (e) => {
    // OT-0024: botón de historial en la tabla de Cuentas por Pagar.
    const provAbrir = e.target.closest("[data-provhist-abrir]");
    if (provAbrir) { e.preventDefault(); abrirHistorialProveedor(provAbrir.getAttribute("data-provhist-abrir")); return; }
    // OT-0020 fix: clic fuera de cualquier buscador cierra los dropdowns
    // abiertos (antes se quedaban pegados al pasar de un campo a otro).
    if (!e.target.closest(".fac-sat-field")) cerrarBuscadores();
    const opt = e.target.closest(".fac-sat-field .fac-sat-opt");
    if (opt) {
      const field = opt.closest(".fac-sat-field");
      const box = field.querySelector(".fac-sat-results");

      // OT-0018: un solo camino para CUALQUIER buscador de cuenta (Libro
      // Mayor, Captura Rápida, Modo Avanzado) — el hidden siempre vive
      // como hermano dentro del mismo .fac-sat-field, sin importar la
      // pantalla, así que no hace falta un caso por cada una.
      const inputCuenta = field.querySelector(".cuenta-busca");
      if (inputCuenta) {
        const hidden = field.querySelector('input[type="hidden"]');
        inputCuenta.value = opt.getAttribute("data-txt");
        if (hidden) hidden.value = opt.getAttribute("data-codigo");
        box.classList.remove("is-open");
        // Único efecto extra: el Libro Mayor recarga el detalle de la
        // cuenta elegida. Las demás pantallas no necesitan nada más.
        if (inputCuenta.classList.contains("mayor-cuenta-busca")) renderMayor(opt.getAttribute("data-codigo"));
        return;
      }
      if (field.querySelector(".rap-cliente-busca")) {
        const input = field.querySelector(".rap-cliente-busca");
        const hidden = document.getElementById("rap-cliente-id");
        if (input) input.value = opt.getAttribute("data-nombre");
        if (hidden) hidden.value = opt.getAttribute("data-id");
        box.classList.remove("is-open");
        return;
      }
    }
    if (!e.target.closest(".fac-sat-field")) {
      document.querySelectorAll(".fac-sat-results.is-open").forEach((b) => b.classList.remove("is-open"));
    }
    const btnImportar = e.target.closest("[data-rapido-importar-cfdi]");
    if (btnImportar) { abrirImportarCfdiRapido(btnImportar.getAttribute("data-rapido-importar-cfdi")); return; }
  });


  document.addEventListener("change", (e) => {
    if (!e.target || !e.target.matches) return;
    if (e.target.matches("[data-periodo-sel]")) {
      const v = e.target.value;
      if (!v) setPeriodo(null);
      else { const parts = v.split("-"); setPeriodo({ anio: parseInt(parts[0], 10), mes: parseInt(parts[1], 10) }); }
      renderTodo(); return;
    }
    if (e.target.matches("[data-sat-rfc]")) { setRfcEmisor(e.target.value); return; }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-cont-nueva-pol]")) { e.preventDefault(); openPolizaForm(); return; }
    if (e.target.closest("[data-cont-nueva-cta]")) { e.preventDefault(); openCuentaForm(); return; }
    if (e.target.closest("[data-cont-config-contable]")) { e.preventDefault(); openConfigContable(); return; }
    const ver = e.target.closest("[data-cont-ver]");
    if (ver) { verPoliza(ver.getAttribute("data-cont-ver")); return; }
    const editPol = e.target.closest("[data-cont-editar-pol]");
    if (editPol) { abrirEditarPoliza(editPol.getAttribute("data-cont-editar-pol")); return; }
    const delPol = e.target.closest("[data-cont-del-pol]");
    if (delPol) {
      ctConfirm("¿Eliminar esta póliza de prueba? Solo existe en este navegador (no está en la base de datos). Sus movimientos dejarán de afectar los saldos.", "Eliminar").then((si) => {
        if (!si) return;
        const id = delPol.getAttribute("data-cont-del-pol");
        deletePoliza(id).then((r) => {
          if (!r.ok) { ctAlert("No se pudo eliminar: " + (r.error || "motivo desconocido")); return; }
          renderTodo();
        });
      });
      return;
    }
    const editCta = e.target.closest("[data-cont-edit-cta]");
    if (editCta) { openCuentaForm(editCta.getAttribute("data-cont-edit-cta")); return; }
    const reactivarCta = e.target.closest("[data-cont-reactivar-cta]");
    if (reactivarCta) {
      reactivarCuenta(reactivarCta.getAttribute("data-cont-reactivar-cta")).then((r) => {
        if (!r.ok) { ctAlert("No se pudo reactivar: " + (r.error || "motivo desconocido")); return; }
        renderTodo();
      });
      return;
    }
    const delCta = e.target.closest("[data-cont-del-cta]");
    if (delCta) {
      ctConfirm("¿Desactivar esta cuenta? Su historial y saldos se conservan, solo deja de estar disponible para movimientos nuevos.", "Desactivar").then((si) => {
        if (!si) return;
        deleteCuenta(delCta.getAttribute("data-cont-del-cta")).then((r) => {
          if (!r.ok) { ctAlert("No se pudo desactivar: " + (r.error || "motivo desconocido")); return; }
          renderTodo();
        });
      });
      return;
    }
    const verMayor = e.target.closest("[data-cont-mayor]");
    if (verMayor) {
      const grupo = document.querySelector('[data-tabs="cont"]');
      if (grupo) {
        grupo.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-tab") === "mayor"));
        const view = grupo.closest(".view") || document;
        view.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("is-active", p.getAttribute("data-pane") === "mayor"));
      }
      renderMayor(verMayor.getAttribute("data-cont-mayor"));
      return;
    }
    if (e.target.closest("[data-cont-contabilizar]")) { openContabilizarCfdi(); return; }
    if (e.target.closest("[data-cont-importar-xml]")) { openImportarXml(); return; }
    if (e.target.closest("[data-sat-xml-cat]")) { descargarXmlSAT("catalogo"); return; }
    if (e.target.closest("[data-sat-xml-bal]")) { descargarXmlSAT("balanza"); return; }
    const nav = e.target.closest('.nav-item[data-view="contabilidad"]');
    if (nav) setTimeout(renderTodo, 30);
  });

  /* ---------- Init ---------- */
  // Render inmediato: el script va al final del body, así que las tablas ya
  // existen y este render gana sobre el de ejemplo de app.js (sin parpadeo).
  // Tomar el control de la tabla de pólizas: antes app.js la pintaba con datos
  // de ejemplo; ahora cualquier refresh muestra las pólizas contables reales.
  if (window.CTRender) window.CTRender.polizas = function () { renderPolizasTabla(); };
  // ---- OT-0009: sincronizar pólizas desde Postgres (lectura de regreso) ----
  // Hasta ahora solo se escribía hacia Postgres al crear/editar; nunca se
  // volvía a leer de ahí. Esto causaba que el navegador se quedara con una
  // versión vieja si la póliza se editaba desde otra sesión, o si un intento
  // fallido (ej. antes del fix de CORS) dejó un dato local desincronizado.
  // Reutiliza window.CONTATECK_POLIZAS_PG, ya traído por auth-guard.js vía
  // /api/operacion (mismo mecanismo que ya usa Nómina).
  async function esperarPolizasPostgres(maxMs) {
    maxMs = maxMs || 4000;
    const start = Date.now();
    while (window.CONTATECK_POLIZAS_PG === undefined && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function sincronizarPolizasDesdePostgres() {
    await esperarPolizasPostgres();
    const pg = window.CONTATECK_POLIZAS_PG;
    if (!pg || !pg.length) return false;
    const arr = leerPolizas();
    let cambiado = false;
    pg.forEach((p) => {
      let local = arr.find((x) => x.pgId === p.id);
      if (!local) local = arr.find((x) => x.folio === p.folio && !x.pgId);
      if (local) {
        if (local.tipo !== p.tipo || local.fecha !== p.fecha || local.concepto !== p.concepto || local.estado !== p.estado || local.pgId !== p.id || local.monto !== p.monto) {
          local.tipo = p.tipo; local.fecha = p.fecha; local.concepto = p.concepto; local.estado = p.estado; local.pgId = p.id; local.monto = p.monto;
          cambiado = true;
        }
      } else {
        // Póliza que existe en Postgres pero no en este navegador (ej. se
        // creó desde otra sesión/dispositivo). Se agrega sin asientos —
        // esos siguen siendo solo locales hasta aprobar poliza_partidas.
        arr.push({ id: "pg-" + p.id, pgId: p.id, folio: p.folio, tipo: p.tipo, fecha: p.fecha, concepto: p.concepto, monto: p.monto, asientos: [], creada: Date.now(), origen: "postgres" });
        cambiado = true;
      }
    });
    if (cambiado) guardarPolizas(arr);
    return cambiado;
  }

  function init() {
    renderTodo();
    cargarCatalogoReal().then((cambio) => { if (cambio) renderTodo(); });
    sincronizarPolizasDesdePostgres().then((cambiado) => { if (cambiado) renderTodo(); });
  }
  init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);

  window.CTCont.render = renderTodo;
  window.__CT_CONT_READY = true;
})();
