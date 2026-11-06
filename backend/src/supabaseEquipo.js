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

// OT-mejoras-ventas: versión ligera de listarEquipo — SIN el candado de
// ROLES_GESTIONAN y SIN datos sensibles (nada de email/activo/rol). Solo
// id + nombre. Existe porque cosas básicas como "¿quién registró este
// pago?" (Ventas y Pagos) las necesita cualquier persona de la empresa,
// no solo RH/admin/director — la política RLS perfiles_select_empresa ya
// permite que cualquier usuario autenticado lea nombres de su misma
// empresa, así que este endpoint no abre ningún hueco de seguridad
// nuevo: solo expone a nivel de API lo que la base ya permitía leer.
export async function listarNombresEquipo(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .order('nombre', { ascending: true });
  if (error) { log.warn('[postgres] listarNombresEquipo:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, equipo: data || [] };
}

// ---------------------------------------------------------------
//  OT-0034 · Reglas que RLS no cubre (el SQL de las políticas de
//  Equipo no está en el repo, así que el backend NO puede confiar en
//  que la base ya impida esto):
//   · RH no toca a Admin/Director: sin esto, alguien de RH podía darle
//     de baja al director (y dejar a la empresa sin quien la administre).
//   · Nunca se queda la empresa sin ningún director activo: ni dándolo de
//     baja ni quitándole el rol.
//   · Nadie cambia su propio rol (un Admin no puede ascenderse a Director).
//   · Los valores se validan (antes `!!"false"` daba true y un rolId inventado
//     llegaba tal cual a la base).
// ---------------------------------------------------------------
const ROLES_PROTEGIDOS = ['admin', 'director'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Una persona de la empresa (RLS ya limita a la misma empresa): id, activo y nombre de su rol.
async function leerMiembro(supabase, miembroId) {
  const { data, error } = await supabase.from('perfiles').select('id, activo, roles ( nombre )').eq('id', miembroId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'No encontré a esa persona en tu empresa.' };
  return { miembro: { id: data.id, activo: data.activo !== false, rol: data.roles && data.roles.nombre } };
}

// ¿Quedaría al menos otro director activo además de `excluirId`?
async function quedaOtroDirectorActivo(supabase, excluirId) {
  const { count, error } = await supabase
    .from('perfiles')
    .select('id, roles!inner ( nombre )', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('roles.nombre', 'director')
    .neq('id', excluirId);
  if (error) return { error: error.message };
  return { quedaOtro: (count || 0) > 0 };
}

export async function cambiarEstadoMiembro(accessToken, miembroId, activo, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_GESTIONAN.includes(rol)) return { ok: false, error: 'No tienes permiso para esto (tu rol no lo permite).' };

  if (typeof miembroId !== 'string' || !UUID.test(miembroId)) return { ok: false, error: 'Persona no válida.' };
  if (typeof activo !== 'boolean') return { ok: false, error: 'Indica si la persona queda activa o dada de baja.' };

  const miId = idDeToken(accessToken);
  if (miembroId === miId) return { ok: false, error: 'No puedes darte de baja a ti mismo.' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const objetivo = await leerMiembro(supabase, miembroId);
  if (objetivo.error) return { ok: false, error: objetivo.error };
  const rolObjetivo = objetivo.miembro.rol;

  if (rol === 'rh' && ROLES_PROTEGIDOS.includes(rolObjetivo)) {
    return { ok: false, error: 'RH no puede dar de baja ni reactivar a un Admin o Director; pídeselo a un Admin/Director.' };
  }
  if (!activo && rolObjetivo === 'director' && objetivo.miembro.activo) {
    const otro = await quedaOtroDirectorActivo(supabase, miembroId);
    if (otro.error) { log.warn('[postgres] cambiarEstadoMiembro (directores):', otro.error); return { ok: false, error: 'No se pudo comprobar que quede otro director activo.' }; }
    if (!otro.quedaOtro) return { ok: false, error: 'Es el único director activo: antes de darlo de baja, asigna a otra persona como director.' };
  }

  const { data, error } = await supabase.from('perfiles').update({ activo }).eq('id', miembroId).select().single();
  if (error) { log.warn('[postgres] cambiarEstadoMiembro:', error.message); return { ok: false, error: 'No se pudo actualizar a la persona.' }; }
  return { ok: true, miembro: data };
}

export async function cambiarRolMiembro(accessToken, miembroId, nuevoRolId, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_CAMBIAN_ROL.includes(rol)) return { ok: false, error: 'Solo Admin/Director pueden cambiar el rol de alguien.' };

  if (typeof miembroId !== 'string' || !UUID.test(miembroId)) return { ok: false, error: 'Persona no válida.' };
  if (typeof nuevoRolId !== 'string' || !UUID.test(nuevoRolId)) return { ok: false, error: 'Rol no válido.' };
  if (miembroId === idDeToken(accessToken)) return { ok: false, error: 'No puedes cambiar tu propio rol; pídeselo a otro Admin/Director.' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data: rolNuevo } = await supabase.from('roles').select('id, nombre').eq('id', nuevoRolId).maybeSingle();
  if (!rolNuevo) return { ok: false, error: 'Ese rol no existe.' };

  const objetivo = await leerMiembro(supabase, miembroId);
  if (objetivo.error) return { ok: false, error: objetivo.error };

  if (objetivo.miembro.rol === 'director' && objetivo.miembro.activo && rolNuevo.nombre !== 'director') {
    const otro = await quedaOtroDirectorActivo(supabase, miembroId);
    if (otro.error) { log.warn('[postgres] cambiarRolMiembro (directores):', otro.error); return { ok: false, error: 'No se pudo comprobar que quede otro director activo.' }; }
    if (!otro.quedaOtro) return { ok: false, error: 'Es el único director activo: antes de cambiarle el rol, asigna a otra persona como director.' };
  }

  const { data, error } = await supabase.from('perfiles').update({ rol_id: nuevoRolId }).eq('id', miembroId).select().single();
  if (error) { log.warn('[postgres] cambiarRolMiembro:', error.message); return { ok: false, error: 'No se pudo cambiar el rol.' }; }
  return { ok: true, miembro: data };
}
