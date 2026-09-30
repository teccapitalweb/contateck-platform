// ============================================================
//  CONTATECK · Backend · SAT y Fiscal (Parte A)
//
//  IMPORTANTE — alcance aprobado: bitácora manual de obligaciones
//  y declaraciones + almacenamiento de documentos. Todo lo demás
//  queda documentado como Parte B, SIN implementar hasta contar
//  con e.firma real y las reglas del responsable contable:
//    - Descarga Masiva del SAT (requiere e.firma)
//    - XML de facturas RECIBIDAS de proveedores
//    - Cálculo automático de IVA/ISR/DIOT
//    - Presentación electrónica de declaraciones ante el SAT
//  El "calendario" de próximos vencimientos NO es una tabla nueva:
//  se calcula aquí mismo cruzando obligaciones_fiscales (día
//  límite) con declaraciones (qué ya se presentó).
//
//  EVENTOS FUTUROS DEL MÓDULO (documentados, NO implementados):
//    - "declaracion.vencida"    -> podría generar alerta/notificación.
//    - "declaracion.presentada" -> podría archivar automáticamente
//                                   el acuse en el expediente anual.
//    - "obligacion.creada"      -> podría generar automáticamente
//                                   las próximas N declaraciones
//                                   pendientes según periodicidad.
//  Ninguno de estos ganchos existe todavía en el código.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

const ROLES_VEN = ['contador', 'admin', 'director', 'auditor'];
const ROLES_ESCRIBEN_DECLARACIONES = ['contador', 'admin', 'director'];
const ROLES_CONFIGURAN_OBLIGACIONES = ['admin', 'director'];

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
  if (error || !data) {
    log.warn('[postgres] obtenerEmpresaId (fiscal):', error?.message);
    return null;
  }
  return data.empresa_id;
}

async function verificarAcceso(accessToken, rolesPermitidos, log) {
  const rol = await obtenerRolUsuario(accessToken, log);
  if (!rolesPermitidos.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para esta acción del módulo SAT y Fiscal (tu rol no lo permite).' };
  }
  return { ok: true, rol };
}

// ---------------- Obligaciones ----------------

export async function listarObligaciones(accessToken, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('obligaciones_fiscales')
    .select('*')
    .order('nombre', { ascending: true });
  if (error) { log.warn('[postgres] listarObligaciones:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, obligaciones: data || [] };
}

export async function crearObligacion(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_CONFIGURAN_OBLIGACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!datos.nombre || !datos.periodicidad || !datos.diaLimite) {
    return { ok: false, error: 'Faltan datos obligatorios (nombre, periodicidad, día límite).' };
  }
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const { data, error } = await supabase
    .from('obligaciones_fiscales')
    .insert({
      empresa_id: empresaId,
      nombre: datos.nombre,
      periodicidad: datos.periodicidad,
      dia_limite: datos.diaLimite,
      mes_limite: datos.mesLimite || null,
      created_by: userId,
    })
    .select().single();
  if (error) { log.warn('[postgres] crearObligacion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, obligacion: data };
}

export async function actualizarObligacion(accessToken, obligacionId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_CONFIGURAN_OBLIGACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const patch = {};
  if (datos.nombre !== undefined) patch.nombre = datos.nombre;
  if (datos.periodicidad !== undefined) patch.periodicidad = datos.periodicidad;
  if (datos.diaLimite !== undefined) patch.dia_limite = datos.diaLimite;
  if (datos.mesLimite !== undefined) patch.mes_limite = datos.mesLimite;
  if (datos.activa !== undefined) patch.activa = datos.activa;

  const { data, error } = await supabase
    .from('obligaciones_fiscales').update(patch).eq('id', obligacionId).select().single();
  if (error) { log.warn('[postgres] actualizarObligacion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, obligacion: data };
}

// ---------------- Declaraciones ----------------

export async function listarDeclaraciones(accessToken, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('declaraciones')
    .select('*')
    .order('fecha_vencimiento', { ascending: true });
  if (error) { log.warn('[postgres] listarDeclaraciones:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, declaraciones: data || [] };
}

export async function crearDeclaracion(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!datos.obligacionId || !datos.periodo || !datos.fechaVencimiento) {
    return { ok: false, error: 'Faltan datos obligatorios (obligación, periodo, fecha de vencimiento).' };
  }
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const { data, error } = await supabase
    .from('declaraciones')
    .insert({
      empresa_id: empresaId,
      obligacion_id: datos.obligacionId,
      periodo: datos.periodo,
      fecha_vencimiento: datos.fechaVencimiento,
      estado: 'pendiente',
      notas: datos.notas || null,
      created_by: userId,
    })
    .select().single();
  if (error) { log.warn('[postgres] crearDeclaracion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, declaracion: data };
}

// Marca una declaración como presentada (o en_proceso), registrando quién y cuándo.
export async function actualizarDeclaracion(accessToken, userId, declaracionId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const patch = {};
  if (datos.estado !== undefined) patch.estado = datos.estado;
  if (datos.folioAcuse !== undefined) patch.folio_acuse = datos.folioAcuse;
  if (datos.documentoPath !== undefined) patch.documento_path = datos.documentoPath;
  if (datos.notas !== undefined) patch.notas = datos.notas;
  if (datos.estado === 'presentada') {
    patch.fecha_presentacion = new Date().toISOString().slice(0, 10);
    patch.presentado_por = userId;
  }

  const { data, error } = await supabase
    .from('declaraciones').update(patch).eq('id', declaracionId).select().single();
  if (error) { log.warn('[postgres] actualizarDeclaracion:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, declaracion: data };
}

// ---------------- Documentos fiscales ----------------

export async function listarDocumentosFiscales(accessToken, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('documentos_fiscales').select('*').order('created_at', { ascending: false });
  if (error) { log.warn('[postgres] listarDocumentosFiscales:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, documentos: data || [] };
}

export async function crearDocumentoFiscal(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!datos.tipo || !datos.nombre || !datos.documentoPath) {
    return { ok: false, error: 'Faltan datos obligatorios (tipo, nombre, documento).' };
  }
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const { data, error } = await supabase
    .from('documentos_fiscales')
    .insert({
      empresa_id: empresaId,
      tipo: datos.tipo,
      nombre: datos.nombre,
      documento_path: datos.documentoPath,
      fecha_documento: datos.fechaDocumento || null,
      vigencia_hasta: datos.vigenciaHasta || null,
      created_by: userId,
    })
    .select().single();
  if (error) { log.warn('[postgres] crearDocumentoFiscal:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, documento: data };
}

// ---------------- Calendario (derivado, sin tabla propia) ----------------

const MESES_NUM = { Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6, Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12 };

export async function obtenerCalendario(accessToken, log = console, clienteExistente = null) {
  let supabase = clienteExistente;
  if (!supabase) {
    const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
    if (!chk.ok) return chk;
    supabase = clienteComoUsuario(accessToken);
  }
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const [obl, decl] = await Promise.all([
    supabase.from('obligaciones_fiscales').select('*').eq('activa', true),
    supabase.from('declaraciones').select('*'),
  ]);
  if (obl.error) return { ok: false, error: obl.error.message };
  if (decl.error) return { ok: false, error: decl.error.message };

  const hoy = new Date();
  const proximas = (decl.data || [])
    .filter((d) => d.estado !== 'presentada')
    .map((d) => {
      const vence = new Date(d.fecha_vencimiento);
      const diasRestantes = Math.ceil((vence - hoy) / 86400000);
      const obligacion = (obl.data || []).find((o) => o.id === d.obligacion_id);
      return {
        declaracionId: d.id,
        obligacion: obligacion ? obligacion.nombre : '—',
        periodo: d.periodo,
        fechaVencimiento: d.fecha_vencimiento,
        diasRestantes,
        estado: diasRestantes < 0 ? 'vencida' : d.estado,
      };
    })
    .sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento));

  return { ok: true, proximas };
}
