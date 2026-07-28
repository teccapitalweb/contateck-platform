/* ============================================================
   CONTATECK · postgres-crud.js
   OT-0008-C · Helper compartido para escribir (crear/editar/borrar)
   en Postgres: clientes, productos, empleados, pólizas.

   Requiere que auth-guard.js ya haya puesto
   window.CONTATECK_SUPABASE_TOKEN (sesión de Supabase). Si no hay
   sesión o el backend no responde, cada función regresa
   { ok:false, error:"..." } — quien la llama decide si usa un
   respaldo (Firestore/local) o muestra el error, según el caso.
   ============================================================ */
window.CTPostgres = (function () {
  function backendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
  }

  async function llamar(metodo, ruta, body) {
    const token = window.CONTATECK_SUPABASE_TOKEN;
    if (!token) return { ok: false, error: "Sin sesión de Supabase todavía." };
    try {
      const resp = await fetch(backendUrl() + ruta, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await resp.json();
    } catch (e) {
      return { ok: false, error: e.message || "No se pudo conectar con el backend." };
    }
  }

  return {
    crear: function (tabla, body) { return llamar("POST", "/api/registro/" + tabla, body); },
    actualizar: function (tabla, id, body) { return llamar("PUT", "/api/registro/" + tabla + "/" + id, body); },
    eliminar: function (tabla, id) { return llamar("DELETE", "/api/registro/" + tabla + "/" + id); },
  };
})();
