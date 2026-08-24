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
    // Simétrica de eliminar() para tablas con baja suave (cuentas_contables).
    // Ruta pendiente de confirmar contra backend/src/routes (ver aviso a Jorge).
    reactivar: function (tabla, id) { return llamar("PUT", "/api/registro/" + tabla + "/" + id + "/reactivar"); },
    // OT-0010: póliza completa (encabezado + partidas), con validación
    // de Debe=Haber garantizada del lado de Postgres.
    crearPolizaCompleta: function (body) { return llamar("POST", "/api/polizas-completas", body); },
    actualizarPolizaCompleta: function (id, body) { return llamar("PUT", "/api/polizas-completas/" + id, body); },
    corregirPoliza: function (id, body) { return llamar("POST", "/api/polizas-completas/" + id + "/corregir", body); },
    polizasConPartidas: function (ids) { return llamar("GET", "/api/polizas-completas/con-partidas?ids=" + encodeURIComponent(ids.join(","))); },
    listarPeriodos: function () { return llamar("GET", "/api/periodos"); },
    cerrarPeriodo: function (anio, mes) { return llamar("POST", "/api/periodos/cerrar", { anio, mes }); },
    // OT-0020: configuración contable (mapa de roles -> cuentas reales)
    // y cobranza de facturas (registrar/confirmar pago de cliente).
    obtenerPartidasPoliza: function (polizaId) { return llamar("GET", "/api/polizas-completas/" + polizaId + "/partidas"); },
    guardarConfigContable: function (body) { return llamar("PUT", "/api/config-contable", body); },
    registrarPagoCliente: function (body) { return llamar("POST", "/api/pagos-cliente", body); },
    listarPagosCfdi: function (cfdiId) { return llamar("GET", "/api/pagos-cliente?cfdiId=" + encodeURIComponent(cfdiId)); },
    confirmarPagoCliente: function (pagoId) { return llamar("POST", "/api/pagos-cliente/" + pagoId + "/confirmar"); },
    // OT-0023: Cuentas por Pagar (espejo de cobranza)
    guardarCfdiProveedor: function (datos, polizaId) { return llamar("POST", "/api/cfdis-proveedor", { datos, polizaId }); },
    registrarPagoProveedor: function (body) { return llamar("POST", "/api/pagos-proveedor", body); },
    confirmarPagoProveedor: function (pagoId) { return llamar("POST", "/api/pagos-proveedor/" + pagoId + "/confirmar"); },
    listarPagosProveedor: function (cfdiProveedorId) { return llamar("GET", "/api/pagos-proveedor?cfdiProveedorId=" + encodeURIComponent(cfdiProveedorId)); },
    listarCfdisProveedorTodas: function () { return llamar("GET", "/api/cfdis-proveedor"); },
  };
})();
