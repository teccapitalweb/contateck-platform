/* ============================================================
   CONTATECK · auth-registro.js  (módulo ES)
   Crear cuenta con Supabase Auth. Mismo patrón de degradación a
   modo demo que auth-login.js cuando no hay config en
   supabase-config.js (ver ese archivo para el detalle del porqué).
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
const configured = !!cfg.url && !!cfg.anonKey && cfg.url.indexOf("PEGA") === -1;

const $ = (id) => document.getElementById(id);
const btn     = $("btnRegistro");
const btnG    = $("btnGoogleRegistro");
const nombre  = $("nombre");
const email   = $("correo");
const pwd     = $("pwd");
const pwd2    = $("pwd2");
const terms   = $("terms");
const errBox  = $("registerError");
const meter   = $("pwdMeter");

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

/* ---------- Medidor de fuerza de contraseña (visual, no bloquea envío) ---------- */
if (pwd && meter) {
  pwd.addEventListener("input", () => {
    const v = pwd.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v) && /[0-9]/.test(v)) score++;
    if (v.length >= 12 && /[^A-Za-z0-9]/.test(v)) score++;
    meter.className = "pwd-meter" + (v ? " s" + Math.max(1, score) : "");
  });
}

function validate() {
  const n = (nombre?.value || "").trim();
  const e = (email?.value || "").trim();
  const p = pwd?.value || "";
  const p2 = pwd2?.value || "";
  if (!n || !e || !p || !p2) return "Completa todos los campos.";
  if (p.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (p !== p2) return "Las contraseñas no coinciden.";
  if (!terms?.checked) return "Acepta los términos y el aviso de privacidad para continuar.";
  return null;
}

if (!configured) {
  /* ---------- MODO DEMO ---------- */
  note("Modo demo · pega tu configuración en supabase-config.js para activar el registro real.", false);
  const go = () => {
    const err = validate();
    if (err) { note(err, true); return; }
    window.location.href = "dashboard.html";
  };
  if (btn)  btn.addEventListener("click", go);
  if (btnG) btnG.addEventListener("click", go);
} else {
  /* ---------- SUPABASE AUTH REAL ---------- */
  const supabase = createClient(cfg.url, cfg.anonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });

  const ERR_MATCH = [
    [/already registered|user already exists/i, "Ya existe una cuenta con ese correo. Inicia sesión."],
    [/password should be at least/i,             "La contraseña es demasiado corta para Supabase."],
    [/invalid email/i,                            "Ese correo no parece válido."],
    [/too many requests/i,                        "Demasiados intentos. Espera un momento e inténtalo de nuevo."],
    [/network/i,                                  "Sin conexión. Revisa tu internet."],
  ];
  const msgFor = (message) => {
    const match = ERR_MATCH.find(([re]) => re.test(message || ""));
    return match ? match[1] : "No se pudo crear la cuenta. Inténtalo de nuevo.";
  };

  // Revertido a propósito (a petición del cliente): lo correcto es pasar
  // por onboarding.html igual que login.html, pero mientras Railway no
  // tenga ALLOWED_ORIGINS configurado con el dominio de GitHub Pages,
  // onboarding.html se queda atorado en "No pudimos conectar" (bloqueo
  // de CORS del navegador, no un bug de este archivo). En cuanto se
  // corrija esa variable de entorno, regresar esto a "onboarding.html".
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session) window.location.replace("dashboard.html");
  });

  async function emailRegister() {
    clearNote();
    const err = validate();
    if (err) { note(err, true); return; }
    loading(true, btn, "Creando cuenta…");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: pwd.value,
        options: { data: { full_name: nombre.value.trim() } },
      });
      if (error) throw error;
      if (data?.session) {
        window.location.replace("dashboard.html");
      } else {
        note("Cuenta creada. Revisa tu correo para confirmarla antes de entrar.", false);
        loading(false, btn);
      }
    } catch (err) {
      note(msgFor(err.message), true);
      loading(false, btn);
    }
  }

  async function googleRegister() {
    clearNote();
    loading(true, btnG, "Conectando…");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname.replace("registro.html", "dashboard.html") },
      });
      if (error) throw error;
    } catch (err) {
      note(msgFor(err.message), true);
      loading(false, btnG);
    }
  }

  if (btn)  btn.addEventListener("click", emailRegister);
  if (btnG) btnG.addEventListener("click", googleRegister);
  if (pwd2) pwd2.addEventListener("keydown", (e) => { if (e.key === "Enter") emailRegister(); });
}
