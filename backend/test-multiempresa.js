// ============================================================
//  CONTATECK · OT-0056 · Prueba del backend de multiempresa
//
//  No toca ninguna base real: levanta un Supabase FALSO en localhost (solo las
//  rutas que usan estos módulos) y le pega al backend de verdad, en memoria.
//  Comprueba: cambiar de empresa, lista de empresas, aceptar una invitación
//  estando dentro de otra empresa (y que no se acepte la de otro correo), el
//  aviso 409 de pestaña desactualizada, y que el Equipo siga viendo a quien
//  trabaja en otra empresa.
//
//  Uso:  cd backend && node test-multiempresa.js
// ============================================================
import http from 'http';
import { once } from 'events';

const U1 = '00000000-0000-0000-0000-0000000000a1';
const EA = '11111111-1111-1111-1111-111111111111';
const EB = '22222222-2222-2222-2222-222222222222';
const R_DIR = 'aaaaaaaa-0000-0000-0000-000000000001';
const INV_OK = 'bbbbbbbb-0000-0000-0000-000000000001';
const INV_AJENA = 'bbbbbbbb-0000-0000-0000-000000000002';

function jwt(sub) { return 'h.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.s'; }
const TOKEN = jwt(U1);

// ---------- Estado del Supabase falso ----------
const db = {
  perfil: { id: U1, empresa_id: EA, email: 'ana@x.mx', roles: { nombre: 'director' } },
  membresias: [{ user_id: U1, empresa_id: EA, rol_id: R_DIR, activo: true }],
  invitaciones: [
    { id: INV_OK, empresa_id: EB, rol_id: R_DIR, correo: 'ana@x.mx', estado: 'pendiente', expira_en: new Date(Date.now() + 864e5).toISOString(), empresas: { nombre: 'Empresa B' }, roles: { nombre: 'director' }, created_at: '2026-11-01' },
    { id: INV_AJENA, empresa_id: EB, rol_id: R_DIR, correo: 'otra@x.mx', estado: 'pendiente', expira_en: new Date(Date.now() + 864e5).toISOString(), empresas: { nombre: 'Empresa B' }, roles: { nombre: 'director' }, created_at: '2026-11-01' },
  ],
  rpcCalls: [],
};

function leer(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : null)); }); }
const fake = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await leer(req);
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const eq = (k) => (url.searchParams.get(k) || '').replace(/^eq\./, '');
  const unico = req.headers.accept && req.headers.accept.includes('vnd.pgrst.object');

  if (url.pathname === '/auth/v1/user') return send(200, { id: U1, email: 'ana@x.mx' });
  if (url.pathname === '/rest/v1/perfiles') return send(200, unico ? db.perfil : [db.perfil]);
  if (url.pathname === '/rest/v1/rpc/mis_empresas') {
    return send(200, db.membresias.map((m) => ({ empresa_id: m.empresa_id, nombre: m.empresa_id === EA ? 'Empresa A' : 'Empresa B', rol: 'director', activa: m.empresa_id === db.perfil.empresa_id, activo: m.activo })));
  }
  if (url.pathname === '/rest/v1/rpc/cambiar_empresa') {
    db.rpcCalls.push(body);
    const m = db.membresias.find((x) => x.empresa_id === body.p_empresa_id);
    if (!m) return send(400, { code: 'P0001', message: 'No perteneces a esa empresa.' });
    db.perfil.empresa_id = body.p_empresa_id;
    return send(200, { cambio: true, empresaId: body.p_empresa_id, empresa: 'x', rol: 'director' });
  }
  if (url.pathname === '/rest/v1/invitaciones' && req.method === 'GET') {
    const id = eq('id');
    if (id) { const i = db.invitaciones.find((x) => x.id === id); return send(200, i ? [i] : []); }
    const correo = eq('correo');
    return send(200, db.invitaciones.filter((i) => i.correo === correo && i.estado === 'pendiente'));
  }
  if (url.pathname === '/rest/v1/invitaciones' && req.method === 'PATCH') {
    const i = db.invitaciones.find((x) => x.id === eq('id')); if (i) Object.assign(i, body); return send(204, {});
  }
  if (url.pathname === '/rest/v1/usuario_empresas' && req.method === 'GET') {
    const m = db.membresias.find((x) => x.user_id === eq('user_id') && x.empresa_id === eq('empresa_id'));
    if (eq('empresa_id') && !eq('user_id')) {
      return send(200, db.membresias.filter((x) => x.empresa_id === eq('empresa_id')).map((x) => ({ user_id: x.user_id, activo: x.activo, created_at: '2026-11-01', roles: { id: R_DIR, nombre: 'director' }, perfiles: { nombre: x.user_id === U1 ? 'Ana' : 'Beto', email: 'x@x', empresa_id: x.user_id === U1 ? db.perfil.empresa_id : EB } })));
    }
    return send(200, m ? (unico ? m : [m]) : (unico ? null : []));
  }
  if (url.pathname === '/rest/v1/usuario_empresas' && req.method === 'POST') { db.membresias.push(body); return send(201, {}); }
  send(404, { message: 'no implementado en el falso: ' + req.method + ' ' + url.pathname });
});
fake.listen(0); await once(fake, 'listening');
process.env.SUPABASE_URL = 'http://127.0.0.1:' + fake.address().port;
process.env.SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.REQUIRE_AUTH = 'true'; process.env.ALLOWED_ORIGINS = '*';

// Después de fijar el entorno: el backend real
const { default: express } = await import('express');
const { default: cors } = await import('cors');
const { empresasRouter } = await import('./src/routes/empresas.js');
const { equipoRouter } = await import('./src/routes/equipo.js');
const { perfilRouter } = await import('./src/routes/perfil.js');
const app = express();
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Empresa-Id'] }));
app.use(express.json());
app.use('/api', empresasRouter); app.use('/api', equipoRouter); app.use('/api', perfilRouter);
const srv = app.listen(0); await once(srv, 'listening');
const BASE = 'http://127.0.0.1:' + srv.address().port + '/api';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fails++; };
async function api(method, path, body, extra = {}) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { status: r.status, j };
}

// 1) lista de empresas e invitaciones
let r = await api('GET', '/empresas');
ok(r.status === 200 && r.j.disponible && r.j.empresas.length === 1 && r.j.empresas[0].activa, 'GET /empresas: 1 empresa, activa');
ok(r.j.invitaciones.length === 1 && r.j.invitaciones[0].id === INV_OK && r.j.invitaciones[0].empresa === 'Empresa B', 'solo ve la invitación dirigida a SU correo');

// 2) aceptar la ajena -> rechazo; la propia -> membresía
r = await api('POST', `/empresas/invitaciones/${INV_AJENA}/aceptar`);
ok(r.status === 400 && /No encontramos/.test(r.j.error) && db.membresias.length === 1, 'invitación de otro correo: rechazada y sin membresía nueva');
r = await api('POST', '/empresas/invitaciones/no-es-uuid/aceptar');
ok(r.status === 400, 'id de invitación inválido: rechazado');
r = await api('POST', `/empresas/invitaciones/${INV_OK}/aceptar`);
ok(r.status === 200 && db.membresias.some((m) => m.empresa_id === EB) && db.invitaciones[0].estado === 'aceptada', 'invitación propia: crea la membresía y queda aceptada');
r = await api('POST', `/empresas/invitaciones/${INV_OK}/aceptar`);
ok(r.status === 400 && /ya no está vigente/.test(r.j.error), 'aceptarla otra vez: rechazado');

// 3) cambiar
r = await api('POST', '/empresas/cambiar', { empresaId: 'cc' });
ok(r.status === 400, 'cambiar con id inválido: rechazado');
r = await api('POST', '/empresas/cambiar', { empresaId: '33333333-3333-3333-3333-333333333333' });
ok(r.status === 400 && r.j.error === 'No perteneces a esa empresa.' && db.perfil.empresa_id === EA, 'cambiar a empresa ajena: mensaje de la base, nada cambia');
r = await api('POST', '/empresas/cambiar', { empresaId: EB });
ok(r.status === 200 && r.j.cambio === true && db.perfil.empresa_id === EB, 'cambiar a B: ok');

// 4) pestaña desactualizada (X-Empresa-Id viejo)
r = await api('GET', '/empresas', null, { 'X-Empresa-Id': EA });
ok(r.status === 409 && r.j.codigo === 'EMPRESA_CAMBIO', 'cabecera con la empresa vieja: 409 EMPRESA_CAMBIO');
r = await api('GET', '/empresas', null, { 'X-Empresa-Id': EB.toUpperCase() });
ok(r.status === 200, 'cabecera con la empresa actual (aun en mayúsculas): 200');
r = await api('GET', '/empresas');
ok(r.status === 200, 'sin cabecera (cliente viejo): 200');

// 5) perfil avisa que el backend entiende la cabecera
r = await api('GET', '/perfil');
ok(r.status === 200 && (r.j.multiempresa === true || r.j.fuente === 'local'), '/perfil responde (multiempresa:true cuando hay datos de Postgres)');

// 6) preflight de CORS acepta la cabecera nueva
const pre = await fetch(BASE + '/empresas', { method: 'OPTIONS', headers: { Origin: 'http://x', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-empresa-id' } });
ok(/x-empresa-id/i.test(pre.headers.get('access-control-allow-headers') || ''), 'CORS permite la cabecera X-Empresa-Id');

// 7) Equipo: quien trabaja en otra empresa sigue en la lista
db.perfil.empresa_id = EA;
db.membresias.push({ user_id: '00000000-0000-0000-0000-0000000000a2', empresa_id: EA, rol_id: R_DIR, activo: true });
const rEq = await api('GET', '/equipo');
const beto = rEq.j && rEq.j.equipo && rEq.j.equipo.find((m) => m.id === '00000000-0000-0000-0000-0000000000a2');
ok(rEq.status === 200 && rEq.j.equipo.length === 2 && beto && beto.enOtraEmpresa === true && rEq.j.equipo.find((m) => m.id === U1).enOtraEmpresa === false, 'GET /equipo: lista a quien trabaja en otra empresa (enOtraEmpresa) y no a mí');

srv.close(); fake.close();
console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
process.exit(fails ? 1 : 0);
