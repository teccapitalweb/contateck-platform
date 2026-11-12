// ============================================================
//  CONTATECK · OT-0038 · Prueba de la LÓGICA de test-endurecimiento-seguridad.js (sin red ni base)
//  Usa una base falsa en memoria, con la protección encendida y apagada. Lo importante es que:
//    - con la base protegida todo sale OK y el perfil queda intacto;
//    - con la base SIN proteger la prueba detecta cada hueco (FALLA) y RESTAURA el perfil que sí se cambió.
//  Uso: node test-endurecimiento-logica.js
// ============================================================
import assert from 'node:assert/strict';
import { ejecutar } from './test-endurecimiento-seguridad.js';

const UID = 'u1', EMP_A = 'emp-A', EMP_B = 'emp-B';

class Q {
  constructor(manejador, tabla) { this.m = manejador; this.tabla = tabla; this.op = 'select'; this.filtros = {}; this.cols = '*'; this.payload = null; this.devuelve = false; }
  select(cols) { if (this.op === 'select') this.cols = cols || '*'; else this.devuelve = true; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtros[c] = v; return this; }
  neq(c, v) { this.filtros['!' + c] = v; return this; }
  limit() { this.limite = 1; return this; }
  maybeSingle() { this.uno = true; return this; }
  then(ok, ko) { return Promise.resolve(this.m(this)).then(ok, ko); }
}

function baseFalsa({ protegida }) {
  const estado = { perfil: { id: UID, empresa_id: EMP_A, rol_id: 'r-vend', activo: true }, restauraciones: 0 };
  const roles = [{ id: 'r-dir', nombre: 'director' }, { id: 'r-vend', nombre: 'vendedor' }];
  const denegadoCsd = { code: '42501', message: 'permission denied for table empresas' };
  const manejadorUsuario = (q) => {
    if (q.tabla === 'empresas') {
      if (q.cols.includes('csd_password')) return protegida ? { data: null, error: denegadoCsd } : { data: [{ csd_password: 'x' }], error: null };
      return { data: [{ id: EMP_A, nombre: 'A' }], error: null };
    }
    if (q.tabla === 'perfiles' && q.op === 'update') {
      if (protegida) return { data: null, error: { code: 'P0001', message: 'No puedes cambiar tu propio rol ni tu estado' } };
      // Base sin proteger. Con RETURNING (.select) PostgREST exige que la fila nueva siga visible: al pasarse a otra
      // empresa deja de serlo y el cambio se rechaza; SIN RETURNING sí se aplica (como lo haría quien ataca).
      if (q.devuelve && q.payload.empresa_id) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "perfiles"' } };
      Object.assign(estado.perfil, q.payload);
      return { data: q.devuelve ? [{ id: UID }] : null, error: null };
    }
    return { data: null, error: null };
  };
  const manejadorAdmin = (q) => {
    if (q.tabla === 'perfiles' && q.op === 'select') return { data: { ...estado.perfil }, error: null };
    if (q.tabla === 'perfiles' && q.op === 'update') { Object.assign(estado.perfil, q.payload); estado.restauraciones++; return { data: null, error: null }; }
    if (q.tabla === 'roles') return { data: roles, error: null };
    if (q.tabla === 'empresas') return { data: [{ id: EMP_B }], error: null };
    if (q.tabla === 'folios_contador') return { data: null, error: null };
    return { data: null, error: null };
  };
  const rpcUsuario = async (nombre, args) => {
    if (nombre === 'periodo_esta_cerrado' && args.p_empresa_id === EMP_A) return { data: false, error: null };
    if (protegida) return { data: null, error: { code: 'P0001', message: 'Empresa no válida.' } };
    return { data: null, error: { code: '23503', message: 'violates foreign key constraint' } }; // sin proteger: llega a la tabla y falla por otra cosa
  };
  const rpcAnon = async () => (protegida
    ? { data: null, error: { code: '42501', message: 'permission denied for function confirmar_pago_cliente' } }
    : { data: null, error: { code: 'P0001', message: 'Pago no encontrado o no pertenece a tu empresa.' } });
  return {
    estado,
    admin: { from: (t) => new Q(manejadorAdmin, t) },
    usuario: { from: (t) => new Q(manejadorUsuario, t), rpc: rpcUsuario },
    anon: { rpc: rpcAnon },
  };
}

let n = 0; const ok = async (nombre, fn) => { await fn(); n++; console.log('  ✔ ' + nombre); };
console.log('\nLógica de test-endurecimiento-seguridad.js');

await ok('con la base protegida: todo OK y el perfil queda intacto', async () => {
  const { admin, usuario, anon, estado } = baseFalsa({ protegida: true });
  const r = await ejecutar({ admin, usuario, anon, uid: UID });
  assert.equal(r.pasa, true, JSON.stringify(r.filas.filter((f) => f.veredicto !== 'OK')));
  assert.equal(r.filas.length, 12); // 1a 1b · 2a 2b 2c · 3a 3b 3e 3c 3d · 4a · 5
  assert.deepEqual({ ...estado.perfil }, { id: UID, empresa_id: EMP_A, rol_id: 'r-vend', activo: true });
  assert.equal(estado.restauraciones, 0);
});

await ok('con la base SIN proteger: detecta cada hueco y restaura el perfil que se cambió', async () => {
  const { admin, usuario, anon, estado } = baseFalsa({ protegida: false });
  const r = await ejecutar({ admin, usuario, anon, uid: UID });
  const falla = (id) => r.filas.find((f) => f.id === id).veredicto === 'FALLA';
  for (const id of ['1a', '2a', '2b', '2c', '3a', '3b', '3e', '3c', '4a']) assert.equal(falla(id), true, 'debía fallar ' + id);
  for (const id of ['1b', '3d', '5']) assert.equal(falla(id), false, 'no debía fallar ' + id);
  assert.equal(r.pasa, false);
  assert.deepEqual({ ...estado.perfil }, { id: UID, empresa_id: EMP_A, rol_id: 'r-vend', activo: true }, 'el perfil NO quedó restaurado');
  assert.equal(estado.restauraciones, 3); // un cambio por cada intento que sí se aplicó (rol, empresa y estado)
  assert.match(r.filas.find((f) => f.id === '2b').nota, /restauró/, 'el pase a otra empresa debe contarse como aplicado');
  assert.match(r.filas.find((f) => f.id === '2a').nota, /restauró/);
});

await ok('si no existe otra empresa o rol para intentar, lo reporta como FALLA y no inventa un OK', async () => {
  const { admin, usuario, anon } = baseFalsa({ protegida: true });
  const base = admin.from;
  admin.from = (t) => { const q = base(t); if (t === 'empresas') { const o = q.then.bind(q); q.then = (a, b) => Promise.resolve({ data: [], error: null }).then(a, b); } return q; };
  const r = await ejecutar({ admin, usuario, anon, uid: UID });
  const f = r.filas.find((x) => x.id === '2b');
  assert.equal(f.veredicto, 'FALLA'); assert.match(f.nota, /no hay otra empresa/);
});

console.log(`\nOK: ${n} pruebas pasaron.`);
