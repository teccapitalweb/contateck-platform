// ============================================================
//  CONTATECK · Módulo SAT y Fiscal — Parte A
//  Bitácora manual real (obligaciones, declaraciones, documentos,
//  calendario derivado). NADA de e.firma, Descarga Masiva del SAT,
//  XML recibidos ni cálculo automático de IVA/ISR/DIOT — eso es
//  Parte B, documentada y sin implementar hasta contar con e.firma
//  real y las reglas del responsable contable.
//
//  OT-0031: texto de la base escapado antes de usar innerHTML, fechas
//  en hora de México, archivos validados (tipo/tamaño), errores sin
//  detalles internos, botones de e.firma marcados como no disponibles.
// ============================================================
(function () {
  "use strict";

  const TIPOS_DOC = [
    { v: "opinion_cumplimiento", t: "Opinión de cumplimiento" },
    { v: "constancia_situacion_fiscal", t: "Constancia de situación fiscal" },
    { v: "otro", t: "Otro" },
  ];
  const PERIODICIDADES = [
    { v: "mensual", t: "Mensual" },
    { v: "bimestral", t: "Bimestral" },
    { v: "anual", t: "Anual" },
  ];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const ESTADOS = {
    pendiente: { txt: "Pendiente", cls: "v-badge--warn" },
    en_proceso: { txt: "En proceso", cls: "v-badge--warn" },
    presentada: { txt: "Presentada", cls: "v-badge--ok" },
    vencida: { txt: "Vencida", cls: "v-badge--bad" },
    duplicada: { txt: "Duplicada", cls: "v-badge--warn" },
  };
  // Tipos de archivo aceptados → extensión que se guarda en Storage.
  const EXT_POR_MIME = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const MAX_ARCHIVO = 5 * 1024 * 1024;
  const ROLES_CONFIGURAN = ["admin", "director"];
  const ROLES_REGISTRAN = ["contador", "admin", "director"];

  function backendUrl() { return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app"; }
  function authHeaders(json) { const h = json ? { "Content-Type": "application/json" } : {}; const t = window.CONTATECK_SUPABASE_TOKEN; if (t) h.Authorization = "Bearer " + t; return h; }
  function miPerfil() { return window.CONTATECK_PERFIL_PG || null; }
  function miRol() { const p = miPerfil(); return p ? p.rol : null; }
  function puedeConfigurar() { return ROLES_CONFIGURAN.indexOf(miRol()) !== -1; }
  function puedeRegistrar() { return ROLES_REGISTRAN.indexOf(miRol()) !== -1; }
  async function esperarPerfil(maxMs) {
    maxMs = maxMs || 5000;
    const start = Date.now();
    while ((!window.CONTATECK_PERFIL_PG || !window.CONTATECK_EMPRESA_PG) && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Todo texto que viene de la base o del usuario pasa por aquí antes de innerHTML.
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Fecha de hoy (AAAA-MM-DD) en hora de México, igual que el backend.
  function hoyISO() {
    try { return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(String(f).slice(0, 10) + "T12:00:00");
    if (isNaN(d)) return String(f);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }
  function uuidCliente() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16); });
  }
  // ---------- Sugerencias (solo orientativas; la persona confirma) ----------
  // Obligaciones habituales, TODAS "día 17 del mes siguiente" (el mismo criterio
  // de sugerirFechaLimite). No incluye Contabilidad Electrónica ni la anual:
  // su fecha límite depende del régimen y no sigue esa regla. Son punto de
  // partida: se editan o desactivan desde la tabla de Obligaciones.
  const PLANTILLA_OBLIGACIONES = [
    { nombre: "IVA mensual", periodicidad: "mensual", diaLimite: 17 },
    { nombre: "ISR pagos provisionales", periodicidad: "mensual", diaLimite: 17 },
    { nombre: "DIOT", periodicidad: "mensual", diaLimite: 17 },
    { nombre: "Retenciones de ISR por sueldos", periodicidad: "mensual", diaLimite: 17 },
    { nombre: "Cuotas IMSS", periodicidad: "mensual", diaLimite: 17 },
    { nombre: "RCV e INFONAVIT", periodicidad: "bimestral", diaLimite: 17 },
  ];
  function ultimoDiaMes(anio, mes0) { return new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate(); }
  // `indice`: mensual 0-11 (mes del periodo), bimestral 0-5 (bimestre), anual se ignora.
  // Mensual y bimestral vencen el `dia_limite` del mes siguiente al periodo; la anual,
  // en `mes_limite` del año siguiente. Si cae en sábado o domingo se recorre al lunes.
  // NO considera días inhábiles por feriados. Devuelve AAAA-MM-DD o null.
  function sugerirFechaLimite(obl, indice, anio) {
    if (!obl || !(anio >= 2000 && anio <= 2100) || !(Number(obl.dia_limite) >= 1)) return null;
    let mes0, anioVence = anio;
    if (obl.periodicidad === "mensual") { if (!(indice >= 0 && indice <= 11)) return null; mes0 = indice + 1; }
    else if (obl.periodicidad === "bimestral") { if (!(indice >= 0 && indice <= 5)) return null; mes0 = indice * 2 + 2; }
    else if (obl.periodicidad === "anual") { if (!(obl.mes_limite >= 1 && obl.mes_limite <= 12)) return null; mes0 = obl.mes_limite - 1; anioVence = anio + 1; }
    else return null;
    if (mes0 > 11) { mes0 -= 12; anioVence += 1; }
    let f = new Date(Date.UTC(anioVence, mes0, Math.min(Number(obl.dia_limite), ultimoDiaMes(anioVence, mes0))));
    const dow = f.getUTCDay();
    if (dow === 6) f = new Date(f.getTime() + 2 * 86400000);
    else if (dow === 0) f = new Date(f.getTime() + 86400000);
    return f.toISOString().slice(0, 10);
  }
  function textoPeriodo(obl, indice, anio) {
    if (obl.periodicidad === "mensual") return MESES[indice] + " " + anio;
    if (obl.periodicidad === "bimestral") return MESES[indice * 2] + "–" + MESES[indice * 2 + 1] + " " + anio;
    return "Ejercicio " + anio;
  }
  // Periodo ya concluido más reciente (el que normalmente toca declarar hoy).
  function periodoAnterior(obl, hoy) {
    const a = Number(hoy.slice(0, 4)), m0 = Number(hoy.slice(5, 7)) - 1;
    if (obl.periodicidad === "anual") return { indice: 0, anio: a - 1 };
    if (obl.periodicidad === "bimestral") { const b = Math.floor(m0 / 2) - 1; return b < 0 ? { indice: 5, anio: a - 1 } : { indice: b, anio: a }; }
    return m0 === 0 ? { indice: 11, anio: a - 1 } : { indice: m0 - 1, anio: a };
  }
  // El tipo de declaración se guarda como prefijo de las notas (sin cambiar la tabla).
  const TIPOS_DECLARACION = ["Normal", "Complementaria", "Extemporánea"];
  // Mismas reglas que backend/src/validacionesFiscal.js (esDuplicadaDePresentada).
  function normalizarPeriodo(p) { return String(p == null ? "" : p).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function esDuplicadaDePresentada(d, todas) {
    if (!d || d.estado === "presentada" || /^\[Complementaria\]/.test(String(d.notas || ""))) return false;
    const k = normalizarPeriodo(d.periodo);
    return todas.some((o) => o.id !== d.id && o.estado === "presentada" && o.obligacion_id === d.obligacion_id && normalizarPeriodo(o.periodo) === k);
  }
  function tipoDeNotas(notas) {
    const m = /^\[(Complementaria|Extemporánea)\]/.exec(String(notas || ""));
    return m ? m[1] : null;
  }

  function toast(msg, tipo) {
    let t = document.createElement("div");
    t.className = "v-toast v-toast--" + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------- Supabase Storage directo (carpeta "sat", igual que "ventas") ----------
  // Devuelve el motivo si el archivo no sirve, o null si está bien.
  function errorArchivo(f) {
    if (!EXT_POR_MIME[f.type]) return "Solo se aceptan archivos PDF, JPG, PNG o WEBP.";
    if (!f.size) return "El archivo está vacío.";
    if (f.size > MAX_ARCHIVO) return "El archivo no debe pasar de 5 MB.";
    return null;
  }
  async function subirDocumento(file, empresaId) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) throw new Error("Sesión o configuración de Storage no disponible.");
    const malo = errorArchivo(file);
    if (malo) throw new Error(malo);
    // Ruta controlada por la app: <empresa>/sat/<uuid>/documento.<ext por tipo MIME>.
    const path = empresaId + "/sat/" + uuidCliente() + "/documento." + EXT_POR_MIME[file.type];
    const resp = await fetch(cfg.url + "/storage/v1/object/documentos/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": file.type },
      body: file,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("[fiscal] Storage rechazó la subida:", resp.status, txt.slice(0, 200));
      throw new Error("No se pudo subir el archivo. Inténtalo de nuevo; si persiste, avisa al administrador.");
    }
    return path;
  }
  async function urlFirmada(path) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t || typeof path !== "string" || !path || path.indexOf("..") !== -1 || path.charAt(0) === "/") return null;
    try {
      const resp = await fetch(cfg.url + "/storage/v1/object/sign/documentos/" + path, {
        method: "POST", headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.signedURL) return null;
      return cfg.url + "/storage/v1" + data.signedURL;
    } catch (e) { return null; }
  }

  // ---------- Datos ----------
  let obligaciones = [], declaraciones = [], documentos = [], calendario = [];
  let errores = {};
  async function pedir(ruta) {
    try {
      const r = await fetch(backendUrl() + ruta, { headers: authHeaders(false) });
      const j = await r.json().catch(() => null);
      return j || { ok: false, error: "Respuesta no válida del servidor." };
    } catch (e) { return { ok: false, error: "Sin conexión con el servidor." }; }
  }
  async function enviar(metodo, ruta, cuerpo) {
    try {
      const r = await fetch(backendUrl() + ruta, { method: metodo, headers: authHeaders(true), body: JSON.stringify(cuerpo) });
      const j = await r.json().catch(() => null);
      return j || { ok: false, error: "Respuesta no válida del servidor." };
    } catch (e) { return { ok: false, error: "Sin conexión con el servidor." }; }
  }
  async function cargarTodo() {
    const [rObl, rDec, rDoc, rCal] = await Promise.all([
      pedir("/api/fiscal/obligaciones"), pedir("/api/fiscal/declaraciones"),
      pedir("/api/fiscal/documentos"), pedir("/api/fiscal/calendario"),
    ]);
    obligaciones = rObl.ok ? rObl.obligaciones : [];
    declaraciones = rDec.ok ? rDec.declaraciones : [];
    documentos = rDoc.ok ? rDoc.documentos : [];
    calendario = rCal.ok ? rCal.proximas : [];
    // Un error no debe verse como "no hay datos": cada sección muestra el suyo.
    errores = {
      obl: rObl.ok ? null : (rObl.error || "Error al cargar."), dec: rDec.ok ? null : (rDec.error || "Error al cargar."),
      doc: rDoc.ok ? null : (rDoc.error || "Error al cargar."), cal: rCal.ok ? null : (rCal.error || "Error al cargar."),
    };
    const primero = errores.obl || errores.dec || errores.doc || errores.cal;
    if (primero) toast(primero, "warn");
  }
  function avisoError(msg) {
    return '<div class="alert alert--danger"><div class="alert__body"><p>No se pudo cargar: ' + esc(msg) + "</p></div></div>";
  }

  function nombreObligacion(id) { const o = obligaciones.find((x) => x.id === id); return o ? o.nombre : "—"; }

  // ---------- Render ----------
  const ICO_DESC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 21h14"/></svg>';
  const ICO_PRES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.4 3 7.6 7 8.7 4-1.1 7-4.3 7-8.7V6z"/><path d="m9 12 2 2 4-4"/></svg>';
  let renderSeq = 0;
  async function render() {
    const root = document.querySelector("[data-fiscal-root]");
    if (!root) return;
    const mio = ++renderSeq;
    root.innerHTML = '<p style="color:var(--faint);padding:1.5rem;text-align:center">Cargando SAT y Fiscal…</p>';
    // El perfil se espera ANTES de pintar: los botones de alta dependen del rol.
    await Promise.all([cargarTodo(), esperarPerfil()]);
    if (mio !== renderSeq) return; // otra carga más nueva ya pintó
    root.innerHTML = `
      <div class="page-head">
        <div><h1>SAT y Fiscal</h1><p>Bitácora de obligaciones, declaraciones y documentos</p></div>
      </div>
      <div class="alerts" style="margin-bottom:1.2rem"><div class="alert alert--info"><div class="alert__body">
        <b>Aquí se lleva la bitácora, no se presenta ante el SAT.</b>
        <p>Las declaraciones se presentan en el portal del SAT con tu e.firma: presenta allá y registra aquí la fecha y el acuse. Los XML de Contabilidad Electrónica (catálogo y balanza) se generan en Contabilidad → SAT / Declaraciones.</p>
      </div></div></div>

      <div class="card" style="margin-bottom:1.2rem">
        <div class="card__head"><h3>Próximos vencimientos</h3><span class="sub">Declaraciones pendientes, ordenadas por fecha límite</span></div>
        <div data-fis-calendario></div>
      </div>

      <div class="grid-2" style="margin-bottom:1.2rem">
        <div class="card">
          <div class="card__head"><h3>Obligaciones</h3>${puedeConfigurar() ? '<span style="display:flex;gap:.4rem"><button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-plantilla>Cargar comunes</button><button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nueva-obl>+ Obligación</button></span>' : ""}</div>
          <div data-fis-obl-error></div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nombre</th><th>Periodicidad</th><th>Día límite</th><th>Estado</th>${puedeConfigurar() ? "<th></th>" : ""}</tr></thead><tbody data-fis-obligaciones></tbody></table></div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Documentos fiscales</h3>${puedeRegistrar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nuevo-doc>+ Documento</button>' : ""}</div>
          <div data-fis-documentos></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h3>Declaraciones</h3>${puedeRegistrar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nueva-decl>+ Declaración</button>' : ""}</div>
        <div data-fis-dec-error></div>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Obligación</th><th>Periodo</th><th>Vence</th><th>Presentada</th><th>Folio acuse</th><th>Estado</th><th></th></tr></thead><tbody data-fis-declaraciones></tbody></table></div>
      </div>`;

    renderCalendario();
    renderObligaciones();
    renderDocumentos();
    renderDeclaraciones();
  }

  function renderCalendario() {
    const host = document.querySelector("[data-fis-calendario]");
    if (!host) return;
    if (errores.cal) { host.innerHTML = avisoError(errores.cal); return; }
    if (!calendario.length) { host.innerHTML = '<p style="color:var(--faint);padding:1rem;text-align:center">Sin vencimientos pendientes.</p>'; return; }
    host.innerHTML = '<div class="alerts">' + calendario.map((c) => {
      const dias = Number(c.diasRestantes);
      const vencida = dias < 0;
      const tipo = vencida ? "danger" : (dias <= 5 ? "warn" : "info");
      const txt = vencida ? "Venció hace " + Math.abs(dias) + " día(s)" : (dias === 0 ? "Vence hoy" : "Vence en " + dias + " día(s)");
      return '<div class="alert alert--' + tipo + '"><div class="alert__body"><b>' + esc(c.obligacion) + " · " + esc(c.periodo) + "</b><p>" + txt + " — " + esc(fmtFecha(c.fechaVencimiento)) + "</p></div></div>";
    }).join("") + "</div>";
  }

  function renderObligaciones() {
    const tb = document.querySelector("[data-fis-obligaciones]");
    const err = document.querySelector("[data-fis-obl-error]");
    if (!tb) return;
    const cols = puedeConfigurar() ? 5 : 4;
    if (err) err.innerHTML = errores.obl ? avisoError(errores.obl) : "";
    if (errores.obl) { tb.innerHTML = ""; return; }
    if (!obligaciones.length) { tb.innerHTML = '<tr><td colspan="' + cols + '" class="v-empty">Sin obligaciones configuradas.</td></tr>'; return; }
    tb.innerHTML = obligaciones.map((o) => {
      const per = PERIODICIDADES.find((p) => p.v === o.periodicidad);
      const mes = o.periodicidad === "anual" && o.mes_limite ? " de " + (MESES[o.mes_limite - 1] || "") : "";
      const accion = puedeConfigurar()
        ? '<td style="white-space:nowrap"><button class="v-mini" data-fis-editar-obl="' + esc(o.id) + '">Editar</button> <button class="v-mini" data-fis-toggle-obl="' + esc(o.id) + '" data-activa="' + (o.activa ? "1" : "0") + '">' + (o.activa ? "Desactivar" : "Activar") + "</button></td>"
        : "";
      return "<tr><td>" + esc(o.nombre) + "</td><td>" + esc(per ? per.t : o.periodicidad) + '</td><td class="num">Día ' + esc(o.dia_limite) + esc(mes) +
        '</td><td><span class="pill ' + (o.activa ? "pill--ok" : "pill--late") + '">' + (o.activa ? "Activa" : "Inactiva") + "</span></td>" + accion + "</tr>";
    }).join("");
  }

  function renderDocumentos() {
    const host = document.querySelector("[data-fis-documentos]");
    if (!host) return;
    if (errores.doc) { host.innerHTML = avisoError(errores.doc); return; }
    if (!documentos.length) { host.innerHTML = '<p style="color:var(--faint);padding:1rem;text-align:center">Sin documentos cargados.</p>'; return; }
    const hoy = hoyISO();
    host.innerHTML = documentos.map((d) => {
      const tipo = TIPOS_DOC.find((t) => t.v === d.tipo);
      let vig = "";
      if (d.vigencia_hasta) {
        const vencido = String(d.vigencia_hasta).slice(0, 10) < hoy;
        vig = ' · <span style="' + (vencido ? "color:#f87171" : "") + '">' + (vencido ? "Vencido el " : "Vigente hasta ") + esc(fmtFecha(d.vigencia_hasta)) + "</span>";
      }
      return '<div class="v-det__row" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">' +
        "<div><b>" + esc(d.nombre) + '</b><br><span style="font-size:.75rem;color:var(--faint)">' + esc(tipo ? tipo.t : d.tipo) + " · " + esc(fmtFecha(d.fecha_documento)) + vig + "</span></div>" +
        '<button class="v-mini" data-fis-ver-doc="' + esc(d.documento_path) + '">Ver</button></div>';
    }).join("");
  }

  function renderDeclaraciones() {
    const tb = document.querySelector("[data-fis-declaraciones]");
    const err = document.querySelector("[data-fis-dec-error]");
    if (!tb) return;
    if (err) err.innerHTML = errores.dec ? avisoError(errores.dec) : "";
    if (errores.dec) { tb.innerHTML = ""; return; }
    if (!declaraciones.length) { tb.innerHTML = '<tr><td colspan="7" class="v-empty">Sin declaraciones registradas.</td></tr>'; return; }
    const hoy = hoyISO();
    tb.innerHTML = declaraciones.slice().sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento))).map((d) => {
      // Comparación de fechas AAAA-MM-DD contra el día de hoy en México: el
      // día del vencimiento todavía no cuenta como vencida.
      // Una pendiente de un periodo que YA tiene una presentada (y no es complementaria)
      // no se marca vencida: se rotula "Duplicada" (mismo criterio que el calendario del backend).
      const duplicada = esDuplicadaDePresentada(d, declaraciones);
      const vencida = !duplicada && d.estado !== "presentada" && String(d.fecha_vencimiento).slice(0, 10) < hoy;
      const e = ESTADOS[duplicada ? "duplicada" : (vencida ? "vencida" : d.estado)] || ESTADOS.pendiente;
      let acciones = "";
      if (puedeRegistrar() && d.estado !== "presentada") {
        acciones = '<button class="v-mini v-mini--ok" data-fis-marcar="' + esc(d.id) + '">Marcar presentada</button>';
      } else {
        if (d.documento_path) acciones += '<button class="v-mini" data-fis-ver-doc="' + esc(d.documento_path) + '">Ver acuse</button> ';
        if (puedeRegistrar()) acciones += '<button class="v-mini" data-fis-deshacer="' + esc(d.id) + '">Regresar a pendiente</button>';
      }
      // Corregir o eliminar una declaración que aún no está presentada: solo admin y director.
      // Eliminar no se ofrece si ya tiene un acuse adjunto (el archivo quedaría huérfano en Storage).
      if (d.estado !== "presentada" && puedeConfigurar()) {
        acciones += ' <button class="v-mini" data-fis-edit-decl="' + esc(d.id) + '">Editar</button>';
        if (!d.documento_path) acciones += ' <button class="v-mini" data-fis-del-decl="' + esc(d.id) + '">Eliminar</button>';
      }
      const tipoDecl = tipoDeNotas(d.notas);
      const etiquetaTipo = tipoDecl ? ' <span class="v-badge v-badge--warn">' + esc(tipoDecl) + "</span>" : "";
      return "<tr><td>" + esc(nombreObligacion(d.obligacion_id)) + "</td><td>" + esc(d.periodo) + etiquetaTipo + "</td><td>" + esc(fmtFecha(d.fecha_vencimiento)) +
        "</td><td>" + esc(fmtFecha(d.fecha_presentacion)) + "</td><td>" + esc(d.folio_acuse || "—") +
        '</td><td><span class="v-badge ' + e.cls + '">' + e.txt + "</span></td><td>" + acciones + "</td></tr>";
    }).join("");
  }

  // ---------- Modales ----------
  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "v-modal";
    modal.innerHTML = '<div class="v-modal__box"><button class="v-modal__x" data-v-close>&times;</button><div data-v-content></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest("[data-v-close]")) closeModal(); });
    return modal;
  }
  function openModal(html) { ensureModal(); modal.querySelector("[data-v-content]").innerHTML = html; modal.classList.add("show"); }
  function closeModal() { if (modal) modal.classList.remove("show"); }

  // Evita guardados dobles: el botón queda deshabilitado mientras responde el servidor.
  async function conBoton(btn, fn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; }
  }

  let obligacionEditando = null; // obligación en edición (null = alta)
  function openFormObligacion(o) {
    obligacionEditando = o || null;
    const per = o ? o.periodicidad : "mensual";
    openModal(`
      <h2 class="v-h2">${o ? "Editar obligación fiscal" : "Nueva obligación fiscal"}</h2>
      ${o ? '<p style="color:var(--muted);font-size:.82rem;margin:0 0 .8rem">Los cambios no modifican las declaraciones que ya registraste.</p>' : ""}
      <div class="v-field"><label>Nombre</label><input class="v-inp" id="fo-nombre" maxlength="120" placeholder="Ej. IVA mensual" value="${o ? esc(o.nombre) : ""}"></div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodicidad</label><select class="v-inp" id="fo-periodicidad">${PERIODICIDADES.map((p) => `<option value="${p.v}"${p.v === per ? " selected" : ""}>${p.t}</option>`).join("")}</select></div>
        <div class="v-field"><label>Día límite</label><input class="v-inp" id="fo-dia" type="number" min="1" max="31" placeholder="17" value="${o ? esc(o.dia_limite) : ""}"></div>
      </div>
      <div class="v-field" id="fo-mes-wrap" style="display:${per === "anual" ? "" : "none"}"><label>Mes límite (solo anual)</label><select class="v-inp" id="fo-mes"><option value="">Elige el mes…</option>${MESES.map((m, i) => `<option value="${i + 1}"${o && o.mes_limite === i + 1 ? " selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-obl>Guardar</button></div>`);
  }
  async function guardarObligacion() {
    const nombre = document.getElementById("fo-nombre").value.trim();
    const periodicidad = document.getElementById("fo-periodicidad").value;
    const diaLimite = parseInt(document.getElementById("fo-dia").value, 10);
    const mesLimite = parseInt(document.getElementById("fo-mes").value, 10);
    if (!nombre) { toast("Captura el nombre de la obligación", "warn"); return; }
    if (!diaLimite || diaLimite < 1 || diaLimite > 31) { toast("Captura un día límite válido (1-31)", "warn"); return; }
    if (periodicidad === "anual" && !mesLimite) { toast("Elige el mes límite de la obligación anual", "warn"); return; }
    const cuerpo = { nombre, periodicidad, diaLimite, mesLimite: periodicidad === "anual" ? mesLimite : null };
    const editando = obligacionEditando;
    const data = editando
      ? await enviar("PUT", "/api/fiscal/obligaciones/" + encodeURIComponent(editando.id), cuerpo)
      : await enviar("POST", "/api/fiscal/obligaciones", cuerpo);
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    obligacionEditando = null;
    closeModal(); toast(editando ? "Obligación actualizada" : "Obligación creada"); await render();
  }
  async function alternarObligacion(btn) {
    const id = btn.getAttribute("data-fis-toggle-obl");
    const activar = btn.getAttribute("data-activa") !== "1";
    const data = await enviar("PUT", "/api/fiscal/obligaciones/" + encodeURIComponent(id), { activa: activar });
    if (!data.ok) { toast(data.error || "No se pudo actualizar", "warn"); return; }
    toast(activar ? "Obligación activada" : "Obligación desactivada"); await render();
  }

  // Plantilla de obligaciones habituales: se eligen y se crean; después se editan igual que cualquiera.
  function openPlantilla() {
    const existentes = obligaciones.map((o) => String(o.nombre).trim().toLowerCase());
    openModal(`
      <h2 class="v-h2">Cargar obligaciones comunes</h2>
      <p style="color:var(--muted);font-size:.85rem;margin:0 0 .8rem">Son sugerencias (día 17 del mes siguiente). Revísalas con tu contadora: después puedes editarlas o desactivarlas aquí mismo. No incluye Contabilidad Electrónica ni la declaración anual, que dependen del régimen.</p>
      ${PLANTILLA_OBLIGACIONES.map((p, i) => {
        const ya = existentes.indexOf(p.nombre.toLowerCase()) !== -1;
        const per = PERIODICIDADES.find((x) => x.v === p.periodicidad);
        return `<label style="display:flex;gap:.6rem;align-items:center;margin-bottom:.45rem${ya ? ";opacity:.55" : ""}"><input type="checkbox" data-fis-tpl="${i}"${ya ? " disabled" : " checked"}> <span><b>${esc(p.nombre)}</b> · ${esc(per ? per.t : p.periodicidad)} · día ${p.diaLimite}${ya ? " · ya existe" : ""}</span></label>`;
      }).join("")}
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-cargar-plantilla>Crear seleccionadas</button></div>`);
  }
  async function cargarPlantilla() {
    const elegidas = Array.from(document.querySelectorAll("[data-fis-tpl]")).filter((c) => c.checked).map((c) => PLANTILLA_OBLIGACIONES[Number(c.getAttribute("data-fis-tpl"))]);
    if (!elegidas.length) { toast("Elige al menos una obligación", "warn"); return; }
    let creadas = 0, fallo = null;
    for (const p of elegidas) {
      const data = await enviar("POST", "/api/fiscal/obligaciones", { nombre: p.nombre, periodicidad: p.periodicidad, diaLimite: p.diaLimite });
      if (data.ok) creadas++; else { fallo = data.error || "No se pudo guardar"; break; }
    }
    closeModal();
    toast(fallo ? creadas + " creada(s); se detuvo: " + fallo : creadas + " obligación(es) creada(s)", fallo ? "warn" : "ok");
    await render();
  }

  let archivoDoc = null;
  function openNuevoDocumento() {
    archivoDoc = null;
    openModal(`
      <h2 class="v-h2">Nuevo documento fiscal</h2>
      <div class="v-field"><label>Tipo</label><select class="v-inp" id="fd-tipo">${TIPOS_DOC.map((t) => `<option value="${t.v}">${t.t}</option>`).join("")}</select></div>
      <div class="v-field"><label>Nombre</label><input class="v-inp" id="fd-nombre" maxlength="120" placeholder="Ej. Opinión de cumplimiento (mes y año)"></div>
      <div class="v-grid2">
        <div class="v-field"><label>Fecha del documento</label><input class="v-inp" id="fd-fecha" type="date"></div>
        <div class="v-field"><label>Vigente hasta (opcional)</label><input class="v-inp" id="fd-vigencia" type="date"></div>
      </div>
      <div class="v-field"><label>Archivo (PDF, JPG, PNG o WEBP · máx. 5 MB)</label>
        <div class="v-file" data-fd-file><span data-fd-file-txt>Adjuntar archivo</span><input type="file" id="fd-archivo" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-doc>Guardar</button></div>`);
  }
  async function guardarDocumento() {
    const tipo = document.getElementById("fd-tipo").value;
    const nombre = document.getElementById("fd-nombre").value.trim();
    const fechaDocumento = document.getElementById("fd-fecha").value;
    const vigenciaHasta = document.getElementById("fd-vigencia").value;
    if (!nombre) { toast("Captura el nombre del documento", "warn"); return; }
    if (fechaDocumento && vigenciaHasta && vigenciaHasta < fechaDocumento) { toast("La vigencia no puede ser anterior a la fecha del documento", "warn"); return; }
    if (!archivoDoc) { toast("Adjunta el archivo", "warn"); return; }
    try {
      const empresa = window.CONTATECK_EMPRESA_PG;
      const empresaId = empresa && empresa.id;
      if (!empresaId) { toast("No se pudo determinar tu empresa todavía; espera unos segundos e inténtalo de nuevo.", "warn"); return; }
      const documentoPath = await subirDocumento(archivoDoc, empresaId);
      const data = await enviar("POST", "/api/fiscal/documentos", { tipo, nombre, documentoPath, fechaDocumento: fechaDocumento || undefined, vigenciaHasta: vigenciaHasta || undefined });
      if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
      closeModal(); toast("Documento guardado"); await render();
    } catch (e) { toast(e.message || "No se pudo guardar el documento", "warn"); }
  }

  function openNuevaDeclaracion() {
    const activas = obligaciones.filter((o) => o.activa);
    if (!activas.length) { toast("Primero da de alta (o activa) al menos una obligación", "warn"); return; }
    openModal(`
      <h2 class="v-h2">Nueva declaración</h2>
      <div class="v-grid2">
        <div class="v-field"><label>Obligación</label><select class="v-inp" id="fdec-obl">${activas.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}</select></div>
        <div class="v-field"><label>Tipo</label><select class="v-inp" id="fdec-tipo">${TIPOS_DECLARACION.map((t) => `<option>${t}</option>`).join("")}</select></div>
      </div>
      <div class="v-grid2">
        <div class="v-field" id="fdec-idx-wrap"><label>Mes o bimestre</label><select class="v-inp" id="fdec-idx"></select></div>
        <div class="v-field"><label>Año</label><input class="v-inp" id="fdec-anio" type="number" min="2000" max="2100"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodo (se arma solo; puedes editarlo)</label><input class="v-inp" id="fdec-periodo" maxlength="60" placeholder="Ej. Julio 2026"></div>
        <div class="v-field"><label>Fecha límite</label><input class="v-inp" id="fdec-vence" type="date"></div>
      </div>
      <p style="color:var(--faint);font-size:.78rem;margin:0" data-fdec-hint></p>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-decl>Guardar</button></div>`);
    prepararDeclaracion(true);
  }
  function obligacionElegida() {
    const sel = document.getElementById("fdec-obl");
    return sel ? obligaciones.find((o) => o.id === sel.value) : null;
  }
  // Llena mes/bimestre, año, periodo y la fecha límite sugerida. `reiniciar`: al
  // cambiar de obligación se vuelve al periodo más reciente ya concluido.
  function prepararDeclaracion(reiniciar) {
    const o = obligacionElegida(); if (!o) return;
    const idxSel = document.getElementById("fdec-idx"), anioInp = document.getElementById("fdec-anio");
    if (reiniciar) {
      const p = periodoAnterior(o, hoyISO());
      const opciones = o.periodicidad === "bimestral"
        ? [0, 1, 2, 3, 4, 5].map((b) => ({ v: b, t: MESES[b * 2] + "–" + MESES[b * 2 + 1] }))
        : MESES.map((m, i) => ({ v: i, t: m }));
      idxSel.innerHTML = o.periodicidad === "anual" ? '<option value="0">—</option>' : opciones.map((x) => '<option value="' + x.v + '">' + esc(x.t) + "</option>").join("");
      idxSel.value = String(p.indice); anioInp.value = String(p.anio);
      document.getElementById("fdec-idx-wrap").style.display = o.periodicidad === "anual" ? "none" : "";
    }
    const indice = parseInt(idxSel.value, 10), anio = parseInt(anioInp.value, 10);
    document.getElementById("fdec-periodo").value = anio ? textoPeriodo(o, indice, anio) : "";
    const f = sugerirFechaLimite(o, indice, anio);
    document.getElementById("fdec-vence").value = f || "";
    fechaSugerida = f || null;
    textoBaseHint = f
      ? "Fecha sugerida: " + (o.periodicidad === "anual" ? "el mes límite del año siguiente" : "el día límite del mes siguiente al periodo") + ", recorrida al lunes si cae en fin de semana. No considera días inhábiles por feriados: confírmala."
      : "No se pudo sugerir la fecha (revisa el año o el mes límite de la obligación); captúrala a mano.";
    document.querySelector("[data-fdec-hint]").textContent = textoBaseHint;
  }
  // Si la fecha límite se cambia a mano y no coincide con la sugerida, se avisa (no se impide).
  let fechaSugerida = null, textoBaseHint = "";
  function avisarFechaDistinta() {
    const hint = document.querySelector("[data-fdec-hint]"), v = document.getElementById("fdec-vence");
    if (!hint || !v) return;
    hint.textContent = fechaSugerida && v.value && v.value !== fechaSugerida
      ? "Esta fecha difiere de la sugerida (" + fmtFecha(fechaSugerida) + "). Si no es a propósito, corrígela."
      : textoBaseHint;
  }
  let declaracionPorConfirmar = null;
  async function guardarDeclaracion() {
    const obligacionId = document.getElementById("fdec-obl").value;
    const periodo = document.getElementById("fdec-periodo").value.trim();
    const fechaVencimiento = document.getElementById("fdec-vence").value;
    const tipo = document.getElementById("fdec-tipo").value;
    if (!periodo || !fechaVencimiento) { toast("Captura el periodo y la fecha límite", "warn"); return; }
    const cuerpo = { obligacionId, periodo, fechaVencimiento };
    if (tipo !== "Normal") cuerpo.notas = "[" + tipo + "]";
    await enviarDeclaracion(cuerpo);
  }
  async function enviarDeclaracion(cuerpo) {
    const data = await enviar("POST", "/api/fiscal/declaraciones", cuerpo);
    if (data.codigo === "DUPLICADA") { openConfirmarDuplicada(cuerpo, data.existentes || []); return; }
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    declaracionPorConfirmar = null;
    closeModal(); toast("Declaración registrada"); await render();
  }
  // Ya hay una declaración de esa obligación y periodo: se muestra cuál y se pide confirmar.
  function openConfirmarDuplicada(cuerpo, existentes) {
    declaracionPorConfirmar = cuerpo;
    const filas = existentes.map((x) => {
      const e = ESTADOS[x.estado] || ESTADOS.pendiente;
      return "<li>" + esc(e.txt) + (x.fechaPresentacion ? " el " + esc(fmtFecha(x.fechaPresentacion)) : "") + " · vence " + esc(fmtFecha(x.fechaVencimiento)) + "</li>";
    }).join("");
    openModal(`
      <h2 class="v-h2">Ya existe una declaración de este periodo</h2>
      <p style="color:var(--muted);font-size:.88rem;margin:0 0 .5rem"><b>${esc(nombreObligacion(cuerpo.obligacionId))} · ${esc(cuerpo.periodo)}</b> ya está registrada:</p>
      <ul style="margin:0 0 .8rem 1.1rem;font-size:.88rem">${filas}</ul>
      <p style="color:var(--muted);font-size:.85rem;margin:0">Si es una corrección de la ya presentada, cancela y vuelve a crearla con el tipo <b>Complementaria</b>. Si la registras de todos modos quedará marcada como <b>Duplicada</b> y no generará alertas mientras exista una presentada.</p>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-confirmar-dup>Registrar de todos modos</button></div>`);
  }

  // ---- Corregir o eliminar una declaración pendiente (admin y director) ----
  let declaracionEnCorreccion = null;
  function openEditarDeclaracion(id) {
    const d = declaraciones.find((x) => x.id === id);
    if (!d) return;
    declaracionEnCorreccion = d.id;
    openModal(`
      <h2 class="v-h2">Corregir declaración</h2>
      <p style="color:var(--muted);font-size:.85rem;margin:0 0 .8rem">${esc(nombreObligacion(d.obligacion_id))}. Solo se corrigen el periodo y la fecha límite; el estado no cambia.</p>
      <div class="v-grid2">
        <div class="v-field"><label>Periodo</label><input class="v-inp" id="fed-periodo" maxlength="60" value="${esc(d.periodo)}"></div>
        <div class="v-field"><label>Fecha límite</label><input class="v-inp" id="fed-vence" type="date" value="${esc(String(d.fecha_vencimiento).slice(0, 10))}"></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-edicion>Guardar cambios</button></div>`);
  }
  async function guardarEdicionDeclaracion() {
    const periodo = document.getElementById("fed-periodo").value.trim();
    const fechaVencimiento = document.getElementById("fed-vence").value;
    if (!periodo || !fechaVencimiento) { toast("Captura el periodo y la fecha límite", "warn"); return; }
    const data = await enviar("PUT", "/api/fiscal/declaraciones/" + encodeURIComponent(declaracionEnCorreccion) + "/datos", { periodo, fechaVencimiento });
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    closeModal(); toast("Declaración corregida"); await render();
  }
  function openEliminarDeclaracion(id) {
    const d = declaraciones.find((x) => x.id === id);
    if (!d) return;
    declaracionEnCorreccion = d.id;
    openModal(`
      <h2 class="v-h2">Eliminar declaración</h2>
      <p style="color:var(--muted);font-size:.88rem">Se eliminará <b>${esc(nombreObligacion(d.obligacion_id))} · ${esc(d.periodo)}</b> (vence ${esc(fmtFecha(d.fecha_vencimiento))}). Esta acción no se puede deshacer. Úsala solo para un registro capturado por error.</p>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" style="background:#FB7185;border-color:#FB7185" data-fis-confirmar-eliminar>Eliminar</button></div>`);
  }
  async function confirmarEliminarDeclaracion() {
    const data = await enviar("DELETE", "/api/fiscal/declaraciones/" + encodeURIComponent(declaracionEnCorreccion));
    if (!data.ok) { toast(data.error || "No se pudo eliminar", "warn"); return; }
    closeModal(); toast("Declaración eliminada"); await render();
  }

  function openDeshacerPresentada(id) {
    declaracionActual = id;
    openModal(`
      <h2 class="v-h2">Regresar a pendiente</h2>
      <p style="color:var(--muted);font-size:.88rem">Se borrará la fecha de presentación y quién la registró; el folio y el acuse adjunto se conservan. Úsalo si la marcaste como presentada por error.</p>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-confirmar-deshacer>Regresar a pendiente</button></div>`);
  }
  async function confirmarDeshacer() {
    const data = await enviar("PUT", "/api/fiscal/declaraciones/" + encodeURIComponent(declaracionActual), { estado: "pendiente" });
    if (!data.ok) { toast(data.error || "No se pudo actualizar", "warn"); return; }
    closeModal(); toast("Declaración regresada a pendiente"); await render();
  }

  let archivoAcuse = null, declaracionActual = null;
  function openMarcarPresentada(id) {
    declaracionActual = id;
    archivoAcuse = null;
    const hoy = hoyISO();
    openModal(`
      <h2 class="v-h2">Marcar declaración como presentada</h2>
      <p style="color:var(--muted);font-size:.85rem;margin:0 0 .8rem">Esto solo registra aquí que ya la presentaste en el portal del SAT; no envía nada al SAT.</p>
      <div class="v-grid2">
        <div class="v-field"><label>Fecha de presentación</label><input class="v-inp" id="fm-fecha" type="date" value="${hoy}" max="${hoy}"></div>
        <div class="v-field"><label>Folio del acuse</label><input class="v-inp" id="fm-folio" maxlength="60" placeholder="Opcional"></div>
      </div>
      <div class="v-field"><label>Acuse (PDF, JPG, PNG o WEBP · máx. 5 MB)</label>
        <div class="v-file" data-fm-file><span data-fm-file-txt>Adjuntar acuse (opcional)</span><input type="file" id="fm-archivo" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-confirmar-presentada>Confirmar</button></div>`);
  }
  async function confirmarPresentada() {
    const folioAcuse = document.getElementById("fm-folio").value.trim();
    const fechaPresentacion = document.getElementById("fm-fecha").value;
    if (!fechaPresentacion) { toast("Captura la fecha de presentación", "warn"); return; }
    if (fechaPresentacion > hoyISO()) { toast("La fecha de presentación no puede ser futura", "warn"); return; }
    try {
      let documentoPath;
      if (archivoAcuse) {
        const empresaId = window.CONTATECK_EMPRESA_PG && window.CONTATECK_EMPRESA_PG.id;
        // Antes, si faltaba la empresa, el acuse se omitía en silencio y la declaración
        // quedaba presentada sin él.
        if (!empresaId) { toast("No se pudo determinar tu empresa todavía; espera unos segundos e inténtalo de nuevo.", "warn"); return; }
        documentoPath = await subirDocumento(archivoAcuse, empresaId);
      }
      const data = await enviar("PUT", "/api/fiscal/declaraciones/" + encodeURIComponent(declaracionActual), {
        estado: "presentada", fechaPresentacion, folioAcuse: folioAcuse || undefined, documentoPath,
      });
      if (!data.ok) { toast(data.error || "No se pudo actualizar", "warn"); return; }
      closeModal(); toast("Declaración marcada como presentada ✓"); await render();
    } catch (e) { toast(e.message || "No se pudo actualizar la declaración", "warn"); }
  }

  async function verDocumento(path) {
    // La ventana se abre YA (dentro del clic) para que el bloqueador de
    // ventanas emergentes no la detenga; después se le asigna la URL firmada.
    const w = window.open("", "_blank");
    toast("Abriendo documento…");
    const url = await urlFirmada(path);
    if (!url) { if (w) w.close(); toast("No se pudo abrir el documento", "warn"); return; }
    if (!w) { toast("Tu navegador bloqueó la ventana; permite ventanas emergentes para ver el documento.", "warn"); return; }
    w.opener = null;
    w.location.href = url;
  }

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-fis-nueva-obl]")) { openFormObligacion(null); return; }
    if (e.target.closest("[data-fis-plantilla]")) { openPlantilla(); return; }
    const cPlan = e.target.closest("[data-fis-cargar-plantilla]"); if (cPlan) { conBoton(cPlan, cargarPlantilla); return; }
    const edObl = e.target.closest("[data-fis-editar-obl]");
    if (edObl) { const o = obligaciones.find((x) => x.id === edObl.getAttribute("data-fis-editar-obl")); if (o) openFormObligacion(o); return; }
    const gObl = e.target.closest("[data-fis-guardar-obl]"); if (gObl) { conBoton(gObl, guardarObligacion); return; }
    const tog = e.target.closest("[data-fis-toggle-obl]"); if (tog) { conBoton(tog, () => alternarObligacion(tog)); return; }
    if (e.target.closest("[data-fis-nuevo-doc]")) { openNuevoDocumento(); return; }
    const gDoc = e.target.closest("[data-fis-guardar-doc]"); if (gDoc) { conBoton(gDoc, guardarDocumento); return; }
    if (e.target.closest("[data-fis-nueva-decl]")) { openNuevaDeclaracion(); return; }
    const gDec = e.target.closest("[data-fis-guardar-decl]"); if (gDec) { conBoton(gDec, guardarDeclaracion); return; }
    const marcar = e.target.closest("[data-fis-marcar]"); if (marcar) { openMarcarPresentada(marcar.getAttribute("data-fis-marcar")); return; }
    const conf = e.target.closest("[data-fis-confirmar-presentada]"); if (conf) { conBoton(conf, confirmarPresentada); return; }
    const cDup = e.target.closest("[data-fis-confirmar-dup]");
    if (cDup) { conBoton(cDup, () => enviarDeclaracion(Object.assign({}, declaracionPorConfirmar, { confirmarDuplicada: true }))); return; }
    const edD = e.target.closest("[data-fis-edit-decl]"); if (edD) { openEditarDeclaracion(edD.getAttribute("data-fis-edit-decl")); return; }
    const gEd = e.target.closest("[data-fis-guardar-edicion]"); if (gEd) { conBoton(gEd, guardarEdicionDeclaracion); return; }
    const dlD = e.target.closest("[data-fis-del-decl]"); if (dlD) { openEliminarDeclaracion(dlD.getAttribute("data-fis-del-decl")); return; }
    const cEl = e.target.closest("[data-fis-confirmar-eliminar]"); if (cEl) { conBoton(cEl, confirmarEliminarDeclaracion); return; }
    const des = e.target.closest("[data-fis-deshacer]"); if (des) { openDeshacerPresentada(des.getAttribute("data-fis-deshacer")); return; }
    const cDes = e.target.closest("[data-fis-confirmar-deshacer]"); if (cDes) { conBoton(cDes, confirmarDeshacer); return; }
    const ver = e.target.closest("[data-fis-ver-doc]"); if (ver) { verDocumento(ver.getAttribute("data-fis-ver-doc")); return; }
    if (e.target.closest("[data-fd-file]")) { const i = document.getElementById("fd-archivo"); if (i) i.click(); return; }
    if (e.target.closest("[data-fm-file]")) { const i = document.getElementById("fm-archivo"); if (i) i.click(); return; }
  });
  function elegirArchivo(e, setArchivo, txtSel) {
    const f = e.target.files[0]; if (!f) return;
    const malo = errorArchivo(f);
    if (malo) { toast(malo, "warn"); e.target.value = ""; setArchivo(null); const t0 = document.querySelector(txtSel); if (t0) t0.textContent = "Adjuntar archivo"; return; }
    setArchivo(f); const t = document.querySelector(txtSel); if (t) t.textContent = f.name + " ✓";
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "fd-archivo") elegirArchivo(e, (f) => { archivoDoc = f; }, "[data-fd-file-txt]");
    if (e.target.id === "fm-archivo") elegirArchivo(e, (f) => { archivoAcuse = f; }, "[data-fm-file-txt]");
    if (e.target.id === "fo-periodicidad") {
      const wrap = document.getElementById("fo-mes-wrap");
      if (wrap) wrap.style.display = e.target.value === "anual" ? "" : "none";
    }
    if (e.target.id === "fdec-obl") prepararDeclaracion(true);
    if (e.target.id === "fdec-idx" || e.target.id === "fdec-anio") prepararDeclaracion(false);
    if (e.target.id === "fdec-vence") avisarFechaDistinta();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest('.nav-item[data-view="sat"]')) setTimeout(render, 30);
  });

  function maybeRender() {
    const sec = document.querySelector('section[data-view="sat"]');
    if (sec && sec.classList.contains("is-active")) render();
  }
  if (document.readyState !== "loading") setTimeout(maybeRender, 50);
  else document.addEventListener("DOMContentLoaded", () => setTimeout(maybeRender, 50));
})();
