// ============================================================
//  CONTATECK · OT-0061 · Pruebas del timbrado masivo (lector de CSV + revisión previa)
//  Sin red y sin base: no timbra nada. Uso:  cd backend && node test-facturacion-masiva.js
// ============================================================
import assert from 'assert';
import { createRequire } from 'module';
import { validarLote, MAX_FACTURAS_LOTE } from './src/facturacionMasiva.js';

const require = createRequire(import.meta.url);
const csv = require('../frontend/facturacion-masiva-csv.js');

let pasaron = 0;
function ok(nombre, fn) {
  try { fn(); pasaron++; console.log('  ✔ ' + nombre); } catch (e) { console.log('  ✘ ' + nombre + '\n    ' + e.message); process.exitCode = 1; }
}

// ---------- Lector de CSV ----------
console.log('Lector de CSV');
ok('la plantilla descargable se lee sin errores y agrupa las filas con la misma "factura"', () => {
  const r = csv.leerFacturas(csv.plantillaCsv());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.facturas.length, 2, 'A1 (2 conceptos) + 1 suelta');
  assert.strictEqual(r.facturas[0].conceptos.length, 2);
  assert.strictEqual(r.facturas[0].agrupador, 'A1');
  assert.strictEqual(r.facturas[1].conceptos.length, 1);
  assert.deepStrictEqual(r.facturas[0].filasCsv, [2, 3]);
});
ok('la plantilla pasa la revisión del servidor tal cual', () => {
  const r = validarLote(csv.leerFacturas(csv.plantillaCsv()).facturas);
  assert.strictEqual(r.resumen.conError, 0, JSON.stringify(r.resultados));
  assert.strictEqual(r.resultados[0].subtotal, 2300);
  assert.strictEqual(r.resultados[0].total, 2668);
});
ok('acepta punto y coma, comillas, acentos y BOM', () => {
  const t = '﻿RFC;Razón Social;Código Postal;Régimen Fiscal;Concepto;Cantidad;Precio Unitario\r\nEKU9003173C9;"ESCUELA ""KEMPER"""; 42501;601;"Servicio, con coma";1;"1500,50"\r\n';
  const r = csv.leerFacturas(t);
  assert.deepStrictEqual(r.errores, []);
  const f = r.facturas[0];
  assert.strictEqual(f.receptor.nombre, 'ESCUELA "KEMPER"');
  assert.strictEqual(f.receptor.cp, '42501');
  assert.strictEqual(f.conceptos[0].descripcion, 'Servicio, con coma');
  assert.strictEqual(f.conceptos[0].precioUnitario, 1500.5);
  assert.strictEqual(f.receptor.usoCfdi, 'G03', 'valor por defecto');
  assert.strictEqual(f.tasaIva, '16'); assert.strictEqual(f.metodoPago, 'PUE'); assert.strictEqual(f.formaPago, '01');
});
ok('faltan columnas obligatorias: lo dice con los nombres', () => {
  const r = csv.leerFacturas('rfc,nombre\r\nEKU9003173C9,X\r\n');
  assert.strictEqual(r.facturas.length, 0);
  assert.ok(/cp, regimen, descripcion, cantidad, precioUnitario/.test(r.errores[0]), r.errores[0]);
});
ok('archivo vacío o solo encabezados', () => {
  assert.ok(csv.leerFacturas('').errores.length === 1);
  assert.ok(csv.leerFacturas('rfc,nombre,cp,regimen,descripcion,cantidad,precioUnitario\r\n').errores.length === 1);
});
ok('un número ilegible se avisa con su fila, no se manda NaN', () => {
  const r = csv.leerFacturas('rfc,nombre,cp,regimen,descripcion,cantidad,precioUnitario\r\nEKU9003173C9,X,42501,601,Algo,uno,100\r\n');
  assert.ok(/Fila 2/.test(r.errores[0]));
  assert.strictEqual(r.facturas[0].conceptos[0].cantidad, 0);
});
ok('filas de la misma factura con receptor distinto: error', () => {
  const t = 'factura,rfc,nombre,cp,regimen,descripcion,cantidad,precioUnitario\r\nA,EKU9003173C9,X,42501,601,a,1,10\r\nA,XAXX010101000,Y,42501,616,b,1,10\r\n';
  const r = csv.leerFacturas(t);
  assert.ok(/Fila 3/.test(r.errores[0]));
});
ok('el CSV de resultado neutraliza fórmulas de Excel y escapa comas', () => {
  const t = csv.resultadoCsv([{ filaCsv: 2, cliente: '=HYPERLINK("x")', rfc: 'A,B', total: 10, estado: 'timbrada', folio: 'CT-1', uuid: 'U', detalle: '' }]);
  assert.ok(t.includes("\"'=HYPERLINK(\"\"x\"\")\""), t);
  assert.ok(t.includes('"A,B"'));
});

// ---------- Revisión previa del servidor ----------
console.log('Revisión previa (servidor)');
const f = (extra = {}) => ({
  receptor: { rfc: 'EKU9003173C9', nombre: 'ESCUELA', usoCfdi: 'G03', cp: '42501', regimen: '601' },
  conceptos: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100 }], tasaIva: '16', metodoPago: 'PUE', formaPago: '03', ...extra,
});
ok('una factura correcta: subtotal y total con IVA', () => {
  const r = validarLote([f()]);
  assert.strictEqual(r.resultados[0].ok, true); assert.strictEqual(r.resultados[0].total, 116);
  assert.deepStrictEqual(r.resumen, { total: 1, validas: 1, conError: 0, subtotal: 100, importe: 116 });
});
ok('IVA exento y 0 no suman impuesto', () => {
  assert.strictEqual(validarLote([f({ tasaIva: 'exento' })]).resultados[0].total, 100);
  assert.strictEqual(validarLote([f({ tasaIva: '0' })]).resultados[0].total, 100);
});
ok('errores por factura, sin frenar a las demás', () => {
  const r = validarLote([f(), f({ receptor: { rfc: 'MAL', nombre: 'X', cp: '42501', regimen: '601' } }), f({ conceptos: [{ descripcion: 'x', cantidad: 0, precioUnitario: 5 }] }), f({ metodoPago: 'XYZ' })]);
  assert.deepStrictEqual(r.resultados.map((x) => x.ok), [true, false, false, false]);
  assert.ok(/RFC/.test(r.resultados[1].error)); assert.ok(/cantidad/.test(r.resultados[2].error)); assert.ok(/PUE o PPD/.test(r.resultados[3].error));
  assert.strictEqual(r.resumen.validas, 1); assert.strictEqual(r.resumen.conError, 3);
});
ok('RFC genérico exige régimen 616', () => {
  const r = validarLote([f({ receptor: { rfc: 'XAXX010101000', nombre: 'PUBLICO', cp: '42501', regimen: '601', usoCfdi: 'S01' } })]);
  assert.ok(/616/.test(r.resultados[0].error));
  assert.strictEqual(validarLote([f({ receptor: { rfc: 'XAXX010101000', nombre: 'PUBLICO', cp: '42501', regimen: '616', usoCfdi: 'S01' } })]).resultados[0].ok, true);
});
ok('usos D01–D10 solo para personas físicas (RFC de 13)', () => {
  assert.ok(/solo aplica a personas físicas/.test(validarLote([f({ receptor: { rfc: 'EKU9003173C9', nombre: 'X', cp: '42501', regimen: '601', usoCfdi: 'D10' } })]).resultados[0].error));
  assert.strictEqual(validarLote([f({ receptor: { rfc: 'XAXX010101000'.replace('XAXX', 'XAXX'), nombre: 'X', cp: '42501', regimen: '616', usoCfdi: 'S01' } })]).resultados[0].ok, true);
  assert.strictEqual(validarLote([f({ receptor: { rfc: 'PEPJ800101AB1', nombre: 'X', cp: '42501', regimen: '612', usoCfdi: 'D10' } })]).resultados[0].ok, true);
});
ok('avisa (sin bloquear) la factura repetida dentro del archivo', () => {
  const r = validarLote([f(), f()]);
  assert.strictEqual(r.resultados[1].ok, true); assert.ok(/factura 1/.test(r.resultados[1].aviso)); assert.strictEqual(r.resultados[0].aviso, undefined);
});
ok(`más de ${MAX_FACTURAS_LOTE} facturas o lote vacío: se rechaza el lote`, () => {
  assert.ok(/Máximo/.test(validarLote(Array.from({ length: MAX_FACTURAS_LOTE + 1 }, () => f())).error));
  assert.ok(validarLote([]).error); assert.ok(validarLote(null).error);
});
ok('elementos que no son objeto no truenan', () => {
  const r = validarLote([null, 5, 'x']);
  assert.deepStrictEqual(r.resultados.map((x) => x.ok), [false, false, false]);
});

console.log(process.exitCode ? '\nHAY FALLAS' : `\nTODO OK · ${pasaron} pruebas`);
