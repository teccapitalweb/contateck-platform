// ============================================================
//  CONTATECK · Módulo SAT y Fiscal — Parte A
//  Bitácora manual real (obligaciones, declaraciones, documentos,
//  calendario derivado). NADA de e.firma, Descarga Masiva del SAT,
//  XML recibidos ni cálculo automático de IVA/ISR/DIOT — eso es
//  Parte B, documentada y sin implementar hasta contar con e.firma
//  real y las reglas del responsable contable.
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
  const ESTADOS = {
    pendiente: { txt: "Pendiente", cls: "v-badge--warn" },
    en_proceso: { txt: "En proceso", cls: "v-badge--warn" },
    presentada: { txt: "Presentada", cls: "v-badge--ok" },
    vencida: { txt: "Vencida", cls: "v-badge--bad" },
  };
  const ROLES_CONFIGURAN = ["admin", "director"];
  const ROLES_REGISTRAN = ["contador", "admin", "director"];

  function backendUrl() { return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app"; }
  function authHeaders(json) { const h = json ? { "Content-Type": "application/json" } : {}; const t = window.CONTATECK_SUPABASE_TOKEN; if (t) h.Authorization = "Bearer " + t; return h; }
  function miPerfil() { return window.CONTATECK_PERFIL_PG || null; }
  function miId() { const p = miPerfil(); return p ? p.id : null; }
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

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(f + (String(f).length === 10 ? "T12:00:00" : ""));
    if (isNaN(d)) return f;
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
  async function subirDocumento(file, empresaId) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) throw new Error("Sesión o configuración de Storage no disponible.");
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = empresaId + "/sat/" + uuidCliente() + "/documento." + ext;
    const resp = await fetch(cfg.url + "/storage/v1/object/documentos/" + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!resp.ok) { const txt = await resp.text().catch(() => ""); throw new Error("No se pudo subir el documento (" + resp.status + "). " + txt.slice(0, 200)); }
    return path;
  }
  async function urlFirmada(path) {
    const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
    if (!cfg || !t) return null;
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
  async function cargarTodo() {
    const h = authHeaders(false);
    try {
      const [rObl, rDec, rDoc, rCal] = await Promise.all([
        fetch(backendUrl() + "/api/fiscal/obligaciones", { headers: h }).then((r) => r.json()),
        fetch(backendUrl() + "/api/fiscal/declaraciones", { headers: h }).then((r) => r.json()),
        fetch(backendUrl() + "/api/fiscal/documentos", { headers: h }).then((r) => r.json()),
        fetch(backendUrl() + "/api/fiscal/calendario", { headers: h }).then((r) => r.json()),
      ]);
      obligaciones = rObl.ok ? rObl.obligaciones : [];
      declaraciones = rDec.ok ? rDec.declaraciones : [];
      documentos = rDoc.ok ? rDoc.documentos : [];
      calendario = rCal.ok ? rCal.proximas : [];
      if (!rObl.ok && rObl.error) toast(rObl.error, "warn");
    } catch (e) {
      obligaciones = []; declaraciones = []; documentos = []; calendario = [];
      toast("Sin conexión con el backend.", "warn");
    }
  }

  function nombreObligacion(id) { const o = obligaciones.find((x) => x.id === id); return o ? o.nombre : "—"; }

  // ---------- Render ----------
  async function render() {
    const root = document.querySelector("[data-fiscal-root]");
    if (!root) return;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>SAT y Fiscal</h1><p>Bitácora de obligaciones, declaraciones y documentos</p></div>
        <div class="page-head__actions">
          <button class="btn btn--ghost" data-soon="La descarga masiva de XML del SAT requiere e.firma + backend — siguiente fase."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 21h14"/></svg>Descargar XML</button>
          <button class="btn btn--primary" data-soon="La presentación electrónica ante el SAT requiere e.firma — siguiente fase."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.4 3 7.6 7 8.7 4-1.1 7-4.3 7-8.7V6z"/><path d="m9 12 2 2 4-4"/></svg>Presentar declaración</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.2rem">
        <div class="card__head"><h3>Próximos vencimientos</h3><span class="sub">Calendario derivado de tus obligaciones</span></div>
        <div data-fis-calendario></div>
      </div>

      <div class="grid-2" style="margin-bottom:1.2rem">
        <div class="card">
          <div class="card__head"><h3>Obligaciones</h3>${puedeConfigurar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nueva-obl>+ Obligación</button>' : ""}</div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nombre</th><th>Periodicidad</th><th>Día límite</th><th>Estado</th></tr></thead><tbody data-fis-obligaciones></tbody></table></div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Documentos fiscales</h3>${puedeRegistrar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nuevo-doc>+ Documento</button>' : ""}</div>
          <div data-fis-documentos></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h3>Declaraciones</h3>${puedeRegistrar() ? '<button class="btn btn--ghost" style="padding:.45rem .8rem;font-size:.84rem" data-fis-nueva-decl>+ Declaración</button>' : ""}</div>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Obligación</th><th>Periodo</th><th>Vence</th><th>Presentada</th><th>Folio acuse</th><th>Estado</th><th></th></tr></thead><tbody data-fis-declaraciones></tbody></table></div>
      </div>`;

    await Promise.all([cargarTodo(), esperarPerfil()]);
    renderCalendario();
    renderObligaciones();
    renderDocumentos();
    renderDeclaraciones();
  }

  function renderCalendario() {
    const host = document.querySelector("[data-fis-calendario]");
    if (!host) return;
    if (!calendario.length) { host.innerHTML = '<p style="color:var(--faint);padding:1rem;text-align:center">Sin vencimientos pendientes.</p>'; return; }
    host.innerHTML = '<div class="alerts">' + calendario.map((c) => {
      const tipo = c.estado === "vencida" ? "danger" : (c.diasRestantes <= 5 ? "warn" : "info");
      const txt = c.estado === "vencida" ? "Venció hace " + Math.abs(c.diasRestantes) + " día(s)" : "Vence en " + c.diasRestantes + " día(s)";
      return '<div class="alert alert--' + tipo + '"><div class="alert__body"><b>' + c.obligacion + " · " + c.periodo + "</b><p>" + txt + " — " + fmtFecha(c.fechaVencimiento) + "</p></div></div>";
    }).join("") + "</div>";
  }

  function renderObligaciones() {
    const tb = document.querySelector("[data-fis-obligaciones]");
    if (!tb) return;
    if (!obligaciones.length) { tb.innerHTML = '<tr><td colspan="4" class="v-empty">Sin obligaciones configuradas.</td></tr>'; return; }
    tb.innerHTML = obligaciones.map((o) => {
      const per = PERIODICIDADES.find((p) => p.v === o.periodicidad);
      return "<tr><td>" + o.nombre + "</td><td>" + (per ? per.t : o.periodicidad) + '</td><td class="num">Día ' + o.dia_limite +
        '</td><td><span class="pill ' + (o.activa ? "pill--ok" : "pill--late") + '">' + (o.activa ? "Activa" : "Inactiva") + "</span></td></tr>";
    }).join("");
  }

  function renderDocumentos() {
    const host = document.querySelector("[data-fis-documentos]");
    if (!host) return;
    if (!documentos.length) { host.innerHTML = '<p style="color:var(--faint);padding:1rem;text-align:center">Sin documentos cargados.</p>'; return; }
    host.innerHTML = documentos.map((d) => {
      const tipo = TIPOS_DOC.find((t) => t.v === d.tipo);
      return '<div class="v-det__row" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">' +
        "<div><b>" + d.nombre + '</b><br><span style="font-size:.75rem;color:var(--faint)">' + (tipo ? tipo.t : d.tipo) + " · " + fmtFecha(d.fecha_documento) + "</span></div>" +
        '<button class="v-mini" data-fis-ver-doc="' + d.documento_path + '">Ver</button></div>';
    }).join("");
  }

  function renderDeclaraciones() {
    const tb = document.querySelector("[data-fis-declaraciones]");
    if (!tb) return;
    if (!declaraciones.length) { tb.innerHTML = '<tr><td colspan="7" class="v-empty">Sin declaraciones registradas.</td></tr>'; return; }
    tb.innerHTML = declaraciones.slice().sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento)).map((d) => {
      const vencida = d.estado !== "presentada" && new Date(d.fecha_vencimiento) < new Date();
      const e = ESTADOS[vencida ? "vencida" : d.estado] || ESTADOS.pendiente;
      let acciones = "";
      if (puedeRegistrar() && d.estado !== "presentada") {
        acciones = '<button class="v-mini v-mini--ok" data-fis-marcar="' + d.id + '">Marcar presentada</button>';
      } else if (d.documento_path) {
        acciones = '<button class="v-mini" data-fis-ver-doc="' + d.documento_path + '">Ver acuse</button>';
      }
      return "<tr><td>" + nombreObligacion(d.obligacion_id) + "</td><td>" + d.periodo + "</td><td>" + fmtFecha(d.fecha_vencimiento) +
        "</td><td>" + fmtFecha(d.fecha_presentacion) + "</td><td>" + (d.folio_acuse || "—") +
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

  function openNuevaObligacion() {
    openModal(`
      <h2 class="v-h2">Nueva obligación fiscal</h2>
      <div class="v-field"><label>Nombre</label><input class="v-inp" id="fo-nombre" placeholder="Ej. IVA mensual"></div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodicidad</label><select class="v-inp" id="fo-periodicidad">${PERIODICIDADES.map((p) => `<option value="${p.v}">${p.t}</option>`).join("")}</select></div>
        <div class="v-field"><label>Día límite del mes</label><input class="v-inp" id="fo-dia" type="number" min="1" max="31" placeholder="17"></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-obl>Guardar</button></div>`);
  }
  async function guardarObligacion() {
    const nombre = document.getElementById("fo-nombre").value.trim();
    const periodicidad = document.getElementById("fo-periodicidad").value;
    const diaLimite = parseInt(document.getElementById("fo-dia").value, 10);
    if (!nombre) { toast("Captura el nombre de la obligación", "warn"); return; }
    if (!diaLimite || diaLimite < 1 || diaLimite > 31) { toast("Captura un día límite válido (1-31)", "warn"); return; }
    const resp = await fetch(backendUrl() + "/api/fiscal/obligaciones", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ nombre, periodicidad, diaLimite }) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    closeModal(); toast("Obligación creada"); await render();
  }

  let archivoDoc = null;
  function openNuevoDocumento() {
    archivoDoc = null;
    openModal(`
      <h2 class="v-h2">Nuevo documento fiscal</h2>
      <div class="v-field"><label>Tipo</label><select class="v-inp" id="fd-tipo">${TIPOS_DOC.map((t) => `<option value="${t.v}">${t.t}</option>`).join("")}</select></div>
      <div class="v-field"><label>Nombre</label><input class="v-inp" id="fd-nombre" placeholder="Ej. Opinión de cumplimiento julio 2026"></div>
      <div class="v-field"><label>Fecha del documento</label><input class="v-inp" id="fd-fecha" type="date"></div>
      <div class="v-field"><label>Archivo (PDF o imagen)</label>
        <div class="v-file" data-fd-file><span data-fd-file-txt>Adjuntar archivo</span><input type="file" id="fd-archivo" accept="image/*,application/pdf" hidden></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-doc>Guardar</button></div>`);
  }
  async function guardarDocumento() {
    const tipo = document.getElementById("fd-tipo").value;
    const nombre = document.getElementById("fd-nombre").value.trim();
    const fechaDocumento = document.getElementById("fd-fecha").value;
    if (!nombre) { toast("Captura el nombre del documento", "warn"); return; }
    if (!archivoDoc) { toast("Adjunta el archivo", "warn"); return; }
    try {
      const empresa = window.CONTATECK_EMPRESA_PG;
      const empresaId = empresa && empresa.id;
      if (!empresaId) { toast("No se pudo determinar tu empresa todavía; espera unos segundos e inténtalo de nuevo.", "warn"); return; }
      const documentoPath = await subirDocumento(archivoDoc, empresaId);
      const resp = await fetch(backendUrl() + "/api/fiscal/documentos", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ tipo, nombre, documentoPath, fechaDocumento }) });
      const data = await resp.json();
      if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
      closeModal(); toast("Documento guardado"); await render();
    } catch (e) { toast("Error: " + e.message, "warn"); }
  }

  function openNuevaDeclaracion() {
    if (!obligaciones.length) { toast("Primero da de alta al menos una obligación", "warn"); return; }
    openModal(`
      <h2 class="v-h2">Nueva declaración</h2>
      <div class="v-field"><label>Obligación</label><select class="v-inp" id="fdec-obl">${obligaciones.map((o) => `<option value="${o.id}">${o.nombre}</option>`).join("")}</select></div>
      <div class="v-grid2">
        <div class="v-field"><label>Periodo</label><input class="v-inp" id="fdec-periodo" placeholder="Ej. Julio 2026"></div>
        <div class="v-field"><label>Fecha límite</label><input class="v-inp" id="fdec-vence" type="date"></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-guardar-decl>Guardar</button></div>`);
  }
  async function guardarDeclaracion() {
    const obligacionId = document.getElementById("fdec-obl").value;
    const periodo = document.getElementById("fdec-periodo").value.trim();
    const fechaVencimiento = document.getElementById("fdec-vence").value;
    if (!periodo || !fechaVencimiento) { toast("Captura el periodo y la fecha límite", "warn"); return; }
    const resp = await fetch(backendUrl() + "/api/fiscal/declaraciones", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ obligacionId, periodo, fechaVencimiento }) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo guardar", "warn"); return; }
    closeModal(); toast("Declaración registrada"); await render();
  }

  let archivoAcuse = null, declaracionActual = null;
  function openMarcarPresentada(id) {
    declaracionActual = id;
    archivoAcuse = null;
    openModal(`
      <h2 class="v-h2">Marcar declaración como presentada</h2>
      <div class="v-field"><label>Folio del acuse</label><input class="v-inp" id="fm-folio" placeholder="Opcional"></div>
      <div class="v-field"><label>Acuse (PDF o imagen)</label>
        <div class="v-file" data-fm-file><span data-fm-file-txt>Adjuntar acuse (opcional)</span><input type="file" id="fm-archivo" accept="image/*,application/pdf" hidden></div>
      </div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-fis-confirmar-presentada>Confirmar</button></div>`);
  }
  async function confirmarPresentada() {
    const folioAcuse = document.getElementById("fm-folio").value.trim();
    try {
      let documentoPath;
      if (archivoAcuse) {
        const empresa = window.CONTATECK_EMPRESA_PG;
        const empresaId = empresa && empresa.id;
        if (empresaId) documentoPath = await subirDocumento(archivoAcuse, empresaId);
      }
      const resp = await fetch(backendUrl() + "/api/fiscal/declaraciones/" + declaracionActual, {
        method: "PUT", headers: authHeaders(true),
        body: JSON.stringify({ estado: "presentada", folioAcuse: folioAcuse || undefined, documentoPath }),
      });
      const data = await resp.json();
      if (!data.ok) { toast(data.error || "No se pudo actualizar", "warn"); return; }
      closeModal(); toast("Declaración marcada como presentada ✓"); await render();
    } catch (e) { toast("Error: " + e.message, "warn"); }
  }

  async function verDocumento(path) {
    toast("Abriendo documento…");
    const url = await urlFirmada(path);
    if (!url) { toast("No se pudo abrir el documento", "warn"); return; }
    window.open(url, "_blank");
  }

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-fis-nueva-obl]")) { openNuevaObligacion(); return; }
    if (e.target.closest("[data-fis-guardar-obl]")) { guardarObligacion(); return; }
    if (e.target.closest("[data-fis-nuevo-doc]")) { openNuevoDocumento(); return; }
    if (e.target.closest("[data-fis-guardar-doc]")) { guardarDocumento(); return; }
    if (e.target.closest("[data-fis-nueva-decl]")) { openNuevaDeclaracion(); return; }
    if (e.target.closest("[data-fis-guardar-decl]")) { guardarDeclaracion(); return; }
    const marcar = e.target.closest("[data-fis-marcar]"); if (marcar) { openMarcarPresentada(marcar.getAttribute("data-fis-marcar")); return; }
    if (e.target.closest("[data-fis-confirmar-presentada]")) { confirmarPresentada(); return; }
    const ver = e.target.closest("[data-fis-ver-doc]"); if (ver) { verDocumento(ver.getAttribute("data-fis-ver-doc")); return; }
    if (e.target.closest("[data-fd-file]")) { const i = document.getElementById("fd-archivo"); if (i) i.click(); return; }
    if (e.target.closest("[data-fm-file]")) { const i = document.getElementById("fm-archivo"); if (i) i.click(); return; }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "fd-archivo") {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast("El archivo no debe pasar de 5 MB", "warn"); e.target.value = ""; return; }
      archivoDoc = f; const t = document.querySelector("[data-fd-file-txt]"); if (t) t.textContent = f.name + " ✓";
    }
    if (e.target.id === "fm-archivo") {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast("El archivo no debe pasar de 5 MB", "warn"); e.target.value = ""; return; }
      archivoAcuse = f; const t = document.querySelector("[data-fm-file-txt]"); if (t) t.textContent = f.name + " ✓";
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
