/* ============================================================
   CONTATECK · auth-guard.js  (módulo ES)
   OT-0004 · Protege el panel con Supabase Auth (reemplaza Firebase
   Auth). Mismo comportamiento: sin sesión → manda a login. Pinta
   el usuario real y maneja "Cerrar sesión". Si no hay config
   válida, corre en modo demo (no bloquea).
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
const configured = !!cfg.url && !!cfg.anonKey && cfg.url.indexOf("PEGA") === -1;
const logoutEls = document.querySelectorAll("[data-logout]");

function initials(name) {
  if (!name) return "U";
  const clean = name.split("@")[0].replace(/[._-]+/g, " ").trim();
  const p = clean.split(/\s+/);
  return ((p[0] ? p[0][0] : "") + (p[1] ? p[1][0] : "")).toUpperCase() || name[0].toUpperCase();
}
function paintUser(name, sub) {
  document.querySelectorAll("[data-user-name]").forEach((e) => { e.textContent = name; });
  document.querySelectorAll("[data-user-ini]").forEach((e) => { e.textContent = initials(name); });
  if (sub) document.querySelectorAll("[data-user-sub]").forEach((e) => { e.textContent = sub; });
}

if (!configured) {
  /* ---------- MODO DEMO: no bloquea ---------- */
  logoutEls.forEach((el) => el.addEventListener("click", () => { window.location.href = "login.html"; }));
} else {
  /* ---------- PROTECCIÓN REAL ---------- */
  const app2 = document.querySelector(".app");
  try {
    const supabase = createClient(cfg.url, cfg.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });

    // Evita el "flash" del panel antes de confirmar la sesión.
    if (app2) app2.style.visibility = "hidden";

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (!user) { window.location.replace("login.html"); return; }
      const displayName = user.user_metadata?.full_name || user.email || "Usuario";
      paintUser(displayName, "Cerrar sesión");
      if (app2) app2.style.visibility = "";

      // OT-0008-B: se expone para que data-firestore.js pueda pedir el
      // puente de Firebase Custom Token (ver /api/firebase-token).
      window.CONTATECK_SUPABASE_TOKEN = data.session.access_token;

      // OT-0006 · Fase A: intenta traer empresa/perfil reales de Postgres.
      // Si no hay backend, no hay datos, o algo falla, NO se toca nada —
      // el selector de empresa sigue funcionando con EMPRESAS de data.js
      // exactamente como antes. Esto es un agregado, no un reemplazo.
      try {
        const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
        const authHeader = { Authorization: `Bearer ${data.session.access_token}` };

        // OT-0014: estas 4 llamadas son independientes entre sí (ninguna
        // necesita el resultado de otra), así que antes no había motivo
        // para esperarlas una por una — eso sumaba los tiempos de red en
        // vez de dejarlos correr al mismo tiempo. Con Promise.all, el
        // tiempo total baja al de la más lenta de las 4, no a la suma.
        const [perfilData, catData, opData, cfdisData, empleadosData] = await Promise.all([
          fetch(`${BACKEND}/api/perfil`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/catalogo`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/operacion`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/cfdis`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/empleados`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
        ]);

        // OT-0006 · Fase A: empresa/perfil reales de Postgres.
        if (perfilData.ok && perfilData.fuente === "postgres" && perfilData.empresa) {
          window.CONTATECK_EMPRESA_PG = perfilData.empresa;
          window.CONTATECK_PERFIL_PG = perfilData.perfil;
          document.querySelectorAll("[data-empresa-label]").forEach((el) => {
            el.textContent = perfilData.empresa.nombre;
          });
        }

        // OT-0007 · Fase A: catálogo de clientes/productos.
        if (catData.ok && catData.fuente === "postgres") {
          window.CONTATECK_CLIENTES_PG = catData.clientes || [];
          window.CONTATECK_PRODUCTOS_PG = catData.productos || [];
        }

        // OT-0008 · Fase A: empleados/pólizas.
        if (opData.ok && opData.fuente === "postgres") {
          window.CONTATECK_EMPLEADOS_PG = opData.empleados || [];
          window.CONTATECK_POLIZAS_PG = opData.polizas || [];
        }

        // OT-0012: CFDIs reales.
        if (cfdisData.ok) {
          window.CONTATECK_CFDIS_PG = cfdisData.cfdis || [];
        }

        // Nómina Parte A (OT-0017): empleados reales (columnas según rol).
        if (empleadosData.ok) {
          window.CONTATECK_EMPLEADOS_REAL_PG = empleadosData.empleados || [];
        } else {
          window.CONTATECK_EMPLEADOS_REAL_PG = []; // sin permiso o error: tabla vacía, nunca datos falsos
        }
      } catch (e) {
        // Silencioso a propósito: sin Postgres disponible, sigue el modo local.
      }
    }
    checkSession();

    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.replace("login.html");
    });

    logoutEls.forEach((el) =>
      el.addEventListener("click", async () => {
        try { await supabase.auth.signOut(); } catch (e) {}
        window.location.replace("login.html");
      })
    );
  } catch (e) {
    // Si Supabase no carga, no dejamos el panel oculto.
    if (app2) app2.style.visibility = "";
    logoutEls.forEach((el) => el.addEventListener("click", () => { window.location.href = "login.html"; }));
  }
}
