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

  // OT-0056: con multiempresa, alguien de mi empresa puede estar trabajando AHORA en otra (su perfil
  // activo apunta a la otra). El equipo se lee de las membresías de mi empresa para que no desaparezca
  // de la lista (y se le pueda dar de baja). Si la tabla aún no existe, se usa el modo anterior.
  const miEmpresa = await miEmpresaId(supabase, accessToken);
  if (miEmpresa) {
    const { data: ms, error: errMs } = await supabase
      .from('usuario_empresas')
      .select('user_id, activo, created_at, roles ( id, nombre ), perfiles ( nombre, email, empresa_id )')
      .eq('empresa_id', miEmpresa);
    if (!errMs) {
      const equipo = (ms || []).map((m) => ({
        id: m.user_id,
        nombre: m.perfiles ? m.perfiles.nombre : null,
        email: m.perfiles ? m.perfiles.email : null,
        activo: m.activo,
        created_at: m.created_at,
        roles: m.roles,
        enOtraEmpresa: !!(m.perfiles && m.perfiles.empresa_id && m.perfiles.empresa_id !== miEmpresa),
      })).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
      return { ok: true, equipo };
    }
    log.warn('[postgres] listarEquipo (membresías, uso el modo anterior):', errMs.message);
  }

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, activo, created_at, roles ( id, nombre )')
    .order('nombre', { ascending: true });
  if (error) { log.warn('[postgres] listarEquipo:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, equipo: data || [] };
}

// Empresa ACTIVA de quien llama (null si no se puede leer).
async function miEmpresaId(supabase, accessToken) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).maybeSingle();
  if (error || !data) return null;
  return data.empresa_id;
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
async function leerMiembro(supabase, miembroId, miEmpresa) {
  // OT-0056: primero la membresía en MI empresa (vale aunque esa persona esté trabajando en otra ahora).
  if (miEmpresa) {
    const { data: m, error: errM } = await supabase
      .from('usuario_empresas')
      .select('user_id, activo, roles ( nombre ), perfiles ( empresa_id )')
      .eq('user_id', miembroId).eq('empresa_id', miEmpresa).maybeSingle();
    if (!errM) {
      if (!m) return { error: 'No encontré a esa persona en tu empresa.' };
      return { miembro: { id: m.user_id, activo: m.activo !== false, rol: m.roles && m.roles.nombre, enOtraEmpresa: !!(m.perfiles && m.perfiles.empresa_id && m.perfiles.empresa_id !== miEmpresa) } };
    }
  }
  const { data, error } = await supabase.from('perfiles').select('id, activo, roles ( nombre )').eq('id', miembroId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'No encontré a esa persona en tu empresa.' };
  return { miembro: { id: data.id, activo: data.activo !== false, rol: data.roles && data.roles.nombre, enOtraEmpresa: false } };
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

  const miEmpresa = await miEmpresaId(supabase, accessToken);
  const objetivo = await leerMiembro(supabase, miembroId, miEmpresa);
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

  // OT-0056: la baja/reactivación va por la función de la base, que actúa sobre la membresía de MI
  // empresa aunque la persona esté trabajando en otra en este momento (si no, no se le podría quitar
  // el acceso mientras no esté aquí). Si esa función aún no existe, se usa el modo anterior.
  const { data: viaRpc, error: errRpc } = await supabase.rpc('membresia_cambiar_estado', { p_user_id: miembroId, p_activo: activo });
  if (!errRpc) return { ok: true, miembro: { id: miembroId, activo: !!(viaRpc && viaRpc.activo) } };
  if (errRpc.code === 'P0001') return { ok: false, error: errRpc.message };
  if (objetivo.miembro.enOtraEmpresa) { log.warn('[postgres] cambiarEstadoMiembro (rpc):', errRpc.message); return { ok: false, error: 'No se pudo actualizar a la persona.' }; }
  log.warn('[postgres] membresia_cambiar_estado no disponible, uso el modo anterior:', errRpc.message);

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

  const objetivo = await leerMiembro(supabase, miembroId, await miEmpresaId(supabase, accessToken));
  if (objetivo.error) return { ok: false, error: objetivo.error };
  if (objetivo.miembro.enOtraEmpresa) {
    return { ok: false, error: 'Esa persona está trabajando en otra empresa en este momento; podrás cambiarle el rol cuando vuelva a esta. Si lo que necesitas es quitarle el acceso, usa "Dar de baja".' };
  }

  if (objetivo.miembro.rol === 'director' && objetivo.miembro.activo && rolNuevo.nombre !== 'director') {
    const otro = await quedaOtroDirectorActivo(supabase, miembroId);
    if (otro.error) { log.warn('[postgres] cambiarRolMiembro (directores):', otro.error); return { ok: false, error: 'No se pudo comprobar que quede otro director activo.' }; }
    if (!otro.quedaOtro) return { ok: false, error: 'Es el único director activo: antes de cambiarle el rol, asigna a otra persona como director.' };
  }

  const { data, error } = await supabase.from('perfiles').update({ rol_id: nuevoRolId }).eq('id', miembroId).select().single();
  if (error) { log.warn('[postgres] cambiarRolMiembro:', error.message); return { ok: false, error: 'No se pudo cambiar el rol.' }; }
  return { ok: true, miembro: data };
}
