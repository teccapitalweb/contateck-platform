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

      // OT-0006 · Fase A: intenta traer empresa/perfil reales de Postgres.
      // Si no hay backend, no hay datos, o algo falla, NO se toca nada —
      // el selector de empresa sigue funcionando con EMPRESAS de data.js
      // exactamente como antes. Esto es un agregado, no un reemplazo.
      try {
        const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
        const resp = await fetch(`${BACKEND}/api/perfil`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const perfilData = await resp.json();
        if (perfilData.ok && perfilData.fuente === "postgres" && perfilData.empresa) {
          window.CONTATECK_EMPRESA_PG = perfilData.empresa;
          window.CONTATECK_PERFIL_PG = perfilData.perfil;
          document.querySelectorAll("[data-empresa-label]").forEach((el) => {
            el.textContent = perfilData.empresa.nombre;
          });
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
