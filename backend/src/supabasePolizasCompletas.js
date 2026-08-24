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
    // OT-0025: la función rechaza cambios de partidas con un mensaje que
    // empieza con "CAMBIO_CONTABLE:". El frontend lo detecta para
    // ofrecer el flujo de corrección en vez de mostrar un error crudo.
    const esCambioContable = /CAMBIO_CONTABLE:/i.test(error.message || '');
    return { ok: false, error: error.message, cambioContable: esCambioContable };
  }
  return { ok: true };
}

// OT-0025: trae encabezado + partidas de pólizas específicas (por sus ids).
// El frontend lo usa tras una corrección para alimentar el Libro Mayor
// con las partidas de la reversa y la corregida (que nacieron en el
// backend y el navegador aún no tiene localmente).
export async function obtenerPolizasConPartidas(accessToken, ids, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  if (!Array.isArray(ids) || !ids.length) return { ok: true, polizas: [] };
  const { data: cabeceras, error: e1 } = await supabase
    .from('polizas')
    .select('id, folio, tipo, fecha, concepto, monto, estado, ajuste_de_id, tipo_ajuste, motivo_ajuste')
    .in('id', ids);
  if (e1) { log.warn('[postgres] obtenerPolizasConPartidas cab:', e1.message); return { ok: false, error: e1.message }; }
  const { data: partidas, error: e2 } = await supabase
    .from('poliza_partidas')
    .select('poliza_id, debe, haber, descripcion, orden, cuentas_contables(codigo, nombre)')
    .in('poliza_id', ids)
    .order('orden');
  if (e2) { log.warn('[postgres] obtenerPolizasConPartidas part:', e2.message); return { ok: false, error: e2.message }; }
  const porPoliza = {};
  (partidas || []).forEach((p) => {
    (porPoliza[p.poliza_id] = porPoliza[p.poliza_id] || []).push({
      codigo: p.cuentas_contables ? p.cuentas_contables.codigo : '',
      nombre: p.cuentas_contables ? p.cuentas_contables.nombre : '',
      debe: Number(p.debe) || 0, haber: Number(p.haber) || 0, descripcion: p.descripcion || null,
    });
  });
  const polizas = (cabeceras || []).map((c) => ({
    id: c.id, folio: c.folio, tipo: c.tipo, fecha: c.fecha, concepto: c.concepto,
    monto: c.monto, estado: c.estado, ajusteDeId: c.ajuste_de_id, tipoAjuste: c.tipo_ajuste,
    motivoAjuste: c.motivo_ajuste, asientos: porPoliza[c.id] || [],
  }));
  return { ok: true, polizas };
}

// OT-0025: genera reversa + corrección de una póliza, atómico, sin tocar
// la original. partidasCorrectas = cómo debe quedar el asiento correcto.
export async function corregirPolizaConAjuste(accessToken, polizaId, { motivo, partidasCorrectas }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('corregir_poliza_con_ajuste', {
    p_poliza_id: polizaId, p_motivo: motivo, p_partidas_correctas: partidasCorrectas,
  });
  if (error) {
    log.warn('[postgres] corregir_poliza_con_ajuste:', error.message);
    return { ok: false, error: error.message };
  }
  // data = { ok, reversa:{id,folio}, correccion:{id,folio} }
  return { ok: true, reversa: data.reversa, correccion: data.correccion };
}
