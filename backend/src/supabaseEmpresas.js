// ============================================================
//  CONTATECK · Backend · Multiempresa por usuario (OT-0056)
//
//  Una persona puede pertenecer a varias empresas (tabla usuario_empresas)
//  y trabajar en una a la vez. `perfiles` guarda la empresa ACTIVA; toda la
//  seguridad de la base (RLS) sigue leyendo de ahí, así que cambiar de empresa
//  es mover ese contexto con la función de la base cambiar_empresa(), la única
//  vía permitida. Este archivo solo la llama con el token de la persona.
//
//  Agregar a alguien a una SEGUNDA empresa se hace con una invitación normal
//  (Equipo → Invitaciones) al correo de esa persona: ella la acepta desde el
//  selector de empresa. Nadie se agrega solo a una empresa.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerClienteAdmin, olvidarEmpresaActual } from './supabaseAuth.js';

export { olvidarEmpresaActual };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Mensajes de la base (raise exception) que sí se le muestran a la persona tal cual.
function mensajeDeLaBase(error, respaldo) {
  const m = (error && error.message) || '';
  if (/^(No perteneces|Tu acceso|Necesitas iniciar|No se encontró tu perfil)/.test(m)) return m;
  return respaldo;
}

// ---- Empresas de la persona + invitaciones pendientes a otras empresas ----
export async function listarMisEmpresas(accessToken, userId, userEmail, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.rpc('mis_empresas');
  if (error) {
    log.warn('[postgres] mis_empresas:', error.message);
    // Base sin el SQL de OT-0056 aplicado: el panel sigue como antes (una sola empresa).
    return { ok: true, disponible: false, empresas: [], invitaciones: [] };
  }
  const empresas = (data || []).map((e) => ({
    id: e.empresa_id, nombre: e.nombre, rol: e.rol, activa: !!e.activa, acceso: e.activo !== false,
  }));

  return { ok: true, disponible: true, empresas, invitaciones: await invitacionesParaMi(userId, userEmail, empresas, log) };
}

// Invitaciones vigentes a mi correo hacia empresas a las que todavía NO pertenezco.
async function invitacionesParaMi(userId, userEmail, empresas, log) {
  const admin = obtenerClienteAdmin();
  const correo = String(userEmail || '').trim().toLowerCase();
  if (!admin || !correo) return [];
  const { data, error } = await admin
    .from('invitaciones')
    .select('id, empresa_id, rol_id, expira_en, empresas ( nombre ), roles ( nombre )')
    .eq('correo', correo)
    .eq('estado', 'pendiente')
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) { log.warn('[empresas] invitaciones pendientes:', error.message); return []; }
  const mias = new Set((empresas || []).map((e) => e.id));
  return (data || [])
    .filter((i) => !mias.has(i.empresa_id))
    .map((i) => ({ id: i.id, empresaId: i.empresa_id, empresa: i.empresas ? i.empresas.nombre : null, rol: i.roles ? i.roles.nombre : null, expiraEn: i.expira_en }));
}

// ---- Cambiar de empresa (mueve el contexto activo en `perfiles`) ----
export async function cambiarEmpresa(accessToken, userId, empresaId, log = console) {
  if (typeof empresaId !== 'string' || !UUID.test(empresaId)) return { ok: false, error: 'Empresa no válida.' };
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('cambiar_empresa', { p_empresa_id: empresaId });
  if (error) {
    log.warn('[postgres] cambiar_empresa:', error.message);
    return { ok: false, error: mensajeDeLaBase(error, 'No se pudo cambiar de empresa.') };
  }
  olvidarEmpresaActual(userId);
  return { ok: true, ...data };
}

// ---- Aceptar una invitación estando YA dentro de otra empresa ----
// El alta de membresías solo la hace el backend con llave de servicio, y solo contra una
// invitación vigente dirigida al correo verificado de quien la acepta.
export async function aceptarInvitacionComoMiembro(userId, userEmail, invitacionId, log = console) {
  if (typeof invitacionId !== 'string' || !UUID.test(invitacionId)) return { ok: false, error: 'Invitación no válida.' };
  const admin = obtenerClienteAdmin();
  if (!admin) return { ok: false, error: 'Backend sin privilegios de administración configurados.' };
  const correo = String(userEmail || '').trim().toLowerCase();
  if (!userId || !correo) return { ok: false, error: 'No se pudo verificar tu correo.' };

  const { data: perfil } = await admin.from('perfiles').select('id').eq('id', userId).maybeSingle();
  if (!perfil) return { ok: false, error: 'Aún no tienes empresa: acepta la invitación desde la pantalla de inicio de tu cuenta.' };

  const { data: inv } = await admin
    .from('invitaciones')
    .select('id, empresa_id, rol_id, correo, estado, expira_en')
    .eq('id', invitacionId)
    .maybeSingle();
  if (!inv || String(inv.correo || '').trim().toLowerCase() !== correo) return { ok: false, error: 'No encontramos esa invitación para tu correo.' };
  if (inv.estado !== 'pendiente') return { ok: false, error: 'Esa invitación ya no está vigente.' };
  if (!inv.expira_en || new Date(inv.expira_en).getTime() <= Date.now()) return { ok: false, error: 'Esa invitación venció; pide que te la reenvíen.' };

  const { data: ya } = await admin.from('usuario_empresas').select('user_id').eq('user_id', userId).eq('empresa_id', inv.empresa_id).maybeSingle();
  if (!ya) {
    const { error } = await admin.from('usuario_empresas').insert({ user_id: userId, empresa_id: inv.empresa_id, rol_id: inv.rol_id, activo: true });
    if (error) { log.warn('[empresas] aceptar invitación (membresía):', error.message); return { ok: false, error: 'No se pudo unirte a la empresa.' }; }
  }
  await admin.from('invitaciones').update({ estado: 'aceptada', aceptada_en: new Date().toISOString() }).eq('id', inv.id);
  return { ok: true, empresaId: inv.empresa_id };
}
