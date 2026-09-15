/* ============================================================
   CONTATECK · app-config.js
   OT-0005 · Config del entorno del frontend (no de credenciales).

   Detección AUTOMÁTICA de entorno — nada que prender/apagar:
     · localhost/127.0.0.1 (Live Server) → backend LOCAL (:8080).
     · Cualquier otro dominio (GitHub Pages) → backend de Railway.

   URL de Railway verificada contra el dominio real del servicio
   (Deployments → contateck-platform-production.up.railway.app).
   Si algún día cambia el dominio en Railway, este es EL ÚNICO
   lugar del frontend donde hay que actualizarlo.
   ============================================================ */
window.APP_CONFIG = {
  BACKEND_URL: (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://contateck-platform-production.up.railway.app",
};
