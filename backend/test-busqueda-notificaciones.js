// ============================================================
//  CONTATECK · OT-0068 · Buscador global y notificaciones de la barra superior (lógica pura, sin red)
//  Uso:  cd backend && node test-busqueda-notificaciones.js
// ============================================================
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { normalizar, buscar, notificaciones } = require('../frontend/panel-busqueda-core.js');
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');

let pasaron = 0;
function ok(nombre, fn) { try { fn(); pasaron++; console.log('  ✔ ' + nombre); } catch (e) { console.log('  ✘ ' + nombre + '\n    ' + e.message); process.exitCode = 1; } }

const fuentes = {
  cfdis: [
    { id: 'c1', serie: 'CT', folio: 'CT-46', uuid_sat: 'a3ac7af2-b40c-4dd2-8416-38071d027d1a', receptor_nombre: 'ESCUELA KEMPER URGATE', receptor_rfc: 'EKU9003173C9', total: 2668, fecha: '2026-11-26T16:27:45Z', estatus: 'vigente', tipo: 'I' },
    { id: 'c2', serie: 'CT', folio: 'CT-35', uuid_sat: 'e8c968d0-aaaa-bbbb-cccc-111122223333', receptor_nombre: 'Distribuidora Peña SA', receptor_rfc: 'DPE010101AB1', total: 1160, fecha: '2026-08-14', estatus: 'cancelado', tipo: 'I' },
    { id: 'c3', serie: 'CT', folio: 'CT-12', uuid_sat: 'ffff0000-aaaa-bbbb-cccc-444455556666', receptor_nombre: 'Cliente NC', receptor_rfc: 'CNC010101AB1', total: 58, fecha: '2026-07-01', estatus: 'vigente', tipo: 'E' },
  ],
  polizas: [
    { id: 'p1', folio: 'I-00003', tipo: 'Ingreso', fecha: '2026-11-05', concepto: 'Venta P-0003 — pago de consultoría', monto: 300, estado: 'ok' },
    { id: 'p2', folio: 'E-00007', tipo: 'Egreso', fecha: '2026-11-15', concepto: 'Nómina quincenal 2026-11-01 a 2026-11-15', monto: 6600, estado: 'ok' },
    { id: 'p3', folio: 'D-00002', tipo: 'Diario', fecha: '2026-10-01', concepto: 'Ajuste de inventario', monto: 80, estado: 'corregida' },
  ],
  clientes: [{ nombre: 'Distribuidora Peña SA', rfc: 'DPE010101AB1' }, { nombre: 'Pérez y Hermanos', rfc: 'PEH800101AA1' }],
  empleados: [
    { nombre: 'Karla Fuente Nolasco', puesto: 'contadora', departamento: 'Contabilidad', rfc: 'FUNK671228PH6', curp: 'FUNK671228MDFNLR08', nss: '12345678901', sueldo: 53.33 },
    { nombre: 'Juan Pérez', puesto: 'ventas', departamento: 'Comercial' },
  ],
};
const grupo = (r, clave) => r.find((g) => g.clave === clave);

console.log('Buscador');
ok('sin acentos ni mayúsculas: "pena" encuentra "Peña" en facturas y clientes', () => {
  const r = buscar(fuentes, 'pena');
  assert.deepStrictEqual(r.map((g) => g.clave), ['facturas', 'clientes']);
  assert.match(grupo(r, 'facturas').items[0].titulo, /CT-35/);
});
ok('menos de 2 letras no busca nada; vacío y null tampoco truenan', () => {
  assert.deepStrictEqual(buscar(fuentes, 'a'), []); assert.deepStrictEqual(buscar(fuentes, ''), []); assert.deepStrictEqual(buscar(fuentes, null), []);
  assert.deepStrictEqual(buscar(null, 'karla'), []); assert.deepStrictEqual(buscar({}, 'karla'), []);
});
ok('varias palabras: todas deben aparecer (en cualquier orden)', () => {
  assert.strictEqual(grupo(buscar(fuentes, 'consultoria venta'), 'polizas').items.length, 1);
  assert.strictEqual(buscar(fuentes, 'consultoria inventario').length, 0);
});
ok('una factura se encuentra por folio, por UUID y por RFC del cliente', () => {
  for (const q of ['CT-46', 'a3ac7af2', 'eku9003173c9']) assert.match(grupo(buscar(fuentes, q), 'facturas').items[0].titulo, /CT-46/, q);
});
ok('la factura lleva a Facturación filtrando por su folio; muestra importe, fecha y estado', () => {
  const it = grupo(buscar(fuentes, 'CT-46'), 'facturas').items[0];
  assert.deepStrictEqual(it.destino, { vista: 'facturacion', filtro: { clave: 'cfdis', texto: 'CT-46' } });
  assert.match(it.detalle, /\$2,668\.00/); assert.match(it.detalle, /2026-11-26/); assert.match(it.detalle, /vigente/);
  assert.match(grupo(buscar(fuentes, 'CT-35'), 'facturas').items[0].detalle, /cancelada/);
  assert.match(grupo(buscar(fuentes, 'CT-12'), 'facturas').items[0].detalle, /nota de crédito/);
});
ok('la póliza lleva a Contabilidad → Pólizas con su id para abrir el detalle', () => {
  const it = grupo(buscar(fuentes, 'I-00003'), 'polizas').items[0];
  assert.deepStrictEqual(it.destino, { vista: 'contabilidad', tab: 'polizas', polizaPgId: 'p1', filtro: { clave: 'polizas', texto: 'I-00003' } });
  assert.match(grupo(buscar(fuentes, 'inventario'), 'polizas').items[0].detalle, /corregida/);
});
ok('empleados: solo por nombre, puesto y departamento; NUNCA por RFC, CURP, NSS ni sueldo', () => {
  assert.strictEqual(grupo(buscar(fuentes, 'karla'), 'empleados').items.length, 1);
  assert.strictEqual(grupo(buscar(fuentes, 'contabilidad'), 'empleados').items.length, 1);
  for (const dato of ['FUNK671228PH6', 'FUNK671228MDFNLR08', '12345678901', '53.33']) assert.strictEqual(grupo(buscar(fuentes, dato), 'empleados'), undefined, dato);
  const it = grupo(buscar(fuentes, 'karla'), 'empleados').items[0];
  assert.strictEqual(JSON.stringify(it).includes('FUNK6712'), false, 'el resultado no filtra el RFC');
  assert.deepStrictEqual(it.destino, { vista: 'nomina', filtro: { clave: 'empleados', texto: 'Karla Fuente Nolasco' } });
});
ok('orden: primero lo que empieza con lo escrito, luego lo que lo contiene', () => {
  const f = { clientes: [{ nombre: 'Casa Perez', rfc: 'A' }, { nombre: 'Perez Hermanos', rfc: 'B' }, { nombre: 'Los Perez', rfc: 'C' }] };
  assert.deepStrictEqual(buscar(f, 'perez')[0].items.map((x) => x.titulo), ['Perez Hermanos', 'Casa Perez', 'Los Perez']);
});
ok('el límite por grupo se respeta y se informa el total', () => {
  const f = { cfdis: Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, serie: 'CT', folio: 'CT-' + i, receptor_nombre: 'Acme', total: 1 })) };
  const g = buscar(f, 'acme', { limite: 5 })[0]; assert.strictEqual(g.items.length, 5); assert.strictEqual(g.total, 20);
});
ok('filas raras (null, números, sin campos) no truenan', () => {
  assert.doesNotThrow(() => buscar({ cfdis: [null, 5, {}], polizas: [undefined, 'x'], clientes: [{}], empleados: [{ nombre: null }] }, 'algo'));
});
ok('lo escrito con HTML se devuelve como texto (la pantalla lo escapa); no se interpreta aquí', () => {
  const r = buscar({ clientes: [{ nombre: '<img src=x onerror=alert(1)>', rfc: 'X' }] }, 'img');
  assert.strictEqual(r[0].items[0].titulo, '<img src=x onerror=alert(1)>');
});

console.log('Notificaciones');
ok('alertas reales del Dashboard con su acción; lo urgente primero y se respeta el orden dentro de cada tipo', () => {
  const n = notificaciones({ alertas: [
    { tipo: 'info', titulo: 'Documento por vencer', texto: 'x', accion: { vista: 'fiscal' } },
    { tipo: 'danger', titulo: 'Obligación vencida', texto: 'IVA', accion: { vista: 'fiscal' } },
    { tipo: 'warn', titulo: 'CFDI sin póliza', texto: '3 facturas', accion: { vista: 'contabilidad' } },
    { tipo: 'warn', titulo: 'Pagos sin causación', texto: '2', accion: { vista: 'contabilidad' } },
  ] });
  assert.deepStrictEqual(n.map((x) => x.titulo), ['Obligación vencida', 'CFDI sin póliza', 'Pagos sin causación', 'Documento por vencer']);
  assert.deepStrictEqual(n[1].destino, { vista: 'contabilidad' });
});
ok('invitaciones a otras empresas: avisan y mandan al selector de empresa', () => {
  const n = notificaciones({ alertas: [], invitaciones: [{ id: 'i1', empresa: 'Empresa B', rol: 'contador' }] });
  assert.strictEqual(n.length, 1); assert.strictEqual(n[0].titulo, 'Te invitaron a Empresa B'); assert.match(n[0].texto, /contador/); assert.deepStrictEqual(n[0].destino, { selectorEmpresa: true });
});
ok('sin alertas ni invitaciones: lista vacía; datos raros no truenan; un tipo desconocido queda informativo', () => {
  assert.deepStrictEqual(notificaciones({}), []); assert.deepStrictEqual(notificaciones(null), []); assert.deepStrictEqual(notificaciones({ alertas: 'x', invitaciones: 5 }), []);
  const n = notificaciones({ alertas: [null, { titulo: '' }, { tipo: 'raro', titulo: 'Algo' }] });
  assert.strictEqual(n.length, 1); assert.strictEqual(n[0].tipo, 'info'); assert.strictEqual(n[0].destino, null);
});

console.log('Cableado en el panel');
ok('el HTML carga el núcleo antes que la pantalla y los dos botones de la barra tienen su atributo', () => {
  const html = fs.readFileSync(path.join(raiz, 'dashboard.html'), 'utf8');
  assert.ok(html.indexOf('panel-busqueda-core.js') > -1 && html.indexOf('panel-busqueda-core.js') < html.indexOf('panel-busqueda.js'));
  assert.ok(/<button[^>]*data-busqueda-global[^>]*aria-label="Buscar"/.test(html) || /<button[^>]*aria-label="Buscar"[^>]*data-busqueda-global/.test(html));
  assert.ok(/<button[^>]*data-notificaciones[^>]*aria-label="Notificaciones"/.test(html) || /<button[^>]*aria-label="Notificaciones"[^>]*data-notificaciones/.test(html));
  const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
  assert.ok(app.includes('contateck:dashboard-datos'), 'app.js avisa cuando el Dashboard tiene sus datos');
});
ok('la normalización del buscador es la de siempre (acentos, mayúsculas, espacios)', () => assert.strictEqual(normalizar('  ÁÉÍ  Ñandú  '), 'aei nandu'));

console.log(process.exitCode ? '\nHAY FALLAS' : `\nTODO OK · ${pasaron} pruebas`);
