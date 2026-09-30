// ============================================================
//  CONTATECK · Backend · Onboarding (Fase 1)
//
//  Dos rutas de "primera vez" que requieren privilegios elevados
//  (service role) porque el usuario todavía NO tiene fila en
//  `perfiles` — sin eso, ninguna RLS normal puede evaluarlo:
//    - crearEmpresaYDirector: nace la empresa + su primer director.
//    - aceptarInvitacionPendiente: busca una invitación por el
//      correo YA VERIFICADO del JWT (nunca uno que mande el
//      cliente) y, si existe, crea el perfil con la empresa/rol
//      que le asignaron.
//
//  La gestión normal de invitaciones (verlas/crearlas/cancelarlas
//  desde el panel de un director ya con empresa) SÍ usa el cliente
//  normal con RLS, igual que el resto del sistema — ver
//  crearInvitacion/listarInvitaciones/cancelarInvitacion abajo.
//
//  PENDIENTE (Fase 2, documentado, no implementado): que crear una
//  invitación también dispare un correo real (Resend/SendGrid) con
//  el token ya generado en la tabla. El token ya existe desde
//  ahora — solo falta "conectar el cable" cuando haya dominio propio.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import { obtenerClienteAdmin } from './supabaseAuth.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

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

async function obtenerEmpresaId(supabase, accessToken, log = console) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (error || !data) return null;
  return data.empresa_id;
}

// ---------------- Estado al iniciar sesión ----------------

// Se llama justo después de loguearse. Le dice al frontend cuál de
// las 3 pantallas mostrar: panel normal / crear empresa / ya se
// aceptó sola una invitación pendiente.
export async function verificarEstadoOnboarding(accessToken, userEmail, log = console) {
  const admin = obtenerClienteAdmin();
  if (!admin) return { ok: false, error: 'Backend sin privilegios de administración configurados.' };

  const userId = idDeToken(accessToken);
  if (!userId) return { ok: false, error: 'Token inválido.' };

  const { data: perfil, error: errPerfil } = await admin.from('perfiles').select('id, activo').eq('id', userId).maybeSingle();
  if (errPerfil) {
    log.warn('[onboarding] verificarEstadoOnboarding — error consultando perfiles:', errPerfil.message);
    return { ok: false, error: errPerfil.message, _debugUserId: userId };
  }
  if (perfil) {
    if (perfil.activo === false) return { ok: true, tienePerfil: true, activo: false };
    return { ok: true, tienePerfil: true, activo: true };
  }

  const { data: invitacion, error: errInv } = await admin
    .from('invitaciones')
    .select('*')
    .eq('correo', userEmail)
    .eq('estado', 'pendiente')
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errInv) log.warn('[onboarding] verificarEstadoOnboarding — error consultando invitaciones:', errInv.message);

  // DEBUG TEMPORAL: quitar _debugUserId en cuanto confirmemos la causa.
  return { ok: true, tienePerfil: false, invitacionPendiente: !!invitacion, _debugUserId: userId, _debugEmail: userEmail };
}

// ---------------- Crear empresa (director automático) ----------------

export async function crearEmpresaYDirector(accessToken, userEmail, nombreEmpresa, nombrePersona, log = console) {
  const admin = obtenerClienteAdmin();
  if (!admin) return { ok: false, error: 'Backend sin privilegios de administración configurados.' };

  const userId = idDeToken(accessToken);
  if (!userId) return { ok: false, error: 'Token inválido.' };
  if (!nombreEmpresa || !nombreEmpresa.trim()) return { ok: false, error: 'Captura el nombre de tu empresa.' };

  // Nunca dejar que alguien con perfil ya existente cree otra empresa por este camino.
  const { data: yaTienePerfil } = await admin.from('perfiles').select('id').eq('id', userId).maybeSingle();
  if (yaTienePerfil) return { ok: false, error: 'Tu cuenta ya pertenece a una empresa.' };

  const { data: rolDirector, error: errRol } = await admin.from('roles').select('id').eq('nombre', 'director').single();
  if (errRol || !rolDirector) return { ok: false, error: 'No se encontró el rol "director" en el catálogo.' };

  const { data: empresa, error: errEmpresa } = await admin
    .from('empresas')
    .insert({ nombre: nombreEmpresa.trim(), estado: 'activa' })
    .select().single();
  if (errEmpresa) { log.warn('[onboarding] crear empresa:', errEmpresa.message); return { ok: false, error: errEmpresa.message }; }

  const { data: perfil, error: errPerfil } = await admin
    .from('perfiles')
    .insert({
      id: userId,
      empresa_id: empresa.id,
      rol_id: rolDirector.id,
      nombre: (nombrePersona || userEmail || '').trim() || 'Director',
      email: userEmail,
    })
    .select().single();
  if (errPerfil) { log.warn('[onboarding] crear perfil director:', errPerfil.message); return { ok: false, error: errPerfil.message }; }

  // Plantilla base de cuentas — mismo catálogo (Código Agrupador SAT
  // simplificado) que ya usaba contabilidad.js. Punto de partida
  // editable: quien administre la empresa puede renombrar, desactivar
  // o agregar cuentas después — esto nunca se vuelve a aplicar solo.
  const CATALOGO_BASE = [
    { codigo: '100', nombre: 'Activo', naturaleza: 'deudora', nivel: 1 },
    { codigo: '101', nombre: 'Caja', naturaleza: 'deudora', nivel: 2 },
    { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora', nivel: 2 },
    { codigo: '105', nombre: 'Clientes', naturaleza: 'deudora', nivel: 2 },
    { codigo: '115', nombre: 'Inventarios', naturaleza: 'deudora', nivel: 2 },
    { codigo: '118', nombre: 'IVA acreditable', naturaleza: 'deudora', nivel: 2 },
    { codigo: '151', nombre: 'Equipo de cómputo', naturaleza: 'deudora', nivel: 2 },
    { codigo: '200', nombre: 'Pasivo', naturaleza: 'acreedora', nivel: 1 },
    { codigo: '201', nombre: 'Proveedores', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '205', nombre: 'Acreedores diversos', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '209', nombre: 'IVA trasladado', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '213', nombre: 'Impuestos por pagar', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '216', nombre: 'Sueldos por pagar', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '300', nombre: 'Capital contable', naturaleza: 'acreedora', nivel: 1 },
    { codigo: '301', nombre: 'Capital social', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '305', nombre: 'Resultado del ejercicio', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '400', nombre: 'Ingresos', naturaleza: 'acreedora', nivel: 1 },
    { codigo: '401', nombre: 'Ventas y servicios', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '402', nombre: 'Productos financieros', naturaleza: 'acreedora', nivel: 2 },
    { codigo: '500', nombre: 'Costos y gastos', naturaleza: 'deudora', nivel: 1 },
    { codigo: '501', nombre: 'Costo de ventas', naturaleza: 'deudora', nivel: 2 },
    { codigo: '601', nombre: 'Gastos de operación', naturaleza: 'deudora', nivel: 2 },
    { codigo: '602', nombre: 'Gastos de administración', naturaleza: 'deudora', nivel: 2 },
    { codigo: '603', nombre: 'Gastos de venta', naturaleza: 'deudora', nivel: 2 },
  ];
  const { error: errCuentas } = await admin
    .from('cuentas_contables')
    .insert(CATALOGO_BASE.map((c) => ({ ...c, empresa_id: empresa.id })));
  if (errCuentas) {
    // No se bloquea el alta de la empresa por esto — el catálogo se
    // puede armar a mano después si el sembrado falla por algún motivo.
    log.warn('[onboarding] sembrar catálogo de cuentas:', errCuentas.message);
  }

  return { ok: true, empresa, perfil };
}

// ---------------- Aceptar invitación pendiente ----------------

export async function aceptarInvitacionPendiente(accessToken, userEmail, log = console) {
  const admin = obtenerClienteAdmin();
  if (!admin) return { ok: false, error: 'Backend sin privilegios de administración configurados.' };

  const userId = idDeToken(accessToken);
  if (!userId) return { ok: false, error: 'Token inválido.' };

  const { data: yaTienePerfil } = await admin.from('perfiles').select('id').eq('id', userId).maybeSingle();
  if (yaTienePerfil) return { ok: false, error: 'Tu cuenta ya pertenece a una empresa.' };

  const { data: invitacion } = await admin
    .from('invitaciones')
    .select('*')
    .eq('correo', userEmail)
    .eq('estado', 'pendiente')
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invitacion) return { ok: false, error: 'No encontramos ninguna invitación vigente para tu correo.' };

  const { data: perfil, error: errPerfil } = await admin
    .from('perfiles')
    .insert({ id: userId, empresa_id: invitacion.empresa_id, rol_id: invitacion.rol_id, nombre: userEmail, email: userEmail })
    .select().single();
  if (errPerfil) { log.warn('[onboarding] aceptar invitación (crear perfil):', errPerfil.message); return { ok: false, error: errPerfil.message }; }

  await admin.from('invitaciones').update({ estado: 'aceptada', aceptada_en: new Date().toISOString() }).eq('id', invitacion.id);

  return { ok: true, perfil };
}

// ---------------- Gestión normal de invitaciones (RLS, director/admin) ----------------

export async function listarInvitaciones(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.from('invitaciones').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, invitaciones: data || [] };
}

export async function crearInvitacion(accessToken, userId, datos, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!['rh', 'admin', 'director'].includes(rol)) return { ok: false, error: 'No tienes permiso para invitar personas (tu rol no lo permite).' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  if (!datos.correo || !datos.rolId) return { ok: false, error: 'Faltan datos obligatorios (correo, rol).' };

  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const correo = datos.correo.trim().toLowerCase();

  // Evita duplicados: si ya hay una pendiente y vigente para este correo,
  // no crear otra — usar "Reenviar" en vez de repetir el formulario.
  const { data: existente } = await supabase
    .from('invitaciones')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('correo', correo)
    .eq('estado', 'pendiente')
    .gt('expira_en', new Date().toISOString())
    .maybeSingle();
  if (existente) return { ok: false, error: 'Ya existe una invitación pendiente para este correo. Usa "Reenviar" en vez de crear otra.' };

  const { data, error } = await supabase
    .from('invitaciones')
    .insert({ empresa_id: empresaId, correo, rol_id: datos.rolId, invitado_por: userId })
    .select().single();
  if (error) {
    log.warn('[postgres] crearInvitacion:', error.message);
    if (error.code === '23505') { // violación de índice único = duplicado real, no error técnico
      return { ok: false, error: 'Ya existe una invitación pendiente para este correo. Usa "Reenviar" en vez de crear otra.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, invitacion: data };
}

// Renueva 7 días más + token nuevo. Sirve tanto para una vencida como para
// "adelantar" una pendiente que está por vencer — nunca para una ya aceptada.
export async function reenviarInvitacion(accessToken, invitacionId, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!['rh', 'admin', 'director'].includes(rol)) return { ok: false, error: 'No tienes permiso para reenviar invitaciones (tu rol no lo permite).' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data: actual } = await supabase.from('invitaciones').select('estado').eq('id', invitacionId).maybeSingle();
  if (!actual) return { ok: false, error: 'Invitación no encontrada.' };
  if (actual.estado === 'aceptada') return { ok: false, error: 'Esa invitación ya fue aceptada, no se puede reenviar.' };

  const nuevaExpiracion = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('invitaciones')
    .update({ estado: 'pendiente', expira_en: nuevaExpiracion, token: randomUUID() })
    .eq('id', invitacionId)
    .select().single();
  if (error) { log.warn('[postgres] reenviarInvitacion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, invitacion: data };
}

export async function cancelarInvitacion(accessToken, invitacionId, log = console) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!['rh', 'admin', 'director'].includes(rol)) return { ok: false, error: 'No tienes permiso para cancelar invitaciones (tu rol no lo permite).' };

  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.from('invitaciones').update({ estado: 'cancelada' }).eq('id', invitacionId).select().single();
  if (error) { log.warn('[postgres] cancelarInvitacion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, invitacion: data };
}
