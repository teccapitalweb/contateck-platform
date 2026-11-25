// ============================================================
//  CONTATECK · Backend · Administración de PLATAFORMA (OT-0037)
//
//  Para el dueño de la plataforma: revisar todas las empresas, usuarios y
//  actividad. NO es el rol "admin" de una empresa.
//
//  Reglas:
//   - Solo SOLO LECTURA en esta versión.
//   - Usa la service role (cruza empresas) ÚNICAMENTE desde aquí, después de que
//     la ruta comprobó que quien llama está en `administradores_plataforma`.
//   - Cada consulta lista sus columnas: NUNCA se leen los datos del CSD
//     (csd_cer_base64, csd_key_base64, csd_password), ni `detalle` de la
//     auditoría, ni ip / user_agent.
// ============================================================
import { obtenerClienteAdmin } from './supabaseAuth.js';
import { config } from './config.js';
import { isFirebaseReady } from './firebase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arranque = Date.now();

function sinCliente() {
  return { ok: false, status: 503, error: 'Supabase no está configurado en el backend.' };
}

// ¿Es administrador de plataforma? Devuelve { ok, esAdmin, nivel, tablaFaltante }.
export async function consultarAdministrador(uid, log = console) {
  const sb = obtenerClienteAdmin();
  if (!sb) return sinCliente();
  if (!UUID.test(String(uid || ''))) return { ok: true, esAdmin: false };
  const { data, error } = await sb.from('administradores_plataforma').select('nivel').eq('user_id', uid).maybeSingle();
  if (error) {
    // 42P01 / PGRST205: la tabla aún no existe (falta correr el SQL de la OT-0037).
    if (error.code === '42P01' || error.code === 'PGRST205') return { ok: true, esAdmin: false, tablaFaltante: true };
    log.warn('[plataforma] consultarAdministrador:', error.message);
    return { ok: false, status: 500, error: 'No se pudo comprobar el acceso.' };
  }
  return { ok: true, esAdmin: !!data, nivel: data ? data.nivel : null };
}

async function contar(sb, tabla, filtro) {
  let q = sb.from(tabla).select('id', { count: 'exact', head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  return error ? null : count;
}

// Último acceso real de cada usuario: viene de Supabase Auth (perfiles.last_login no se llena).
async function ultimosAccesos(sb) {
  const mapa = new Map();
  try {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    (data?.users || []).forEach((u) => mapa.set(u.id, { ultimoAcceso: u.last_sign_in_at || null, confirmado: !!u.email_confirmed_at }));
  } catch (e) { /* sin dato: se muestra "—" */ }
  return mapa;
}

export async function resumenPlataforma() {
  const sb = obtenerClienteAdmin();
  if (!sb) return sinCliente();
  const [empresas, usuarios, polizas, cfdis, invitaciones, actividad7d] = await Promise.all([
    contar(sb, 'empresas'),
    contar(sb, 'perfiles'),
    contar(sb, 'polizas'),
    contar(sb, 'cfdis'),
    contar(sb, 'invitaciones', (q) => q.eq('estado', 'pendiente')),
    contar(sb, 'auditoria_log', (q) => q.gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())),
  ]);
  return { ok: true, resumen: { empresas, usuarios, polizas, cfdis, invitacionesPendientes: invitaciones, movimientos7dias: actividad7d } };
}

// OT-0056: con multiempresa, quien trabaja en otra empresa sigue siendo de esta. Se cuenta por
// membresía (usuario_empresas); si esa tabla aún no existe se usa perfiles, como antes.
async function personasPorEmpresa(sb) {
  const { data, error } = await sb.from('usuario_empresas').select('user_id, empresa_id, activo');
  if (!error) return (data || []).map((m) => ({ id: m.user_id, empresa_id: m.empresa_id, activo: m.activo }));
  const { data: perfiles } = await sb.from('perfiles').select('id, empresa_id, activo');
  return perfiles || [];
}

export async function listarEmpresas() {
  const sb = obtenerClienteAdmin();
  if (!sb) return sinCliente();
  const { data: empresas, error } = await sb
    .from('empresas')
    .select('id, nombre, rfc, plan, status, estado, created_at')
    .order('created_at', { ascending: true });
  if (error) return { ok: false, status: 500, error: 'No se pudieron leer las empresas.' };

  const perfiles = await personasPorEmpresa(sb);
  const accesos = await ultimosAccesos(sb);

  const filas = await Promise.all((empresas || []).map(async (e) => {
    const [polizas, cfdis, ultimo] = await Promise.all([
      contar(sb, 'polizas', (q) => q.eq('empresa_id', e.id)),
      contar(sb, 'cfdis', (q) => q.eq('empresa_id', e.id)),
      sb.from('auditoria_log').select('created_at').eq('empresa_id', e.id).order('created_at', { ascending: false }).limit(1),
    ]);
    const suyos = (perfiles || []).filter((p) => p.empresa_id === e.id);
    let ultimoAcceso = null;
    suyos.forEach((p) => {
      const a = accesos.get(p.id);
      if (a && a.ultimoAcceso && (!ultimoAcceso || a.ultimoAcceso > ultimoAcceso)) ultimoAcceso = a.ultimoAcceso;
    });
    return {
      id: e.id, nombre: e.nombre, rfc: e.rfc, plan: e.plan, status: e.status, estado: e.estado, creada: e.created_at,
      usuarios: suyos.length, usuariosActivos: suyos.filter((p) => p.activo !== false).length,
      polizas, cfdis, ultimoAcceso,
      ultimaActividad: ultimo?.data?.[0]?.created_at || null,
    };
  }));
  return { ok: true, empresas: filas };
}

export async function listarUsuariosEmpresa(empresaId) {
  const sb = obtenerClienteAdmin();
  if (!sb) return sinCliente();
  if (!UUID.test(String(empresaId || ''))) return { ok: false, status: 400, error: 'Empresa no válida.' };
  // OT-0056: por membresía (incluye a quien hoy trabaja en otra empresa); sin la tabla, por perfiles como antes.
  let data = null;
  const { data: ms, error: errMs } = await sb
    .from('usuario_empresas')
    .select('user_id, activo, created_at, roles(nombre), perfiles(nombre, email)')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true });
  if (!errMs) {
    data = (ms || []).map((m) => ({ id: m.user_id, nombre: m.perfiles?.nombre, email: m.perfiles?.email, activo: m.activo, created_at: m.created_at, roles: m.roles }));
  } else {
    const r = await sb
      .from('perfiles')
      .select('id, nombre, email, activo, created_at, roles(nombre)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true });
    if (r.error) return { ok: false, status: 500, error: 'No se pudieron leer los usuarios.' };
    data = r.data;
  }
  const accesos = await ultimosAccesos(sb);
  return {
    ok: true,
    usuarios: (data || []).map((p) => ({
      id: p.id, nombre: p.nombre, email: p.email, rol: p.roles?.nombre || null, activo: p.activo !== false,
      desde: p.created_at,
      ultimoAcceso: accesos.get(p.id)?.ultimoAcceso || null,
      correoConfirmado: accesos.get(p.id)?.confirmado ?? null,
    })),
  };
}

export async function actividadReciente(limite) {
  const sb = obtenerClienteAdmin();
  if (!sb) return sinCliente();
  const n = Math.min(Math.max(parseInt(limite, 10) || 50, 1), 200);
  const { data, error } = await sb
    .from('auditoria_log')
    .select('id, empresa_id, usuario_id, modulo, accion, tabla_afectada, created_at')
    .order('created_at', { ascending: false })
    .limit(n);
  if (error) return { ok: false, status: 500, error: 'No se pudo leer la actividad.' };
  const [{ data: empresas }, { data: perfiles }] = await Promise.all([
    sb.from('empresas').select('id, nombre'),
    sb.from('perfiles').select('id, email'),
  ]);
  const nombreEmpresa = Object.fromEntries((empresas || []).map((e) => [e.id, e.nombre]));
  const correo = Object.fromEntries((perfiles || []).map((p) => [p.id, p.email]));
  return {
    ok: true,
    actividad: (data || []).map((a) => ({
      id: a.id, fecha: a.created_at, modulo: a.modulo, accion: a.accion, tabla: a.tabla_afectada,
      empresa: nombreEmpresa[a.empresa_id] || null, usuario: correo[a.usuario_id] || null,
    })),
  };
}

// Estado del sistema. Solo banderas y tiempos: nunca llaves.
export async function saludPlataforma() {
  const sb = obtenerClienteAdmin();
  const salud = {
    backend: { ok: true, activoMinutos: Math.round((Date.now() - arranque) / 60000) },
    supabase: { ok: false, ms: null },
    fiscalapi: {
      ambiente: config.fiscalapi.apiUrl.includes('test.') ? 'PRUEBAS' : 'PRODUCCIÓN',
      llavesConfiguradas: !!(config.fiscalapi.apiKey && config.fiscalapi.tenant),
    },
    seguridad: {
      autenticacionObligatoria: !!config.requireAuth,
      corsAbiertoATodos: config.allowedOrigins.includes('*'),
    },
    firebaseHeredado: isFirebaseReady(),
  };
  if (sb) {
    const t0 = Date.now();
    const { error } = await sb.from('roles').select('id', { head: true, count: 'exact' }).limit(1);
    salud.supabase = { ok: !error, ms: Date.now() - t0 };
  }
  return { ok: true, salud };
}
