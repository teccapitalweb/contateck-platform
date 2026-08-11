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

// Extrae el "sub" (user id) del JWT sin llamada de red extra.
function idDeToken(accessToken) {
  try {
    const json = Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch (e) {
    return null;
  }
}

// BUG encontrado en OT-0014: la RLS de `perfiles` permite ver a
// cualquiera de tu misma empresa, no solo tu propia fila. Sin filtrar
// explícitamente por id, .single() truena en cuanto la empresa tiene
// 2+ usuarios reales (encuentra más de 1 fila -> error -> cae en falso
// "no se encontró tu perfil").
async function obtenerEmpresaId(supabase, accessToken) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
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
    .eq('id', idDeToken(accessToken))
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

  const empresaId = await obtenerEmpresaId(supabase, accessToken);
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

// OT-0012: lectura real para el listado del panel de Facturación
// (reemplaza el arreglo estático window.CFDIS del frontend). RLS filtra
// automáticamente por empresa_id del usuario autenticado — no hace
// falta filtrar aquí a mano.
export async function listarCfdis(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('cfdis')
    .select('id, fiscalapi_id, uuid_sat, serie, folio, tipo, total, fecha, receptor_rfc, receptor_nombre, estatus, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    log.warn('[postgres] listarCfdis:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, cfdis: data || [] };
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
