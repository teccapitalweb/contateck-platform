// ============================================================
//  CONTATECK · Backend · Facturas de proveedor (cfdis_proveedor)
//  OT-0023 · Persiste lo que antes "Importar XML recibido" leía y
//  olvidaba de inmediato — ahora queda como documento consultable,
//  con saldo por pagar calculado (cfdis_proveedor_saldo).
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function idDeToken(accessToken) {
  try { return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')).sub || null; }
  catch (e) { return null; }
}

// Guarda la factura de proveedor tal como se parseó del XML, ligada a
// la póliza de causación que "Importar XML" ya genera hoy mismo.
// Si el UUID ya existía (mismo XML importado dos veces), no truena —
// regresa el registro existente (el índice único de la tabla protege
// contra duplicados).
export async function guardarCfdiProveedor(accessToken, datos, polizaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data: perfil, error: errPerfil } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (errPerfil || !perfil) return { ok: false, error: 'No se encontró tu perfil/empresa.' };
  const payload = {
    empresa_id: perfil.empresa_id,
    uuid_sat: datos.uuid || null,
    serie: datos.serie || null,
    folio: datos.folio || (datos.uuid ? datos.uuid.slice(0, 8) : null),
    metodo_pago: datos.metodoPago || null,
    forma_pago: datos.formaPago || null,
    total: datos.total, subtotal: datos.subtotal,
    fecha: datos.fecha || null,
    emisor_rfc: datos.rfcEmisor || null,
    emisor_nombre: datos.nombreEmisor || null,
    poliza_causacion_id: polizaId || null,
    raw: datos.raw || null,
  };
  const { error } = await supabase
    .from('cfdis_proveedor')
    .upsert(payload, { onConflict: 'empresa_id,uuid_sat', ignoreDuplicates: false });
  if (error) {
    // Si el índice único rechaza por duplicado real de otra empresa o
    // condición de carrera, no es fatal para el import — se reporta.
    log.warn('[postgres] guardarCfdiProveedor:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listarCfdisProveedorSaldo(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('cfdis_proveedor_saldo')
    .select('cfdi_proveedor_id, folio, serie, emisor_nombre, emisor_rfc, fecha, metodo_pago, estatus, total, pagado, saldo_pendiente')
    .gt('saldo_pendiente', 0)
    .order('fecha', { ascending: false })
    .limit(200);
  if (error) {
    log.warn('[postgres] listarCfdisProveedorSaldo:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, facturas: data || [] };
}

// OT-0024: TODAS las facturas de proveedor, pagadas o no — para la
// pantalla "Cuentas por Pagar" (a diferencia de listarCfdisProveedorSaldo,
// que solo trae las que aún tienen algo pendiente, esta es para poder
// consultar el historial incluso de una ya liquidada por completo).
export async function listarCfdisProveedorTodas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('cfdis_proveedor_saldo')
    .select('cfdi_proveedor_id, folio, serie, emisor_nombre, emisor_rfc, fecha, metodo_pago, estatus, total, pagado, saldo_pendiente')
    .order('fecha', { ascending: false })
    .limit(300);
  if (error) {
    log.warn('[postgres] listarCfdisProveedorTodas:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, facturas: data || [] };
}
