/* ============================================================
   CONTATECK · auth-login.js  (módulo ES)
   Login real con Firebase Auth. Si no hay config válida en
   firebase-config.js, degrada a modo demo (navega sin validar).
   Importa Firebase de forma dinámica: en modo demo NO toca la red.
   ============================================================ */
const FB_VER = "12.15.0";
const cfg = window.FIREBASE_CONFIG || {};
const configured = !!cfg.apiKey && cfg.apiKey.indexOf("PEGA") === -1 && cfg.apiKey.indexOf("TU-") === -1;

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
  note("Modo demo · pega tu configuración en firebase-config.js para activar el acceso real.", false);
  const go = () => { window.location.href = "dashboard.html"; };
  if (btn)  btn.addEventListener("click", go);
  if (btnG) btnG.addEventListener("click", go);
  if (pwd)  pwd.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
} else {
  /* ---------- FIREBASE AUTH REAL ---------- */
  const ERR = {
    "auth/invalid-email": "El correo no es válido.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/missing-password": "Escribe tu contraseña.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.",
    "auth/cancelled-popup-request": "Hay otra ventana de acceso abierta.",
    "auth/operation-not-allowed": "Este método de acceso no está habilitado en Firebase.",
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Authentication.",
  };
  const msgFor = (code) => ERR[code] || "No se pudo iniciar sesión. Inténtalo de nuevo.";

  try {
    const [appMod, authMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`),
    ]);
    const { initializeApp } = appMod;
    const {
      getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence,
      signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged,
    } = authMod;

    const app = initializeApp(cfg);
    const auth = getAuth(app);
    auth.useDeviceLanguage();

    // Si ya hay sesión activa, directo al panel
    onAuthStateChanged(auth, (u) => { if (u) window.location.replace("dashboard.html"); });

    const persist = async () =>
      setPersistence(auth, remember && remember.checked ? browserLocalPersistence : browserSessionPersistence);

    async function emailLogin() {
      clearNote();
      const e = (email.value || "").trim();
      const p = pwd.value || "";
      if (!e || !p) { note("Escribe tu correo y contraseña.", true); return; }
      loading(true, btn, "Entrando…");
      try {
        await persist();
        await signInWithEmailAndPassword(auth, e, p); // onAuthStateChanged redirige
      } catch (err) { note(msgFor(err.code), true); loading(false, btn); }
    }

    async function googleLogin() {
      clearNote();
      loading(true, btnG, "Conectando…");
      try {
        await persist();
        await signInWithPopup(auth, new GoogleAuthProvider()); // onAuthStateChanged redirige
      } catch (err) { note(msgFor(err.code), true); loading(false, btnG); }
    }

    if (btn)  btn.addEventListener("click", emailLogin);
    if (btnG) btnG.addEventListener("click", googleLogin);
    if (pwd)  pwd.addEventListener("keydown", (e) => { if (e.key === "Enter") emailLogin(); });
    if (email) email.addEventListener("keydown", (e) => { if (e.key === "Enter" && pwd) pwd.focus(); });
  } catch (e) {
    note("No se pudo cargar Firebase. Revisa tu conexión y la configuración.", true);
    // Fallback: que el botón al menos navegue para no bloquear pruebas
    if (btn) btn.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  }
}
