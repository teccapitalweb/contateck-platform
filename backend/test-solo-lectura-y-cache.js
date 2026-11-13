// ============================================================
//  CONTATECK · OT-0042 · Pruebas del rol de solo lectura (auditor) y del caché de lecturas
//  Sin red ni base de datos ni servidor.
//    1) styles.css oculta al auditor TODOS los botones que escriben y NINGUNO de los de lectura;
//       auth-guard.js marca la página con el rol; y si un módulo agrega un botón nuevo que escribe,
//       esta prueba falla hasta que se agregue a la lista (o a las excepciones, con su motivo).
//    2) postgres-crud.js: el caché de lecturas repetidas (una sola petición en vuelo, TTL, una
//       escritura lo borra, un error no se guarda, cada quien recibe su copia).
//  Uso:  node test-solo-lectura-y-cache.js   (o  npm run test:lectura)
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');
let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };

// ============================================================
console.log('\n1) Rol de solo lectura (auditor)');

const css = leer('styles.css');
const inicio = css.indexOf('OT-0042 · Rol de solo lectura');
assert.ok(inicio > 0, 'falta el bloque de solo lectura en styles.css');
const bloque = css.slice(inicio);
assert.match(bloque, /html\[data-rol="auditor"\] :is\(/);
assert.match(bloque, /\) \{ display: none !important; \}/);
// Solo selectores simples: el de valor ([data-soon*="imbrado"]) se prueba aparte para no ocultar "Exportar".
const ocultos = new Set(Array.from(bloque.matchAll(/\[([a-z0-9-]+)\]/g)).map((m) => m[1]));
const ocultaTimbrado = /\[data-soon\*="imbrado"\]/.test(bloque);

await ok('se ocultan los botones que escriben de Contabilidad, Ventas, Facturación, Nómina y los genéricos', () => {
  for (const a of [
    'data-cont-nueva-pol', 'data-cont-nueva-cta', 'data-cont-edit-cta', 'data-cont-del-cta', 'data-cont-reactivar-cta', 'data-cont-contabilizar',
    'data-cont-importar-xml', 'data-cont-config-contable', 'data-cerrar-periodo', 'data-cont-editar-pol', 'data-cont-del-pol', 'data-cont-anular-pol',
    'data-v-nueva', 'data-v-tomar', 'data-v-conf', 'data-v-rech', 'data-v-genpol',
    'data-facturar', 'data-correo-cfdi', 'data-nc-cfdi', 'data-rep-cfdi', 'data-cancelar-cfdi', 'data-config-empresa',
    'data-nom-calcular', 'data-pn-generar', 'data-pn-aprobar', 'data-new', 'data-edit', 'data-del', 'data-sat-agr-cargar',
  ]) assert.ok(ocultos.has(a), 'no se oculta: ' + a);
  assert.ok(ocultaTimbrado, 'los avisos "Timbrado masivo" y "Timbrar nómina" deben ocultarse');
});

await ok('NO se oculta ninguno de los botones de lectura (ver, PDF, historial, descargas)', () => {
  for (const a of [
    'data-v-ver', 'data-v-verpol', 'data-cont-ver', 'data-pdf-cfdi', 'data-fac-pdf', 'data-fac-pdf-dl', 'data-hist-comprobante',
    'data-provhist-abrir', 'data-provhist-det', 'data-provhist-comprobante', 'data-hist-ver', 'data-simfiscal',
    'data-sat-xml-cat', 'data-sat-xml-bal', 'data-sat-csv-cat', 'data-fis-ver-doc', 'data-soon', 'data-cont-mayor',
  ]) assert.ok(!ocultos.has(a), 'se está ocultando un botón de lectura: ' + a);
  // "Exportar" usa data-soon pero NO es un timbrado: el selector por valor no debe alcanzarlo
  const dash = leer('dashboard.html');
  const exportar = /data-soon="([^"]*xportaci[^"]*)"/.exec(dash);
  assert.ok(exportar && !/imbrado/.test(exportar[1]), '"Exportar" no debe quedar oculto');
  assert.ok(/data-soon="[^"]*imbrado[^"]*"/.test(dash), 'ya no hay avisos de timbrado en dashboard.html: revisar el selector');
});

await ok('cada atributo de la lista existe en el código (sin erratas)', () => {
  const codigo = ['dashboard.html', 'ventas.js', 'facturacion.js', 'nomina.js', 'contabilidad.js', 'data-firestore.js', 'app.js'].map(leer).join('\n');
  for (const a of ocultos) assert.ok(codigo.includes(a), 'el atributo no aparece en ningún módulo: ' + a);
});

await ok('un botón nuevo que escribe no puede quedar sin ocultar: todo lo que parece escritura está en la lista o en las excepciones', () => {
  // Nombres que SÍ son acciones de lectura, de navegación o que solo existen dentro de ventanas que se abren
  // con botones ya ocultos (captura rápida, póliza, configuración, factura). Cada uno con su motivo.
  const EXCEPCIONES = {
    'data-cierre-cancelar': 'cancelar el cierre (dentro de la ventana de Cerrar periodo)',
    'data-cobro-busca': 'buscador dentro del flujo de cobro', 'data-cobro-cancelar': 'cancelar dentro del flujo de cobro',
    'data-cobro-continuar': 'paso dentro del flujo de cobro', 'data-cobro-factura': 'elegir factura dentro del flujo de cobro',
    'data-cobro-lista': 'lista dentro del flujo de cobro', 'data-cobro-volver-lista': 'navegación dentro del flujo de cobro',
    'data-prov-busca': 'buscador dentro del flujo de pago a proveedor', 'data-prov-cancelar': 'cancelar dentro del flujo de pago a proveedor',
    'data-prov-continuar': 'paso del flujo de pago a proveedor', 'data-prov-factura': 'elegir factura del flujo de pago a proveedor',
    'data-prov-lista': 'lista del flujo de pago a proveedor', 'data-prov-volver-lista': 'navegación del flujo de pago a proveedor',
    'data-rapido-form': 'formulario de la captura rápida (solo se abre desde "Nueva póliza")', 'data-rapido-volver': 'navegación de la captura rápida',
    'data-codigo': 'dato de una cuenta, no un botón', 'data-config-rol': 'campo de la ventana de Configuración contable (oculta)',
    'data-cont-as-add': 'agregar renglón dentro del formulario de póliza (oculto)', 'data-cont-as-del': 'quitar renglón dentro del formulario de póliza (oculto)',
    'data-cont-cuadrar': 'ayuda de cuadre dentro del formulario de póliza (oculto)', 'data-ct-ok': 'aceptar un aviso de la propia pantalla',
    'data-perfil-volver': 'navegación dentro de la ventana de Configuración de facturación (oculta)',
  };
  const modulos = ['ventas.js', 'facturacion.js', 'nomina.js', 'contabilidad.js', 'data-firestore.js', 'app.js', 'dashboard.html'];
  const nombres = new Set();
  for (const f of modulos) for (const m of leer(f).matchAll(/data-([a-z0-9-]+)/g)) nombres.add('data-' + m[1]);
  const pareceEscritura = /(guardar|confirmar|aplicar|nuev|editar|edit$|edit-|eliminar|-del|del-|anular|timbrar|aprobar|generar|genpol|calcular|emitir|enviar|importar|contabilizar|reactivar|cerrar-periodo|cierre|config|facturar|-nc|nc-|rep-|-rep$|correo|tomar|rech|conf$|-conf|cobro-|prov-|rapido|cuadrar|as-add|as-del|perfil|new$|nueva|nuevo|ok$|go$)/;
  const sinCubrir = [...nombres].filter((n) => pareceEscritura.test(n) && !ocultos.has(n) && !EXCEPCIONES[n]).sort();
  assert.deepEqual(sinCubrir, [], 'botones que parecen escribir y no están en styles.css ni en las excepciones: ' + sinCubrir.join(', '));
});

await ok('auth-guard.js marca la página con el rol del perfil', () => {
  const ag = leer('auth-guard.js');
  assert.match(ag, /document\.documentElement\.setAttribute\("data-rol", perfilData\.perfil\.rol\)/);
});

await ok('las versiones de caché de los archivos tocados subieron en dashboard.html', () => {
  const d = leer('dashboard.html');
  assert.match(d, /styles\.css\?v=\d+/); assert.match(d, /postgres-crud\.js\?v=\d+/); assert.match(d, /auth-guard\.js\?v=\d+/);
});

// ============================================================
console.log('\n2) Caché de lecturas repetidas (postgres-crud.js)');

function cliente({ respuestas = {}, latencia = 0 } = {}) {
  const llamadas = [];
  const win = { CONTATECK_SUPABASE_TOKEN: 'token', APP_CONFIG: { BACKEND_URL: 'http://backend.falso' }, console };
  win.fetch = async (url, op) => {
    const ruta = String(url).replace('http://backend.falso', '');
    llamadas.push((op.method || 'GET') + ' ' + ruta);
    if (latencia) await new Promise((r) => setTimeout(r, latencia));
    const r = respuestas[ruta];
    const cuerpo = typeof r === 'function' ? r() : (r === undefined ? { ok: true, datos: [1, 2, 3] } : r);
    return { json: async () => cuerpo };
  };
  win.window = win; vm.createContext(win);
  vm.runInContext(leer('postgres-crud.js'), win, { filename: 'postgres-crud.js' });
  return { C: win.CTPostgres, llamadas, win };
}

await ok('varios pedidos iguales al mismo tiempo comparten UNA petición', async () => {
  const { C, llamadas } = cliente({ latencia: 20 });
  const r = await Promise.all([1, 2, 3, 4, 5, 6].map(() => C.listarPeriodos()));
  assert.equal(llamadas.filter((l) => l === 'GET /api/periodos').length, 1);
  assert.ok(r.every((x) => x.ok === true));
});

await ok('un pedido posterior dentro de la vigencia reutiliza el resultado; al vencer, vuelve a pedir', async () => {
  const { C, llamadas, win } = cliente();
  await C.listarPeriodos(); await C.listarPeriodos();
  assert.equal(llamadas.length, 1);
  // pasan 9 s (la vigencia es de 8 s): se adelanta el reloj DENTRO del navegador simulado
  vm.runInContext('Date.now = (function (o) { return function () { return o() + 9000; }; })(Date.now);', win);
  await C.listarPeriodos();
  assert.equal(llamadas.length, 2);
});

await ok('cada quien recibe su propia copia: modificar el resultado no afecta a los demás', async () => {
  const { C } = cliente({ respuestas: { '/api/periodos': { ok: true, periodos: [{ mes: 1 }] } } });
  const a = await C.listarPeriodos(); a.periodos.push({ mes: 99 }); a.periodos[0].mes = 7;
  const b = await C.listarPeriodos();
  assert.equal(JSON.stringify(b.periodos), '[{"mes":1}]');
});

await ok('cualquier escritura borra el caché (la lectura siguiente ya es nueva)', async () => {
  const { C, llamadas } = cliente();
  await C.listarPeriodos();
  await C.cerrarPeriodo(2026, 11);               // POST /api/periodos/cerrar
  await C.listarPeriodos();
  assert.equal(llamadas.filter((l) => l === 'GET /api/periodos').length, 2);
  await C.listarPeriodos(); assert.equal(llamadas.filter((l) => l === 'GET /api/periodos').length, 2);
  await C.guardarConfigContable({});             // PUT: también invalida otras rutas
  await C.leerConfigContable(); await C.leerConfigContable();
  assert.equal(llamadas.filter((l) => l === 'GET /api/config-contable').length, 1);
});

await ok('un error no se guarda: el siguiente pedido vuelve a intentarlo', async () => {
  let n = 0;
  const { C, llamadas } = cliente({ respuestas: { '/api/cfdis-proveedor': () => (++n === 1 ? { ok: false, error: 'falla' } : { ok: true, facturas: [] }) } });
  const a = await C.listarCfdisProveedorTodas(); assert.equal(a.ok, false);
  const b = await C.listarCfdisProveedorTodas(); assert.equal(b.ok, true);
  assert.equal(llamadas.length, 2);
});

await ok('sin sesión no se guarda nada y las rutas que no son de lectura repetida nunca se cachean', async () => {
  const { C, llamadas, win } = cliente();
  win.CONTATECK_SUPABASE_TOKEN = '';
  const sin = await C.listarPeriodos(); assert.equal(sin.ok, false); assert.equal(llamadas.length, 0);
  win.CONTATECK_SUPABASE_TOKEN = 'token';
  await C.obtenerPartidasPoliza('abc'); await C.obtenerPartidasPoliza('abc');   // ruta no cacheable
  assert.equal(llamadas.filter((l) => l.includes('/partidas')).length, 2);
});

await ok('las pólizas con partidas se cachean por conjunto de ids, no mezclan resultados', async () => {
  const { C, llamadas } = cliente({ respuestas: { '/api/polizas-completas/con-partidas?ids=a%2Cb': { ok: true, polizas: [1] }, '/api/polizas-completas/con-partidas?ids=c': { ok: true, polizas: [2] } } });
  const x = await C.polizasConPartidas(['a', 'b']); const y = await C.polizasConPartidas(['c']); const z = await C.polizasConPartidas(['a', 'b']);
  assert.equal(JSON.stringify(x.polizas), '[1]'); assert.equal(JSON.stringify(y.polizas), '[2]'); assert.equal(JSON.stringify(z.polizas), '[1]');
  assert.equal(llamadas.length, 2);
});

// OT-0044: auth-guard pide la configuración contable por el caché (si existe), no con un fetch propio,
// para que la petición que hace Contabilidad después se comparta y no se repita.
await ok('auth-guard pide config-contable por CTPostgres (caché) y solo cae a fetch directo sin él', async () => {
  const g = leer('auth-guard.js');
  assert.match(g, /window\.CTPostgres\s*&&\s*window\.CTPostgres\.leerConfigContable/);
  assert.equal((g.match(/\/api\/config-contable/g) || []).length, 1, 'solo queda el respaldo directo');
  const { C, llamadas } = cliente({ respuestas: { '/api/config-contable': { ok: true, config: { a: 1 } } } });
  const [x, y] = await Promise.all([C.leerConfigContable(), C.leerConfigContable()]);   // auth-guard + Contabilidad
  assert.equal(x.ok && y.ok, true);
  assert.equal(llamadas.filter((l) => l.includes('/api/config-contable')).length, 1);
});

console.log(`\n✔ ${pruebas} pruebas de solo lectura y caché pasaron\n`);
