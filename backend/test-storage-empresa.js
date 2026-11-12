// ============================================================
//  CONTATECK · OT-0038 · Prueba de storage-empresa.js (datos del navegador por empresa)
//  Sin red ni base de datos: simula un navegador con vm.
//    1) Pruebas del módulo storage-empresa.js solo.
//    2) contabilidad.js COMPLETO cargado en un navegador simulado, cambiando de empresa:
//       las pólizas de una empresa no deben verse en otra.
//  Uso: node test-storage-empresa.js
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const codigo = (f) => fs.readFileSync(path.join(frontend, f), 'utf8');

// ---------- navegador simulado ----------
function crearLocalStorage(opciones = {}) {
  const m = new Map();
  return {
    _m: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opciones.sinEspacio && opciones.sinEspacio(k)) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}
const CONFIG_SUPABASE = { url: 'https://ejemplo.supabase.co', anonKey: 'anon-de-prueba' };

function navegador({ ls = crearLocalStorage(), supabase = CONFIG_SUPABASE, empresa = null } = {}) {
  const win = { localStorage: ls, SUPABASE_CONFIG: supabase, console };
  if (empresa) win.CONTATECK_EMPRESA_PG = { id: empresa };
  win.window = win;
  vm.createContext(win);
  return win;
}
const cargar = (win, archivo) => vm.runInContext(codigo(archivo), win, { filename: archivo });

let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log('  ✔ ' + nombre); };

console.log('\n1) storage-empresa.js');

ok('dos empresas en el mismo navegador no se ven entre sí', () => {
  const w = navegador({ empresa: 'A' });
  cargar(w, 'storage-empresa.js');
  w.CTStorage.setItem('contateck_polizas', '["de A"]');
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
  w.CTStorage.setItem('contateck_polizas', '["de B"]');
  assert.equal(w.CTStorage.getItem('contateck_polizas'), '["de B"]');
  w.CONTATECK_EMPRESA_PG = { id: 'A' };
  assert.equal(w.CTStorage.getItem('contateck_polizas'), '["de A"]');
  assert.deepEqual(w.localStorage.keys().sort(), ['contateck_polizas:A', 'contateck_polizas:B']);
});

ok('mientras no se sabe la empresa no se lee ni se escribe en el navegador', () => {
  const w = navegador(); // sin empresa
  cargar(w, 'storage-empresa.js');
  w.localStorage.setItem('contateck_polizas:A', '["de A"]'); // algo que ya existía de A
  assert.equal(w.CTStorage.scope(), null);
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
  w.CTStorage.setItem('contateck_polizas', '["temporal"]');
  assert.equal(w.CTStorage.getItem('contateck_polizas'), '["temporal"]'); // memoria de la pestaña
  assert.deepEqual(w.localStorage.keys(), ['contateck_polizas:A']); // nada nuevo escrito
  w.CONTATECK_EMPRESA_PG = { id: 'B' }; // ya se sabe: lo temporal NO pasa a B
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
});

ok('datos viejos sin empresa se apartan: ninguna empresa los ve y no se borran', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_polizas', '["viejas"]');
  ls.setItem('contateck_folios', '{"I":3}');
  ls.setItem('contateck_cuentas_cache', '["cuentas"]');
  ls.setItem('contateck_rfc_emisor', 'AAA010101AAA');
  const w = navegador({ ls, empresa: 'A' });
  cargar(w, 'storage-empresa.js');
  w.CTStorage.getItem('contateck_polizas'); // el barrido de claves viejas ocurre en el primer uso
  for (const k of ['contateck_polizas', 'contateck_folios', 'contateck_cuentas_cache', 'contateck_rfc_emisor']) {
    assert.equal(ls.getItem(k), null, 'sigue sin empresa: ' + k);
    assert.equal(w.CTStorage.getItem(k), null, 'A ve datos viejos: ' + k);
    assert.notEqual(ls.getItem('contateck_legacy_' + k), null, 'se perdió: ' + k);
  }
  assert.equal(ls.getItem('contateck_legacy_contateck_polizas'), '["viejas"]');
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
});

ok('si no hay espacio para apartar, el dato original NO se borra', () => {
  const ls = crearLocalStorage({ sinEspacio: (k) => k.startsWith('contateck_legacy_') });
  ls.setItem('contateck_polizas', '["viejas"]');
  const w = navegador({ ls, empresa: 'A' });
  cargar(w, 'storage-empresa.js');
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null); // A no lo ve
  assert.equal(ls.getItem('contateck_polizas'), '["viejas"]'); // y sigue ahí: no se perdió
});

ok('la configuración de Supabase puede cargar DESPUÉS del módulo (orden de scripts en dashboard.html)', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_polizas', '["viejas de una empresa real"]');
  const w = navegador({ ls, supabase: null }); // al cargar el módulo todavía no hay configuración
  cargar(w, 'storage-empresa.js');
  w.SUPABASE_CONFIG = CONFIG_SUPABASE; // ...y llega después
  w.CONTATECK_EMPRESA_PG = { id: 'A' };
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
  assert.equal(ls.getItem('contateck_legacy_contateck_polizas'), '["viejas de una empresa real"]', 'debía apartarse como dato viejo');
  assert.equal(ls.getItem('contateck_polizas:local'), null, 'no debía ir a la clave del modo local');
});

ok('modo local puro (sin Supabase): los datos viejos pasan a "local" y se conservan', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_polizas', '["locales"]');
  const w = navegador({ ls, supabase: {} });
  cargar(w, 'storage-empresa.js');
  assert.equal(w.CTStorage.scope(), 'local');
  assert.equal(w.CTStorage.getItem('contateck_polizas'), '["locales"]');
  assert.equal(ls.getItem('contateck_polizas'), null);
});

ok('CFDI contabilizados y perfiles de marca: los adopta solo la primera empresa', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_cfdi_contab', '["uuid-1"]');
  ls.setItem('contateck_perfiles', '{"perfiles":[{"id":"p1"}],"activoId":"p1"}');
  const w = navegador({ ls, empresa: 'A' });
  cargar(w, 'storage-empresa.js');
  assert.equal(w.CTStorage.getItem('contateck_cfdi_contab'), '["uuid-1"]');
  assert.match(w.CTStorage.getItem('contateck_perfiles'), /p1/);
  assert.equal(ls.getItem('contateck_cfdi_contab'), null);
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  assert.equal(w.CTStorage.getItem('contateck_cfdi_contab'), null);
  assert.equal(w.CTStorage.getItem('contateck_perfiles'), null);
});

ok('limpiarCaches borra solo el respaldo de cuentas de la empresa actual', () => {
  const w = navegador({ empresa: 'A' });
  cargar(w, 'storage-empresa.js');
  w.CTStorage.setItem('contateck_cuentas_cache', '["a"]');
  w.CTStorage.setItem('contateck_polizas', '["p"]');
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  w.CTStorage.setItem('contateck_cuentas_cache', '["b"]');
  w.CTStorage.limpiarCaches();
  assert.equal(w.CTStorage.getItem('contateck_cuentas_cache'), null);
  w.CONTATECK_EMPRESA_PG = { id: 'A' };
  assert.equal(w.CTStorage.getItem('contateck_cuentas_cache'), '["a"]'); // la de A sigue
  assert.equal(w.CTStorage.getItem('contateck_polizas'), '["p"]'); // las pólizas nunca se limpian
});

ok('si el navegador bloquea localStorage no truena', () => {
  const w = navegador({ empresa: 'A' });
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('bloqueado'); } });
  cargar(w, 'storage-empresa.js');
  assert.equal(w.CTStorage.setItem('contateck_polizas', '[]'), false);
  assert.equal(w.CTStorage.getItem('contateck_polizas'), null);
});

console.log('\n2) contabilidad.js completo en un navegador simulado');

// Un "documento" que acepta cualquier llamada: sirve para que el archivo arranque sin pantalla real.
function falso() {
  const base = function () {};
  const p = new Proxy(base, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'forEach' || k === 'map' || k === 'filter') return () => [];
      return p;
    },
    set() { return true; },
    apply() { return p; },
  });
  return p;
}

function conContabilidad(ls, empresa, { temporizadoresReales = false } = {}) {
  const win = navegador({ ls, empresa });
  win.document = falso();
  // Por omisión sin temporizadores: lo asíncrono se queda esperando y no estorba.
  win.setTimeout = temporizadoresReales ? setTimeout : () => 0;
  win.clearTimeout = () => {};
  win.requestAnimationFrame = () => 0;
  win.addEventListener = () => {};
  win.navigator = { userAgent: 'prueba' };
  cargar(win, 'storage-empresa.js');
  cargar(win, 'contabilidad.js');
  return win;
}
const poliza = (id, folio) => ({ id, folio, tipo: 'Ingreso', fecha: '2026-11-01', concepto: 'x', monto: 100, asientos: [] });

ok('Contabilidad muestra solo las pólizas de la empresa activa', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_polizas:A', JSON.stringify([poliza('a1', 'I-A1')]));
  ls.setItem('contateck_polizas:B', JSON.stringify([poliza('b1', 'I-B1'), poliza('b2', 'I-B2')]));
  ls.setItem('contateck_polizas', JSON.stringify([poliza('v1', 'I-VIEJA')])); // dato de antes de esta OT
  const w = conContabilidad(ls, 'A');
  assert.ok(w.CTCont && w.CTCont.getPolizas, 'contabilidad.js no arrancó');
  // (JSON.stringify porque los arreglos creados dentro del navegador simulado son de otro "mundo" para deepEqual)
  const folios = () => JSON.stringify(w.CTCont.getPolizas().map((p) => p.folio).sort());
  assert.equal(folios(), '["I-A1"]');
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  assert.equal(folios(), '["I-B1","I-B2"]');
  w.CONTATECK_EMPRESA_PG = { id: 'C' };
  assert.equal(folios(), '[]');
  assert.equal(ls.getItem('contateck_polizas'), null, 'las pólizas viejas siguen a la vista sin empresa');
  assert.equal(ls.getItem('contateck_legacy_contateck_polizas') !== null, true, 'las pólizas viejas se perdieron');
});

ok('una póliza guardada en una empresa no aparece en la otra', () => {
  const w = conContabilidad(crearLocalStorage(), 'A');
  w.CTCont.savePoliza({ tipo: 'Ingreso', fecha: '2026-11-02', concepto: 'solo de A', asientos: [] });
  assert.equal(w.CTCont.getPolizas().length, 1);
  w.CONTATECK_EMPRESA_PG = { id: 'B' };
  assert.equal(w.CTCont.getPolizas().length, 0);
  w.CONTATECK_EMPRESA_PG = { id: 'A' };
  assert.equal(w.CTCont.getPolizas().length, 1);
});

ok('sin saber la empresa, Contabilidad no muestra pólizas de nadie', () => {
  const ls = crearLocalStorage();
  ls.setItem('contateck_polizas:A', JSON.stringify([poliza('a1', 'I-A1')]));
  const w = conContabilidad(ls, null);
  assert.equal(w.CTCont.getPolizas().length, 0);
});

// Prueba con tiempo real (~6 s): en la primera carga de una empresa el backend llegó a tardar más
// de 4 s y Contabilidad dejó de esperar sus pólizas, así que se veía vacía hasta recargar.
console.log('\n3) carga lenta del backend (tarda unos segundos)');
{
  const w = conContabilidad(crearLocalStorage(), null, { temporizadoresReales: true });
  setTimeout(() => {
    w.CONTATECK_EMPRESA_PG = { id: 'A' };
    w.CONTATECK_POLIZAS_PG = [{ id: 'pg1', folio: 'I-LENTA', tipo: 'Ingreso', fecha: '2026-11-01', concepto: 'x', estado: 'ok', monto: 5 }];
  }, 5000); // llega 5 s después de abrir la página
  await new Promise((r) => setTimeout(r, 6500));
  ok('las pólizas que llegan a los 5 s sí se sincronizan (antes se dejaban de esperar a los 4 s)', () => {
    assert.equal(JSON.stringify(w.CTCont.getPolizas().map((p) => p.folio)), '["I-LENTA"]');
    assert.notEqual(w.localStorage.getItem('contateck_polizas:A'), null);
  });
}

console.log(`\nOK: ${pruebas} pruebas pasaron.`);
process.exit(0);
