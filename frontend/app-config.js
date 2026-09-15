/* ============================================================
   CONTATECK · app-config.js
   OT-0005 · Config del entorno del frontend (no de credenciales).

   Detección AUTOMÁTICA de entorno — ya no hay nada que prender
   ni apagar a mano:
     · Si la página corre en localhost/127.0.0.1 (Live Server en
       tu compu) → usa el backend LOCAL (npm start, puerto 8080).
     · En cualquier otro dominio (GitHub Pages, producción) → usa
       el backend de Railway.

   Así es imposible subir por accidente una config apuntando a
   localhost: el mismo archivo funciona en todos lados.
   ============================================================ */
window.APP_CONFIG = {
  BACKEND_URL: (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://contateck-backend-production.up.railway.app",
};
