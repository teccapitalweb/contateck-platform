/* ============================================================
   CONTATECK · auth-guard.js  (módulo ES)
   Protege el panel: sin sesión → manda a login. Pinta el usuario
   real y maneja "Cerrar sesión". Si no hay config válida, corre
   en modo demo (no bloquea, logout solo regresa a login).
   ============================================================ */
const FB_VER = "12.15.0";
const cfg = window.FIREBASE_CONFIG || {};
const configured = !!cfg.apiKey && cfg.apiKey.indexOf("PEGA") === -1 && cfg.apiKey.indexOf("TU-") === -1;
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
    const [appMod, authMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`),
    ]);
    const { initializeApp } = appMod;
    const { getAuth, onAuthStateChanged, signOut } = authMod;

    const app = initializeApp(cfg);
    const auth = getAuth(app);

    // Evita el "flash" del panel antes de confirmar la sesión
    if (app2) app2.style.visibility = "hidden";

    onAuthStateChanged(auth, (user) => {
      if (!user) { window.location.replace("login.html"); return; }
      paintUser(user.displayName || user.email || "Usuario", "Cerrar sesión");
      if (app2) app2.style.visibility = "";
    });

    logoutEls.forEach((el) =>
      el.addEventListener("click", async () => {
        try { await signOut(auth); } catch (e) {}
        window.location.replace("login.html");
      })
    );
  } catch (e) {
    // Si Firebase no carga, no dejamos el panel oculto
    if (app2) app2.style.visibility = "";
    logoutEls.forEach((el) => el.addEventListener("click", () => { window.location.href = "login.html"; }));
  }
}
