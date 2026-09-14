// ============================================================
//  CONTATECK · Backend · Nóminas internas (Pieza 4)
//  Llama a la RPC crear_nomina de Postgres, que valida rol y
//  guarda encabezado + detalle en una sola transacción atómica.
//  Mismo patrón que supabasePolizasCompletas: cliente autenticado
//  como el propio usuario (RLS real vía las verificaciones dentro
//  de la función RPC).
//
//  Control interno — NO timbra CFDI de nómina ni calcula ISR/IMSS.
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

// detalle: [{ empleado_id, nombre, puesto, salario_diario, sueldo_base,
//             otras_percepciones, deducciones, notas }, ...]
// Los totales NO se mandan desde aquí — la RPC los recalcula en el
// servidor a partir del detalle (fuente única de verdad).
export async function crearNomina(accessToken, { periodicidad, fechaInicio, fechaFin, dias, detalle }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.rpc('crear_nomina', {
    p_periodicidad: periodicidad,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_dias: dias,
    p_detalle: detalle,
  });
  if (error) {
    log.warn('[postgres] crear_nomina:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, nomina: data };
}

// Lista de nóminas pagadas (encabezados), más reciente primero. La RLS
// de `nominas` ya limita a rh/admin/director/contador/auditor de la
// misma empresa — aquí no hace falta revalidar rol.
export async function listarNominas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('nominas')
    .select('id, periodicidad, fecha_inicio, fecha_fin, dias, total_percepciones, total_deducciones, total_neto, empleados_pagados, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    log.warn('[postgres] listarNominas:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, nominas: data || [] };
}

// Detalle (empleados) de una nómina específica. La RLS de nomina_detalle
// ya filtra por empresa/rol, así que solo devuelve filas si el usuario
// tiene permiso — un id de otra empresa simplemente regresa vacío.
export async function detalleNomina(accessToken, nominaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('nomina_detalle')
    .select('nombre, puesto, salario_diario, sueldo_base, otras_percepciones, deducciones, neto, notas')
    .eq('nomina_id', nominaId)
    .order('nombre', { ascending: true });
  if (error) {
    log.warn('[postgres] detalleNomina:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, detalle: data || [] };
}
