// ============================================================
//  CONTATECK · Pruebas: las facturas canceladas no se cobran ni se pagan, y no cuentan como deuda (OT-0034, OT-0055, OT-0057)
//  Revisan el código fuente (los módulos crean su propio cliente de Supabase y no se pueden simular sin red).
//  Ejecutar:  npm run test:canceladas
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const leer = (f) => fs.readFileSync(path.join(src, f), 'utf8').replace(/\r\n/g, '\n');
let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log('  ✔ ' + nombre); };
const funcion = (codigo, nombre) => { const i = codigo.indexOf('export async function ' + nombre); assert.ok(i >= 0, nombre); const j = codigo.indexOf('\nexport ', i + 10); return codigo.slice(i, j < 0 ? undefined : j); };

console.log('\nFacturas canceladas (OT-0057)\n');

ok('cobros a clientes: no se registra un cobro sobre una factura cancelada y el selector no las lista', () => {
  const c = leer('supabasePagosCliente.js');
  const registrar = funcion(c, 'registrarPagoCliente');
  assert.ok(registrar.includes("cfdi.estatus === 'cancelado'") && registrar.indexOf("cfdi.estatus === 'cancelado'") < registrar.indexOf("rpc('registrar_pago_cliente'"), 'la revisión va antes de registrar');
  assert.ok(funcion(c, 'listarCfdisSaldo').includes(".neq('estatus', 'cancelado')"));
});

ok('pagos a proveedores: no se registra un pago sobre una factura cancelada (revisión antes de registrar) y la lista de pendientes no las incluye', () => {
  const p = funcion(leer('supabasePagosProveedor.js'), 'registrarPagoProveedor');
  assert.ok(p.includes("factura.estatus === 'cancelado'") && p.includes('ya no se le registran pagos'));
  assert.ok(p.indexOf("factura.estatus === 'cancelado'") < p.indexOf("rpc('registrar_pago_proveedor'"), 'la revisión va antes de registrar');
  assert.ok(funcion(leer('supabaseCfdisProveedor.js'), 'listarCfdisProveedorSaldo').includes(".neq('estatus', 'cancelado')"));
});

ok('el historial completo de facturas de proveedor sigue mostrando también las canceladas (es consulta, no lista de pendientes)', () => {
  assert.ok(!funcion(leer('supabaseCfdisProveedor.js'), 'listarCfdisProveedorTodas').includes(".neq('estatus', 'cancelado')"));
});

ok('el asistente y las alertas no cuentan las facturas canceladas como deuda', () => {
  const ia = leer('iaContable.js');
  assert.ok(ia.includes("f.estatus !== 'cancelado' && Number(f.saldo_pendiente) > 0"));
  const alertas = leer('alertasContables.js');
  assert.ok(alertas.includes("c.estatus === 'cancelado'"), 'las alertas de CFDI sin póliza excluyen cancelados');
});

console.log(`\n✔ ${pruebas} pruebas de facturas canceladas pasaron\n`);
