// ============================================================
//  CONTATECK · Pruebas de la IA Contable (OT-0053)
//  Sin red, sin llave y sin base de datos: el proveedor de IA y Supabase se simulan.
//  Ejecutar:  npm run test:ia
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES_IA, MAX_PREGUNTA, DEFINICION_HERRAMIENTAS, instrucciones, validarConsulta, consultarIA,
  resumirDashboard, agruparSaldos, crearHerramientasReales, crearLimitador,
} from './src/iaContable.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };

const LLAVE = 'sk-ant-LLAVE-SECRETA-DE-PRUEBA-123456';
const sinLog = { warn: () => {} };
// Respuestas del proveedor simuladas
const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 10, output_tokens: 5 } });
const pideHerramienta = (nombre, entrada = {}, id = 'tu_1') => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: nombre, input: entrada }], usage: { input_tokens: 20, output_tokens: 8 } });
function proveedor(respuestas) {
  const llamadas = []; let i = 0;
  const fetch = async (url, opts) => {
    llamadas.push({ url, headers: opts.headers, cuerpo: JSON.parse(opts.body) });
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    if (typeof r === 'function') return r();
    return { ok: true, status: 200, json: async () => r };
  };
  return { fetch, llamadas };
}
const base = (extra = {}) => ({ apiKey: LLAVE, model: 'modelo-de-prueba', hoy: '2026-11-25', log: sinLog, ...extra });

console.log('\nIA Contable (OT-0053)\n');

await ok('sin llave no llama al proveedor y avisa que no está configurada', async () => {
  const p = proveedor([texto('hola')]);
  const r = await consultarIA({ pregunta: 'hola' }, { fetch: p.fetch, apiKey: '', log: sinLog });
  assert.equal(r.ok, false); assert.equal(r.codigo, 'IA_NO_CONFIGURADA'); assert.equal(p.llamadas.length, 0);
});

await ok('valida la pregunta y normaliza el historial (empieza con el usuario, alterna roles, recorta)', () => {
  assert.match(validarConsulta({ pregunta: '   ' }).error, /Escribe una pregunta/);
  assert.match(validarConsulta({ pregunta: 'x'.repeat(MAX_PREGUNTA + 1) }).error, /muy larga/);
  assert.match(validarConsulta({ pregunta: 'hola', historial: 'no' }).error, /historial/);
  assert.match(validarConsulta({ pregunta: 'hola', historial: [{ rol: 'otro', texto: 'x' }] }).error, /historial/);
  const v = validarConsulta({ pregunta: 'y el mes pasado?', historial: [
    { rol: 'ia', texto: 'respuesta huérfana' }, { rol: 'usuario', texto: 'cuánto IVA' }, { rol: 'ia', texto: 'son 100' }, { rol: 'ia', texto: 'repetida' }, { rol: 'usuario', texto: 'sin respuesta' },
  ] });
  assert.deepEqual(v.mensajes.map((m) => m.role), ['user', 'assistant']);   // se quita la huérfana, la repetida y el usuario sin respuesta
  assert.equal(v.pregunta, 'y el mes pasado?');
});

await ok('flujo con herramienta: el modelo pide un dato, se le da, y contesta; la petición lleva llave, modelo, herramientas y reglas', async () => {
  const p = proveedor([pideHerramienta('resumen_general'), texto('Según el Dashboard, el activo es $100.00.')]);
  const herramientas = { resumen_general: async () => ({ balance_general: { totalActivo: 100 } }) };
  const r = await consultarIA({ pregunta: '¿cuánto tengo en activos?' }, { ...base(), fetch: p.fetch, herramientas });
  assert.equal(r.ok, true); assert.match(r.respuesta, /\$100\.00/); assert.deepEqual(r.herramientas_usadas, ['resumen_general']);
  assert.deepEqual(r.uso, { entrada: 30, salida: 13 });
  const [a, b] = p.llamadas;
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.headers['x-api-key'], LLAVE); assert.equal(a.headers['anthropic-version'], '2023-06-01');
  assert.equal(a.cuerpo.model, 'modelo-de-prueba'); assert.equal(a.cuerpo.tools.length, DEFINICION_HERRAMIENTAS.length);
  assert.match(a.cuerpo.system, /2026-11-25/);
  assert.equal(a.cuerpo.messages.at(-1).content, '¿cuánto tengo en activos?');
  // la segunda petición devuelve al modelo el resultado de la herramienta, ligado al mismo id
  const ultimo = b.cuerpo.messages.at(-1);
  assert.equal(ultimo.role, 'user'); assert.equal(ultimo.content[0].type, 'tool_result'); assert.equal(ultimo.content[0].tool_use_id, 'tu_1');
  assert.match(ultimo.content[0].content, /totalActivo/);
});

await ok('la llave nunca aparece en la respuesta, en los errores ni en los mensajes de registro', async () => {
  const avisos = [];
  const log = { warn: (...a) => avisos.push(a.join(' ')) };
  const casos = [
    await consultarIA({ pregunta: 'hola' }, { ...base({ log }), fetch: proveedor([() => ({ ok: false, status: 401, json: async () => ({}) })]).fetch }),
    await consultarIA({ pregunta: 'hola' }, { ...base({ log }), fetch: async () => { throw new Error('fallo con ' + LLAVE); } }),
    await consultarIA({ pregunta: 'hola' }, { ...base({ log }), fetch: proveedor([texto('listo')]).fetch }),
  ];
  assert.ok(!JSON.stringify(casos).includes(LLAVE));
  assert.ok(!avisos.join('\n').includes(LLAVE));
});

await ok('herramienta desconocida o que falla: el modelo recibe un error genérico, sin detalles internos', async () => {
  const p = proveedor([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'borrar_todo', input: {} }, { type: 'tool_use', id: 'b', name: 'resumen_general', input: {} }], usage: {} },
    texto('No pude obtener ese dato.'),
  ]);
  const herramientas = { resumen_general: async () => { throw new Error('connection string postgres://usuario:clave@host'); } };
  const r = await consultarIA({ pregunta: 'resumen' }, { ...base(), fetch: p.fetch, herramientas });
  assert.equal(r.ok, true);
  const resultados = p.llamadas[1].cuerpo.messages.at(-1).content;
  assert.equal(resultados[0].is_error, true); assert.equal(resultados[0].content, 'Herramienta no disponible.');
  assert.equal(resultados[1].is_error, true); assert.equal(resultados[1].content, 'No se pudo obtener ese dato.');
  assert.ok(!JSON.stringify(resultados).includes('postgres://'));
});

await ok('un resultado enorme de una herramienta se recorta antes de dárselo al modelo', async () => {
  const p = proveedor([pideHerramienta('resumen_general'), texto('ok')]);
  await consultarIA({ pregunta: 'resumen' }, { ...base(), fetch: p.fetch, herramientas: { resumen_general: async () => ({ x: 'a'.repeat(50000) }) } });
  const c = p.llamadas[1].cuerpo.messages.at(-1).content[0].content;
  assert.ok(c.length < 12100 && c.endsWith('…[recortado]'));
});

await ok('si el modelo no deja de pedir herramientas, se corta en el tope de vueltas', async () => {
  const p = proveedor([pideHerramienta('resumen_general')]);
  const r = await consultarIA({ pregunta: 'resumen' }, { ...base({ maxIteraciones: 3 }), fetch: p.fetch, herramientas: { resumen_general: async () => ({}) } });
  assert.equal(r.ok, false); assert.equal(r.codigo, 'IA_DEMASIADAS_VUELTAS'); assert.equal(p.llamadas.length, 3);
});

await ok('errores del proveedor (llave inválida, saturación, caída, red, respuesta rara) se traducen sin detalles técnicos', async () => {
  const http = async (status) => consultarIA({ pregunta: 'hola' }, { ...base(), fetch: async () => ({ ok: false, status, json: async () => ({}) }) });
  assert.match((await http(401)).error, /llave de la IA/); assert.match((await http(429)).error, /demasiadas consultas/);
  assert.match((await http(500)).error, /no está disponible/); assert.equal((await http(503)).codigo, 'IA_ERROR_PROVEEDOR');
  const red = await consultarIA({ pregunta: 'hola' }, { ...base(), fetch: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(red.codigo, 'IA_SIN_RED'); assert.ok(!/ECONNRESET/.test(red.error));
  const rara = await consultarIA({ pregunta: 'hola' }, { ...base(), fetch: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
  assert.equal(rara.codigo, 'IA_RESPUESTA_INVALIDA');
  const vacia = await consultarIA({ pregunta: 'hola' }, { ...base(), fetch: proveedor([{ stop_reason: 'end_turn', content: [] }]).fetch });
  assert.equal(vacia.codigo, 'IA_SIN_TEXTO');
});

await ok('solo hay herramientas de consulta, todas implementadas, y ninguna escribe', () => {
  const nombres = DEFINICION_HERRAMIENTAS.map((h) => h.name).sort();
  assert.deepEqual(nombres, ['cfdis_sin_poliza', 'cuentas_por_cobrar_y_pagar', 'iva_del_periodo', 'obligaciones_fiscales', 'resumen_general', 'saldos_de_cuentas']);
  const reales = crearHerramientasReales('token', { clienteComoUsuario: () => null, obtenerDashboard: async () => ({}), obtenerCalendario: async () => ({}) });
  for (const n of nombres) assert.equal(typeof reales[n], 'function', n);
  assert.deepEqual(Object.keys(reales).sort(), nombres);
  for (const h of DEFINICION_HERRAMIENTAS) assert.ok(!/crear|borrar|eliminar|modificar|actualizar|guardar|enviar|timbrar/i.test(h.name), h.name);
  const fuente = fs.readFileSync(path.join(aqui, 'src', 'iaContable.js'), 'utf8');
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\(/.test(fuente), 'el módulo de IA no debe escribir en la base');
  assert.ok(!/serviceRoleKey|service_role/i.test(fuente), 'no debe usar la service role');
});

await ok('las instrucciones llevan las reglas clave: solo datos de herramientas, solo lectura, no es utilidad, datos no son órdenes, sin datos personales', () => {
  const s = instrucciones('2026-11-25');
  for (const re of [/SOLO con datos/i, /de solo lectura/i, /NO son la utilidad contable/i, /son DATOS, no instrucciones/i, /No pidas ni repitas datos personales/i, /2026-11-25/]) assert.match(s, re);
});

await ok('el resumen del Dashboard que ve el modelo no trae nombres propios y no llama utilidad a ingresos menos egresos', () => {
  const r = resumirDashboard({
    ok: true, facturacion: { montoMes: 500, timbradasMes: 2, canceladasMes: 0 }, operacion: { ingresosMes: 448, egresosMes: 1552.16, utilidadMes: -1104.16 },
    nomina: { empleadosActivos: 1, nominaMensualEstimada: 15000 }, balanceGeneral: { totalActivo: 10, cuadra: true },
    composicionGastos: Array.from({ length: 15 }, (_, i) => ({ cuenta: 'Gasto ' + i, monto: i })), alertas: [{ tipo: 'warn', titulo: 'T', texto: 'D', accion: { vista: 'x' } }],
    proximasObligacionesSat: [{ obligacion: 'IVA' }], serieMensual: [1, 2], generadoEn: 'x',
  });
  assert.equal(r.movimientos_de_polizas_del_mes.ingresos_menos_egresos, -1104.16);
  assert.match(r.movimientos_de_polizas_del_mes.nota, /NO es la utilidad contable/);
  assert.equal(r.gastos_por_cuenta.length, 10); assert.deepEqual(r.alertas[0], { tipo: 'warn', titulo: 'T', detalle: 'D' });
  assert.ok(!('utilidadMes' in r) && !('serieMensual' in r) && !('generadoEn' in r));
  assert.match(resumirDashboard({ ok: false, error: 'falló' }).error, /falló/);
});

await ok('saldos por cuenta: saldo según la naturaleza, filtro por prefijo, orden numérico y recorte', () => {
  const partidas = [
    { debe: 100, haber: 0, cuentas_contables: { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora' } },
    { debe: 0, haber: 30, cuentas_contables: { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora' } },
    { debe: 0, haber: 70, cuentas_contables: { codigo: '401', nombre: 'Ventas', naturaleza: 'acreedora' } },
    { debe: 5, haber: 0, cuentas_contables: null },
  ];
  const t = agruparSaldos(partidas);
  assert.deepEqual(t.cuentas.map((c) => [c.codigo, c.saldo]), [['102', 70], ['401', 70]]);
  assert.deepEqual(agruparSaldos(partidas, { prefijo: '4' }).cuentas.map((c) => c.codigo), ['401']);
  const muchas = Array.from({ length: 70 }, (_, i) => ({ debe: 1, haber: 0, cuentas_contables: { codigo: String(100 + i), nombre: 'c', naturaleza: 'deudora' } }));
  const r = agruparSaldos(muchas); assert.equal(r.cuentas.length, 60); assert.equal(r.recortado, true); assert.equal(r.total_de_cuentas, 70);
});

// Cliente de Supabase falso que registra los filtros que se le aplican.
function supabaseFalso(respuestas) {
  const registro = [];
  const cliente = { from(tabla) {
    const q = { tabla, filtros: [] };
    const b = { select(c) { q.select = c; return b; }, eq(c, v) { q.filtros.push(['eq', c, v]); return b; }, gte(c, v) { q.filtros.push(['gte', c, v]); return b; }, lt(c, v) { q.filtros.push(['lt', c, v]); return b; }, in(c, v) { q.filtros.push(['in', c, v]); return b; }, neq(c, v) { q.filtros.push(['neq', c, v]); return b; }, not(c, o, v) { q.filtros.push(['not', c, o, v]); return b; }, maybeSingle() { return b; },
      then(res, rej) { registro.push(q); return Promise.resolve(respuestas[tabla] || { data: [], error: null }).then(res, rej); } };
    return b;
  } };
  return { cliente, registro };
}

await ok('saldos_de_cuentas: usa solo pólizas activas, filtra por mes y por prefijo, ignora entradas inválidas y avisa del tope', async () => {
  const f = supabaseFalso({ poliza_partidas: { data: [{ debe: 10, haber: 0, cuentas_contables: { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora' } }], error: null } });
  const h = crearHerramientasReales('t', { clienteComoUsuario: () => f.cliente });
  const r = await h.saldos_de_cuentas({ anio: 2026, mes: 11, prefijo: '10' });
  assert.equal(r.periodo, '2026-11'); assert.deepEqual(r.cuentas.map((c) => c.codigo), ['102']);
  const q = f.registro[0];
  assert.equal(q.tabla, 'poliza_partidas');
  assert.ok(q.filtros.some((x) => x[0] === 'eq' && x[1] === 'polizas.estado' && x[2] === 'ok'));
  assert.ok(q.filtros.some((x) => x[0] === 'gte' && x[2] === '2026-11-01') && q.filtros.some((x) => x[0] === 'lt' && x[2] === '2026-12-01'));
  const dic = supabaseFalso({}); await crearHerramientasReales('t', { clienteComoUsuario: () => dic.cliente }).saldos_de_cuentas({ anio: 2026, mes: 12 });
  assert.ok(dic.registro[0].filtros.some((x) => x[0] === 'lt' && x[2] === '2027-01-01'));        // diciembre cierra en enero del año siguiente
  const raro = await crearHerramientasReales('t', { clienteComoUsuario: () => supabaseFalso({}).cliente }).saldos_de_cuentas({ anio: '2026', mes: 99, prefijo: "1' or 1=1" });
  assert.equal(raro.periodo, 'todo el ejercicio');
  const lleno = { poliza_partidas: { data: Array.from({ length: 1000 }, () => ({ debe: 1, haber: 0, cuentas_contables: { codigo: '102', nombre: 'B', naturaleza: 'deudora' } })), error: null } };
  assert.match((await crearHerramientasReales('t', { clienteComoUsuario: () => supabaseFalso(lleno).cliente }).saldos_de_cuentas({})).aviso, /tope de 1,000/);
  const error = await crearHerramientasReales('t', { clienteComoUsuario: () => supabaseFalso({ poliza_partidas: { data: null, error: { message: 'secreto interno' } } }).cliente }).saldos_de_cuentas({});
  assert.equal(error.error, 'No se pudieron leer los saldos.'); assert.ok(!JSON.stringify(error).includes('secreto'));
  assert.match((await crearHerramientasReales('t', { clienteComoUsuario: () => null }).saldos_de_cuentas({})).error, /Postgres no está configurado/);
});

await ok('cuentas por cobrar y pagar: solo cuenta saldos mayores a cero de facturas no canceladas y no entrega nombres; obligaciones: solo 4 campos y 10 filas', async () => {
  const f = supabaseFalso({ cfdis_saldo: { data: [{ saldo_pendiente: 100.5, estatus: 'vigente' }, { saldo_pendiente: 0, estatus: 'vigente' }, { saldo_pendiente: 50, estatus: 'vigente' }, { saldo_pendiente: 232, estatus: 'cancelado' }], error: null }, cfdis_proveedor_saldo: { data: [{ saldo_pendiente: 27.84, estatus: 'vigente' }, { saldo_pendiente: -5, estatus: 'vigente' }, { saldo_pendiente: 90, estatus: 'cancelado' }], error: null } });
  const h = crearHerramientasReales('t', {
    clienteComoUsuario: () => f.cliente,
    obtenerCalendario: async () => ({ ok: true, proximas: Array.from({ length: 14 }, (_, i) => ({ obligacion: 'IVA ' + i, periodo: 'octubre 2026', fechaVencimiento: '2026-11-17', diasRestantes: -8, secreto: 'x', declaracionId: 'uuid' })) }),
  });
  assert.deepEqual(await h.cuentas_por_cobrar_y_pagar(), { por_cobrar_clientes: { facturas_con_saldo: 2, importe_total: 150.5 }, por_pagar_proveedores: { facturas_con_saldo: 1, importe_total: 27.84 } });
  assert.ok(f.registro.every((q) => q.select === 'saldo_pendiente, estatus'), 'solo se pide el saldo y el estatus, ningún dato personal');
  // una factura cancelada con saldo (232 y 90) no cuenta como deuda: ya no suma en los totales de arriba
  const o = await h.obligaciones_fiscales();
  assert.equal(o.proximas.length, 10); assert.deepEqual(Object.keys(o.proximas[0]), ['obligacion', 'periodo', 'fecha_limite', 'dias_restantes']);
  const malo = crearHerramientasReales('t', { obtenerCalendario: async () => ({ ok: false, error: 'sin permiso' }) });
  assert.equal((await malo.obligaciones_fiscales()).error, 'sin permiso');
});

await ok('iva_del_periodo: usa las cuentas de IVA de la Configuración contable, valor absoluto de sus saldos, y explica si falta configurar', async () => {
  const partidas = [
    { debe: 0, haber: 160, cuentas_contables: { codigo: '209', nombre: 'IVA trasladado', naturaleza: 'acreedora' } },
    { debe: 100, haber: 0, cuentas_contables: { codigo: '118', nombre: 'IVA acreditable', naturaleza: 'deudora' } },
    { debe: 50, haber: 0, cuentas_contables: { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora' } },
  ];
  const f = supabaseFalso({
    configuracion_contable: { data: { cuenta_iva_trasladado_id: 'id-t', cuenta_iva_acreditable_id: 'id-a' }, error: null },
    cuentas_contables: { data: [{ id: 'id-t', codigo: '209' }, { id: 'id-a', codigo: '118' }], error: null },
    poliza_partidas: { data: partidas, error: null },
  });
  const h = crearHerramientasReales('t', { clienteComoUsuario: () => f.cliente });
  const r = await h.iva_del_periodo({ anio: 2026, mes: 11 });
  assert.deepEqual([r.periodo, r.trasladado, r.acreditable, r.resultado], ['2026-11', 160, 100, 60]);
  assert.ok(f.registro.some((q) => q.tabla === 'cuentas_contables' && q.filtros.some((x) => x[0] === 'in')));
  const sinCfg = await crearHerramientasReales('t', { clienteComoUsuario: () => supabaseFalso({ configuracion_contable: { data: { cuenta_iva_trasladado_id: null, cuenta_iva_acreditable_id: 'x' }, error: null } }).cliente }).iva_del_periodo({});
  assert.match(sinCfg.error, /Configuración contable/);
  const fallo = await crearHerramientasReales('t', { clienteComoUsuario: () => supabaseFalso({ configuracion_contable: { data: null, error: { message: 'secreto' } } }).cliente }).iva_del_periodo({});
  assert.ok(!JSON.stringify(fallo).includes('secreto'));
});

await ok('cfdis_sin_poliza: lista folio, fecha e importe de las facturas vigentes sin póliza activa (corregida cuenta), sin nombres, con tope de 10', async () => {
  const facturas = [
    { uuid_sat: 'AAA-1', folio: 'CT-1', tipo: 'I', estatus: 'vigente', total: 100, fecha: '2026-11-01' },   // con póliza
    { uuid_sat: 'BBB-2', folio: 'CT-2', tipo: 'I', estatus: 'vigente', total: 200.456, fecha: '2026-11-02' }, // sin póliza
    { uuid_sat: 'CCC-3', folio: 'CT-3', tipo: 'I', estatus: 'vigente', total: 50, fecha: '2026-11-03' },   // póliza corregida: cuenta
    ...Array.from({ length: 12 }, (_, i) => ({ uuid_sat: 'X' + i, folio: 'X-' + i, tipo: 'I', estatus: 'vigente', total: 1, fecha: '2026-11-04', receptor_nombre: 'NOMBRE PRIVADO' })),
  ];
  const polizas = [{ cfdi_uuid: 'aaa-1', estado: 'ok' }, { cfdi_uuid: 'CCC-3', estado: 'corregida' }];
  const f = supabaseFalso({ cfdis: { data: facturas, error: null }, polizas: { data: polizas, error: null } });
  const r = await crearHerramientasReales('t', { clienteComoUsuario: () => f.cliente }).cfdis_sin_poliza();
  assert.equal(r.total, 13); assert.equal(r.facturas.length, 10);
  assert.deepEqual(r.facturas[0], { folio: 'CT-2', fecha: '2026-11-02', total: 200.46, tipo: 'I' });
  assert.ok(!JSON.stringify(r).includes('NOMBRE PRIVADO') && !JSON.stringify(r).includes('BBB-2'), 'ni nombres ni UUID');
  const consultaCfdis = f.registro.find((q) => q.tabla === 'cfdis');
  assert.ok(consultaCfdis.filtros.some((x) => x[0] === 'neq' && x[1] === 'estatus' && x[2] === 'cancelado'), 'se excluyen las canceladas');
  const muchas = supabaseFalso({ cfdis: { data: Array.from({ length: 1000 }, () => ({ uuid_sat: 'u', estatus: 'vigente' })), error: null }, polizas: { data: [], error: null } });
  assert.match((await crearHerramientasReales('t', { clienteComoUsuario: () => muchas.cliente }).cfdis_sin_poliza()).error, /demasiadas facturas/);
  const mal = supabaseFalso({ cfdis: { data: null, error: { message: 'secreto' } }, polizas: { data: [], error: null } });
  assert.ok(!JSON.stringify(await crearHerramientasReales('t', { clienteComoUsuario: () => mal.cliente }).cfdis_sin_poliza()).includes('secreto'));
});

await ok('límite de uso: bloquea al pasar el máximo por usuario y se libera cuando termina la ventana', () => {
  let t = 0; const permitir = crearLimitador({ max: 2, ventanaMs: 1000, ahora: () => t });
  assert.equal(permitir('ana'), true); assert.equal(permitir('ana'), true); assert.equal(permitir('ana'), false);
  assert.equal(permitir('beto'), true);                       // otro usuario no se ve afectado
  t = 1500; assert.equal(permitir('ana'), true);              // ya pasó la ventana
});

await ok('la ruta exige sesión y un rol con acceso (director, admin, contador, auditor; no rh ni vendedor) antes de consultar, y avisa si falta la llave', () => {
  assert.deepEqual([...ROLES_IA].sort(), ['admin', 'auditor', 'contador', 'director']);
  const r = fs.readFileSync(path.join(aqui, 'src', 'routes', 'ia.js'), 'utf8');
  assert.ok(r.includes('iaRouter.use(verifyAuth)'));
  const i401 = r.indexOf('401'), i403 = r.indexOf('403'), iReglas = r.indexOf('responderPorReglas('), i503 = r.indexOf('503'), i429 = r.lastIndexOf('429'), iConsulta = r.indexOf('consultarIA({');
  assert.ok(i401 > 0 && i401 < i403 && i403 < iReglas && iReglas < i503 && i503 < i429 && i429 < iConsulta, 'primero sesión y rol; en modo IA luego llave y límite, y al final la consulta');
  // La llave solo se usa para: saber si existe (booleano) o pasársela al núcleo; jamás se devuelve.
  const usos = r.match(/config\.ia\.apiKey/g) || [];
  const permitidos = r.match(/Boolean\(config\.ia\.apiKey\)|!config\.ia\.apiKey|apiKey: config\.ia\.apiKey/g) || [];
  assert.ok(usos.length > 0 && usos.length === permitidos.length, 'la llave solo se usa como booleano o se pasa al núcleo');
  const idx = fs.readFileSync(path.join(aqui, 'index.js'), 'utf8');
  assert.ok(idx.includes("app.use('/api', iaRouter)"));
});

// ---------------- Frontend (frontend/app.js, bloque de la IA Contable) ----------------
await ok('frontend: el texto de la IA se escapa antes de darle formato y el del usuario se pinta como texto', async () => {
  const vm = await import('node:vm');
  const app = fs.readFileSync(path.join(aqui, '..', 'frontend', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const ini = app.indexOf('const escIA = '), fin = app.indexOf('const burbuja = ');
  assert.ok(ini > 0 && fin > ini, 'no se encontró el formateador de la IA en app.js');
  const ctx = vm.createContext({});
  vm.runInContext(app.slice(ini, fin) + '\nthis.formatea = formatea;', ctx);
  const f = ctx.formatea;
  assert.equal(f('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(f('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(f('Saldo: **$1,000.00**\nlisto'), 'Saldo: <b>$1,000.00</b><br>listo');
  assert.equal(f('**<b>x</b>**'), '<b>&lt;b&gt;x&lt;/b&gt;</b>');
  // el mensaje del usuario y los errores se asignan con textContent; solo la respuesta formateada usa innerHTML
  assert.ok(app.includes('burbuja("me", pregunta, true)') && app.includes('espera.textContent = (r && r.error)'));
  assert.ok(app.includes('espera.innerHTML = formatea(r.respuesta)'));
});

await ok('frontend: la IA arranca desactivada, se inicia al abrir la vista, y consulta por CTPostgres (con token y backend ya existentes)', () => {
  const app = fs.readFileSync(path.join(aqui, '..', 'frontend', 'app.js'), 'utf8');
  assert.ok(app.includes('bloquear("Cargando…")'));
  assert.ok(app.includes('navIA.addEventListener("click", iniciar)'), 'no debe pedir nada al cargar el panel, solo al abrir la vista');
  assert.ok(app.includes('window.CTPostgres.estadoIA()') && app.includes('window.CTPostgres.consultarIA('));
  for (const msg of ['Tu rol no tiene acceso al asistente contable.', 'falta configurar la llave del proveedor']) assert.ok(app.includes(msg), msg);
  const pg = fs.readFileSync(path.join(aqui, '..', 'frontend', 'postgres-crud.js'), 'utf8');
  assert.ok(pg.includes('"/api/ia/estado"') && pg.includes('"/api/ia/consultar"'));
  const html = fs.readFileSync(path.join(aqui, '..', 'frontend', 'dashboard.html'), 'utf8');
  assert.ok(html.includes('app.js?v=21') && html.includes('postgres-crud.js?v=5'));
  assert.ok(!html.includes('>En desarrollo<'), 'la etiqueta "En desarrollo" ya no aplica');
  const css = fs.readFileSync(path.join(aqui, '..', 'frontend', 'styles.css'), 'utf8');
  assert.ok(!css.includes('data-ia'), 'el auditor (solo lectura) debe poder usar la IA: no se oculta');
});

console.log(`\n✔ ${pruebas} pruebas de la IA Contable pasaron\n`);
