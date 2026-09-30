// ============================================================
//  CONTATECK · Módulo Invitaciones + Equipo (Fase 1 completa)
//  Solo rh/admin/director. Cambiar el ROL de alguien (no solo
//  activar/desactivar) queda restringido a admin/director — el
//  backend es quien de verdad lo exige, esto es solo para no
//  mostrar un botón que de todos modos va a ser rechazado.
// ============================================================
(function () {
  "use strict";

  const ROLES_GESTIONAN = ["rh", "admin", "director"];
  const ROLES_CAMBIAN_ROL = ["admin", "director"];
  const ROLES_DISPONIBLES = ["director", "admin", "contador", "vendedor", "rh", "auditor"];
  const ESTADOS_INV = {
    pendiente: { txt: "Pendiente", cls: "v-badge--warn" },
    aceptada: { txt: "Aceptada", cls: "v-badge--ok" },
    cancelada: { txt: "Cancelada", cls: "v-badge--bad" },
    expirada: { txt: "Expirada", cls: "v-badge--bad" },
  };

  function backendUrl() { return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app"; }
  function authHeaders(json) { const h = json ? { "Content-Type": "application/json" } : {}; const t = window.CONTATECK_SUPABASE_TOKEN; if (t) h.Authorization = "Bearer " + t; return h; }
  function miPerfil() { return window.CONTATECK_PERFIL_PG || null; }
  function miId() { const p = miPerfil(); return p ? p.id : null; }
  function miRol() { const p = miPerfil(); return p ? p.rol : null; }
  function puedeGestionar() { return ROLES_GESTIONAN.indexOf(miRol()) !== -1; }
  function puedeCambiarRol() { return ROLES_CAMBIAN_ROL.indexOf(miRol()) !== -1; }
  async function esperarPerfil(maxMs) {
    maxMs = maxMs || 5000; const start = Date.now();
    while (!window.CONTATECK_PERFIL_PG && Date.now() - start < maxMs) await new Promise((r) => setTimeout(r, 150));
  }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(f);
    if (isNaN(d)) return f;
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }
  function estaVencida(inv) { return inv.estado === "pendiente" && new Date(inv.expira_en) < new Date(); }
  function toast(msg, tipo) {
    let t = document.createElement("div");
    t.className = "v-toast v-toast--" + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  let roles = [], invitaciones = [], equipo = [];
  let tabActual = "invitaciones";

  async function cargarRoles() {
    try {
      const cfg = window.SUPABASE_CONFIG, t = window.CONTATECK_SUPABASE_TOKEN;
      if (!cfg || !t) return;
      const resp = await fetch(cfg.url + "/rest/v1/roles?select=id,nombre", { headers: { Authorization: "Bearer " + t, apikey: cfg.anonKey } });
      roles = await resp.json();
      if (!Array.isArray(roles)) roles = [];
    } catch (e) { roles = []; }
  }
  async function cargarInvitaciones() {
    try {
      const resp = await fetch(backendUrl() + "/api/onboarding/invitaciones", { headers: authHeaders(false) });
      const data = await resp.json();
      invitaciones = data.ok ? (data.invitaciones || []) : [];
      if (!data.ok && data.error) toast(data.error, "warn");
    } catch (e) { invitaciones = []; toast("Sin conexión con el backend.", "warn"); }
  }
  async function cargarEquipo() {
    try {
      const resp = await fetch(backendUrl() + "/api/equipo", { headers: authHeaders(false) });
      const data = await resp.json();
      equipo = data.ok ? (data.equipo || []) : [];
      if (!data.ok && data.error) toast(data.error, "warn");
    } catch (e) { equipo = []; toast("Sin conexión con el backend.", "warn"); }
  }
  function nombreRol(rolId) { const r = roles.find((x) => x.id === rolId); return r ? r.nombre : "—"; }

  async function ocultarSegunRol() {
    await esperarPerfil();
    const navItem = document.querySelector('.nav-item[data-view="invitaciones"]');
    if (navItem) navItem.style.display = puedeGestionar() ? "" : "none";
  }

  async function render() {
    const root = document.querySelector("[data-inv-root]");
    if (!root) return;
    await esperarPerfil();

    if (!puedeGestionar()) {
      root.innerHTML = `
        <div class="page-head"><div><h1>Invitaciones</h1><p>Gestión del equipo</p></div></div>
        <div class="card"><p style="padding:1.5rem;text-align:center;color:var(--faint)">Solo RH/Admin/Director pueden gestionar el equipo.</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Equipo</h1><p>Invita personas, y administra quién tiene acceso activo</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" data-inv-nueva><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nueva invitación</button></div>
      </div>
      <div class="v-filtros" style="margin-bottom:1rem">
        <button class="v-chip ${tabActual === "invitaciones" ? "is-on" : ""}" data-inv-tab="invitaciones">Invitaciones</button>
        <button class="v-chip ${tabActual === "equipo" ? "is-on" : ""}" data-inv-tab="equipo">Miembros del equipo</button>
      </div>
      <div data-inv-tabcontent></div>`;

    await Promise.all([cargarRoles(), cargarInvitaciones(), cargarEquipo()]);
    renderTab();
  }

  function renderTab() {
    const host = document.querySelector("[data-inv-tabcontent]");
    if (!host) return;
    document.querySelectorAll("[data-inv-tab]").forEach((b) => b.classList.toggle("is-on", b.getAttribute("data-inv-tab") === tabActual));
    if (tabActual === "invitaciones") {
      host.innerHTML = `
        <div class="card" style="margin-bottom:1.2rem">
          <p style="padding:1rem 1.3rem;margin:0;font-size:.85rem;color:var(--muted)">
            El envío automático de correo todavía no está activo — comparte tú mismo el aviso con la persona invitada. En cuanto inicie sesión con ese mismo correo, quedará asignada sola a tu empresa.
          </p>
        </div>
        <div class="card">
          <div class="card__head"><h3>Invitaciones enviadas</h3></div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Correo</th><th>Rol</th><th>Enviada</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody data-inv-rows></tbody></table></div>
        </div>`;
      renderInvitaciones();
    } else {
      host.innerHTML = `
        <div class="card">
          <div class="card__head"><h3>Miembros del equipo</h3></div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Desde</th><th>Estado</th><th></th></tr></thead><tbody data-eq-rows></tbody></table></div>
        </div>`;
      renderEquipo();
    }
  }

  function renderInvitaciones() {
    const tb = document.querySelector("[data-inv-rows]");
    if (!tb) return;
    if (!invitaciones.length) { tb.innerHTML = '<tr><td colspan="6" class="v-empty">Sin invitaciones enviadas todavía.</td></tr>'; return; }
    tb.innerHTML = invitaciones.map((i) => {
      const vencida = estaVencida(i);
      const e = ESTADOS_INV[vencida ? "expirada" : i.estado] || ESTADOS_INV.pendiente;
      let acciones = "";
      if (i.estado === "pendiente" || i.estado === "expirada" || vencida) {
        acciones += `<button class="v-mini v-mini--ok" data-inv-reenviar="${i.id}">Reenviar</button>`;
      }
      if (i.estado === "pendiente" && !vencida) {
        acciones += `<button class="v-mini v-mini--bad" data-inv-cancelar="${i.id}">Cancelar</button>`;
      }
      return `<tr><td>${i.correo}</td><td>${nombreRol(i.rol_id)}</td><td>${fmtFecha(i.created_at)}</td><td>${fmtFecha(i.expira_en)}</td><td><span class="v-badge ${e.cls}">${e.txt}</span></td><td>${acciones}</td></tr>`;
    }).join("");
  }

  function renderEquipo() {
    const tb = document.querySelector("[data-eq-rows]");
    if (!tb) return;
    if (!equipo.length) { tb.innerHTML = '<tr><td colspan="6" class="v-empty">Sin miembros todavía.</td></tr>'; return; }
    tb.innerHTML = equipo.map((m) => {
      const rolNombre = m.roles ? m.roles.nombre : "—";
      const soyYo = m.id === miId();
      let acciones = "";
      if (!soyYo) {
        acciones = m.activo
          ? `<button class="v-mini v-mini--bad" data-eq-baja="${m.id}">Dar de baja</button>`
          : `<button class="v-mini v-mini--ok" data-eq-alta="${m.id}">Reactivar</button>`;
      } else {
        acciones = '<span style="color:var(--faint);font-size:.76rem">Tú</span>';
      }
      return `<tr><td>${m.nombre || "—"}</td><td>${m.email || "—"}</td><td>${rolNombre}</td><td>${fmtFecha(m.created_at)}</td>` +
        `<td><span class="v-badge ${m.activo ? "v-badge--ok" : "v-badge--bad"}">${m.activo ? "Activo" : "Dado de baja"}</span></td><td>${acciones}</td></tr>`;
    }).join("");
  }

  // ---------- Modal ----------
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

  function openNuevaInvitacion() {
    const opciones = ROLES_DISPONIBLES.map((r) => {
      const rr = roles.find((x) => x.nombre === r);
      return rr ? `<option value="${rr.id}">${r[0].toUpperCase() + r.slice(1)}</option>` : "";
    }).join("");
    openModal(`
      <h2 class="v-h2">Nueva invitación</h2>
      <div class="v-field"><label>Correo de la persona</label><input class="v-inp" id="inv-correo" type="email" placeholder="nombre@correo.com"></div>
      <div class="v-field"><label>Rol</label><select class="v-inp" id="inv-rol">${opciones}</select></div>
      <div class="v-modal__foot"><button class="btn btn--ghost" data-v-close>Cancelar</button><button class="btn btn--primary" data-inv-guardar>Enviar invitación</button></div>`);
  }
  let enviandoInvitacion = false;
  async function guardarInvitacion() {
    if (enviandoInvitacion) return; // protección extra: aunque se reabra el modal, nunca 2 envíos a la vez
    const correo = document.getElementById("inv-correo").value.trim();
    const rolId = document.getElementById("inv-rol").value;
    if (!correo || !correo.includes("@")) { toast("Captura un correo válido", "warn"); return; }
    enviandoInvitacion = true;
    const btn = document.querySelector("[data-inv-guardar]");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
    try {
      const resp = await fetch(backendUrl() + "/api/onboarding/invitaciones", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ correo, rolId }) });
      const data = await resp.json();
      if (!data.ok) { toast(data.error || "No se pudo enviar la invitación", "warn"); return; }
      closeModal(); toast("Invitación creada — avísale tú mismo por ahora"); await render();
    } catch (e) {
      toast("Error: " + e.message, "warn");
    } finally {
      enviandoInvitacion = false;
      if (btn) { btn.disabled = false; btn.textContent = "Enviar invitación"; }
    }
  }
  async function reenviarInvitacion(id) {
    const resp = await fetch(backendUrl() + "/api/onboarding/invitaciones/" + id + "/reenviar", { method: "PUT", headers: authHeaders(true) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo reenviar", "warn"); return; }
    toast("Invitación renovada 7 días más"); await render();
  }
  async function cancelarInvitacion(id) {
    const resp = await fetch(backendUrl() + "/api/onboarding/invitaciones/" + id + "/cancelar", { method: "PUT", headers: authHeaders(true) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo cancelar", "warn"); return; }
    toast("Invitación cancelada"); await render();
  }
  async function darDeBaja(id) {
    const resp = await fetch(backendUrl() + "/api/equipo/" + id + "/estado", { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ activo: false }) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo dar de baja", "warn"); return; }
    toast("Persona dada de baja — su historial se conserva"); await render();
  }
  async function reactivar(id) {
    const resp = await fetch(backendUrl() + "/api/equipo/" + id + "/estado", { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ activo: true }) });
    const data = await resp.json();
    if (!data.ok) { toast(data.error || "No se pudo reactivar", "warn"); return; }
    toast("Persona reactivada"); await render();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-inv-nueva]")) { openNuevaInvitacion(); return; }
    if (e.target.closest("[data-inv-guardar]")) { guardarInvitacion(); return; }
    const reenv = e.target.closest("[data-inv-reenviar]"); if (reenv) { reenviarInvitacion(reenv.getAttribute("data-inv-reenviar")); return; }
    const canc = e.target.closest("[data-inv-cancelar]"); if (canc) { cancelarInvitacion(canc.getAttribute("data-inv-cancelar")); return; }
    const baja = e.target.closest("[data-eq-baja]"); if (baja) { darDeBaja(baja.getAttribute("data-eq-baja")); return; }
    const alta = e.target.closest("[data-eq-alta]"); if (alta) { reactivar(alta.getAttribute("data-eq-alta")); return; }
    const tab = e.target.closest("[data-inv-tab]"); if (tab) { tabActual = tab.getAttribute("data-inv-tab"); renderTab(); return; }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest('.nav-item[data-view="invitaciones"]')) setTimeout(render, 30);
  });

  function maybeRender() {
    const sec = document.querySelector('section[data-view="invitaciones"]');
    if (sec && sec.classList.contains("is-active")) render();
  }
  if (document.readyState !== "loading") { setTimeout(maybeRender, 50); setTimeout(ocultarSegunRol, 50); }
  else document.addEventListener("DOMContentLoaded", () => { setTimeout(maybeRender, 50); setTimeout(ocultarSegunRol, 50); });
})();
