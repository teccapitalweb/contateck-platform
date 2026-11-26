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

  async function pedir(metodo, ruta, body) {
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

  // OT-0042 · Caché corta de lecturas repetidas. Al abrir el panel, Contabilidad se vuelve a pintar
  // varias veces seguidas y cada pintado pedía de nuevo la misma lista (periodos ×6, facturas de
  // proveedor ×6…); cada petición cuesta ~1 s en el backend. Aquí, para estas rutas de solo lectura:
  //   · dos pedidos iguales casi al mismo tiempo comparten UNA sola petición, y
  //   · el resultado se reutiliza unos segundos.
  // Cualquier escritura (POST/PUT/DELETE) borra todo el caché, y un error nunca se guarda. Cada quien
  // recibe su propia copia, para que modificar el resultado no afecte a los demás.
  var TTL_LECTURAS_MS = 8000;
  var RUTAS_CACHEABLES = /^\/api\/(periodos|cfdis-proveedor|config-contable|polizas-completas\/con-partidas)(\?|$)/;
  var lecturas = {}; // ruta -> { hasta, promesa }
  function copia(x) {
    try { return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)); } catch (e) { return x; }
  }

  async function llamar(metodo, ruta, body) {
    if (metodo !== "GET") lecturas = {}; // una escritura puede cambiar lo ya leído
    if (metodo !== "GET" || !RUTAS_CACHEABLES.test(ruta)) return pedir(metodo, ruta, body);
    const guardada = lecturas[ruta];
    if (guardada && guardada.hasta > Date.now()) return copia(await guardada.promesa);
    const promesa = pedir(metodo, ruta, body);
    const entrada = { hasta: Date.now() + TTL_LECTURAS_MS, promesa };
    lecturas[ruta] = entrada;
    const r = await promesa;
    if ((!r || r.ok === false) && lecturas[ruta] === entrada) delete lecturas[ruta]; // un error no se guarda
    return copia(r);
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
    anularPolizaDuplicada: function (id, motivo) { return llamar("POST", "/api/polizas-completas/" + id + "/anular", { motivo }); },
    polizasConPartidas: function (ids) { return llamar("GET", "/api/polizas-completas/con-partidas?ids=" + encodeURIComponent(ids.join(","))); },
    listarPeriodos: function () { return llamar("GET", "/api/periodos"); },
    cerrarPeriodo: function (anio, mes) { return llamar("POST", "/api/periodos/cerrar", { anio, mes }); },
    // OT-0020: configuración contable (mapa de roles -> cuentas reales)
    // y cobranza de facturas (registrar/confirmar pago de cliente).
    obtenerPartidasPoliza: function (polizaId) { return llamar("GET", "/api/polizas-completas/" + polizaId + "/partidas"); },
    guardarConfigContable: function (body) { return llamar("PUT", "/api/config-contable", body); },
    leerConfigContable: function () { return llamar("GET", "/api/config-contable"); },
    // OT-0053: IA Contable (solo lectura). estado = si está configurada y si el rol puede usarla.
    // OT-0061: IVA del mes e ISR estimado (referencia) para la tarjeta del Dashboard.
    indicadoresFiscales: function () { return llamar("GET", "/api/indicadores-fiscales"); },
    estadoIA: function () { return llamar("GET", "/api/ia/estado"); },
    consultarIA: function (pregunta, historial) { return llamar("POST", "/api/ia/consultar", { pregunta: pregunta, historial: historial }); },
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
