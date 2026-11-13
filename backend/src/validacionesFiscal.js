// ============================================================
//  CONTATECK · Backend · Validaciones del módulo SAT y Fiscal
//  OT-0031 · Funciones puras (sin red ni base) para poder probarlas
//  sueltas. Cada validación devuelve { error } o { valores } con los
//  datos ya limpios (texto recortado, tipos correctos).
// ============================================================

import { codigoAgrupadorExiste } from './catalogoCodigoAgrupador.js';

export const PERIODICIDADES = ['mensual', 'bimestral', 'anual'];
export const ESTADOS_DECLARACION = ['pendiente', 'en_proceso', 'presentada'];
export const TIPOS_DOCUMENTO = ['opinion_cumplimiento', 'constancia_situacion_fiscal', 'otro'];

const MAX_NOMBRE = 120;
const MAX_PERIODO = 60;
const MAX_FOLIO = 60;
const MAX_NOTAS = 500;
const ZONA = 'America/Mexico_City';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esUuid(v) { return UUID.test(String(v || '')); }

// Fecha de hoy (AAAA-MM-DD) en hora de México, no en UTC: después de las
// 18:00 locales la fecha UTC ya es la de mañana.
export function hoyMexico(ahora = new Date()) {
  return ahora.toLocaleDateString('sv-SE', { timeZone: ZONA });
}

export function fechaIsoValida(s) {
  if (typeof s !== 'string' || !ISO_FECHA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Días de calendario de `desde` a `hasta` (ambas AAAA-MM-DD). Negativo si
// `hasta` ya pasó. Cambio de mes/año y bisiestos salen bien porque se
// cuenta con fechas UTC puras, sin horas.
export function diasEntre(desde, hasta) {
  const p = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((p(hasta) - p(desde)) / 86400000);
}

function texto(v) { return typeof v === 'string' ? v.trim() : ''; }

function validarTextoLargo(valor, etiqueta, max, requerido) {
  const t = texto(valor);
  if (!t) return requerido ? { error: `Captura ${etiqueta}.` } : { valor: null };
  if (t.length > max) return { error: `${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} no puede pasar de ${max} caracteres.` };
  return { valor: t };
}

function entero(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^\d{1,2}$/.test(v.trim())) return parseInt(v, 10);
  return NaN;
}

// ---------------- Obligaciones ----------------
// parcial=true: solo se validan los campos que vienen (actualización).
export function validarObligacion(datos, parcial = false) {
  const d = datos || {};
  const valores = {};
  if (!parcial || d.nombre !== undefined) {
    const r = validarTextoLargo(d.nombre, 'el nombre de la obligación', MAX_NOMBRE, true);
    if (r.error) return { error: r.error };
    valores.nombre = r.valor;
  }
  if (!parcial || d.periodicidad !== undefined) {
    if (!PERIODICIDADES.includes(d.periodicidad)) return { error: 'La periodicidad debe ser mensual, bimestral o anual.' };
    valores.periodicidad = d.periodicidad;
  }
  if (!parcial || d.diaLimite !== undefined) {
    const n = entero(d.diaLimite);
    if (!(n >= 1 && n <= 31)) return { error: 'El día límite debe ser un número entre 1 y 31.' };
    valores.dia_limite = n;
  }
  if (d.mesLimite !== undefined && d.mesLimite !== null && d.mesLimite !== '') {
    const n = entero(d.mesLimite);
    if (!(n >= 1 && n <= 12)) return { error: 'El mes límite debe ser un número entre 1 y 12.' };
    valores.mes_limite = n;
  } else if (!parcial || d.mesLimite !== undefined) {
    valores.mes_limite = null;
  }
  if (d.activa !== undefined) {
    if (typeof d.activa !== 'boolean') return { error: 'El campo "activa" debe ser verdadero o falso.' };
    valores.activa = d.activa;
  }
  if (parcial && !Object.keys(valores).length) return { error: 'No hay cambios que guardar.' };
  return { valores };
}

// ---------------- Declaraciones ----------------
export function validarDeclaracionNueva(datos) {
  const d = datos || {};
  if (!esUuid(d.obligacionId)) return { error: 'Elige una obligación válida.' };
  const per = validarTextoLargo(d.periodo, 'el periodo', MAX_PERIODO, true);
  if (per.error) return { error: per.error };
  if (!fechaIsoValida(d.fechaVencimiento)) return { error: 'La fecha de vencimiento no es válida (AAAA-MM-DD).' };
  const notas = validarTextoLargo(d.notas, 'las notas', MAX_NOTAS, false);
  if (notas.error) return { error: notas.error };
  return { valores: { obligacion_id: d.obligacionId, periodo: per.valor, fecha_vencimiento: d.fechaVencimiento, notas: notas.valor } };
}

// `hoy` se inyecta para poder probar la regla "no en el futuro".
export function validarActualizacionDeclaracion(datos, hoy = hoyMexico()) {
  const d = datos || {};
  const valores = {};
  if (d.estado !== undefined) {
    if (!ESTADOS_DECLARACION.includes(d.estado)) return { error: 'El estado debe ser pendiente, en proceso o presentada.' };
    valores.estado = d.estado;
  }
  if (d.folioAcuse !== undefined) {
    const r = validarTextoLargo(d.folioAcuse, 'el folio del acuse', MAX_FOLIO, false);
    if (r.error) return { error: r.error };
    valores.folio_acuse = r.valor;
  }
  if (d.notas !== undefined) {
    const r = validarTextoLargo(d.notas, 'las notas', MAX_NOTAS, false);
    if (r.error) return { error: r.error };
    valores.notas = r.valor;
  }
  if (d.documentoPath !== undefined && d.documentoPath !== null) {
    if (typeof d.documentoPath !== 'string' || !d.documentoPath.trim()) return { error: 'La ruta del documento no es válida.' };
    valores.documentoPath = d.documentoPath.trim();
  }
  if (d.fechaPresentacion !== undefined && d.fechaPresentacion !== null && d.fechaPresentacion !== '') {
    if (!fechaIsoValida(d.fechaPresentacion)) return { error: 'La fecha de presentación no es válida (AAAA-MM-DD).' };
    if (d.fechaPresentacion > hoy) return { error: 'La fecha de presentación no puede ser futura.' };
    valores.fechaPresentacion = d.fechaPresentacion;
  }
  if (!Object.keys(valores).length) return { error: 'No hay cambios que guardar.' };
  return { valores };
}

// ---------------- Documentos fiscales ----------------
export function validarDocumentoNuevo(datos) {
  const d = datos || {};
  if (!TIPOS_DOCUMENTO.includes(d.tipo)) return { error: 'El tipo de documento no es válido.' };
  const nom = validarTextoLargo(d.nombre, 'el nombre del documento', MAX_NOMBRE, true);
  if (nom.error) return { error: nom.error };
  if (typeof d.documentoPath !== 'string' || !d.documentoPath.trim()) return { error: 'Falta el archivo del documento.' };
  const valores = { tipo: d.tipo, nombre: nom.valor, documentoPath: d.documentoPath.trim(), fecha_documento: null, vigencia_hasta: null };
  if (d.fechaDocumento) {
    if (!fechaIsoValida(d.fechaDocumento)) return { error: 'La fecha del documento no es válida (AAAA-MM-DD).' };
    valores.fecha_documento = d.fechaDocumento;
  }
  if (d.vigenciaHasta) {
    if (!fechaIsoValida(d.vigenciaHasta)) return { error: 'La fecha de vigencia no es válida (AAAA-MM-DD).' };
    if (valores.fecha_documento && d.vigenciaHasta < valores.fecha_documento) return { error: 'La vigencia no puede ser anterior a la fecha del documento.' };
    valores.vigencia_hasta = d.vigenciaHasta;
  }
  return { valores };
}

// La ruta de Storage debe ser de la propia empresa y de la carpeta "sat"
// (<empresa>/sat/<uuid>/documento.<ext>). Evita que alguien apunte la
// declaración a un archivo de otra empresa o de otro módulo.
export function rutaDocumentoValida(path, empresaId) {
  if (typeof path !== 'string' || !empresaId) return false;
  if (path.length > 300 || path.includes('..') || path.includes('\\') || path.startsWith('/')) return false;
  const partes = path.split('/');
  return partes.length === 4 && partes[0] === String(empresaId) && partes[1] === 'sat'
    && esUuid(partes[2]) && /^documento\.(pdf|jpg|png|webp)$/.test(partes[3]);
}

// ---------------- Alertas de vigencia de documentos ----------------
// De cada tipo de documento (los "otro" se separan por nombre) cuenta solo el
// de vigencia más lejana: si ya subiste la opinión nueva, la vencida de hace
// meses no vuelve a avisar. Alerta si vence en 5 días o menos, o ya venció.
export function alertasVigencia(documentos, hoy = hoyMexico()) {
  const mejores = new Map();
  for (const d of documentos || []) {
    if (!d || !d.vigencia_hasta) continue;
    const vig = String(d.vigencia_hasta).slice(0, 10);
    if (!fechaIsoValida(vig)) continue;
    const clave = d.tipo === 'otro' ? `otro:${String(d.nombre).trim().toLowerCase()}` : String(d.tipo);
    const previo = mejores.get(clave);
    if (!previo || vig > previo.vig) mejores.set(clave, { vig, nombre: d.nombre });
  }
  const alertas = [];
  for (const { vig, nombre } of mejores.values()) {
    const dias = diasEntre(hoy, vig);
    if (dias < 0) {
      alertas.push({ tipo: 'danger', titulo: `${nombre} vencido`, texto: `Su vigencia terminó el ${vig}. Sube el documento actualizado en SAT y Fiscal.`, accion: { vista: 'sat' } });
    } else if (dias <= 5) {
      alertas.push({ tipo: 'warn', titulo: dias === 0 ? `${nombre} vence hoy` : `${nombre} vence en ${dias} día${dias === 1 ? '' : 's'}`, texto: `Vigencia hasta el ${vig}.`, accion: { vista: 'sat' } });
    }
  }
  return alertas;
}

// ---------------- Duplicados de periodo ----------------
// Compara periodos sin importar mayúsculas, acentos ni espacios repetidos
// ("Julio 2026" = " julio  2026 ").
export function normalizarPeriodo(p) {
  return String(p == null ? '' : p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Las complementarias se marcan con el prefijo "[Complementaria]" en las notas.
// Es el ÚNICO caso en que dos declaraciones de la misma obligación y periodo
// conviven sin avisar (la extemporánea es una original tardía, no una corrección).
export function esComplementaria(notas) {
  return /^\[Complementaria\]/.test(String(notas || ''));
}

// Declaraciones de `existentes` de la misma obligación y mismo periodo que `nueva`.
export function similaresDePeriodo(nueva, existentes) {
  const k = normalizarPeriodo(nueva.periodo);
  return (existentes || []).filter((o) => o.id !== nueva.id && o.obligacion_id === nueva.obligacion_id && normalizarPeriodo(o.periodo) === k);
}

// ¿`d` sobra? No está presentada, no es complementaria y ya hay otra PRESENTADA
// de la misma obligación y periodo: no debe verse como vencida ni alertar.
export function esDuplicadaDePresentada(d, todas) {
  if (!d || d.estado === 'presentada' || esComplementaria(d.notas)) return false;
  return similaresDePeriodo(d, todas).some((o) => o.estado === 'presentada');
}

// ---------------- Código Agrupador SAT por cuenta ----------------
// Formato del Código Agrupador: "NNN" (cuenta de mayor) o "NNN.NN" (subcuenta),
// p. ej. 102.01. Aquí solo se revisa el FORMATO, no que el código exista en el catálogo del SAT.
const CODIGO_AGRUPADOR = /^\d{3}(\.\d{2})?$/;
export function codigoAgrupadorValido(c) { return CODIGO_AGRUPADOR.test(String(c || '')); }

// Valida el lote que manda el panel: [{ id, codigoAgrupador }]; '' o null = quitar el código.
export function validarCodigosAgrupador(filas) {
  if (!Array.isArray(filas) || !filas.length) return { error: 'No hay códigos que guardar.' };
  if (filas.length > 500) return { error: 'Máximo 500 cuentas por carga.' };
  const valores = [];
  const vistos = new Set();
  for (const f of filas) {
    if (!f || !esUuid(f.id)) return { error: 'Una de las cuentas no tiene un identificador válido.' };
    if (vistos.has(f.id)) return { error: 'Una cuenta viene repetida en la carga.' };
    vistos.add(f.id);
    const c = f.codigoAgrupador == null ? '' : String(f.codigoAgrupador).trim();
    if (c && !codigoAgrupadorValido(c)) return { error: `El código "${c.slice(0, 20)}" no tiene el formato del Código Agrupador (NNN o NNN.NN, por ejemplo 102.01).` };
    // Además de tener el formato, debe existir en el catálogo oficial del SAT (OT-0031c).
    if (c && !codigoAgrupadorExiste(c)) return { error: `El código "${c}" no existe en el catálogo de Códigos Agrupadores del SAT.` };
    valores.push({ id: f.id, codigo_agrupador: c || null });
  }
  return { valores };
}

// ---------------- Corregir una declaración pendiente (periodo y fecha límite) ----------------
export function validarCorreccionDeclaracion(datos) {
  const d = datos || {};
  const valores = {};
  if (d.periodo !== undefined) {
    const r = validarTextoLargo(d.periodo, 'el periodo', MAX_PERIODO, true);
    if (r.error) return { error: r.error };
    valores.periodo = r.valor;
  }
  if (d.fechaVencimiento !== undefined) {
    if (!fechaIsoValida(d.fechaVencimiento)) return { error: 'La fecha de vencimiento no es válida (AAAA-MM-DD).' };
    valores.fecha_vencimiento = d.fechaVencimiento;
  }
  if (!Object.keys(valores).length) return { error: 'No hay cambios que guardar.' };
  return { valores };
}
