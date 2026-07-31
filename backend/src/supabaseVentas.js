// ============================================================
//  CONTATECK · Backend · Ventas y Pagos
//  OT-0014 · Épica 2: Evolución UX/UI
//
//  Reglas de negocio finas que RLS no cubre (documentado también
//  en addendum_ventas_policies.sql):
//    - Quien registra una venta (created_by) NO puede tomarla para
//      revisión ni confirmarla/rechazarla — separación de funciones.
//    - Transición de estados es estrictamente:
//        pendiente -> revision -> (confirmado | rechazado)
//      Nunca se salta "revision"; "Tomar para revisión" es SIEMPRE
//      manual (aprobado explícitamente, nunca automático).
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

const ROLES_VALIDADORES = ['contador', 'admin', 'director'];
const ROLES_REGISTRO = ['vendedor', 'contador', 'admin', 'director'];

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

async function nextFolio(supabase) {
  const { count } = await supabase.from('ventas').select('id', { count: 'exact', head: true });
  return 'P-' + String((count || 0) + 1).padStart(4, '0');
}

// BUG encontrado en OT-0014: la RLS de `perfiles` permite ver a
// cualquiera de tu misma empresa, no solo tu propia fila. Sin filtrar
// explícitamente por id, .single() truena en cuanto la empresa tiene
// 2+ usuarios reales.
async function obtenerEmpresaId(supabase, accessToken, log = console) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (error || !data) {
    log.warn('[postgres] obtenerEmpresaId:', error?.message);
    return null;
  }
  return data.empresa_id;
}

export async function crearVenta(accessToken, userId, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!datos.cliente || !datos.concepto || !datos.importe || !datos.fechaPago) {
    return { ok: false, error: 'Faltan datos obligatorios (cliente, concepto, importe, fecha de pago).' };
  }

  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se pudo determinar la empresa del usuario.' };

  const folio = await nextFolio(supabase);
  const { data, error } = await supabase
    .from('ventas')
    .insert({
      folio,
      cliente: datos.cliente,
      concepto: datos.concepto,
      consultora_id: datos.consultoraId || null,
      importe: datos.importe,
      fecha_pago: datos.fechaPago,
      metodo_pago: datos.metodoPago || null,
      referencia: datos.referencia || null,
      banco: datos.banco || null,
      vendedor_id: userId,
      comprobante_path: datos.comprobantePath || null,
      notas: datos.notas || null,
      created_by: userId,
      empresa_id: empresaId,
    })
    .select()
    .single();

  if (error) {
    log.warn('[postgres] crearVenta:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, venta: data };
}

export async function listarVentas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('ventas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    log.warn('[postgres] listarVentas:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, ventas: data || [] };
}

// ---- Transiciones de estado (con reglas finas de negocio) ----

async function obtenerVenta(supabase, ventaId) {
  const { data, error } = await supabase.from('ventas').select('*').eq('id', ventaId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function tomarParaRevision(accessToken, userId, ventaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para tomar ventas a revisión (tu rol no lo permite).' };
  }

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada.' };
    if (venta.created_by === userId) {
      return { ok: false, error: 'No puedes tomar para revisión una venta que tú mismo registraste.' };
    }
    if (venta.estado !== 'pendiente') {
      return { ok: false, error: `Esta venta ya no está en 'pendiente' (estado actual: ${venta.estado}).` };
    }

    const { data, error } = await supabase
      .from('ventas')
      .update({ estado: 'revision', tomado_por: userId, tomado_en: new Date().toISOString() })
      .eq('id', ventaId)
      .eq('estado', 'pendiente') // doble seguro contra condición de carrera (dos clics casi simultáneos)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, venta: data };
  } catch (error) {
    log.warn('[postgres] tomarParaRevision:', error.message);
    return { ok: false, error: error.message };
  }
}

async function resolverVenta(accessToken, userId, ventaId, nuevoEstado, log) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para validar ventas (tu rol no lo permite).' };
  }

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada.' };
    if (venta.created_by === userId) {
      return { ok: false, error: 'No puedes validar una venta que tú mismo registraste.' };
    }
    if (venta.estado !== 'revision') {
      return { ok: false, error: `Esta venta debe estar en 'revision' antes de confirmar/rechazar (estado actual: ${venta.estado}). Tómala primero con "Tomar para revisión".` };
    }

    const { data, error } = await supabase
      .from('ventas')
      .update({ estado: nuevoEstado, revisado_por: userId, revisado_en: new Date().toISOString() })
      .eq('id', ventaId)
      .eq('estado', 'revision')
      .select()
      .single();

    if (error) throw error;
    return { ok: true, venta: data };
  } catch (error) {
    log.warn('[postgres] resolverVenta:', error.message);
    return { ok: false, error: error.message };
  }
}

export function confirmarVenta(accessToken, userId, ventaId, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'confirmado', log);
}
export function rechazarVenta(accessToken, userId, ventaId, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'rechazado', log);
}
