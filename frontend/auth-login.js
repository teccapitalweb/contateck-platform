/* ============================================================
   CONTATECK · auth-login.js  (módulo ES)
   OT-0004 · Login real con Supabase Auth (reemplaza Firebase Auth).
   Si no hay config válida en supabase-config.js, degrada a modo
   demo (navega sin validar) — mismo patrón que el archivo anterior.

   Diferencias de comportamiento respecto a la versión con Firebase
   (documentadas también en docs/work-orders/OT-0004.md):
   - Login con Google: Supabase usa redirección de página completa
     (signInWithOAuth), no una ventana emergente como signInWithPopup
     de Firebase. El usuario sale de la página y regresa a dashboard.html.
   - Los mensajes de error de Supabase son texto libre (error.message),
     no códigos como "auth/wrong-password"; se mapean por coincidencia
     de texto en vez de por código exacto.
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
const configured = !!cfg.url && !!cfg.anonKey && cfg.url.indexOf("PEGA") === -1;

const $ = (id) => document.getElementById(id);
const btn   = $("btnLogin");
const btnG  = $("btnGoogle");
const email = $("correo");
const pwd   = $("pwd");
const errBox = $("loginError");
const remember = document.querySelector('.check input[type="checkbox"]');

function note(msg, isErr) {
  if (!errBox) return;
  errBox.textContent = msg;
  errBox.className = "form-error is-shown" + (isErr ? "" : " is-note");
}
function clearNote() { if (errBox) { errBox.className = "form-error"; errBox.textContent = ""; } }
function loading(on, el, txt) {
  if (!el) return;
  if (on) { el.dataset.lbl = el.dataset.lbl || el.textContent; el.textContent = txt; el.disabled = true; el.style.opacity = ".7"; }
  else { el.textContent = el.dataset.lbl || el.textContent; el.disabled = false; el.style.opacity = ""; }
}

if (!configured) {
  /* ---------- MODO DEMO ---------- */
  note("Modo demo · pega tu configuración en supabase-config.js para activar el acceso real.", false);
  const go = () => { window.location.href = "dashboard.html"; };
  if (btn)  btn.addEventListener("click", go);
  if (btnG) btnG.addEventListener("click", go);
  if (pwd)  pwd.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
} else {
  /* ---------- SUPABASE AUTH REAL ---------- */

  // "Recordar sesión" (checkbox) → localStorage; si no, sessionStorage.
  // Se resuelve en el momento del login, no al cargar el cliente.
  let persistLocally = true;
  const dynamicStorage = {
    getItem: (key) => (persistLocally ? window.localStorage : window.sessionStorage).getItem(key),
    setItem: (key, value) => (persistLocally ? window.localStorage : window.sessionStorage).setItem(key, value),
    removeItem: (key) => (persistLocally ? window.localStorage : window.sessionStorage).removeItem(key),
  };

  const supabase = createClient(cfg.url, cfg.anonKey, {
    auth: { storage: dynamicStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });

  const ERR_MATCH = [
    [/invalid login credentials/i, "Correo o contraseña incorrectos."],
    [/email not confirmed/i,        "Confirma tu correo antes de entrar."],
    [/user not found/i,             "No existe una cuenta con ese correo."],
    [/too many requests/i,          "Demasiados intentos. Espera un momento e inténtalo de nuevo."],
    [/network/i,                    "Sin conexión. Revisa tu internet."],
  ];
  const msgFor = (message) => {
    const match = ERR_MATCH.find(([re]) => re.test(message || ""));
    return match ? match[1] : "No se pudo iniciar sesión. Inténtalo de nuevo.";
  };

  // Si ya hay sesión activa, deja que onboarding.html decida el destino
  // final (panel real / crear empresa / invitación pendiente).
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session) window.location.replace("onboarding.html");
  });

  async function emailLogin() {
    clearNote();
    const e = (email.value || "").trim();
    const p = pwd.value || "";
    if (!e || !p) { note("Escribe tu correo y contraseña.", true); return; }
    persistLocally = !!(remember && remember.checked);
    loading(true, btn, "Entrando…");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
      if (error) throw error;
      window.location.replace("onboarding.html");
    } catch (err) {
      note(msgFor(err.message), true);
      loading(false, btn);
    }
  }

  async function googleLogin() {
    clearNote();
    persistLocally = !!(remember && remember.checked);
    loading(true, btnG, "Conectando…");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname.replace("login.html", "onboarding.html") },
      });
      if (error) throw error;
      // No hay redirect manual aquí: Supabase navega la página completa a Google
      // y de regreso a redirectTo — a diferencia del popup que usaba Firebase.
    } catch (err) {
      note(msgFor(err.message), true);
      loading(false, btnG);
    }
  }

  // ---------- Registro (Fase 1 — reemplaza "Solicita acceso") ----------
  async function emailSignUp() {
    clearNote();
    const e = (email.value || "").trim();
    const p = pwd.value || "";
    if (!e || !p) { note("Escribe tu correo y contraseña.", true); return; }
    if (p.length < 6) { note("La contraseña debe tener al menos 6 caracteres.", true); return; }
    const btnReg = $("btnRegistro");
    loading(true, btnReg, "Creando cuenta…");
    try {
      const { error } = await supabase.auth.signUp({ email: e, password: p });
      if (error) throw error;
      window.location.replace("onboarding.html");
    } catch (err) {
      note(msgFor(err.message), true);
      loading(false, btnReg);
    }
  }
  const btnRegistro = $("btnRegistro");
  if (btnRegistro) btnRegistro.addEventListener("click", emailSignUp);

  // ---------- Toggle login / registro ----------
  const toggleLink = $("authToggleLink");
  const toggleTxt = $("authToggleTxt");
  const authTitle = $("authTitle");
  const authSub = $("authSub");
  let modoRegistro = false;
  function aplicarModo() {
    clearNote();
    if (btn) btn.style.display = modoRegistro ? "none" : "";
    if (btnRegistro) btnRegistro.style.display = modoRegistro ? "" : "none";
    if (authTitle) authTitle.textContent = modoRegistro ? "Crear cuenta" : "Iniciar sesión";
    if (authSub) authSub.textContent = modoRegistro ? "Regístrate para empezar a usar Contateck." : "Accede al panel contable de tu empresa.";
    if (toggleTxt && toggleLink) {
      toggleTxt.innerHTML = modoRegistro ? '¿Ya tienes cuenta? <a href="#" class="link" id="authToggleLink">Inicia sesión</a>' : '¿Aún no tienes cuenta? <a href="#" class="link" id="authToggleLink">Crea una aquí</a>';
      $("authToggleLink").addEventListener("click", onToggleClick);
    }
  }
  function onToggleClick(e) {
    e.preventDefault();
    modoRegistro = !modoRegistro;
    aplicarModo();
  }
  if (toggleLink) toggleLink.addEventListener("click", onToggleClick);

  if (btn)  btn.addEventListener("click", emailLogin);
  if (btnG) btnG.addEventListener("click", googleLogin);
  if (pwd)  pwd.addEventListener("keydown", (e) => { if (e.key === "Enter") emailLogin(); });
  if (email) email.addEventListener("keydown", (e) => { if (e.key === "Enter" && pwd) pwd.focus(); });
}
