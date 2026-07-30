/* ============================================================
   CONTATECK · dashboardService.js
   OT-0013A · Épica 2: Evolución UX/UI

   Único punto de acceso a los datos del Dashboard. Ningún
   componente visual debe leer window.KPIS/FISCAL/BALANCE/etc.
   directamente — todos pasan por aquí. Así, en el futuro, cambiar
   de dónde vienen los datos (otro endpoint, otra agregación) solo
   toca este archivo, nunca los componentes visuales.

   Uso:
     const datos = await window.dashboardService.obtenerDatos();
     if (datos.ok) { ... datos.facturacion, datos.operacion, etc. }
   ============================================================ */
window.dashboardService = (function () {
  function backendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
  }

  // Espera a que auth-guard.js deje lista la sesión (mismo patrón que
  // ya usan cargarCfdisPostgres/mezclarOperacionPostgres en data-firestore.js).
  async function esperarSesion(maxMs = 5000) {
    const start = Date.now();
    while (!window.CONTATECK_SUPABASE_TOKEN && Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  let cache = null;

  async function obtenerDatos({ forzarRecarga = false } = {}) {
    if (cache && !forzarRecarga) return cache;

    await esperarSesion();
    const token = window.CONTATECK_SUPABASE_TOKEN;
    if (!token) {
      return { ok: false, error: "Sin sesión todavía." };
    }

    try {
      const resp = await fetch(backendUrl() + "/api/dashboard", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await resp.json();
      if (data.ok) cache = data;
      return data;
    } catch (e) {
      return { ok: false, error: e.message || "No se pudo conectar con el backend." };
    }
  }

  function invalidarCache() { cache = null; }

  return { obtenerDatos, invalidarCache };
})();
