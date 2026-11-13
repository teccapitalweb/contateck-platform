// ============================================================
//  CONTATECK · Backend · Alertas contables del Dashboard (OT-0045)
//  Funciones puras (sin red), para poder probarlas sin base de datos.
// ============================================================

// PostgREST devuelve como máximo ~1000 filas por consulta. Si una de las dos listas llega a ese tope
// puede venir incompleta, y comparar listas incompletas daría falsos "sin póliza": en ese caso no se avisa.
export const TOPE_FILAS_CONSULTA = 1000;

/**
 * CFDI emitidos y vigentes que no tienen una póliza activa ligada por su UUID.
 *  - cfdis:   filas de `cfdis` (uuid_sat, tipo, estatus) ya sin cancelados, o con ellos: aquí se filtran.
 *  - polizas: filas de `polizas` (cfdi_uuid, estado) con cfdi_uuid no nulo.
 * Una póliza anulada (estado distinto de 'ok') no cuenta como contabilizada.
 * Un CFDI sin UUID del SAT aún no está timbrado: no se avisa.
 * Regresa null si no se puede asegurar la comparación (listas posiblemente truncadas).
 */
export function cfdisSinPoliza(cfdis, polizas) {
  const cf = Array.isArray(cfdis) ? cfdis : [];
  const po = Array.isArray(polizas) ? polizas : [];
  if (cf.length >= TOPE_FILAS_CONSULTA || po.length >= TOPE_FILAS_CONSULTA) return null;
  const contabilizados = new Set(
    po.filter((p) => p && p.cfdi_uuid && p.estado === 'ok').map((p) => String(p.cfdi_uuid).trim().toLowerCase())
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
