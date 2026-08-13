// ============================================================
//  CONTATECK · Backend · Equipo (Fase 1 — continuación)
//
//  "Dar de baja" nunca borra el perfil (todo lo que esa persona
//  hizo — facturas, pólizas, ventas — sigue referenciado a su
//  perfil). Solo apaga `activo`, y eso ya basta para bloquearla en
//  TODO el sistema, porque auth_empresa_id()/auth_rol() (usadas
//  por absolutamente cada política RLS) exigen activo = true.
//
//  Regla fina que RLS no cubre (documentado también en
//  addendum_equipo_activo.sql): rh puede dar de baja/reactivar,
//  pero SOLO admin/director pueden cambiar el rol de alguien, y
//  nadie puede darse de baja a sí mismo por este camino.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

const ROLES_GESTIONAN = ['rh', 'admin', 'director'];
const ROLES_CAMBIAN_ROL = ['admin', 'director'];

function idDeToken(accessToken) {
  try {
    const json = Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch (e) {
    return null;
  }
}

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function listarEquipo(accessToken, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_GESTIONAN.includes(rol)) return { ok: false, error: 'No tienes permiso para ver el equipo (tu rol no lo permite).' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, activo, created_at, roles ( id, nombre )')
    .order('nombre', { ascending: true });
  if (error) { log.warn('[postgres] listarEquipo:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, equipo: data || [] };
}

export async function cambiarEstadoMiembro(accessToken, miembroId, activo, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_GESTIONAN.includes(rol)) return { ok: false, error: 'No tienes permiso para esto (tu rol no lo permite).' };

  const miId = idDeToken(accessToken);
  if (miembroId === miId) return { ok: false, error: 'No puedes darte de baja a ti mismo.' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.from('perfiles').update({ activo: !!activo }).eq('id', miembroId).select().single();
  if (error) { log.warn('[postgres] cambiarEstadoMiembro:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, miembro: data };
}

export async function cambiarRolMiembro(accessToken, miembroId, nuevoRolId, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_CAMBIAN_ROL.includes(rol)) return { ok: false, error: 'Solo Admin/Director pueden cambiar el rol de alguien.' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.from('perfiles').update({ rol_id: nuevoRolId }).eq('id', miembroId).select().single();
  if (error) { log.warn('[postgres] cambiarRolMiembro:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, miembro: data };
}
