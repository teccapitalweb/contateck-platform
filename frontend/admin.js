/* ============================================================
   CONTATECK · admin.js (módulo ES)
   OT-0037 · Administración de PLATAFORMA (solo lectura).

   El navegador NO decide quién es administrador: pide /api/plataforma/yo y el
   backend responde. Todo el texto que viene de la base se escapa antes de
   pintarlo (esc / DOM por textContent).
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
const supabase = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("es-MX"));
const fecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function aviso(titulo, texto, extraHtml) {
  const el = $("admEstado");
  el.hidden = false;
  $("admContenido").hidden = true;
  el.innerHTML = "<h2>" + esc(titulo) + "</h2><p class=\"muted\">" + texto + "</p>" + (extraHtml || "");
}

async function api(ruta) {
  const { data } = await supabase.auth.getSession();
  if (!data || !data.session) { window.location.replace("login.html"); throw new Error("sin sesión"); }
  const r = await fetch(BACKEND + "/api/plataforma" + ruta, { headers: { Authorization: "Bearer " + data.session.access_token } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* respuesta sin JSON */ }
  if (r.status === 401) { window.location.replace("login.html"); throw new Error("sesión vencida"); }
  if (!r.ok || !j || !j.ok) throw Object.assign(new Error((j && j.error) || "Error del servidor"), { status: r.status });
  return j;
}

/* ---------- Pintado ---------- */
function pintarKpis(r) {
  const k = [
    ["Empresas", r.empresas], ["Usuarios", r.usuarios], ["Pólizas", r.polizas], ["CFDI", r.cfdis],
    ["Invitaciones pendientes", r.invitacionesPendientes], ["Movimientos (7 días)", r.movimientos7dias],
  ];
  $("admKpis").innerHTML = k.map(([t, v]) => "<div class=\"adm__kpi\"><small>" + esc(t) + "</small><b>" + num(v) + "</b></div>").join("");
}

function pintarEmpresas(lista) {
  if (!lista.length) { $("admEmpresas").innerHTML = "<tr><td class=\"muted\">Aún no hay empresas.</td></tr>"; return; }
  $("admEmpresas").innerHTML =
    "<thead><tr><th>Empresa</th><th>RFC</th><th>Plan</th><th>Estado</th><th class=\"num\">Usuarios</th><th class=\"num\">Pólizas</th><th class=\"num\">CFDI</th><th>Último acceso</th><th>Última actividad</th></tr></thead><tbody>" +
    lista.map((e) => {
      const activa = e.status === "activo" && e.estado !== "suspendida";
      return "<tr class=\"is-click\" data-emp=\"" + esc(e.id) + "\" data-nombre=\"" + esc(e.nombre) + "\">" +
        "<td><b>" + esc(e.nombre) + "</b></td><td class=\"muted\">" + esc(e.rfc || "—") + "</td><td>" + esc(e.plan || "—") + "</td>" +
        "<td><span class=\"pill " + (activa ? "pill--ok" : "pill--off") + "\">" + esc(activa ? "Activa" : (e.status || e.estado || "—")) + "</span></td>" +
        "<td class=\"num\">" + num(e.usuariosActivos) + " / " + num(e.usuarios) + "</td><td class=\"num\">" + num(e.polizas) + "</td><td class=\"num\">" + num(e.cfdis) + "</td>" +
        "<td class=\"muted\">" + esc(fecha(e.ultimoAcceso)) + "</td><td class=\"muted\">" + esc(fecha(e.ultimaActividad)) + "</td></tr>";
    }).join("") + "</tbody>";
  $("admEmpresas").querySelectorAll("tr.is-click").forEach((tr) => {
    tr.addEventListener("click", () => verUsuarios(tr.dataset.emp, tr.dataset.nombre));
  });
}

async function verUsuarios(id, nombre) {
  const card = $("admUsuariosCard");
  card.hidden = false;
  $("admUsuariosTitulo").textContent = "Usuarios · " + nombre;
  $("admUsuarios").innerHTML = "<tr><td class=\"muted\">Cargando…</td></tr>";
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const r = await api("/empresas/" + encodeURIComponent(id) + "/usuarios");
    $("admUsuarios").innerHTML =
      "<thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Correo confirmado</th><th>Último acceso</th><th>Desde</th></tr></thead><tbody>" +
      r.usuarios.map((u) =>
        "<tr><td>" + esc(u.nombre || "—") + "</td><td>" + esc(u.email || "—") + "</td><td><span class=\"pill pill--gris\">" + esc(u.rol || "—") + "</span></td>" +
        "<td><span class=\"pill " + (u.activo ? "pill--ok" : "pill--off") + "\">" + (u.activo ? "Activo" : "De baja") + "</span></td>" +
        "<td>" + (u.correoConfirmado == null ? "—" : (u.correoConfirmado ? "Sí" : "No")) + "</td>" +
        "<td class=\"muted\">" + esc(fecha(u.ultimoAcceso)) + "</td><td class=\"muted\">" + esc(fecha(u.desde)) + "</td></tr>").join("") + "</tbody>";
  } catch (e) {
    $("admUsuarios").innerHTML = "<tr><td class=\"muted\">" + esc(e.message) + "</td></tr>";
  }
}

function fila(k, v, ok) {
  const clase = ok === true ? "pill--ok" : ok === false ? "pill--off" : "pill--gris";
  return "<div class=\"adm__sal\"><span>" + esc(k) + "</span><span class=\"pill " + clase + "\">" + esc(v) + "</span></div>";
}
function pintarSalud(s) {
  $("admSalud").innerHTML =
    fila("Backend", "Activo · " + num(s.backend.activoMinutos) + " min", true) +
    fila("Base de datos (Supabase)", s.supabase.ok ? "Responde · " + s.supabase.ms + " ms" : "Sin respuesta", s.supabase.ok) +
    fila("Timbrado (Fiscalapi)", s.fiscalapi.ambiente, s.fiscalapi.ambiente === "PRODUCCIÓN" ? true : null) +
    fila("Llaves de timbrado", s.fiscalapi.llavesConfiguradas ? "Configuradas" : "Faltan", s.fiscalapi.llavesConfiguradas) +
    fila("Sesión obligatoria en la API", s.seguridad.autenticacionObligatoria ? "Sí" : "No", s.seguridad.autenticacionObligatoria) +
    fila("CORS", s.seguridad.corsAbiertoATodos ? "Abierto a todos" : "Restringido", !s.seguridad.corsAbiertoATodos) +
    fila("Firebase (heredado)", s.firebaseHeredado ? "Conectado" : "No configurado", null) +
    "<p class=\"adm__nota\">Solo se muestran banderas; nunca llaves ni contraseñas.</p>";
}

function pintarActividad(lista) {
  if (!lista.length) { $("admActividad").innerHTML = "<tr><td class=\"muted\">Sin movimientos registrados.</td></tr>"; return; }
  $("admActividad").innerHTML =
    "<thead><tr><th>Fecha</th><th>Empresa</th><th>Usuario</th><th>Módulo</th><th>Acción</th></tr></thead><tbody>" +
    lista.map((a) =>
      "<tr><td class=\"muted\">" + esc(fecha(a.fecha)) + "</td><td>" + esc(a.empresa || "—") + "</td><td class=\"muted\">" + esc(a.usuario || "—") + "</td>" +
      "<td>" + esc(a.modulo || "—") + "</td><td>" + esc((a.accion || "—") + (a.tabla ? " · " + a.tabla : "")) + "</td></tr>").join("") + "</tbody>";
}

async function cargarTodo() {
  const btn = $("admRecargar");
  btn.disabled = true; btn.textContent = "Actualizando…";
  try {
    const [res, emp, act, sal] = await Promise.all([api("/resumen"), api("/empresas"), api("/actividad?limite=40"), api("/salud")]);
    pintarKpis(res.resumen); pintarEmpresas(emp.empresas); pintarActividad(act.actividad); pintarSalud(sal.salud);
  } catch (e) {
    if (e.message !== "sin sesión" && e.message !== "sesión vencida") aviso("No se pudo cargar", esc(e.message));
  } finally {
    btn.disabled = false; btn.textContent = "Actualizar";
  }
}

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (!data || !data.session) { window.location.replace("login.html"); return; }
  $("admCorreo").textContent = data.session.user.email || "";

  let yo;
  try { yo = await api("/yo"); }
  catch (e) {
    if (e.message === "sin sesión" || e.message === "sesión vencida") return;
    aviso("No pudimos conectar", "No logramos comunicarnos con el servidor. Intenta de nuevo en un momento.", "<p><button class=\"adm__btn\" onclick=\"location.reload()\">Reintentar</button></p>");
    return;
  }
  if (!yo.esAdmin) {
    if (yo.tablaFaltante) {
      aviso("Falta un paso de instalación", "La tabla <code>administradores_plataforma</code> todavía no existe en la base. Corre <code>database/OT-0037-administradores-plataforma.sql</code> en el SQL Editor de Supabase y recarga.");
    } else {
      aviso("Sin acceso", "Esta cuenta no es administradora de la plataforma.", "<p><a class=\"adm__btn\" href=\"dashboard.html\">Ir al panel de mi empresa</a></p>");
    }
    return;
  }

  $("admEstado").hidden = true;
  $("admContenido").hidden = false;
  // Si además pertenece a una empresa, ofrece el atajo al panel normal.
  fetch(BACKEND + "/api/onboarding/estado", { headers: { Authorization: "Bearer " + data.session.access_token } })
    .then((r) => r.json()).then((s) => { if (s && s.ok && s.tienePerfil) $("admIrPanel").hidden = false; }).catch(() => {});
  await cargarTodo();
}

$("admRecargar").addEventListener("click", cargarTodo);
$("admCerrarUsuarios").addEventListener("click", () => { $("admUsuariosCard").hidden = true; });
$("admSalir").addEventListener("click", async () => { try { await supabase.auth.signOut(); } catch (e) { /* ya sin sesión */ } window.location.replace("login.html"); });
iniciar();
