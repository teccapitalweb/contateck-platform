// ============================================================
//  CONTATECK · Backend · Alertas contables del Dashboard (OT-0045)
//  Funciones puras (sin red), para poder probarlas sin base de datos.
// ============================================================

// PostgREST devuelve como máximo ~1000 filas por consulta. Si una de las dos listas llega a ese tope
// puede venir incompleta, y comparar listas incompletas daría falsos "sin póliza": en ese caso no se avisa.
export const TOPE_FILAS_CONSULTA = 1000;

// OT-0052: estados de póliza que cuentan como "la factura está contabilizada". Una póliza de causación que se
// CORRIGE (corregir_poliza_con_ajuste) pasa a 'corregida' y conserva su cfdi_uuid, mientras que la reversa y la
// póliza nueva ('correccion') no lo copian: si solo contara 'ok', corregir una póliza haría que la factura
// pareciera sin contabilizar. 'anulada' sí significa que NO está contabilizada.
export const ESTADOS_QUE_CONTABILIZAN = ['ok', 'corregida', 'correccion'];

/**
 * CFDI emitidos y vigentes que no tienen una póliza activa ligada por su UUID.
 *  - cfdis:   filas de `cfdis` (uuid_sat, tipo, estatus) ya sin cancelados, o con ellos: aquí se filtran.
 *  - polizas: filas de `polizas` (cfdi_uuid, estado) con cfdi_uuid no nulo.
 * Una póliza anulada no cuenta como contabilizada; una corregida sí (ver ESTADOS_QUE_CONTABILIZAN).
 * Un CFDI sin UUID del SAT aún no está timbrado: no se avisa.
 * Regresa null si no se puede asegurar la comparación (listas posiblemente truncadas).
 */
export function cfdisSinPoliza(cfdis, polizas) {
  const cf = Array.isArray(cfdis) ? cfdis : [];
  const po = Array.isArray(polizas) ? polizas : [];
  if (cf.length >= TOPE_FILAS_CONSULTA || po.length >= TOPE_FILAS_CONSULTA) return null;
  const contabilizados = new Set(
    po.filter((p) => p && p.cfdi_uuid && ESTADOS_QUE_CONTABILIZAN.includes(p.estado)).map((p) => String(p.cfdi_uuid).trim().toLowerCase())
  );
  return cf.filter((c) => {
    if (!c || !c.uuid_sat || c.estatus === 'cancelado') return false;
    return !contabilizados.has(String(c.uuid_sat).trim().toLowerCase());
  });
}

/** Alerta del Dashboard, o null si no hay nada que avisar. */
export function alertaCfdiSinPoliza(cfdis, polizas) {
  const faltan = cfdisSinPoliza(cfdis, polizas);
  if (!faltan || faltan.length === 0) return null;
  const n = faltan.length;
  return {
    tipo: 'warn',
    titulo: `${n} CFDI vigente${n > 1 ? 's' : ''} sin póliza contable`,
    texto: `Aún no ${n > 1 ? 'tienen' : 'tiene'} póliza en Contabilidad, así que no ${n > 1 ? 'aparecen' : 'aparece'} en el Balance ni en el IVA. Regístral${n > 1 ? 'os' : 'o'} en Contabilidad → Captura rápida → Venta → «Importar desde factura timbrada».`,
    accion: { vista: 'contabilidad' },
  };
}

/**
 * OT-0051 · Pagos confirmados sobre facturas que nunca se contabilizaron (sin póliza de causación).
 * El cobro o el pago ya movió Bancos, pero la factura no tiene su póliza (Clientes/Ventas/IVA o Gastos/IVA/Proveedores),
 * así que Clientes o Proveedores quedan con saldo de naturaleza inversa y el Balance se distorsiona.
 *  - pagosCliente:    filas de `pagos_cliente` confirmadas (cfdi_id).
 *  - cfdisEmitidos:   filas de `cfdis` (id, uuid_sat) sin cancelados; un pago sobre un CFDI que no está aquí no se cuenta.
 *  - polizasConCfdi:  filas de `polizas` con cfdi_uuid (cfdi_uuid, estado).
 *  - pagosProveedor:  filas de `pagos_proveedor` confirmadas (cfdi_proveedor_id).
 *  - cfdisProveedor:  filas de `cfdis_proveedor` (id, poliza_causacion_id).
 * Regresa null si alguna lista llega al tope de la consulta (podría venir incompleta).
 */
export function pagosSinCausacion({ pagosCliente, cfdisEmitidos, polizasConCfdi, pagosProveedor, cfdisProveedor }) {
  const lista = (x) => (Array.isArray(x) ? x : []);
  const pc = lista(pagosCliente), ce = lista(cfdisEmitidos), po = lista(polizasConCfdi), pp = lista(pagosProveedor), cp = lista(cfdisProveedor);
  if ([pc, ce, po, pp, cp].some((l) => l.length >= TOPE_FILAS_CONSULTA)) return null;
  const contabilizados = new Set(po.filter((p) => p && p.cfdi_uuid && ESTADOS_QUE_CONTABILIZAN.includes(p.estado)).map((p) => String(p.cfdi_uuid).trim().toLowerCase()));
  const uuidDe = new Map(ce.filter((c) => c && c.id && c.uuid_sat).map((c) => [c.id, String(c.uuid_sat).trim().toLowerCase()]));
  const cobros = pc.filter((p) => p && uuidDe.has(p.cfdi_id) && !contabilizados.has(uuidDe.get(p.cfdi_id))).length;
  const causacionDe = new Map(cp.filter((c) => c && c.id).map((c) => [c.id, c.poliza_causacion_id]));
  const proveedores = pp.filter((p) => p && causacionDe.has(p.cfdi_proveedor_id) && !causacionDe.get(p.cfdi_proveedor_id)).length;
  return { cobros, proveedores, total: cobros + proveedores };
}

/** Alerta del Dashboard, o null si no hay nada que avisar. */
export function alertaPagosSinCausacion(datos) {
  const r = pagosSinCausacion(datos);
  if (!r || r.total === 0) return null;
  const n = r.total;
  const partes = [r.cobros ? `${r.cobros} cobro${r.cobros > 1 ? 's' : ''}` : '', r.proveedores ? `${r.proveedores} pago${r.proveedores > 1 ? 's' : ''} a proveedor` : ''].filter(Boolean).join(' y ');
  return {
    tipo: 'warn',
    titulo: `${n} pago${n > 1 ? 's' : ''} confirmado${n > 1 ? 's' : ''} sobre facturas sin póliza de causación`,
    texto: `${partes}: ya movieron Bancos, pero la factura nunca se contabilizó, así que Clientes o Proveedores quedan con saldo inverso y el Balance se distorsiona. Contabiliza primero la factura.`,
    accion: { vista: 'contabilidad' },
  };
}
