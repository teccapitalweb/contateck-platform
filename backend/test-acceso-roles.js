// ============================================================
//  CONTATECK · Pruebas de la pantalla por rol (OT-0070)
//  Sin navegador: se ejecuta el módulo real acceso-roles.js contra un DOM mínimo armado con las vistas REALES de dashboard.html.
//  Ejecutar:  npm run test:acceso-roles
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const leer = (...p) => fs.readFileSync(path.join(aqui, '..', 'frontend', ...p), 'utf8').replace(/\r\n/g, '\n');
const acceso = createRequire(import.meta.url)('../frontend/acceso-roles.js');
let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log('  ✔ ' + nombre); };
const html = leer('dashboard.html');

// ---------- DOM mínimo ----------
function el(attrs, clases = []) {
  const c = new Set(clases);
  return { attrs, classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: (x, f) => (f ? c.add(x) : c.delete(x)) }, getAttribute: (k) => (k in attrs ? attrs[k] : null), textContent: '', hijos: [] };
}
function armarDoc() {
  const vistas = [...html.matchAll(/<div class="nav-item[^"]*" data-view="([a-z]+)" data-title="([^"]*)"/g)].map((m) => ({ v: m[1], t: m[2] }));
  const secciones = [...html.matchAll(/<section class="view[^"]*" data-view="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(vistas.length >= 8 && secciones.length >= 8, 'se leyeron las vistas reales de dashboard.html');
  const clics = [];
  const items = vistas.map((x) => { const i = el({ 'data-view': x.v, 'data-title': x.t }, x.v === 'dashboard' ? ['nav-item', 'is-active'] : ['nav-item']); i.click = () => clics.push(x.v); return i; });
  const grupo = (vs) => { const g = el({}, ['side__group']); g.hijos = items.filter((i) => vs.includes(i.getAttribute('data-view'))); g.querySelectorAll = () => g.hijos; return g; };
  const grupos = [grupo(['dashboard', 'contabilidad', 'ventas', 'facturacion', 'nomina', 'sat']), grupo(['invitaciones']), grupo(['ia'])];
  const views = secciones.map((v) => el({ 'data-view': v }, v === 'dashboard' ? ['view', 'is-active'] : ['view']));
  const crumb = el({ 'data-crumb-title': '' }); crumb.textContent = 'Dashboard ejecutivo';
  const doc = {
    querySelectorAll(sel) { if (sel === '.nav-item[data-view]') return items; if (sel === '.side__group') return grupos; if (sel === '.view[data-view]') return views; throw new Error('selector no previsto: ' + sel); },
    querySelector(sel) { if (sel === '.view.is-active') return views.find((v) => v.classList.contains('is-active')) || null; if (sel === '[data-crumb-title]') return crumb; throw new Error('selector no previsto: ' + sel); },
  };
  return { doc, items, grupos, views, crumb, clics, vistas: vistas.map((x) => x.v) };
}
const visibles = (lista) => lista.filter((x) => !x.classList.contains('por-rol-oculto')).map((x) => x.getAttribute('data-view'));

console.log('\nPantalla por rol (OT-0070)\n');

ok('qué vistas ve cada rol: rh solo Nómina y Equipo; vendedor solo Ventas y Facturación; el resto conserva todo', () => {
  assert.deepEqual(acceso.vistasDe('rh'), ['nomina', 'invitaciones']); assert.deepEqual(acceso.vistasDe('vendedor'), ['ventas', 'facturacion']);
  for (const r of ['director', 'admin', 'contador', 'auditor', undefined, null, 'otro']) { assert.equal(acceso.vistasDe(r), null); assert.equal(acceso.puedeVer(r, 'sat'), true); assert.equal(acceso.inicioDe(r), null); }
  assert.equal(acceso.puedeVer('rh', 'contabilidad'), false); assert.equal(acceso.puedeVer('rh', 'nomina'), true); assert.equal(acceso.puedeVer('rh', 'ia'), false); assert.equal(acceso.puedeVer('rh', 'dashboard'), false);
  assert.equal(acceso.puedeVer('vendedor', 'nomina'), false); assert.equal(acceso.puedeVer('vendedor', 'facturacion'), true); assert.equal(acceso.puedeVer('vendedor', 'invitaciones'), false);
  assert.equal(acceso.inicioDe('rh'), 'nomina'); assert.equal(acceso.inicioDe('vendedor'), 'ventas');
  const copia = acceso.vistasDe('rh'); copia.push('sat'); assert.equal(acceso.puedeVer('rh', 'sat'), false, 'la lista devuelta es una copia');
});

ok('rh: se ocultan menú, rótulos y secciones que no son suyos y arranca en Nómina', () => {
  const d = armarDoc(); const r = acceso.aplicar('rh', d.doc);
  assert.deepEqual(visibles(d.items).sort(), ['invitaciones', 'nomina']);
  assert.deepEqual(visibles(d.views).sort(), ['invitaciones', 'nomina']);
  assert.equal(r.inicio, 'nomina'); assert.deepEqual(r.ocultas.sort(), d.vistas.filter((v) => !['nomina', 'invitaciones'].includes(v)).sort());
  assert.equal(d.views.find((v) => v.getAttribute('data-view') === 'nomina').classList.contains('is-active'), true);
  assert.equal(d.views.filter((v) => v.classList.contains('is-active')).length, 1, 'una sola sección activa');
  assert.equal(d.items.filter((i) => i.classList.contains('is-active')).map((i) => i.getAttribute('data-view')).join(), 'nomina');
  assert.equal(d.crumb.textContent, 'Nómina');
  assert.deepEqual(d.clics, ['nomina'], 'se hace el clic real en su opción de inicio: así el módulo dibuja su sección (si no, queda en blanco)');
  assert.equal(d.grupos[2].classList.contains('por-rol-oculto'), true, 'el grupo "Asistente", sin opciones visibles, también se oculta');
  assert.equal(d.grupos[1].classList.contains('por-rol-oculto'), false); assert.equal(d.grupos[0].classList.contains('por-rol-oculto'), false);
});

ok('vendedor: ve Ventas y Facturación, arranca en Ventas y se oculta el grupo de Equipo', () => {
  const d = armarDoc(); acceso.aplicar('vendedor', d.doc);
  assert.deepEqual(visibles(d.items).sort(), ['facturacion', 'ventas']); assert.deepEqual(visibles(d.views).sort(), ['facturacion', 'ventas']);
  assert.equal(d.views.find((v) => v.classList.contains('is-active')).getAttribute('data-view'), 'ventas'); assert.equal(d.crumb.textContent, 'Ventas y pagos');
  assert.equal(d.grupos[1].classList.contains('por-rol-oculto'), true); assert.equal(d.grupos[2].classList.contains('por-rol-oculto'), true);
  assert.deepEqual(d.clics, ['ventas'], 'Ventas se dibuja con el clic en su opción');
});

ok('los demás roles (y un rol desconocido) no cambian nada; aplicarlo dos veces da lo mismo', () => {
  for (const rol of ['director', 'admin', 'contador', 'auditor', undefined]) {
    const d = armarDoc(); const r = acceso.aplicar(rol, d.doc);
    assert.deepEqual(r, { ocultas: [], inicio: null }); assert.equal(visibles(d.items).length, d.vistas.length); assert.deepEqual(d.clics, [], 'sin clics para los demás roles');
    assert.equal(d.views.find((v) => v.classList.contains('is-active')).getAttribute('data-view'), 'dashboard'); assert.equal(d.crumb.textContent, 'Dashboard ejecutivo');
  }
  const d = armarDoc(); acceso.aplicar('rh', d.doc); const una = JSON.stringify(visibles(d.items)); acceso.aplicar('rh', d.doc);
  assert.equal(JSON.stringify(visibles(d.items)), una); assert.equal(d.views.filter((v) => v.classList.contains('is-active')).length, 1);
  assert.deepEqual(acceso.aplicar('rh', null), { ocultas: [], inicio: null });
});

ok('si la sección activa ya es del rol, no se mueve (p. ej. el vendedor que ya estaba en Facturación)', () => {
  const d = armarDoc();
  d.views.forEach((v) => v.classList.toggle('is-active', v.getAttribute('data-view') === 'facturacion'));
  d.items.forEach((i) => i.classList.toggle('is-active', i.getAttribute('data-view') === 'facturacion'));
  acceso.aplicar('vendedor', d.doc);
  assert.equal(d.views.find((v) => v.classList.contains('is-active')).getAttribute('data-view'), 'facturacion'); assert.deepEqual(d.clics, [], 'no se mueve ni se hace clic si ya estaba en una sección suya');
});

ok('el panel carga el módulo antes que app.js, lo aplica al fijar el rol, y app.js y el buscador lo respetan', () => {
  assert.ok(html.indexOf('acceso-roles.js') > 0 && html.indexOf('acceso-roles.js') < html.indexOf('app.js?v='), 'acceso-roles.js va antes que app.js');
  const guard = leer('auth-guard.js');
  assert.ok(guard.indexOf('setAttribute("data-rol"') > 0 && guard.indexOf('CTAcceso.aplicar(') > guard.indexOf('setAttribute("data-rol"'));
  assert.ok(leer('app.js').includes('window.CTAcceso.puedeVer(document.documentElement.getAttribute("data-rol"), id)'), 'la navegación rechaza vistas ajenas, también por clic programático');
  const pb = leer('panel-busqueda.js');
  for (const k of ['puede(d.vista)', 'puede("facturacion") ? (window.CONTATECK_CFDIS_PG', 'puede("contabilidad") ? (window.CONTATECK_POLIZAS_PG', 'puede("nomina") ? (window.CONTATECK_EMPLEADOS_REAL_PG', 'puede("dashboard") ?']) assert.ok(pb.includes(k), k);
});

ok('estilos: lo oculto por rol no se ve; al vendedor se le quitan los botones de escritura de Facturación y Ventas, pero NO "Nueva venta"', () => {
  const css = leer('styles.css');
  assert.ok(/\.por-rol-oculto\s*\{\s*display:\s*none\s*!important/.test(css));
  const i = css.indexOf('html[data-rol="vendedor"] :is('); assert.ok(i > 0);
  const bloque = css.slice(i, css.indexOf(') { display: none !important; }', i));
  for (const b of ['data-facturar', 'data-fac-timbrar', 'data-fac-masivo', 'data-fac-cancelar', 'data-nc-emitir', 'data-rep-emitir', 'data-correo-enviar', 'data-cancelar-cfdi', 'data-config-empresa', 'data-v-tomar', 'data-v-conf', 'data-v-rech', 'data-v-genpol']) assert.ok(bloque.includes('[' + b + ']'), b);
  assert.ok(!bloque.includes('data-v-nueva') && !bloque.includes('data-v-guardar'), 'registrar una venta es del vendedor');
  // todo botón de escritura de Facturación que ya se le oculta al auditor, también se le oculta al vendedor
  const aud = css.slice(css.indexOf('html[data-rol="auditor"] :is('), css.indexOf('/* Nómina */'));
  const fact = aud.slice(aud.indexOf('/* Facturación'), aud.indexOf('/* Nómina'));
  const esperados = [...fact.matchAll(/\[(data-[a-z-]+)\]/g)].map((m) => m[1]).filter((n) => n !== 'data-soon');
  assert.ok(esperados.length >= 12);
  for (const b of esperados) assert.ok(bloque.includes('[' + b + ']'), 'falta para el vendedor: ' + b);
});

ok('Ventas: el vendedor no ve el aviso, el filtro ni la etiqueta de "sin póliza"; los demás roles (auditor incluido) sí', () => {
  const ventas = leer('ventas.js');
  const a = ventas.indexOf('function veAvisosContables'); assert.ok(a > 0);
  const fn = ventas.slice(a, ventas.indexOf('\n', a));
  for (const [rol, esperado] of [['vendedor', false], ['auditor', true], ['contador', true], ['admin', true], ['director', true], ['rh', true]]) {
    const cx = {}; new Function('cx', 'const miRol = () => ' + JSON.stringify(rol) + ';\n' + fn + '\ncx.f = veAvisosContables;')(cx);
    assert.equal(cx.f(), esperado, rol);
  }
  assert.ok(ventas.includes('const nSin = veAvisosContables() ? ventasCache.filter(sinPoliza).length : 0;'), 'aviso y chip salen de nSin');
  assert.ok(ventas.includes('const badgePol = veAvisosContables() && sinPoliza(v) ? '), 'la etiqueta de cada venta');
  assert.ok(html.includes('ventas.js?v=6'));
});

console.log(`\n✔ ${pruebas} pruebas de pantalla por rol pasaron\n`);
