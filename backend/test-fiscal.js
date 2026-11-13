// ============================================================
//  CONTATECK · OT-0040 · Pruebas del módulo SAT y Fiscal
//  Sin red ni base de datos ni servidor. Cubre (OT-0031, 0031b, 0031c y 0039):
//    1) Validaciones del backend (validacionesFiscal.js) y catálogo oficial de Códigos Agrupadores.
//    2) Lógica del backend (supabaseFiscal.js) con un cliente de base FALSO: calendario, altas,
//       duplicados, presentar/regresar, documentos, editar/eliminar, Código Agrupador, DIOT.
//    3) Ayudas puras del panel: fiscal.js (fechas sugeridas, plantilla) y auth-login.js (mensajes).
//    4) contabilidad.js COMPLETO en un navegador simulado: XML del SAT, hoja de cuentas, IVA y DIOT.
//  Uso:  node test-fiscal.js      (Node 22 o más nuevo; no instala nada)
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(aqui, '..', 'frontend');
const codigo = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');

let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Dependencias falsas SOLO para supabaseFiscal.js ----------
// (no hay base ni llaves: el cliente de Supabase, la configuración y la consulta del rol se reemplazan)
const STUB_SUPABASE = [
  'export function createClient() {',
  '  return { from(tabla) {',
  '    const q = { tabla, op: "select", patch: null, filtros: {} };',
  '    const api = {',
  '      select() { return api; }, neq() { return api; }, order() { return api; }, not() { return api; }, limit() { return api; },',
  '      insert(v) { q.op = "insert"; q.patch = v; return api; },',
  '      update(v) { q.op = "update"; q.patch = v; return api; },',
  '      delete() { q.op = "delete"; return api; },',
  '      eq(c, v) { q.filtros[c] = v; return api; },',
  '      then(res, rej) { return Promise.resolve(globalThis.__db.list ? globalThis.__db.list(q) : { data: [], error: null }).then(res, rej); },',
  '      async maybeSingle() { return globalThis.__db.maybe(q); },',
  '      async single() { return globalThis.__db.single(q); },',
  '    };',
  '    return api;',
  '  } };',
  '}',
].join('\n');
const STUBS = {
  '@supabase/supabase-js': STUB_SUPABASE,
  './config.js': 'export const config = { supabase: { url: "http://falso", anonKey: "k" } };',
  './supabaseCfdis.js': 'export async function obtenerRolUsuario() { return globalThis.__rol || "contador"; }',
};
const HOOKS = [
  'const STUBS = ' + JSON.stringify(STUBS) + ';',
  'export async function resolve(spec, ctx, next) {',
  '  if (STUBS[spec] && ctx.parentURL && ctx.parentURL.endsWith("/supabaseFiscal.js")) {',
  '    return { url: "data:text/javascript," + encodeURIComponent(STUBS[spec]), shortCircuit: true };',
  '  }',
  '  return next(spec, ctx);',
  '}',
].join('\n');
register('data:text/javascript,' + encodeURIComponent(HOOKS), import.meta.url);

const V = await import('./src/validacionesFiscal.js');
const CAT = await import('./src/catalogoCodigoAgrupador.js');
const F = await import('./src/supabaseFiscal.js');

const U = '123e4567-e89b-42d3-a456-426614174000';
const E = '11111111-1111-4111-8111-111111111111';
const OBL = '223e4567-e89b-42d3-a456-426614174000';
const DEC = '323e4567-e89b-42d3-a456-426614174000';
const jwt = 'h.' + Buffer.from(JSON.stringify({ sub: U })).toString('base64url') + '.s';
const log = { warn() {} };
const sumar = (hoy, n) => { const [a, m, d] = hoy.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };

// ============================================================
console.log('\n1) Validaciones y catálogo oficial del SAT');

await ok('hoy en México y días entre fechas (cambio de mes, año, bisiesto, día límite a las 20:00 locales)', () => {
  assert.equal(V.hoyMexico(new Date('2026-11-18T03:00:00Z')), '2026-11-17');
  assert.equal(V.diasEntre('2026-11-30', '2026-12-17'), 17);
  assert.equal(V.diasEntre('2026-12-30', '2027-01-17'), 18);
  assert.equal(V.diasEntre('2028-02-28', '2028-03-01'), 2);
  assert.equal(V.diasEntre('2026-11-17', '2026-11-16'), -1);
  assert.equal(V.diasEntre(V.hoyMexico(new Date('2026-11-18T02:00:00Z')), '2026-11-17'), 0);
  assert.ok(V.fechaIsoValida('2028-02-29') && !V.fechaIsoValida('2027-02-29') && !V.fechaIsoValida('2026-1-1'));
});

await ok('obligaciones: datos válidos, inválidos y actualización parcial', () => {
  assert.deepEqual(V.validarObligacion({ nombre: '  IVA mensual ', periodicidad: 'mensual', diaLimite: '17' }).valores, { nombre: 'IVA mensual', periodicidad: 'mensual', dia_limite: 17, mes_limite: null });
  for (const d of [
    { nombre: '', periodicidad: 'mensual', diaLimite: 5 }, { nombre: 'x', periodicidad: 'semanal', diaLimite: 5 },
    { nombre: 'x', periodicidad: 'mensual', diaLimite: 0 }, { nombre: 'x', periodicidad: 'mensual', diaLimite: 32 },
    { nombre: 'x', periodicidad: 'mensual', diaLimite: 5.5 }, { nombre: 'x'.repeat(121), periodicidad: 'mensual', diaLimite: 5 },
    { nombre: 'x', periodicidad: 'anual', diaLimite: 5, mesLimite: 13 },
  ]) assert.ok(V.validarObligacion(d).error, JSON.stringify(d));
  assert.deepEqual(V.validarObligacion({ activa: false }, true).valores, { activa: false });
  assert.ok(V.validarObligacion({}, true).error && V.validarObligacion({ activa: 'no' }, true).error);
});

await ok('declaraciones y documentos: validaciones y ruta de Storage de la propia empresa', () => {
  assert.equal(V.validarDeclaracionNueva({ obligacionId: U, periodo: ' Julio 2026 ', fechaVencimiento: '2026-08-17' }).valores.periodo, 'Julio 2026');
  assert.ok(V.validarDeclaracionNueva({ obligacionId: 'x', periodo: 'a', fechaVencimiento: '2026-08-17' }).error);
  assert.ok(V.validarActualizacionDeclaracion({ estado: 'vencida' }, '2026-11-17').error);
  assert.ok(V.validarActualizacionDeclaracion({ estado: 'presentada', fechaPresentacion: '2026-11-18' }, '2026-11-17').error);
  assert.ok(V.validarCorreccionDeclaracion({}).error && V.validarCorreccionDeclaracion({ periodo: '' }).error && V.validarCorreccionDeclaracion({ fechaVencimiento: '2026-02-30' }).error);
  assert.deepEqual(V.validarCorreccionDeclaracion({ periodo: ' Agosto 2026 ', fechaVencimiento: '2026-09-17' }).valores, { periodo: 'Agosto 2026', fecha_vencimiento: '2026-09-17' });
  const base = { tipo: 'otro', nombre: 'Opinión', documentoPath: 'e/sat/u/documento.pdf' };
  assert.ok(V.validarDocumentoNuevo(base).valores && V.validarDocumentoNuevo({ ...base, tipo: 'x' }).error);
  assert.ok(V.validarDocumentoNuevo({ ...base, fechaDocumento: '2026-05-10', vigenciaHasta: '2026-05-01' }).error);
  assert.ok(V.rutaDocumentoValida(`${E}/sat/${U}/documento.pdf`, E));
  for (const p of [`22222222-2222-4222-8222-222222222222/sat/${U}/documento.pdf`, `${E}/ventas/${U}/documento.pdf`, `${E}/sat/${U}/../x/documento.pdf`, `${E}/sat/${U}/documento.exe`, '', null]) {
    assert.ok(!V.rutaDocumentoValida(p, E), String(p));
  }
});

await ok('duplicados: mismo periodo sin importar mayúsculas ni acentos; la complementaria no cuenta', () => {
  assert.equal(V.normalizarPeriodo('  JÚLIO   2026 '), 'julio 2026');
  const P = { id: 'p', obligacion_id: 'o1', periodo: 'Julio 2026', estado: 'presentada', notas: null };
  const D = { id: 'd', obligacion_id: 'o1', periodo: ' julio 2026', estado: 'pendiente', notas: null };
  assert.equal(V.esDuplicadaDePresentada(D, [P, D]), true);
  assert.equal(V.esDuplicadaDePresentada({ ...D, notas: '[Complementaria]' }, [P, D]), false);
  assert.equal(V.esDuplicadaDePresentada({ ...D, notas: '[Extemporánea]' }, [P, D]), true);
  assert.equal(V.esDuplicadaDePresentada({ ...D, obligacion_id: 'o2' }, [P, D]), false);
  assert.equal(V.esDuplicadaDePresentada(P, [P, D]), false);
});

await ok('alertas de vigencia de documentos: 5 días, hoy, vencida, y el documento más nuevo de cada tipo', () => {
  const hoy = '2026-11-05';
  const al = V.alertasVigencia([
    { tipo: 'opinion_cumplimiento', nombre: 'Opinión vieja', vigencia_hasta: '2026-06-01' },
    { tipo: 'opinion_cumplimiento', nombre: 'Opinión nov', vigencia_hasta: '2026-11-08' },
    { tipo: 'constancia_situacion_fiscal', nombre: 'Constancia', vigencia_hasta: '2026-11-01' },
    { tipo: 'otro', nombre: 'Poder A', vigencia_hasta: '2026-11-05' },
    { tipo: 'otro', nombre: 'Poder B', vigencia_hasta: '2027-01-01' },
    { tipo: 'otro', nombre: 'Sin vigencia', vigencia_hasta: null },
  ], hoy);
  const t = al.map((a) => a.titulo).sort();
  assert.deepEqual(t, ['Constancia vencido', 'Opinión nov vence en 3 días', 'Poder A vence hoy']);
  assert.equal(V.alertasVigencia([{ tipo: 'otro', nombre: 'x', vigencia_hasta: '2026-11-11' }], hoy).length, 0);
});

await ok('Código Agrupador: el catálogo oficial trae 1,080 códigos y el lote se valida contra él', () => {
  assert.equal(CAT.CODIGOS_AGRUPADOR_SAT.length, 1080);
  assert.ok(CAT.codigoAgrupadorExiste('102.01') && CAT.codigoAgrupadorExiste('105.01') && CAT.codigoAgrupadorExiste('100'));
  assert.ok(!CAT.codigoAgrupadorExiste('102.99') && !CAT.codigoAgrupadorExiste('999.99') && !CAT.codigoAgrupadorExiste(null));
  for (const mal of ['10', '1000', '102.1', 'A02.01', '102,01', ' 102.01', null]) assert.ok(!V.codigoAgrupadorValido(mal), String(mal));
  const id = '00000000-0000-4000-8000-000000000001';
  assert.ok(V.validarCodigosAgrupador([{ id, codigoAgrupador: '102.01' }]).valores);
  assert.match(V.validarCodigosAgrupador([{ id, codigoAgrupador: '102.99' }]).error, /no existe en el cat[aá]logo/i);
  assert.match(V.validarCodigosAgrupador([{ id, codigoAgrupador: '10X' }]).error, /formato/);
  assert.deepEqual(V.validarCodigosAgrupador([{ id, codigoAgrupador: ' 102.01 ' }, { id: '00000000-0000-4000-8000-000000000002', codigoAgrupador: '' }]).valores.map((v) => v.codigo_agrupador), ['102.01', null]);
  assert.ok(V.validarCodigosAgrupador([]).error);
  assert.ok(V.validarCodigosAgrupador([{ id, codigoAgrupador: '100' }, { id, codigoAgrupador: '101' }]).error);
});

// ============================================================
console.log('\n2) Lógica del backend con un cliente de base falso');

await ok('calendario: orden, el día del vencimiento no es vencida, inactivas fuera y duplicadas no alertan', async () => {
  const hoy = V.hoyMexico();
  const tablas = {
    obligaciones_fiscales: [{ id: 'o1', nombre: 'IVA <b>mensual</b>', activa: true }, { id: 'o2', nombre: 'Vieja', activa: false }],
    declaraciones: [
      { id: 'p', obligacion_id: 'o1', periodo: 'Julio 2026', fecha_vencimiento: '2026-07-31', estado: 'presentada', notas: null },
      { id: 'd', obligacion_id: 'o1', periodo: 'Julio 2026', fecha_vencimiento: sumar(hoy, -80), estado: 'pendiente', notas: null }, // duplicada
      { id: 'c', obligacion_id: 'o1', periodo: 'Julio 2026', fecha_vencimiento: sumar(hoy, -5), estado: 'pendiente', notas: '[Complementaria]' },
      { id: 'h', obligacion_id: 'o1', periodo: 'Agosto 2026', fecha_vencimiento: hoy, estado: 'pendiente', notas: null },
      { id: 'i', obligacion_id: 'o2', periodo: 'X', fecha_vencimiento: sumar(hoy, 2), estado: 'pendiente', notas: null },       // obligación inactiva
      { id: 'z', obligacion_id: 'zz', periodo: 'E', fecha_vencimiento: sumar(hoy, 1), estado: 'pendiente', notas: null },       // obligación desconocida
    ],
  };
  const cliente = { from: (t) => ({ select: () => Promise.resolve({ data: tablas[t], error: null }) }) };
  const r = await F.obtenerCalendario('x', log, cliente);
  assert.ok(r.ok);
  assert.deepEqual(r.proximas.map((p) => p.declaracionId), ['c', 'h', 'z']);
  assert.equal(r.proximas[0].estado, 'vencida');
  assert.equal(r.proximas[1].diasRestantes, 0); assert.equal(r.proximas[1].estado, 'pendiente');
  assert.equal(r.proximas[2].obligacion, '—');
  const malo = { from: () => ({ select: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "obligaciones_fiscales" does not exist' } }) }) };
  const e = await F.obtenerCalendario('x', log, malo);
  assert.equal(e.ok, false); assert.ok(!/relation|obligaciones_fiscales/.test(e.error), 'no debe mostrar el error interno de la base');
});

let ultimo = null; let previas = []; let filaDec = { id: DEC, estado: 'pendiente', documento_path: null }; let oblDeLaBase = { id: OBL, activa: true };
const ops = [];
globalThis.__db = {
  maybe: (q) => {
    if (q.tabla === 'obligaciones_fiscales') return { data: oblDeLaBase, error: null };
    if (q.tabla === 'declaraciones') return { data: filaDec, error: null };
    return { data: null, error: null };
  },
  single: (q) => { if (q.tabla === 'perfiles') return { data: { empresa_id: E }, error: null }; ultimo = q; ops.push(q.op); return { data: { ...(filaDec || {}), ...q.patch }, error: null }; },
  list: (q) => {
    ops.push(q.op);
    if (q.tabla === 'declaraciones' && q.op === 'select') return { data: previas, error: null };
    if (q.tabla === 'declaraciones' && q.op === 'delete') return globalThis.__sinPermisoBorrar ? { data: [], error: null } : { data: [{ id: q.filtros.id }], error: null };
    if (q.tabla === 'cuentas_contables' && q.op === 'update') return globalThis.__colFalta ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'codigo_agrupador' column" } } : { data: q.filtros.id === '00000000-0000-4000-8000-000000000003' ? [] : [{ id: q.filtros.id }], error: null };
    if (q.tabla === 'cfdis_proveedor') return { data: [{ uuid_sat: 'U1', emisor_rfc: 'AAA010101AAA', emisor_nombre: 'Prov A' }, { uuid_sat: 'U2', emisor_rfc: null, emisor_nombre: null }], error: null };
    return { data: [], error: null };
  },
};

await ok('crear declaración: obligación inexistente o inactiva, formato y aviso de duplicado con confirmación', async () => {
  globalThis.__rol = 'contador';
  const ok1 = { obligacionId: OBL, periodo: 'Julio 2026', fechaVencimiento: '2026-08-17' };
  let r = await F.crearDeclaracion(jwt, U, ok1, log); assert.ok(r.ok, r.error); assert.equal(ultimo.patch.estado, 'pendiente'); assert.equal(ultimo.patch.empresa_id, E);
  oblDeLaBase = null; r = await F.crearDeclaracion(jwt, U, ok1, log); assert.match(r.error, /no existe/);
  oblDeLaBase = { id: OBL, activa: false }; r = await F.crearDeclaracion(jwt, U, ok1, log); assert.match(r.error, /inactiva/);
  oblDeLaBase = { id: OBL, activa: true };
  r = await F.crearDeclaracion(jwt, U, { ...ok1, fechaVencimiento: 'mañana' }, log); assert.equal(r.ok, false);
  previas = [{ id: 'x1', obligacion_id: OBL, periodo: 'Julio 2026', estado: 'presentada', fecha_vencimiento: '2026-07-31', fecha_presentacion: '2026-07-31', notas: null }];
  ultimo = null;
  r = await F.crearDeclaracion(jwt, U, { ...ok1, periodo: 'julio 2026' }, log);
  assert.equal(r.ok, false); assert.equal(r.codigo, 'DUPLICADA'); assert.equal(ultimo, null, 'no debe guardar sin confirmar');
  assert.deepEqual(r.existentes, [{ estado: 'presentada', fechaVencimiento: '2026-07-31', fechaPresentacion: '2026-07-31' }]);
  r = await F.crearDeclaracion(jwt, U, { ...ok1, confirmarDuplicada: true }, log); assert.ok(r.ok, r.error); assert.ok(!('confirmarDuplicada' in ultimo.patch));
  r = await F.crearDeclaracion(jwt, U, { ...ok1, notas: '[Complementaria]' }, log); assert.ok(r.ok, r.error); // la complementaria no pide confirmación
  r = await F.crearDeclaracion(jwt, U, { ...ok1, periodo: 'Agosto 2026' }, log); assert.ok(r.ok, r.error);
  previas = [];
});

await ok('marcar presentada: fecha, ruta de acuse de otra empresa, no pisar la fecha y limpiar al regresar', async () => {
  globalThis.__rol = 'contador';
  let r = await F.actualizarDeclaracion(jwt, U, DEC, { estado: 'presentada', fechaPresentacion: '2026-08-10', folioAcuse: 'AC1', documentoPath: `${E}/sat/${U}/documento.pdf` }, log);
  assert.ok(r.ok, r.error); assert.equal(ultimo.patch.fecha_presentacion, '2026-08-10'); assert.equal(ultimo.patch.presentado_por, U); assert.equal(ultimo.patch.folio_acuse, 'AC1');
  r = await F.actualizarDeclaracion(jwt, U, DEC, { documentoPath: `99999999-9999-4999-8999-999999999999/sat/${U}/documento.pdf` }, log);
  assert.equal(r.ok, false); assert.match(r.error, /adjunto/);
  filaDec = { id: DEC, estado: 'presentada', documento_path: null };
  r = await F.actualizarDeclaracion(jwt, U, DEC, { estado: 'presentada' }, log); assert.ok(r.ok); assert.equal(ultimo.patch.fecha_presentacion, undefined);
  r = await F.actualizarDeclaracion(jwt, U, DEC, { estado: 'pendiente' }, log); assert.ok(r.ok);
  assert.equal(ultimo.patch.fecha_presentacion, null); assert.equal(ultimo.patch.presentado_por, null);
  assert.equal((await F.actualizarDeclaracion(jwt, U, 'abc', { estado: 'presentada' }, log)).ok, false);
  assert.equal((await F.actualizarDeclaracion(jwt, U, DEC, { estado: 'vencida' }, log)).ok, false);
  filaDec = { id: DEC, estado: 'pendiente', documento_path: null };
});

await ok('documentos: la ruta debe ser de la empresa y carpeta sat; vigencia se guarda', async () => {
  let r = await F.crearDocumentoFiscal(jwt, U, { tipo: 'otro', nombre: 'x', documentoPath: `${E}/ventas/${U}/documento.pdf` }, log); assert.equal(r.ok, false);
  r = await F.crearDocumentoFiscal(jwt, U, { tipo: 'otro', nombre: 'x', documentoPath: `${E}/sat/${U}/documento.pdf`, vigenciaHasta: '2026-12-01' }, log);
  assert.ok(r.ok, r.error); assert.equal(ultimo.patch.documento_path, `${E}/sat/${U}/documento.pdf`); assert.equal(ultimo.patch.vigencia_hasta, '2026-12-01'); assert.equal('documentoPath' in ultimo.patch, false);
});

await ok('corregir y eliminar declaración: solo admin/director, nunca una presentada ni con acuse, y avisa si la base no deja borrar', async () => {
  globalThis.__rol = 'contador'; ops.length = 0;
  let r = await F.corregirDeclaracion(jwt, DEC, { periodo: 'Agosto 2026' }, log); assert.match(r.error, /rol/);
  r = await F.eliminarDeclaracion(jwt, DEC, log); assert.match(r.error, /rol/); assert.equal(ops.length, 0);
  globalThis.__rol = 'auditor'; assert.equal((await F.eliminarDeclaracion(jwt, DEC, log)).ok, false);
  globalThis.__rol = 'director';
  r = await F.corregirDeclaracion(jwt, DEC, { periodo: 'Agosto 2026', fechaVencimiento: '2026-09-17' }, log); assert.ok(r.ok, r.error); assert.equal(r.declaracion.periodo, 'Agosto 2026');
  assert.equal((await F.corregirDeclaracion(jwt, 'no-uuid', { periodo: 'x' }, log)).ok, false);
  filaDec = { id: DEC, estado: 'presentada', documento_path: null }; ops.length = 0;
  r = await F.corregirDeclaracion(jwt, DEC, { periodo: 'x' }, log); assert.match(r.error, /regrésala a pendiente/);
  r = await F.eliminarDeclaracion(jwt, DEC, log); assert.match(r.error, /presentada/); assert.ok(!ops.includes('delete'));
  filaDec = { id: DEC, estado: 'pendiente', documento_path: 'e/sat/u/documento.pdf' };
  r = await F.eliminarDeclaracion(jwt, DEC, log); assert.match(r.error, /acuse/); assert.ok(!ops.includes('delete'));
  filaDec = { id: DEC, estado: 'pendiente', documento_path: null };
  r = await F.eliminarDeclaracion(jwt, DEC, log); assert.ok(r.ok, r.error); assert.ok(ops.includes('delete'));
  globalThis.__sinPermisoBorrar = true; r = await F.eliminarDeclaracion(jwt, DEC, log); assert.match(r.error, /permiso de borrado/); globalThis.__sinPermisoBorrar = false;
  filaDec = null; r = await F.eliminarDeclaracion(jwt, DEC, log); assert.match(r.error, /no existe/);
  filaDec = { id: DEC, estado: 'pendiente', documento_path: null };
  globalThis.__rol = 'contador';
});

await ok('Código Agrupador: guarda con el cliente del usuario, reporta cuentas ajenas, columna faltante sin detalles internos', async () => {
  globalThis.__rol = 'contador';
  const ids = [1, 2, 3].map((i) => `00000000-0000-4000-8000-00000000000${i}`);
  let r = await F.guardarCodigosAgrupador(jwt, ids.map((id, i) => ({ id, codigoAgrupador: ['102.01', '105.01', '201.01'][i] })), log);
  assert.ok(r.ok, r.error); assert.equal(r.actualizadas, 2); assert.deepEqual(r.noEncontradas, [ids[2]]); // la 3.ª "no es de su empresa"
  globalThis.__colFalta = true;
  r = await F.guardarCodigosAgrupador(jwt, [{ id: ids[0], codigoAgrupador: '102.01' }], log);
  assert.equal(r.ok, false); assert.match(r.error, /OT-0031b-codigo-agrupador\.sql/); assert.ok(!/schema cache|PGRST/.test(r.error));
  globalThis.__colFalta = false; ops.length = 0;
  r = await F.guardarCodigosAgrupador(jwt, [{ id: ids[0], codigoAgrupador: '102.99' }], log);
  assert.equal(r.ok, false); assert.ok(!ops.includes('update'), 'un código inexistente no debe llegar a la base');
  globalThis.__rol = 'auditor';
  r = await F.guardarCodigosAgrupador(jwt, [{ id: ids[0], codigoAgrupador: '102.01' }], log); assert.match(r.error, /rol/);
  globalThis.__rol = 'contador';
});

await ok('proveedores de la DIOT por UUID, y el router importa solo funciones que existen', async () => {
  globalThis.__rol = 'auditor';
  const r = await F.listarProveedoresDiot(jwt, log);
  assert.ok(r.ok); assert.deepEqual(r.proveedores, [{ uuid: 'U1', rfc: 'AAA010101AAA', nombre: 'Prov A' }, { uuid: 'U2', rfc: '', nombre: '' }]);
  const router = fs.readFileSync(path.join(aqui, 'src', 'routes', 'fiscal.js'), 'utf8');
  const nombres = /import \{([^}]+)\} from '\.\.\/supabaseFiscal\.js'/.exec(router)[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(nombres.length >= 12);
  for (const n of nombres) assert.equal(typeof F[n], 'function', 'el router importa algo que no existe: ' + n);
  globalThis.__rol = 'contador';
});

// ============================================================
console.log('\n3) Ayudas puras del panel (fiscal.js y auth-login.js)');

await ok('fechas sugeridas: al lunes si cae en fin de semana, bimestral, anual, mes corto y entradas inválidas', () => {
  const src = codigo('fiscal.js');
  const a = src.indexOf('const PLANTILLA_OBLIGACIONES'); const b = src.indexOf('function toast(msg, tipo)');
  assert.ok(a > 0 && b > a);
  const ctx = { out: {} }; vm.createContext(ctx);
  vm.runInContext('const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];\n' + src.slice(a, b) +
    '\nout.s = sugerirFechaLimite; out.t = textoPeriodo; out.p = periodoAnterior; out.n = tipoDeNotas; out.d = esDuplicadaDePresentada; out.pl = PLANTILLA_OBLIGACIONES;', ctx);
  const { s, t, p, n, d, pl } = ctx.out;
  const M = (dia) => ({ periodicidad: 'mensual', dia_limite: dia }), B = (dia) => ({ periodicidad: 'bimestral', dia_limite: dia }), A = (dia, mes) => ({ periodicidad: 'anual', dia_limite: dia, mes_limite: mes });
  assert.equal(s(M(17), 9, 2026), '2026-11-17');
  assert.equal(s(M(17), 8, 2026), '2026-10-19');   // 17-oct-2026 es sábado
  assert.equal(s(M(17), 11, 2026), '2027-01-18');  // diciembre -> enero, domingo
  assert.equal(s(M(31), 0, 2026), '2026-03-02');   // enero, día 31 -> 28-feb (sábado) -> lunes
  assert.equal(s(B(17), 5, 2026), '2027-01-18'); assert.equal(s(B(17), 0, 2026), '2026-03-17');
  assert.equal(s(A(31, 3), 0, 2025), '2026-03-31'); assert.equal(s(A(30, null), 0, 2025), null);
  assert.equal(s(M(17), 12, 2026), null); assert.equal(s(M(17), 0, NaN), null); assert.equal(s(null, 0, 2026), null);
  assert.equal(t(M(17), 6, 2026), 'Julio 2026'); assert.equal(t(B(17), 5, 2026), 'Noviembre–Diciembre 2026'); assert.equal(t(A(31, 3), 0, 2025), 'Ejercicio 2025');
  assert.equal(JSON.stringify(p(M(17), '2026-01-10')), '{"indice":11,"anio":2025}'); assert.equal(JSON.stringify(p(B(17), '2026-02-01')), '{"indice":5,"anio":2025}');
  assert.equal(n('[Complementaria] x'), 'Complementaria'); assert.equal(n('[Normal]'), null); assert.equal(n(null), null);
  const P = { id: 'p', obligacion_id: 'o', periodo: 'Julio 2026', estado: 'presentada' };
  assert.equal(d({ id: 'd', obligacion_id: 'o', periodo: ' julio 2026', estado: 'pendiente' }, [P]), true);
  assert.equal(d({ id: 'd', obligacion_id: 'o', periodo: 'julio 2026', estado: 'pendiente', notas: '[Complementaria]' }, [P]), false);
  for (const x of pl) assert.ok(['mensual', 'bimestral'].includes(x.periodicidad) && x.diaLimite === 17);
});

await ok('mensajes del inicio de sesión: errores conocidos traducidos y el técnico no llega al usuario', () => {
  const src = codigo('auth-login.js');
  const a = src.indexOf('const ERR_MATCH = ['); const b = src.indexOf('// Si ya hay sesión activa');
  assert.ok(a > 0 && b > a);
  const avisos = []; const ctx = { out: {}, console: { warn: (...x) => avisos.push(x.join(' ')) } }; vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nout.msgFor = msgFor;', ctx);
  const m = ctx.out.msgFor;
  for (const [msg, re] of [
    ['Invalid login credentials', /incorrectos/], ['Email not confirmed', /Confirma tu correo/], ['User already registered', /ya tiene una cuenta/],
    ['email rate limit exceeded', /demasiados correos/], ['Signups not allowed for this instance', /registro con correo está desactivado/],
    ['Error sending confirmation email', /correo de confirmación/], ['Password should be at least 6 characters.', /contraseña es muy débil/],
    ['Unable to validate email address: invalid format', /Revisa el correo/], ['User is banned', /suspendida/], ['Failed to fetch', /Sin conexión/],
  ]) assert.match(m(msg), re, msg);
  assert.equal(avisos.length, 0);
  assert.match(m('Database error saving new user', 'No se pudo crear la cuenta.'), /No se pudo crear la cuenta/);
  assert.ok(!/Database error/.test(m('Database error saving new user', 'No se pudo crear la cuenta.')));
  assert.equal(m(undefined), 'No se pudo iniciar sesión. Inténtalo de nuevo.');
  assert.equal(avisos.length, 3); // cada llamada con un error no reconocido deja rastro en la consola
});

await ok('Dashboard: la tarjeta de ingresos − egresos no se llama "utilidad" (no es la utilidad del Estado de Resultados)', () => {
  const app = codigo('app.js');
  assert.ok(app.includes('kpiCard("Ingresos − egresos (pólizas)"'), 'falta la etiqueta nueva');
  assert.ok(!app.includes('kpiCard("Utilidad operativa"'), 'volvió la etiqueta confusa "Utilidad operativa"');
  assert.match(codigo('dashboard.html'), /app\.js\?v=\d+/);
});

// ============================================================
console.log('\n4) contabilidad.js completo en un navegador simulado (XML del SAT, hoja de cuentas, IVA y DIOT)');

function falso() {
  const p = new Proxy(function () {}, {
    get(_t, k) { if (k === Symbol.toPrimitive) return () => ''; if (k === 'then') return undefined; if (k === 'length') return 0; if (k === 'forEach' || k === 'map' || k === 'filter') return () => []; return p; },
    set() { return true; }, apply() { return p; },
  });
  return p;
}
// Un panel que captura lo que se le escribe en innerHTML (para leer la pantalla SAT).
function paneCaptura() {
  const f = falso(); const est = { html: '' };
  return new Proxy(function () {}, { get(_t, k) { return k === 'innerHTML' ? est.html : f; }, set(_t, k, v) { if (k === 'innerHTML') est.html = String(v); return true; }, apply() { return f; } });
}

const cuentasDemo = [
  { id: 'c100', codigo: '100', nombre: 'Activo', nat: 'Deudora', nivel: 1, activo: true },
  { id: 'c102', codigo: '102', nombre: 'Bancos', nat: 'Deudora', nivel: 2, activo: true },
  { id: 'c105', codigo: '105', nombre: 'Clientes', nat: 'Deudora', nivel: 2, activo: true },
  { id: 'c118', codigo: '118', nombre: 'IVA acreditable', nat: 'Deudora', nivel: 2, activo: true },
  { id: 'c200', codigo: '200', nombre: 'Pasivo', nat: 'Acreedora', nivel: 1, activo: true },
  { id: 'c201', codigo: '201', nombre: 'Proveedores', nat: 'Acreedora', nivel: 2, activo: true },
  { id: 'c208', codigo: '208', nombre: 'IVA trasladado', nat: 'Acreedora', nivel: 2, activo: true },
  { id: 'c299', codigo: '299', nombre: 'Vieja sin uso', nat: 'Acreedora', nivel: 2, activo: false },          // inactiva SIN movimientos: no se manda a revisar
  { id: 'c298', codigo: '298', nombre: 'Vieja con uso', nat: 'Acreedora', nivel: 2, activo: false },         // inactiva CON movimientos: sí
  { id: 'c400', codigo: '400', nombre: 'Ingresos', nat: 'Acreedora', nivel: 1, activo: true },
  { id: 'c401', codigo: '401', nombre: 'Ventas', nat: 'Acreedora', nivel: 2, activo: true },
  { id: 'c600', codigo: '600', nombre: 'Gastos', nat: 'Deudora', nivel: 1, activo: true },
  { id: 'c601', codigo: '601', nombre: 'Gastos de operación', nat: 'Deudora', nivel: 2, activo: true },
];
const configDemo = { cuenta_bancos_id: 'c102', cuenta_clientes_id: 'c105', cuenta_proveedores_id: 'c201', cuenta_ventas_id: 'c401', cuenta_iva_trasladado_id: 'c208', cuenta_iva_acreditable_id: 'c118', cuenta_gastos_id: 'c601' };
const A = (codigo, debe, haber) => ({ codigo, debe, haber });
const gasto = (id, uuid, base, estado) => ({ id, pgId: id, folio: 'E-' + id, tipo: 'Egreso', fecha: '2026-11-05', concepto: 'Gasto · Proveedor', estado: estado || 'ok', origen: 'cfdi-recibido', cfdiUuid: uuid,
  asientos: [A('601', base, 0), A('118', +(base * 0.16).toFixed(2), 0), A('201', 0, +(base * 1.16).toFixed(2))] });
// Pólizas como llegan de Postgres a un navegador limpio: CON partidas pero SIN proveedorRfc ni proveedorNombre.
const polizasDemo = [
  { id: 'v1', pgId: 'v1', folio: 'I-1', tipo: 'Ingreso', fecha: '2026-11-03', concepto: 'Venta', estado: 'ok', origen: 'ventas', asientos: [A('105', 1160, 0), A('401', 0, 1000), A('208', 0, 160)] },
  gasto('g1', 'AAAAAAAA-0000-4000-8000-000000000001', 1000), gasto('g2', 'AAAAAAAA-0000-4000-8000-000000000001', 500),
  gasto('g3', 'BBBBBBBB-0000-4000-8000-000000000002', 200), gasto('g4', 'AAAAAAAA-0000-4000-8000-000000000001', 9999, 'anulada'),
  { id: 'u1', pgId: 'u1', folio: 'D-1', tipo: 'Diario', fecha: '2026-11-06', concepto: 'Uso de una cuenta ya desactivada', estado: 'ok', origen: 'postgres', asientos: [A('298', 0, 10), A('201', 10, 0)] },
];

function navegadorSat({ polizas = polizasDemo, cuentas = cuentasDemo, proveedores = null, rol = 'contador' } = {}) {
  const ls = new Map();
  ls.set('contateck_polizas:E1', JSON.stringify(polizas));
  ls.set('contateck_cuentas_cache:E1', JSON.stringify(cuentas));
  const paneles = {}; const llamadas = [];
  const win = { console, SUPABASE_CONFIG: { url: 'http://supabase.falso', anonKey: 'k' }, APP_CONFIG: { BACKEND_URL: 'http://backend.falso' },
    CONTATECK_SUPABASE_TOKEN: 'token-falso', CONTATECK_PERFIL_PG: { rol }, CONTATECK_EMPRESA_PG: { id: 'E1', rfc: 'EKU9003173C9', nombre: 'Empresa Demo' },
    CONTATECK_CONFIG_CONTABLE_PG: configDemo, CONTATECK_POLIZAS_PG: [],
    CTPostgres: { leerConfigContable: async () => ({ ok: false }), polizasConPartidas: async () => ({ ok: true, polizas: [] }), listarPeriodos: async () => ({ ok: true, periodos: [] }) },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } },
    fetch: async (url) => {
      llamadas.push(String(url));
      if (/proveedores-diot/.test(url)) return { json: async () => (proveedores ? { ok: true, proveedores } : { ok: false, error: 'falla simulada' }) };
      if (/cuentas_contables/.test(url)) return { json: async () => cuentas.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, naturaleza: c.nat === 'Deudora' ? 'deudora' : 'acreedora', nivel: c.nivel, activo: c.activo !== false, codigo_agrupador: c.codigoAgrupador || null })) };
      return { json: async () => ({ ok: false }) };
    },
    setTimeout, clearTimeout, requestAnimationFrame: () => 0, addEventListener() {}, navigator: { userAgent: 'prueba' }, Blob: class {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  };
  win.document = new Proxy({}, { get(_t, k) {
    if (k === 'readyState') return 'complete';
    if (k === 'querySelector') return (sel) => { const m = /data-pane="(\w+)"/.exec(sel); if (m) { paneles[m[1]] = paneles[m[1]] || paneCaptura(); return paneles[m[1]]; } return falso(); };
    return falso();
  } });
  win.window = win; vm.createContext(win);
  vm.runInContext(codigo('storage-empresa.js'), win, { filename: 'storage-empresa.js' });
  vm.runInContext(codigo('contabilidad.js'), win, { filename: 'contabilidad.js' });
  return { win, paneles, llamadas };
}

await ok('IVA y DIOT con pólizas sin RFC de proveedor: se identifica por UUID, el sin RFC se avisa y la anulada no cuenta', async () => {
  const { win, paneles, llamadas } = navegadorSat({ proveedores: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', rfc: 'aaa010101aaa', nombre: 'Proveedor A SA' }] });
  await esperar(60);
  assert.ok(win.CTCont && win.CTCont.diot, 'contabilidad.js no arrancó');
  assert.ok(llamadas.some((u) => /proveedores-diot/.test(u)), 'no pidió los proveedores de la DIOT');
  const iva = win.CTCont.determinacionIVA();
  assert.equal(iva.configurado, true); assert.equal(iva.trasladado, 160);
  const d = JSON.parse(JSON.stringify(win.CTCont.diot()));
  const a = d.find((x) => x.rfc === 'AAA010101AAA');
  assert.ok(a, 'el proveedor A debe salir con su RFC en mayúsculas'); assert.equal(a.nombre, 'Proveedor A SA'); assert.equal(a.ops, 2); assert.equal(a.base, 1500); assert.equal(a.iva, 240);
  const sin = d.find((x) => x.rfc === '—'); assert.ok(sin && sin.ops === 1 && sin.base === 200);
  assert.ok(!d.some((x) => x.base === 9999), 'la póliza anulada no debe contar');
  win.CTCont.render(); await esperar(60);
  const html = paneles.sat.innerHTML;
  assert.ok(html.includes('AAA010101AAA') && html.includes('Proveedor A SA') && html.includes('EKU9003173C9'));
  assert.ok(/1 operación\(es\) con proveedores sin RFC válido/.test(html) && html.includes('$1,500.00'));
});

await ok('si falla la carga de proveedores se intenta una sola vez (sin bucle) y el aviso de "sin RFC" se ve', async () => {
  const { win, paneles, llamadas } = navegadorSat({ proveedores: null });
  await esperar(60); win.CTCont.render(); await esperar(60);
  assert.equal(llamadas.filter((u) => /proveedores-diot/.test(u)).length, 1);
  assert.ok(/operación\(es\) con proveedores sin RFC válido/.test(paneles.sat.innerHTML));
});

await ok('hoja de cuentas: solo activas e inactivas con movimientos; el indicador cuenta lo mismo', async () => {
  const { win, paneles } = navegadorSat();
  await esperar(60);
  const codigos = JSON.parse(JSON.stringify(win.CTCont.cuentasParaSat().map((c) => c.codigo)));
  assert.ok(!codigos.includes('299'), 'una inactiva sin movimientos no debe ir a revisión');
  assert.ok(codigos.includes('298'), 'una inactiva con movimientos sí debe ir');
  assert.equal(codigos.length, cuentasDemo.length - 1);
  const csv = win.CTCont.csvCuentasContadora();
  assert.ok(csv.charCodeAt(0) === 0xFEFF, 'debe empezar con la marca UTF-8 para Excel');
  const filas = csv.slice(1).split('\r\n');
  assert.equal(filas[0], '"Código","Nombre","Nivel","Naturaleza","Cuenta de mayor","Código agrupador SAT (llenar)"');
  assert.equal(filas.length - 1, cuentasDemo.length - 1);
  assert.ok(filas.slice(1).every((f) => f.endsWith(',""')), 'la última columna debe ir vacía en todas las cuentas');
  assert.ok(!csv.includes('"299"') && csv.includes('"298"'));
  win.CTCont.render(); await esperar(60);
  assert.ok(paneles.sat.innerHTML.includes(`0 de ${cuentasDemo.length - 1}</b> cuentas con código asignado`), 'el indicador debe contar las mismas cuentas');
});

await ok('hoja de cuentas: neutraliza fórmulas y comillas en nombres', async () => {
  const raras = [{ id: 'x1', codigo: '100', nombre: '=HYPERLINK("http://x")', nat: 'Deudora', nivel: 1, activo: true }, { id: 'x2', codigo: '101', nombre: 'Bancos, "BBVA"\nsucursal', nat: 'Deudora', nivel: 2, activo: true }];
  const { win } = navegadorSat({ cuentas: raras, polizas: [] }); await esperar(60);
  const csv = win.CTCont.csvCuentasContadora();
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`) && csv.includes('"Bancos, ""BBVA"" sucursal"'));
});

await ok('XML del SAT: catálogo (usa el Código Agrupador si existe) y balanza (saldo inicial y final con signo)', async () => {
  const conAgr = cuentasDemo.map((c) => (c.codigo === '102' ? { ...c, codigoAgrupador: '102.01' } : c));
  const { win } = navegadorSat({ cuentas: conAgr }); await esperar(60);
  const cat = win.CTCont.xmlCatalogoSAT('EKU9003173C9', 11, 2026);
  assert.match(cat, /<catalogocuentas:Catalogo [^>]*Version="1\.3"[^>]*RFC="EKU9003173C9"[^>]*Mes="11"[^>]*Anio="2026"/);
  assert.ok(cat.includes('CodAgrup="102.01" NumCta="102"') && cat.includes('CodAgrup="105" NumCta="105"'));
  assert.equal((cat.match(/<catalogocuentas:Ctas /g) || []).length, cuentasDemo.length);
  win.CTCont.setPeriodo({ mes: 11, anio: 2026 });
  const bal = win.CTCont.xmlBalanzaSAT('EKU9003173C9', 11, 2026);
  assert.match(bal, /<BCE:Balanza [^>]*TipoEnvio="N"/);
  const re = /<BCE:Ctas NumCta="(\d+)" SaldoIni="(-?[\d.]+)" Debe="([\d.]+)" Haber="([\d.]+)" SaldoFin="(-?[\d.]+)"\/>/g; let m, n = 0;
  while ((m = re.exec(bal))) {
    n++; const cta = cuentasDemo.find((c) => c.codigo === m[1]); const [ini, de, ha, fin] = [+m[2], +m[3], +m[4], +m[5]];
    const esperado = cta.nat === 'Deudora' ? ini + de - ha : ini + ha - de;
    assert.ok(Math.abs(esperado - fin) < 0.011, `${m[1]}: saldo final ${fin} ≠ ${esperado}`);
    for (const x of [m[2], m[3], m[4], m[5]]) assert.match(x, /^-?\d+\.\d{2}$/);
  }
  assert.ok(n > 0);
});

console.log(`\n✔ ${pruebas} pruebas del módulo SAT y Fiscal pasaron\n`);
