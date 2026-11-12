// ============================================================
//  CONTATECK · OT-0038 · Fase 2 · Prueba de la LÓGICA de test-aislamiento-empresas.js
//  Sin red ni base: usa una base falsa en memoria con dos empresas. Comprueba que el script
//  da OK cuando el aislamiento funciona y FUGA cuando hay un hueco (por eso importa: una prueba
//  que nunca falla no sirve).
//  Uso: node test-aislamiento-logica.js
// ============================================================
import assert from 'node:assert/strict';
import { ejecutar, revisarTabla, TABLAS } from './test-aislamiento-empresas.js';

// ---------- base falsa ----------
// visible(tabla, fila) decide qué ve el usuario; el cliente "admin" ve todo (como la llave de servicio).
class Consulta {
  constructor(db, tabla, esAdmin) { this.db = db; this.tabla = tabla; this.esAdmin = esAdmin; this.filtros = []; this.soloContar = false; this.tope = Infinity; this.conConteo = false; }
  select(_cols, opc = {}) { this.soloContar = !!opc.head; this.conConteo = opc.count === 'exact'; return this; }
  eq(c, v) { this.filtros.push((f) => f[c] === v); return this; }
  neq(c, v) { this.filtros.push((f) => f[c] !== undefined && f[c] !== null && f[c] !== v); return this; } // como SQL: null no cuenta
  is(c, v) { this.filtros.push((f) => (f[c] === undefined ? null : f[c]) === v); return this; }
  in(c, lista) { this.filtros.push((f) => lista.includes(f[c])); return this; }
  limit(n) { this.tope = n; return this; }
  then(ok, ko) { return Promise.resolve(this._ejecutar()).then(ok, ko); }
  _ejecutar() {
    const tabla = this.db.tablas[this.tabla];
    if (!tabla) return { data: null, count: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.tabla}'` } };
    if (!this.esAdmin && this.db.denegadas && this.db.denegadas[this.tabla]) {
      // como PostgREST: con head no hay cuerpo y el mensaje llega vacío; sin head trae el código 42501
      return this.soloContar
        ? { data: null, count: null, status: 403, error: { message: '', details: '', hint: '', code: '' } }
        : { data: null, count: null, status: 403, error: { code: '42501', message: `permission denied for table ${this.tabla}` } };
    }
    let filas = tabla.filter((f) => this.esAdmin || this.db.visible(this.tabla, f));
    filas = filas.filter((f) => this.filtros.every((fn) => fn(f)));
    const count = this.conConteo ? filas.length : null;
    return { data: this.soloContar ? null : filas.slice(0, this.tope), count, error: null };
  }
}
function cliente(db, esAdmin) {
  return {
    from: (t) => new Consulta(db, t, esAdmin),
    storage: { from: () => ({ list: async (prefijo) => {
      const todos = db.archivos;
      const nivel = prefijo ? todos.filter((a) => a.startsWith(prefijo + '/')).map((a) => ({ name: a.split('/')[1] })) : [...new Set(todos.map((a) => a.split('/')[0]))].map((n) => ({ name: n }));
      return { data: esAdmin || !prefijo || prefijo === db.empresaUsuario ? nivel : (db.fugaStorage ? nivel : []), error: null };
    } }) },
  };
}
function baseFalsa({ empresaUsuario, fugas = {}, fugaStorage = false }) {
  const A = 'emp-A', B = 'emp-B';
  const tablas = {
    empresas: [{ id: A }, { id: B }],
    perfiles: [{ id: 'u1', empresa_id: A }, { id: 'u2', empresa_id: B }],
    polizas: [{ id: 'pA', empresa_id: A }, { id: 'pB1', empresa_id: B }, { id: 'pB2', empresa_id: B }],
    poliza_partidas: [{ id: 1, poliza_id: 'pA' }, { id: 2, poliza_id: 'pB1' }],
    cfdis: [{ id: 'c1', empresa_id: A }], // solo existe la empresa A: no se puede concluir nada
    clientes: [{ id: 'k1', empresa_id: A }, { id: 'k2', empresa_id: B }, { id: 'k3', empresa_id: null }],
    administradores_plataforma: [{ user_id: 'u1' }],
    roles: [{ id: 1 }],
  };
  const db = {
    tablas, empresaUsuario, fugaStorage, archivos: [`${A}/a.pdf`, `${B}/b.pdf`],
    visible(tabla, f) {
      if (tabla === 'administradores_plataforma') return !!fugas[tabla];
      if (fugas[tabla]) return true; // hueco: esta tabla se ve completa
      if (tabla === 'empresas') return f.id === empresaUsuario;
      if (tabla === 'poliza_partidas') return tablas.polizas.find((p) => p.id === f.poliza_id).empresa_id === empresaUsuario;
      return f.empresa_id === empresaUsuario;
    },
  };
  return { db, admin: cliente(db, true), usuario: cliente(db, false) };
}

const CHICAS = [{ t: 'empresas', tipo: 'propia', col: 'id' }, { t: 'perfiles' }, { t: 'polizas' }, { t: 'poliza_partidas', tipo: 'hija', fk: 'poliza_id', padre: 'polizas' },
  { t: 'cfdis' }, { t: 'clientes' }, { t: 'administradores_plataforma', tipo: 'cerrada' }, { t: 'roles', tipo: 'catalogo' }, { t: 'nominas' }];
const veredictos = (r) => Object.fromEntries(r.filas.map((f) => [f.tabla, f.veredicto]));
let n = 0; const ok = async (nombre, fn) => { await fn(); n++; console.log('  ✔ ' + nombre); };

console.log('\nLógica de test-aislamiento-empresas.js');

await ok('con RLS correcto: OK donde hay datos de otras empresas, SIN PRUEBA donde no, y pasa', async () => {
  const { admin, usuario } = baseFalsa({ empresaUsuario: 'emp-A' });
  const r = await ejecutar({ admin, usuario, empresaId: 'emp-A', tablas: CHICAS, conStorage: true });
  const v = veredictos(r);
  assert.equal(v.empresas, 'OK'); assert.equal(v.perfiles, 'OK'); assert.equal(v.polizas, 'OK');
  assert.equal(v.poliza_partidas, 'OK'); assert.equal(v.clientes, 'OK');
  assert.equal(v.cfdis, 'SIN PRUEBA'); // no hay cfdis de otra empresa: no concluye
  assert.equal(v.administradores_plataforma, 'OK');
  assert.equal(v.roles, 'OMITIDA'); assert.equal(v.nominas, 'NO EXISTE');
  assert.equal(v['storage:documentos'], 'OK');
  assert.equal(r.resumen.fuga, 0); assert.equal(r.pasa, true);
});

await ok('detecta una fuga en una tabla con empresa_id (polizas)', async () => {
  const { admin, usuario } = baseFalsa({ empresaUsuario: 'emp-A', fugas: { polizas: true } });
  const r = await ejecutar({ admin, usuario, empresaId: 'emp-A', tablas: CHICAS, conStorage: false });
  assert.equal(veredictos(r).polizas, 'FUGA');
  assert.equal(r.filas.find((f) => f.tabla === 'polizas').ve, 2);
  assert.equal(r.pasa, false);
});

await ok('detecta una fuga en una tabla hija (poliza_partidas) y en la tabla cerrada', async () => {
  const { admin, usuario } = baseFalsa({ empresaUsuario: 'emp-A', fugas: { poliza_partidas: true, administradores_plataforma: true } });
  const r = await ejecutar({ admin, usuario, empresaId: 'emp-A', tablas: CHICAS, conStorage: false });
  const v = veredictos(r);
  assert.equal(v.poliza_partidas, 'FUGA'); assert.equal(v.administradores_plataforma, 'FUGA');
  assert.equal(r.pasa, false);
});

await ok('cuenta como fuga las filas SIN empresa que el usuario puede ver', async () => {
  const { admin, usuario, db } = baseFalsa({ empresaUsuario: 'emp-A' });
  db.visible = (tabla, f) => (tabla === 'clientes' ? f.empresa_id === 'emp-A' || f.empresa_id === null : f.empresa_id === 'emp-A' || f.id === 'emp-A');
  const r = await revisarTabla({ t: 'clientes' }, { admin, usuario, empresaId: 'emp-A' });
  assert.equal(r.veredicto, 'FUGA'); assert.match(r.nota, /sin empresa_id/);
});

await ok('una tabla cerrada con "acceso denegado" es OK (no un error), con o sin cuerpo en la respuesta', async () => {
  const { admin, usuario, db } = baseFalsa({ empresaUsuario: 'emp-A' });
  db.denegadas = { administradores_plataforma: true };
  const r = await revisarTabla({ t: 'administradores_plataforma', tipo: 'cerrada' }, { admin, usuario, empresaId: 'emp-A' });
  assert.equal(r.veredicto, 'OK'); assert.match(r.nota, /denegado/); assert.equal(r.existen, 1);
});

await ok('un error de verdad en una tabla cerrada sigue siendo ERROR, y nunca se muestra "[object Object]"', async () => {
  const { admin, usuario, db } = baseFalsa({ empresaUsuario: 'emp-A' });
  const roto = { ...usuario, from: () => ({ select: () => ({ limit: async () => ({ data: null, status: 500, error: { message: '', details: '', hint: '', code: '' } }) }) }) };
  const r = await revisarTabla({ t: 'administradores_plataforma', tipo: 'cerrada' }, { admin, usuario: roto, empresaId: 'emp-A' });
  assert.equal(r.veredicto, 'ERROR'); assert.ok(!r.nota.includes('[object Object]'), r.nota);
});

await ok('detecta una fuga en Storage', async () => {
  const { admin, usuario } = baseFalsa({ empresaUsuario: 'emp-A', fugaStorage: true });
  const r = await ejecutar({ admin, usuario, empresaId: 'emp-A', tablas: [], conStorage: true });
  assert.equal(r.filas[0].veredicto, 'FUGA');
});

await ok('un error de consulta se reporta como ERROR y hace fallar la prueba (no se esconde)', async () => {
  const { admin, usuario, db } = baseFalsa({ empresaUsuario: 'emp-A' });
  db.tablas.perfiles = [{ id: 'u1' }]; // sin columna empresa_id
  const r = await ejecutar({ admin, usuario, empresaId: 'emp-A', tablas: [{ t: 'perfiles' }], conStorage: false });
  assert.equal(r.filas[0].veredicto, 'ERROR'); assert.equal(r.pasa, false);
});

await ok('la lista real de tablas incluye las del backend, las fiscales y la tabla cerrada', async () => {
  const nombres = TABLAS.map((t) => t.t);
  for (const t of ['polizas', 'poliza_partidas', 'cfdis', 'cfdis_proveedor', 'pagos_cliente', 'pagos_proveedor', 'ventas', 'nominas', 'nomina_detalle',
    'obligaciones_fiscales', 'declaraciones', 'documentos_fiscales', 'periodos_contables', 'invitaciones', 'perfiles', 'empresas', 'administradores_plataforma']) {
    assert.ok(nombres.includes(t), 'falta ' + t);
  }
});

console.log(`\nOK: ${n} pruebas pasaron.`);
