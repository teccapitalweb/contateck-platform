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
    const noDisp = "No disponible todavía: requiere la e.firma del contribuyente";
    root.innerHTML = `
      <div class="page-head">
        <div><h1>SAT y Fiscal</h1><p>Bitácora de obligaciones, declaraciones y documentos</p></div>
        <div class="page-head__actions">
          <button class="btn btn--ghost" disabled aria-disabled="true" title="${noDisp}" style="opacity:.55;cursor:not-allowed">${ICO_DESC}Descargar XML del SAT · no disponible</button>
          <button class="btn btn--primary" disabled aria-disabled="true" title="${noDisp}" style="opacity:.55;cursor:not-allowed">${ICO_PRES}Presentar declaración · no disponible</button>
        </div>
      </div>
      <div class="alerts" style="margin-bottom:1.2rem"><div class="alert alert--info"><div class="alert__body">
        <b>Aquí se lleva la bitácora, no se presenta ante el SAT.</b>
        <p>La descarga masiva de XML y la presentación electrónica requieren e.firma y todavía no están disponibles: presenta en el portal del SAT y registra aquí la fecha y el acuse. Los XML de Contabilidad Electrónica (catálogo y balanza) se generan en Contabilidad → SAT / Declaraciones.</p>
      </div></div></div>

      <div class="card" style="margin-bottom:1.2rem">
        <div class="card__head"><h3>Próximos vencimientos</h3><span class="sub">Declaraciones pendientes, ordenadas por fecha límite</span></div>
        <div data-fis-calendario></div>
      </div>

      <div class="grid-2" style="margin-bottom:1.2rem">
        <div class="card">
          <div class="card__head"><h3>Obligaciones</h3>${puedeConfigurar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nueva-obl>+ Obligación</button>' : ""}</div>
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
        ? '<td><button class="v-mini" data-fis-toggle-obl="' + esc(o.id) + '" data-activa="' + (o.activa ? "1" : "0") + '">' + (o.activa ? "Desactivar" : "Activar") + "</button></td>"
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
      const vencida = d.estado !== "presentada" && String(d.fecha_vencimiento).slice(0, 10) < hoy;
      const e = ESTADOS[vencida ? "vencida" : d.estado] || ESTADOS.pendiente;
      let acciones = "";
      if (puedeRegistrar() && d.estado !== "presentada") {
        acciones = '<button class="v-mini v-mini--ok" data-fis-marcar="' + esc(d.id) + '">Marcar presentada</button>';
      } else if (d.documento_path) {
        acciones = '<button class="v-mini" data-fis-ver-doc="' + esc(d.documento_path) + '">Ver acuse</button>';
      }
      return "<tr><td>" + esc(nombreObligacion(d.obligacion_id)) + "</td><td>" + esc(d.periodo) + "</td><td>" + esc(fmtFecha(d.fecha_vencimiento)) +
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

  function openNuevaObligacion() {
    openModal(`
      <h2 class="v-h2">Nueva obligación fiscal</h2>
      <div class="v-field"><label>Nombre</label><input class="v-inp" id="fo-nombre" maxlength="120" placeholder="Ej. IVA mensual"></div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodicidad</label><select class="v-inp" id="fo-periodicidad">${PERIODICIDADES.map((p) => `<option value="${p.v}">${p.t}</option>`).join("")}</select></div>
        <div class="v-field"><label>Día límite</label><input class="v-inp" id="fo-dia" type="number" min="1" max="31" placeholder="17"></div>
      </div>
      <div class="v-field" id="fo-mes-wrap" style="display:none"><label>Mes límite (solo anual)</label><select class="v-inp" id="fo-mes"><option value="">Elige el mes…</option>${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></div>
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
    const cuerpo = { nombre, periodicidad, diaLimite };
    if (periodicidad === "anual") cuerpo.mesLimite = mesLimite;
    const data = await enviar("POST", "/api/fiscal/obligaciones", cuerpo);
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    closeModal(); toast("Obligación creada"); await render();
  }
  async function alternarObligacion(btn) {
    const id = btn.getAttribute("data-fis-toggle-obl");
    const activar = btn.getAttribute("data-activa") !== "1";
    const data = await enviar("PUT", "/api/fiscal/obligaciones/" + encodeURIComponent(id), { activa: activar });
    if (!data.ok) { toast(data.error || "No se pudo actualizar", "warn"); return; }
    toast(activar ? "Obligación activada" : "Obligación desactivada"); await render();
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
      <div class="v-field"><label>Obligación</label><select class="v-inp" id="fdec-obl">${activas.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}</select></div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodo</label><input class="v-inp" id="fdec-periodo" maxlength="60" placeholder="Ej. Julio 2026"></div>
        <div class="v-field"><label>Fecha límite</label><input class="v-inp" id="fdec-vence" type="date"></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-decl>Guardar</button></div>`);
  }
  async function guardarDeclaracion() {
    const obligacionId = document.getElementById("fdec-obl").value;
    const periodo = document.getElementById("fdec-periodo").value.trim();
    const fechaVencimiento = document.getElementById("fdec-vence").value;
    if (!periodo || !fechaVencimiento) { toast("Captura el periodo y la fecha límite", "warn"); return; }
    const data = await enviar("POST", "/api/fiscal/declaraciones", { obligacionId, periodo, fechaVencimiento });
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    closeModal(); toast("Declaración registrada"); await render();
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
    if (e.target.closest("[data-fis-nueva-obl]")) { openNuevaObligacion(); return; }
    const gObl = e.target.closest("[data-fis-guardar-obl]"); if (gObl) { conBoton(gObl, guardarObligacion); return; }
    const tog = e.target.closest("[data-fis-toggle-obl]"); if (tog) { conBoton(tog, () => alternarObligacion(tog)); return; }
    if (e.target.closest("[data-fis-nuevo-doc]")) { openNuevoDocumento(); return; }
    const gDoc = e.target.closest("[data-fis-guardar-doc]"); if (gDoc) { conBoton(gDoc, guardarDocumento); return; }
    if (e.target.closest("[data-fis-nueva-decl]")) { openNuevaDeclaracion(); return; }
    const gDec = e.target.closest("[data-fis-guardar-decl]"); if (gDec) { conBoton(gDec, guardarDeclaracion); return; }
    const marcar = e.target.closest("[data-fis-marcar]"); if (marcar) { openMarcarPresentada(marcar.getAttribute("data-fis-marcar")); return; }
    const conf = e.target.closest("[data-fis-confirmar-presentada]"); if (conf) { conBoton(conf, confirmarPresentada); return; }
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
