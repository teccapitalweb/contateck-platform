// ============================================================
//  CONTATECK · Backend · Pólizas completas (encabezado + partidas)
//  OT-0010 · Llama a las funciones RPC de Postgres que validan
//  Debe = Haber y guardan todo en una sola transacción atómica.
//  Mismo patrón: cliente autenticado como el propio usuario (RLS
//  real vía las verificaciones dentro de la función RPC).
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

// partidas: [{ codigo, debe, haber, descripcion }, ...]
// OT-0012: crear_poliza_completa ya no recibe folio — lo genera Postgres
// internamente (siguiente_folio) y lo regresa junto con el id.
export async function crearPolizaCompleta(accessToken, { tipo, fecha, concepto, partidas }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('crear_poliza_completa', {
    p_tipo: tipo, p_fecha: fecha, p_concepto: concepto, p_partidas: partidas,
  });
  if (error) {
    log.warn('[postgres] crear_poliza_completa:', error.message);
    return { ok: false, error: error.message };
  }
  // data ahora es {"id": "...", "folio": "I-00007"}
  return { ok: true, id: data.id, folio: data.folio };
}

export async function actualizarPolizaCompleta(accessToken, polizaId, { tipo, fecha, concepto, partidas }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { error } = await supabase.rpc('actualizar_poliza_completa', {
    p_poliza_id: polizaId, p_tipo: tipo, p_fecha: fecha, p_concepto: concepto, p_partidas: partidas,
  });
  if (error) {
    log.warn('[postgres] actualizar_poliza_completa:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// OT-0020 FIX 3: partidas de una póliza que vive en Postgres — para que
// el frontend pueda mostrar el detalle (Debe/Haber) de pólizas que no
// nacieron en ese navegador (ej. las generadas por el flujo de cobranza).
export async function obtenerPartidasPoliza(accessToken, polizaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('poliza_partidas')
    .select('debe, haber, orden, cuentas_contables(codigo, nombre)')
    .eq('poliza_id', polizaId)
    .order('orden', { ascending: true });
  if (error) {
    log.warn('[postgres] obtenerPartidasPoliza:', error.message);
    return { ok: false, error: error.message };
  }
  const partidas = (data || []).map((r) => ({
    codigo: r.cuentas_contables ? r.cuentas_contables.codigo : '',
    nombre: r.cuentas_contables ? r.cuentas_contables.nombre : '',
    debe: r.debe, haber: r.haber,
  }));
  return { ok: true, partidas };
}
