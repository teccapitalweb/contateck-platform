// ============================================================
//  CONTATECK · OT-0070 · Editar y cancelar un pago PENDIENTE: reglas del backend (rutas reales + Supabase FALSO en localhost)
//  Las reglas de la base (SECURITY DEFINER, fila bloqueada) se prueban aparte con PGlite: database/OT-0070-prueba-sql-pglite.mjs
//  Uso:  cd backend && node test-ventas-editar-cancelar.js
// ============================================================
import http from 'http';
import { once } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const jwt = (sub) => 'h.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.s';
const ROL = { 'u-ven': 'vendedor', 'u-otro': 'vendedor', 'u-con': 'contador', 'u-dir': 'director', 'u-rh': 'rrhh' };
const T = Object.fromEntries(Object.keys(ROL).map((u) => [u, jwt(u)]));
const EMP = '99999999-9999-4999-8999-999999999999';
const hoy = new Date().toISOString().slice(0, 10);

const VENTAS = {
  PROPIA: { id: 'PROPIA', empresa_id: EMP, folio: 'P-0001', estado: 'pendiente', created_by: 'u-ven' },
  AJENA: { id: 'AJENA', empresa_id: EMP, folio: 'P-0002', estado: 'pendiente', created_by: 'u-otro' },
  REVISION: { id: 'REVISION', empresa_id: EMP, folio: 'P-0003', estado: 'revision', created_by: 'u-ven' },
  CONFIRMADA: { id: 'CONFIRMADA', empresa_id: EMP, folio: 'P-0004', estado: 'confirmado', created_by: 'u-ven' },
  DEL_DIR: { id: 'DEL_DIR', empresa_id: EMP, folio: 'P-0005', estado: 'pendiente', created_by: 'u-dir' },
};
let rpcLlamadas = [];
let sinSql = false;

const fake = http.createServer((req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://x');
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const uid = Object.keys(T).find((u) => T[u] === tok);
  if (url.pathname === '/auth/v1/user') return uid ? send(200, { id: uid, email: uid + '@x.mx' }) : send(401, { msg: 'no' });
  if (url.pathname === '/rest/v1/perfiles') {
    if ((url.searchParams.get('select') || '').includes('roles')) return send(200, { roles: { nombre: ROL[uid] } });
    return send(200, { empresa_id: EMP });
  }
  if (url.pathname === '/rest/v1/ventas') {
    const id = (url.searchParams.get('id') || '').replace('eq.', '');
    return send(200, VENTAS[id] || null);
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const nombre = url.pathname.split('/').pop();
      const j = JSON.parse(body || '{}');
      rpcLlamadas.push({ nombre, j });
      if (sinSql) return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + nombre + ' in the schema cache' });
      send(200, { ...VENTAS[j.p_id], ...(nombre === 'cancelar_venta_pendiente' ? { estado: 'cancelado', motivo_rechazo: j.p_motivo } : (j.p_datos || {})) });
    });
    return;
  }
  send(404, {});
});
fake.listen(0); await once(fake, 'listening');
process.env.SUPABASE_URL = 'http://127.0.0.1:' + fake.address().port;
process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_ROLE_KEY = 's'; process.env.REQUIRE_AUTH = 'true';

const { default: express } = await import('express');
const { ventasRouter } = await import('./src/routes/ventas.js');
const app = express(); app.use(express.json()); app.use('/api', ventasRouter);
const srv = app.listen(0); await once(srv, 'listening');
const BASE = 'http://127.0.0.1:' + srv.address().port + '/api';

let fallas = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const llamar = async (metodo, ruta, quien, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(quien ? { Authorization: 'Bearer ' + T[quien] } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { status: r.status, j };
};
const buenos = { cliente: ' Cliente Corregido ', concepto: 'Servicio', importe: '1160.5', fechaPago: hoy, metodoPago: 'Transferencia', referencia: 'R-1', banco: 'BBVA', notas: '', incluyeIva: true };
const antes = () => rpcLlamadas.length;

console.log('Editar');
let r = await llamar('PUT', '/ventas/PROPIA', null, buenos);
ok(r.status === 401, 'sin sesión: 401');

let a = antes();
r = await llamar('PUT', '/ventas/PROPIA', 'u-ven', buenos);
ok(r.status === 200 && r.j.ok && rpcLlamadas.length === a + 1 && rpcLlamadas[a].nombre === 'editar_venta_pendiente', 'quien registró el pago lo corrige: pasa por la función de la base');
const enviado = rpcLlamadas[a].j.p_datos;
ok(enviado.cliente === 'Cliente Corregido' && enviado.importe === 1160.5 && enviado.notas === null && enviado.fechaPago === hoy, 'los datos llegan limpios (sin espacios, importe numérico, vacío → null)');
ok(!('comprobantePath' in enviado) && !('folio' in enviado) && !('estado' in enviado), 'no se puede cambiar comprobante, folio ni estado desde la edición');

a = antes();
r = await llamar('PUT', '/ventas/AJENA', 'u-ven', buenos);
ok(r.status === 400 && /Solo quien registró/.test(r.j.error) && rpcLlamadas.length === a, 'el pago de OTRA persona no se edita (ni siquiera llega a la base)');
r = await llamar('PUT', '/ventas/AJENA', 'u-dir', buenos);
ok(r.status === 400 && /Solo quien registró/.test(r.j.error), 'ni siquiera un director edita el pago ajeno (puede cancelarlo, no reescribirlo)');
r = await llamar('PUT', '/ventas/DEL_DIR', 'u-dir', buenos);
ok(r.status === 200, 'un director sí corrige un pago que él mismo registró');
r = await llamar('PUT', '/ventas/REVISION', 'u-ven', buenos);
ok(r.status === 400 && /ya no está pendiente \(estado: revision\)/.test(r.j.error), 'un pago en revisión ya no se edita');
r = await llamar('PUT', '/ventas/CONFIRMADA', 'u-ven', buenos);
ok(r.status === 400 && /confirmado/.test(r.j.error), 'un pago confirmado tampoco');
r = await llamar('PUT', '/ventas/NOEXISTE', 'u-ven', buenos);
ok(r.status === 400 && /no encontrado/i.test(r.j.error), 'un pago inexistente (o de otra empresa, por RLS): no encontrado');
r = await llamar('PUT', '/ventas/PROPIA', 'u-rh', buenos);
ok(r.status === 400 && /rol no permite/.test(r.j.error), 'un rol sin acceso a ventas (RH) no edita');

a = antes();
for (const [campo, valor, texto] of [['cliente', '  ', /cliente/], ['concepto', '', /concepto/], ['importe', '0', /importe/], ['importe', '-5', /importe/], ['importe', 'abc', /importe/], ['fechaPago', '2999-01-01', /fecha/], ['fechaPago', '2026-02-31', /fecha/], ['cliente', 'x'.repeat(151), /150/]]) {
  r = await llamar('PUT', '/ventas/PROPIA', 'u-ven', { ...buenos, [campo]: valor });
  ok(r.status === 400 && texto.test(r.j.error), `se rechaza ${campo} = "${String(valor).slice(0, 12)}"`);
}
ok(rpcLlamadas.length === a, 'ninguno de esos intentos llegó a la base');

sinSql = true;
r = await llamar('PUT', '/ventas/PROPIA', 'u-ven', buenos);
ok(r.status === 400 && /Falta aplicar el SQL OT-0070/.test(r.j.error), 'si el SQL aún no se aplicó, el mensaje lo dice claro (no un error críptico)');
sinSql = false;

console.log('Cancelar');
r = await llamar('POST', '/ventas/PROPIA/cancelar', null, { motivo: 'Me equivoqué de cliente' });
ok(r.status === 401, 'sin sesión: 401');
a = antes();
r = await llamar('POST', '/ventas/PROPIA/cancelar', 'u-ven', { motivo: '  Me equivoqué de cliente ' });
ok(r.status === 200 && r.j.venta.estado === 'cancelado' && rpcLlamadas[a].nombre === 'cancelar_venta_pendiente' && rpcLlamadas[a].j.p_motivo === 'Me equivoqué de cliente', 'quien lo registró lo cancela con motivo (sin espacios sobrantes)');
r = await llamar('POST', '/ventas/AJENA/cancelar', 'u-dir', { motivo: 'Duplicado del P-0001' });
ok(r.status === 200, 'un director cancela el pago pendiente de otra persona');
r = await llamar('POST', '/ventas/AJENA/cancelar', 'u-con', { motivo: 'Duplicado del P-0001' });
ok(r.status === 400 && /Solo quien registró el pago, o un Admin\/Director/.test(r.j.error), 'un contador a secas no cancela el pago ajeno');
r = await llamar('POST', '/ventas/AJENA/cancelar', 'u-ven', { motivo: 'Duplicado' });
ok(r.status === 400 && /Solo quien registró/.test(r.j.error), 'un vendedor tampoco cancela el de alguien más');
a = antes();
for (const motivo of [undefined, '', '  ', 'ab', 'x'.repeat(501)]) {
  r = await llamar('POST', '/ventas/PROPIA/cancelar', 'u-ven', motivo === undefined ? {} : { motivo });
  ok(r.status === 400 && /motivo/i.test(r.j.error), 'sin motivo válido no se cancela: ' + JSON.stringify(motivo === undefined ? motivo : motivo.slice(0, 6)));
}
ok(rpcLlamadas.length === a, 'sin llegar a la base');
r = await llamar('POST', '/ventas/REVISION/cancelar', 'u-ven', { motivo: 'Ya no va' });
ok(r.status === 400 && /ya no está pendiente \(estado: revision\)/.test(r.j.error), 'un pago en revisión no se cancela (se rechaza con motivo)');
r = await llamar('POST', '/ventas/CONFIRMADA/cancelar', 'u-dir', { motivo: 'Ya no va' });
ok(r.status === 400 && /confirmado/.test(r.j.error), 'un pago confirmado nunca se cancela por aquí: tiene póliza');
r = await llamar('POST', '/ventas/PROPIA/cancelar', 'u-rh', { motivo: 'Ya no va' });
ok(r.status === 400 && /rol no permite/.test(r.j.error), 'RH no cancela');
sinSql = true;
r = await llamar('POST', '/ventas/PROPIA/cancelar', 'u-ven', { motivo: 'Ya no va' });
ok(r.status === 400 && /Falta aplicar el SQL OT-0070/.test(r.j.error), 'cancelar sin el SQL aplicado: mensaje claro');
sinSql = false;

console.log('Código del panel y SQL');
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = fs.readFileSync(path.join(raiz, 'frontend', 'ventas.js'), 'utf8');
ok(ui.includes('cancelado') && ui.includes('data-v-editar') && ui.includes('data-v-cancelar') && ui.includes('accionVenta("cancelar"') && ui.includes('method: "PUT"'), 'la pantalla de Ventas tiene los botones Editar y Cancelar y el estado Cancelado');
const sql = fs.readFileSync(path.join(raiz, 'database', 'OT-0070-editar-cancelar-venta.sql'), 'utf8');
ok(/security definer/i.test(sql) && /for update/i.test(sql) && /revoke execute[^;]*from public, anon/i.test(sql) && /grant\s+execute[^;]*to authenticated/i.test(sql), 'el SQL usa SECURITY DEFINER, bloquea la fila y solo permite ejecutar a usuarios con sesión');

srv.closeAllConnections(); fake.closeAllConnections(); srv.close(); fake.close();
console.log(fallas ? `\n${fallas} FALLA(S)` : `\nTODO OK · ${n} pruebas`);
process.exitCode = fallas ? 1 : 0;
