// ============================================================
//  CONTATECK · Pruebas de los indicadores fiscales del Dashboard (OT-0061)
//  Sin red ni base de datos: las herramientas de lectura se simulan.
//  Ejecutar:  npm run test:indicadores
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { calcularIndicadores, obtenerIndicadoresFiscales, TASA_ISR_PERSONAS_MORALES } from './src/indicadoresFiscales.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const leer = (...p) => fs.readFileSync(path.join(aqui, ...p), 'utf8').replace(/\r\n/g, '\n');
let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };
const HOY = '2026-11-25';

console.log('\nIndicadores fiscales (OT-0061)\n');

await ok('ISR estimado para el régimen 601: 30% de la utilidad contable acumulada; con pérdida o sin movimientos es cero', () => {
  const caso = (totales) => calcularIndicadores({ iva: { trasladado: 160, acreditable: 100, resultado: 60 }, saldosAnio: { totales_por_digito: totales }, regimen: '601', hoy: HOY }).isr;
  assert.equal(TASA_ISR_PERSONAS_MORALES, 0.3);
  assert.deepEqual(caso({ 4: 5000, 5: 1000, 6: 1500 }), { disponible: true, anio: 2026, base: 2500, tasa: 0.3, estimado: 750 });
  assert.equal(caso({ 4: 100, 6: 400 }).base, -300); assert.equal(caso({ 4: 100, 6: 400 }).estimado, 0);        // pérdida: no hay ISR estimado
  assert.deepEqual(caso({}), { disponible: true, anio: 2026, base: 0, tasa: 0.3, estimado: 0 });
  assert.equal(caso({ 4: 258.62, 6: 172.41 }).estimado, 25.86);                                                      // redondeo a centavos (86.21 × 0.30 = 25.863)
});

await ok('para otros regímenes, sin régimen o sin datos NO se inventa un ISR: se explica el motivo', () => {
  const t = { totales_por_digito: { 4: 1000 } };
  const otro = calcularIndicadores({ iva: {}, saldosAnio: t, regimen: '626', hoy: HOY }).isr;
  assert.equal(otro.disponible, false); assert.match(otro.motivo, /régimen general de personas morales \(601\)/); assert.match(otro.motivo, /626/); assert.match(otro.motivo, /contador/);
  assert.match(calcularIndicadores({ iva: {}, saldosAnio: t, regimen: null, hoy: HOY }).isr.motivo, /Falta el régimen fiscal/);
  assert.match(calcularIndicadores({ iva: {}, saldosAnio: t, regimen: '  ', hoy: HOY }).isr.motivo, /Falta el régimen fiscal/);
  assert.match(calcularIndicadores({ iva: {}, saldosAnio: { error: 'x' }, regimen: '601', hoy: HOY }).isr.motivo, /No se pudieron leer/);
  assert.equal(calcularIndicadores({ iva: {}, saldosAnio: t, regimen: ' 601 ', hoy: HOY }).isr.disponible, true, 'espacios alrededor del régimen no estorban');
});

await ok('IVA del mes en curso: trasladado, acreditable y resultado con el periodo en palabras; el error de configuración se conserva para explicarlo', () => {
  const r = calcularIndicadores({ iva: { trasladado: 41.384, acreditable: 27.59, resultado: 13.794 }, saldosAnio: { totales_por_digito: {} }, regimen: '601', hoy: HOY }).iva;
  assert.deepEqual(r, { periodo: 'noviembre de 2026', trasladado: 41.38, acreditable: 27.59, resultado: 13.79 });
  assert.equal(calcularIndicadores({ iva: { trasladado: 1, acreditable: 1, resultado: 0 }, saldosAnio: {}, regimen: '601', hoy: '2026-01-05' }).iva.periodo, 'enero de 2026');
  const sinCfg = calcularIndicadores({ iva: { error: 'Faltan las cuentas de IVA trasladado y acreditable en la Configuración contable.' }, saldosAnio: {}, regimen: '601', hoy: HOY }).iva;
  assert.equal(sinCfg.error, 'No se pudo calcular el IVA.'); assert.match(sinCfg.detalle, /Configuración contable/);
  const otro = calcularIndicadores({ iva: { error: 'secreto interno de la base' }, saldosAnio: {}, regimen: '601', hoy: HOY }).iva;
  assert.ok(!JSON.stringify(otro).includes('secreto'), 'los errores internos no llegan a la pantalla');
});

await ok('obtenerIndicadoresFiscales pide el IVA del mes actual y los saldos del año, con la herramienta del usuario, y nunca lanza', async () => {
  const pedidos = [];
  const herramientas = {
    async iva_del_periodo(e) { pedidos.push(['iva', e]); return { trasladado: 160, acreditable: 100, resultado: 60 }; },
    async saldos_de_cuentas(e) { pedidos.push(['saldos', e]); return { totales_por_digito: { 4: 1000, 5: 200, 6: 300 } }; },
  };
  const r = await obtenerIndicadoresFiscales('token', { herramientas, hoy: HOY, regimen: async () => '601' });
  assert.deepEqual(pedidos, [['iva', { anio: 2026, mes: 11 }], ['saldos', { anio: 2026 }]]);
  assert.equal(r.ok, true); assert.equal(r.isr.estimado, 150); assert.equal(r.iva.resultado, 60); assert.match(r.nota, /no sustituyen la revisión de tu contador/);
  const malo = await obtenerIndicadoresFiscales('token', { herramientas: { async iva_del_periodo() { throw new Error('postgres://clave'); }, async saldos_de_cuentas() { return {}; } }, hoy: HOY, regimen: async () => '601' });
  assert.deepEqual(malo, { ok: false, error: 'No se pudieron calcular los indicadores fiscales.' });
});

await ok('la ruta es solo para roles de contabilidad (rh y vendedor reciben "restringido", no ceros) y la herramienta nueva no escribe', () => {
  const ruta = leer('src', 'routes', 'dashboard.js');
  const i401 = ruta.indexOf("res.status(401)", ruta.indexOf('/indicadores-fiscales')), iRol = ruta.indexOf('ROLES_IA.includes(rol)'), iCalc = ruta.indexOf('obtenerIndicadoresFiscales(req.token)');
  assert.ok(i401 > 0 && i401 < iRol && iRol < iCalc, 'primero sesión, luego rol y al final el cálculo');
  assert.ok(ruta.includes('restringido: true'));
  const fuente = leer('src', 'indicadoresFiscales.js');
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\(/.test(fuente) && !/service_?role/i.test(fuente));
});

await ok('frontend: la tarjeta pide los indicadores aparte, escapa los textos y ya no dice "pendiente de definición fiscal"', async () => {
  const app = leer('..', 'frontend', 'app.js');
  assert.ok(!app.includes('pendiente de definición fiscal'));
  assert.ok(app.includes('window.CTPostgres.indicadoresFiscales()') && app.includes('pintarIndicadoresFiscales(r)'));
  assert.ok(leer('..', 'frontend', 'postgres-crud.js').includes('"/api/indicadores-fiscales"'));
  // se ejecuta el pintor real con datos de ejemplo
  const a = app.indexOf('function pintarIndicadoresFiscales'), b = app.indexOf('// Estado vacío SIN el rótulo');
  assert.ok(a > 0 && b > a);
  const ctx = vm.createContext({
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    money: (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    sinPendientes: (t) => '<sin>' + t + '</sin>',
  });
  vm.runInContext(app.slice(a, b) + '\nthis.pintar = pintarIndicadoresFiscales;', ctx);
  const h = ctx.pintar({ ok: true, iva: { periodo: 'noviembre de 2026', trasladado: 160, acreditable: 100, resultado: 60 }, isr: { disponible: true, anio: 2026, base: 2500, estimado: 750 }, nota: 'Cifras de referencia' });
  assert.match(h, /IVA trasladado \(noviembre de 2026\)<\/span><b>\$160\.00/); assert.match(h, /IVA a cargo<\/span><b>\$60\.00/); assert.match(h, /ISR estimado 2026<\/span><b>\$750\.00/); assert.match(h, /Es un estimado/);
  assert.match(ctx.pintar({ ok: true, iva: { periodo: 'x', trasladado: 0, acreditable: 50, resultado: -50 }, isr: { disponible: false, motivo: '<script>alert(1)</script>' } }), /IVA a favor<\/span><b>\$50\.00[\s\S]*&lt;script&gt;/);
  assert.match(ctx.pintar({ ok: true, restringido: true }), /roles de contabilidad/);
  assert.match(ctx.pintar({ ok: false }), /No se pudieron calcular/);
  assert.match(ctx.pintar({ ok: true, iva: { error: 'x', detalle: 'Faltan las cuentas de IVA' }, isr: { disponible: false, motivo: 'm' } }), /Faltan las cuentas de IVA/);
});

console.log(`\n✔ ${pruebas} pruebas de indicadores fiscales pasaron\n`);
