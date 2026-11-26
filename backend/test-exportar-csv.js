// ============================================================
//  CONTATECK · OT-0074 · Exportar listas a CSV (formato del archivo y cableado en el panel; sin red)
//  Uso:  cd backend && node test-exportar-csv.js
// ============================================================
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { csv, nombreArchivo } = require('../frontend/exportar-csv.js');
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

let pasaron = 0;
function ok(nombre, fn) { try { fn(); pasaron++; console.log('  ✔ ' + nombre); } catch (e) { console.log('  ✘ ' + nombre + '\n    ' + e.message); process.exitCode = 1; } }

console.log('Formato del archivo');
ok('empieza con BOM UTF-8, usa saltos CRLF y termina con salto de línea', () => {
  const t = csv(['A', 'B'], [[1, 'x']]);
  assert.strictEqual(t.charCodeAt(0), 0xFEFF);
  assert.strictEqual(t.slice(1), 'A,B\r\n1,x\r\n');
});
ok('acentos, eñes y símbolos se conservan tal cual', () => assert.ok(csv(['Cliente'], [['Peña Núñez — Café']]).includes('Peña Núñez — Café')));
ok('comas, comillas, punto y coma y saltos de línea dentro de un texto se entrecomillan y escapan', () => {
  assert.strictEqual(csv(['T'], [['a,b']]).split('\r\n')[1], '"a,b"');
  assert.strictEqual(csv(['T'], [['dijo "hola"']]).split('\r\n')[1], '"dijo ""hola"""');
  assert.strictEqual(csv(['T'], [['uno;dos']]).split('\r\n')[1], '"uno;dos"');
  assert.strictEqual(csv(['T'], [['l1\nl2']]).slice(1), 'T\r\n"l1\nl2"\r\n');
});
ok('un texto que Excel leería como fórmula se neutraliza (= + - @ y tabulador)', () => {
  for (const peligro of ['=SUMA(A1:A2)', '+52 55 1234', '-cmd|calc', '@usuario', '\t=1+1']) {
    const celda = csv(['T'], [[peligro]]).split('\r\n')[1];
    assert.ok(celda.startsWith("'") || celda.startsWith('"\''), peligro + ' → ' + celda);
  }
});
ok('un número NO se neutraliza: un importe negativo sigue siendo número en Excel', () => {
  assert.strictEqual(csv(['M'], [[-1160.5]]).split('\r\n')[1], '-1160.5');
  assert.strictEqual(csv(['M'], [[0]]).split('\r\n')[1], '0');
});
ok('vacíos y valores raros no truenan: null, undefined, NaN, Infinity, booleanos, fila nula, sin filas', () => {
  assert.strictEqual(csv(['A', 'B', 'C', 'D'], [[null, undefined, NaN, Infinity]]).split('\r\n')[1], ',,,');
  assert.strictEqual(csv(['A', 'B'], [[true, false]]).split('\r\n')[1], 'Sí,No');
  assert.strictEqual(csv(['A'], [null]).split('\r\n')[1], '');
  assert.strictEqual(csv(['A', 'B'], []), '﻿A,B\r\n');
  assert.doesNotThrow(() => csv(null, null));
});
ok('el nombre del archivo lleva la fecha y no deja caracteres raros', () => {
  assert.strictEqual(nombreArchivo('Ventas', new Date(2026, 10, 26)), 'Ventas_2026-11-26.csv');
  assert.strictEqual(nombreArchivo('Pólizas / 2026', new Date(2026, 0, 5)), 'P_lizas_2026_2026-01-05.csv');
  assert.match(nombreArchivo(), /^Exportacion_\d{4}-\d{2}-\d{2}\.csv$/);
});

console.log('Cableado en el panel');
ok('el HTML carga la herramienta antes que Ventas y Contabilidad, y tiene el botón de pólizas', () => {
  const html = leer('dashboard.html');
  const i = html.indexOf('exportar-csv.js');
  assert.ok(i > -1 && i < html.indexOf('contabilidad.js') && i < html.indexOf('ventas.js'));
  assert.ok(/<button[^>]*data-cont-exportar-pol/.test(html));
});
ok('Ventas exporta lo que se ve (los mismos filtros) y avisa si no hay nada', () => {
  const v = leer('ventas.js');
  assert.ok(v.includes('data-v-exportar') && v.includes('function exportarVentas()'));
  assert.ok(/function exportarVentas\(\) \{\s*const arr = ventasFiltradas\(\);/.test(v), 'usa ventasFiltradas()');
  assert.ok(v.includes('No hay pagos con esos filtros para exportar'));
});
ok('Pólizas exporta lo que se ve: la tabla y la exportación comparten la misma lista filtrada', () => {
  const c = leer('contabilidad.js');
  assert.ok(c.includes('function polizasVisibles()') && c.includes('function exportarPolizasCsv()'));
  assert.ok(/function renderPolizasTabla\(\) \{[\s\S]*?const pol = polizasVisibles\(\);/.test(c));
  assert.ok(/function exportarPolizasCsv\(\) \{\s*const pol = polizasVisibles\(\);/.test(c));
});
ok('Facturación exporta las facturas que se ven (mismo filtro que la tabla) y avisa si faltan por cargar', () => {
  const d = leer('data-firestore.js'), html = leer('dashboard.html');
  assert.ok(/<button[^>]*data-cfdis-exportar/.test(html));
  const m = d.match(/function exportarCfdis\(\) \{[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(m, 'existe exportarCfdis');
  assert.ok(m[0].includes('filters.cfdis') && m[0].includes('searchText("cfdis", r)'), 'usa el mismo filtro que refresh()');
  assert.ok(m[0].includes('uuidFull') && m[0].includes('CONTATECK_CFDIS_META') && m[0].includes('Cargar más'));
});
ok('Balanza exporta lo que se ve (con o sin saldo inicial según el periodo) y trae la fila de totales', () => {
  const c = leer('contabilidad.js'), html = leer('dashboard.html');
  assert.ok(c.includes('data-cont-exportar-balanza') && c.includes('function exportarBalanzaCsv()'));
  const m = c.match(/function exportarBalanzaCsv\(\) \{[\s\S]*?\r?\n  \}\r?\n/);
  assert.ok(m && m[0].includes('b.hayPeriodo') && m[0].includes('"Totales"') && m[0].includes('b.tot.saldoAcreedor'));
  assert.ok(html.includes('contabilidad.js?v=25'));
});
ok('Nómina exporta el historial y el detalle de una nómina, con montos como números', () => {
  const n = leer('nomina.js');
  assert.ok(n.includes('data-hist-exportar') && n.includes('data-nom-det-exportar'));
  assert.ok(/function exportarDetalleNomina\(\) \{[\s\S]*?Number\(d\.sueldo_base\)[\s\S]*?Number\(d\.neto\)/.test(n));
  assert.ok(/function exportarHistorialNominas\(\) \{[\s\S]*?Number\(n\.total_neto\)/.test(n));
  assert.ok(n.includes('ultimoDetalleNomina = { id: id, detalle: detalle }'), 'exporta el mismo detalle que muestra la ventana');
});
ok('exportar solo lee: ningún botón de exportación se oculta al rol de solo lectura', () => {
  const css = leer('styles.css');
  for (const b of ['data-v-exportar', 'data-cont-exportar-pol', 'data-cont-exportar-balanza', 'data-cfdis-exportar', 'data-hist-exportar', 'data-nom-det-exportar']) {
    assert.ok(!css.includes(b), b + ' no debe ocultarse');
  }
});

console.log(process.exitCode ? '\nHAY FALLAS' : `\nTODO OK · ${pasaron} pruebas`);
