// ============================================================
//  CONTATECK · OT-0069 · Ruta GET /api/nominas/detalle/:id/pdf: permisos y casos sin CFDI
//  Backend real en memoria + Supabase FALSO en localhost. No llega al PAC (el camino feliz, con el PAC de pruebas
//  real, se comprobó en el panel: 200, application/pdf, "%PDF-").
//  Uso:  cd backend && node test-nomina-pdf-ruta.js
// ============================================================
import http from 'http';
import { once } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const jwt = (sub) => 'h.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.s';
const TOKEN = jwt('u-dir');
const SIN_CFDI = '11111111-1111-4111-8111-111111111111';
const AJENO = '22222222-2222-4222-8222-222222222222';

const fake = http.createServer((req, res) => {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://x');
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  if (url.pathname === '/auth/v1/user') return tok === TOKEN ? send(200, { id: 'u-dir', email: 'x@x.mx' }) : send(401, { msg: 'no' });
  if (url.pathname === '/rest/v1/nomina_detalle') {
    const id = (url.searchParams.get('id') || '').replace('eq.', '');
    if (id === SIN_CFDI) return send(200, { cfdi_uuid: null, cfdi_fiscalapi_id: null, nombre: 'Sin timbrar' });
    return send(200, null); // otra empresa (RLS) o inexistente
  }
  send(404, {});
});
fake.listen(0); await once(fake, 'listening');
process.env.SUPABASE_URL = 'http://127.0.0.1:' + fake.address().port;
process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_ROLE_KEY = 's'; process.env.REQUIRE_AUTH = 'true';

const { default: express } = await import('express');
const { nominasRouter } = await import('./src/routes/nominas.js');
const app = express(); app.use(express.json()); app.use('/api', nominasRouter);
const srv = app.listen(0); await once(srv, 'listening');
const BASE = 'http://127.0.0.1:' + srv.address().port + '/api';

let fallas = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const pedir = async (ruta, token) => {
  const r = await fetch(BASE + ruta, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { status: r.status, j };
};

let r = await pedir(`/nominas/detalle/${SIN_CFDI}/pdf`);
ok(r.status === 401, 'sin sesión: 401');
r = await pedir('/nominas/detalle/no-es-uuid/pdf', TOKEN);
ok(r.status === 400, 'identificador inválido: 400');
r = await pedir(`/nominas/detalle/${SIN_CFDI}/pdf`, TOKEN);
ok(r.status === 404 && /no tiene CFDI de nómina timbrado/.test(r.j.error), 'un recibo sin timbrar no genera PDF: 404 con el motivo');
r = await pedir(`/nominas/detalle/${AJENO}/pdf`, TOKEN);
ok(r.status === 404, 'un recibo de otra empresa (la base no lo devuelve) o inexistente: 404, sin tocar al PAC');

const codigo = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'nomina.js'), 'utf8');
ok(codigo.includes('data-nom-pdf') && codigo.includes('/pdf"') && codigo.includes('descargarPdfNomina'), 'la pantalla tiene el botón PDF junto al XML y lo conecta con la ruta');

srv.closeAllConnections(); fake.closeAllConnections(); srv.close(); fake.close();
console.log(fallas ? `\n${fallas} FALLA(S)` : `\nTODO OK · ${n} pruebas`);
process.exitCode = fallas ? 1 : 0;
