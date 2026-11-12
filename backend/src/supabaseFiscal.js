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
//  se calcula aquí mismo con las declaraciones aún no presentadas
//  (fecha de vencimiento capturada) y el nombre de su obligación.
//
//  OT-0031: validaciones de entrada (validacionesFiscal.js), errores de
//  Postgres traducidos a mensajes sin detalles internos, rutas de
//  Storage restringidas a la empresa y fechas en hora de México.
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
import {
  esUuid, hoyMexico, diasEntre, validarObligacion, validarDeclaracionNueva,
  validarActualizacionDeclaracion, validarDocumentoNuevo, rutaDocumentoValida, alertasVigencia,
  esComplementaria, similaresDePeriodo, esDuplicadaDePresentada, validarCodigosAgrupador,
} from './validacionesFiscal.js';

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

// OT-0031: el mensaje crudo de Postgres/PostgREST (nombres de tablas,
// políticas, restricciones) se queda en el log del servidor; al navegador
// solo llega un texto entendible.
function errorAmigable(error, accion, log = console) {
  log.warn(`[postgres] ${accion}:`, error?.message);
  switch (error?.code) {
    case '42501': return { ok: false, error: 'No tienes permiso para esta acción sobre los datos de tu empresa.' };
    case '23505': return { ok: false, error: 'Ya existe un registro igual.' };
    case '23503': return { ok: false, error: 'El registro relacionado no existe.' };
    case '23514': case '22P02': case '22007': case '22008':
      return { ok: false, error: 'Algún dato tiene un formato o valor no válido.' };
    // Columna que aún no existe: falta correr el script de database/ de la OT.
    case '42703': case 'PGRST204':
      return { ok: false, error: 'La base de datos todavía no tiene la columna codigo_agrupador: hay que correr database/OT-0031b-codigo-agrupador.sql en Supabase.' };
    case 'PGRST116': return { ok: false, error: 'No se encontró el registro (o no pertenece a tu empresa).' };
    default: return { ok: false, error: `No se pudo ${accion}. Inténtalo de nuevo; si persiste, avisa al administrador.` };
  }
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
  if (error) return errorAmigable(error, 'cargar las obligaciones', log);
  return { ok: true, obligaciones: data || [] };
}

export async function crearObligacion(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_CONFIGURAN_OBLIGACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const v = validarObligacion(datos);
  if (v.error) return { ok: false, error: v.error };
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const { data, error } = await supabase
    .from('obligaciones_fiscales')
    .insert({ empresa_id: empresaId, ...v.valores, created_by: userId })
    .select().single();
  if (error) return errorAmigable(error, 'guardar la obligación', log);
  return { ok: true, obligacion: data };
}

export async function actualizarObligacion(accessToken, obligacionId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_CONFIGURAN_OBLIGACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!esUuid(obligacionId)) return { ok: false, error: 'El identificador de la obligación no es válido.' };
  const v = validarObligacion(datos, true);
  if (v.error) return { ok: false, error: v.error };

  const { data, error } = await supabase
    .from('obligaciones_fiscales').update(v.valores).eq('id', obligacionId).select().single();
  if (error) return errorAmigable(error, 'actualizar la obligación', log);
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
  if (error) return errorAmigable(error, 'cargar las declaraciones', log);
  return { ok: true, declaraciones: data || [] };
}

export async function crearDeclaracion(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const v = validarDeclaracionNueva(datos);
  if (v.error) return { ok: false, error: v.error };
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  // La obligación debe ser visible para este usuario (misma empresa, por
  // RLS) y estar activa: no se registran declaraciones de otra empresa ni
  // de una obligación dada de baja.
  const { data: obl, error: errObl } = await supabase
    .from('obligaciones_fiscales').select('id, activa').eq('id', v.valores.obligacion_id).maybeSingle();
  if (errObl) return errorAmigable(errObl, 'verificar la obligación', log);
  if (!obl) return { ok: false, error: 'La obligación no existe o no es de tu empresa.' };
  if (obl.activa === false) return { ok: false, error: 'La obligación está inactiva; actívala antes de registrar declaraciones.' };

  // Aviso de duplicado: si ya hay una declaración de esta obligación y periodo
  // (presentada o no) se devuelve el detalle y NO se guarda hasta que el
  // usuario confirme (`confirmarDuplicada: true`). Una complementaria no pide
  // confirmación: es justo el caso en que conviven dos.
  if (!esComplementaria(v.valores.notas) && datos.confirmarDuplicada !== true) {
    const { data: previas, error: errPrev } = await supabase
      .from('declaraciones')
      .select('id, obligacion_id, periodo, estado, fecha_vencimiento, fecha_presentacion, notas')
      .eq('obligacion_id', v.valores.obligacion_id);
    if (errPrev) return errorAmigable(errPrev, 'verificar declaraciones existentes', log);
    const similares = similaresDePeriodo(v.valores, previas || []);
    if (similares.length) {
      return {
        ok: false,
        codigo: 'DUPLICADA',
        error: 'Ya existe una declaración de esta obligación para ese periodo.',
        existentes: similares.map((s) => ({
          estado: s.estado,
          fechaVencimiento: s.fecha_vencimiento ? String(s.fecha_vencimiento).slice(0, 10) : null,
          fechaPresentacion: s.fecha_presentacion ? String(s.fecha_presentacion).slice(0, 10) : null,
        })),
      };
    }
  }

  const { data, error } = await supabase
    .from('declaraciones')
    .insert({ empresa_id: empresaId, ...v.valores, estado: 'pendiente', created_by: userId })
    .select().single();
  if (error) return errorAmigable(error, 'guardar la declaración', log);
  return { ok: true, declaracion: data };
}

// Marca una declaración como presentada (o en_proceso), registrando quién y cuándo.
export async function actualizarDeclaracion(accessToken, userId, declaracionId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!esUuid(declaracionId)) return { ok: false, error: 'El identificador de la declaración no es válido.' };
  const v = validarActualizacionDeclaracion(datos);
  if (v.error) return { ok: false, error: v.error };
  const val = v.valores;

  const { data: actual, error: errAct } = await supabase
    .from('declaraciones').select('id, estado').eq('id', declaracionId).maybeSingle();
  if (errAct) return errorAmigable(errAct, 'consultar la declaración', log);
  if (!actual) return { ok: false, error: 'La declaración no existe o no es de tu empresa.' };

  const patch = {};
  if (val.estado !== undefined) patch.estado = val.estado;
  if (val.folio_acuse !== undefined) patch.folio_acuse = val.folio_acuse;
  if (val.notas !== undefined) patch.notas = val.notas;
  if (val.documentoPath !== undefined) {
    const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
    if (!rutaDocumentoValida(val.documentoPath, empresaId)) {
      return { ok: false, error: 'El archivo adjunto no es válido para tu empresa.' };
    }
    patch.documento_path = val.documentoPath;
  }
  if (val.estado === 'presentada') {
    // Si ya estaba presentada no se pisa la fecha original (salvo que se
    // mande una fecha explícita).
    if (actual.estado !== 'presentada' || val.fechaPresentacion) {
      patch.fecha_presentacion = val.fechaPresentacion || hoyMexico();
      patch.presentado_por = userId;
    }
  } else if (val.estado !== undefined) {
    // Regresa a pendiente/en proceso: ya no hay fecha ni responsable de presentación.
    patch.fecha_presentacion = null;
    patch.presentado_por = null;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'No hay cambios que guardar.' };

  const { data, error } = await supabase
    .from('declaraciones').update(patch).eq('id', declaracionId).select().single();
  if (error) return errorAmigable(error, 'actualizar la declaración', log);
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
  if (error) return errorAmigable(error, 'cargar los documentos', log);
  return { ok: true, documentos: data || [] };
}

export async function crearDocumentoFiscal(accessToken, userId, datos, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const v = validarDocumentoNuevo(datos);
  if (v.error) return { ok: false, error: v.error };
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };
  if (!rutaDocumentoValida(v.valores.documentoPath, empresaId)) {
    return { ok: false, error: 'El archivo adjunto no es válido para tu empresa.' };
  }

  const { documentoPath, ...resto } = v.valores;
  const { data, error } = await supabase
    .from('documentos_fiscales')
    .insert({ empresa_id: empresaId, ...resto, documento_path: documentoPath, created_by: userId })
    .select().single();
  if (error) return errorAmigable(error, 'guardar el documento', log);
  return { ok: true, documento: data };
}

// ---------------- Proveedores de la DIOT ----------------
// Las pólizas de Postgres traen el UUID del CFDI pero no el RFC/nombre del
// proveedor (eso vive en cfdis_proveedor). La DIOT del panel los une por UUID.
export async function listarProveedoresDiot(accessToken, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('cfdis_proveedor').select('uuid_sat, emisor_rfc, emisor_nombre').not('uuid_sat', 'is', null).limit(5000);
  if (error) return errorAmigable(error, 'cargar los proveedores de la DIOT', log);
  return { ok: true, proveedores: (data || []).map((p) => ({ uuid: p.uuid_sat, rfc: p.emisor_rfc || '', nombre: p.emisor_nombre || '' })) };
}

// ---------------- Código Agrupador SAT por cuenta ----------------
// Guarda el lote de la hoja que llena la contadora. Las cuentas se actualizan
// con el cliente del usuario: la RLS decide qué cuentas son de su empresa
// (las demás no se tocan y se reportan como "no encontradas").
export async function guardarCodigosAgrupador(accessToken, filas, log = console) {
  const chk = await verificarAcceso(accessToken, ROLES_ESCRIBEN_DECLARACIONES, log);
  if (!chk.ok) return chk;
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const v = validarCodigosAgrupador(filas);
  if (v.error) return { ok: false, error: v.error };

  let actualizadas = 0;
  const noEncontradas = [];
  for (let i = 0; i < v.valores.length; i += 10) {
    const tanda = v.valores.slice(i, i + 10);
    const res = await Promise.all(tanda.map((f) =>
      supabase.from('cuentas_contables').update({ codigo_agrupador: f.codigo_agrupador }).eq('id', f.id).select('id')));
    for (let j = 0; j < res.length; j++) {
      if (res[j].error) return errorAmigable(res[j].error, 'guardar los códigos agrupador', log);
      if (res[j].data && res[j].data.length) actualizadas++; else noEncontradas.push(tanda[j].id);
    }
  }
  return { ok: true, actualizadas, noEncontradas };
}

// ---------------- Alertas de vigencia de documentos (para el Dashboard) ----------------
// Nunca lanza: si no se puede leer, el Dashboard sigue sin esas alertas.
export async function obtenerAlertasDocumentos(supabase, log = console) {
  try {
    const { data, error } = await supabase
      .from('documentos_fiscales').select('tipo, nombre, vigencia_hasta').not('vigencia_hasta', 'is', null);
    if (error) { log.warn('[postgres] alertas de documentos:', error.message); return []; }
    return alertasVigencia(data || []);
  } catch (e) {
    log.warn('[postgres] alertas de documentos:', e?.message);
    return [];
  }
}

// ---------------- Calendario (derivado, sin tabla propia) ----------------

export async function obtenerCalendario(accessToken, log = console, clienteExistente = null) {
  let supabase = clienteExistente;
  if (!supabase) {
    const chk = await verificarAcceso(accessToken, ROLES_VEN, log);
    if (!chk.ok) return chk;
    supabase = clienteComoUsuario(accessToken);
  }
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  // Se leen TODAS las obligaciones (no solo las activas) para poder poner
  // nombre a cualquier declaración y omitir las de obligaciones dadas de baja.
  const [obl, decl] = await Promise.all([
    supabase.from('obligaciones_fiscales').select('id, nombre, activa'),
    // Se leen también las presentadas: sirven para no alertar por una declaración
    // "de más" del mismo periodo (ver esDuplicadaDePresentada).
    supabase.from('declaraciones').select('id, obligacion_id, periodo, fecha_vencimiento, estado, notas'),
  ]);
  if (obl.error) return errorAmigable(obl.error, 'cargar el calendario', log);
  if (decl.error) return errorAmigable(decl.error, 'cargar el calendario', log);

  // Los días se cuentan con fechas de calendario en hora de México: antes se
  // restaba la medianoche UTC al instante actual y el mismo día del
  // vencimiento (a partir de las 18:00) ya salía como "vencida".
  const hoy = hoyMexico();
  const obligaciones = obl.data || [];
  const todas = decl.data || [];
  const proximas = todas
    .filter((d) => d.estado !== 'presentada' && !esDuplicadaDePresentada(d, todas))
    .map((d) => ({ d, obligacion: obligaciones.find((o) => o.id === d.obligacion_id) }))
    .filter(({ obligacion }) => !obligacion || obligacion.activa !== false)
    .map(({ d, obligacion }) => {
      const diasRestantes = diasEntre(hoy, d.fecha_vencimiento);
      return {
        declaracionId: d.id,
        obligacion: obligacion ? obligacion.nombre : '—',
        periodo: d.periodo,
        fechaVencimiento: String(d.fecha_vencimiento).slice(0, 10),
        diasRestantes,
        estado: diasRestantes < 0 ? 'vencida' : d.estado,
      };
    })
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  return { ok: true, proximas };
}
