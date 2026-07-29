// ============================================================
//  CONTATECK · Backend · CFDIs en Postgres
//  OT-0011 · Opción A (aprobada): sustituye Firestore como
//  destino de almacenamiento del registro de CFDIs timbrados.
//  El timbrado en sí sigue igual (Fiscalapi + CSD global de
//  pruebas) — solo cambia dónde se guarda el resultado.
//
//  Mismo patrón de siempre: cliente autenticado como el propio
//  usuario (RLS real), nunca con la service role.
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

async function obtenerEmpresaId(supabase) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').single();
  if (error || !data) return null;
  return data.empresa_id;
}

// OT-0011: rol del usuario, para el middleware que restringe quién puede
// iniciar timbrado/cancelación (mismo criterio que las políticas RLS de
// insert/update en la tabla cfdis: solo director/admin/contador).
export async function obtenerRolUsuario(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('perfiles')
    .select('roles ( nombre )')
    .single();
  if (error || !data) {
    log.warn('[postgres] obtenerRolUsuario:', error?.message);
    return null;
  }
  return data.roles?.nombre || null;
}

// resumen: mismo objeto que ya arma resumenCfdi() en invoices.js
// (id, uuid, serie, folio, total, subtotal, moneda, tipo, fecha,
//  receptorRfc, receptorNombre, emisorRfc, estatus, uid, emailUsuario)
export async function guardarCfdi(accessToken, resumen, raw, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const empresaId = await obtenerEmpresaId(supabase);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const { data, error } = await supabase
    .from('cfdis')
    .insert({
      empresa_id: empresaId,
      usuario_id: resumen.uid || null,
      fiscalapi_id: resumen.id || null,
      uuid_sat: resumen.uuid || null,
      serie: resumen.serie || null,
      folio: resumen.folio || null,
      tipo: resumen.tipo || null,
      total: resumen.total || null,
      subtotal: resumen.subtotal || null,
      moneda: resumen.moneda || 'MXN',
      fecha: resumen.fecha || null,
      receptor_rfc: resumen.receptorRfc || null,
      receptor_nombre: resumen.receptorNombre || null,
      emisor_rfc: resumen.emisorRfc || null,
      estatus: resumen.estatus || 'vigente',
      raw: raw || null,
    })
    .select()
    .single();

  if (error) {
    log.warn('[postgres] guardarCfdi:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, registro: data };
}

// Busca por fiscalapi_id o por uuid_sat (la cancelación puede venir con
// cualquiera de los dos, según cómo se haya solicitado).
export async function marcarCfdiCancelado(accessToken, { fiscalapiId, uuidSat }, extra = {}, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  let query = supabase.from('cfdis').update({
    estatus: 'cancelado',
    cancelled_at: new Date().toISOString(),
    ...(extra.acuse ? { raw: extra.acuse } : {}),
  });

  if (fiscalapiId) query = query.eq('fiscalapi_id', fiscalapiId);
  else if (uuidSat) query = query.eq('uuid_sat', uuidSat);
  else return { ok: false, error: 'Falta el id o UUID del CFDI a marcar como cancelado.' };

  const { error } = await query;
  if (error) {
    log.warn('[postgres] marcarCfdiCancelado:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
