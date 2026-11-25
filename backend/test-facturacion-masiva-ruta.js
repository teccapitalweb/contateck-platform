// ============================================================
//  CONTATECK · OT-0061 · Prueba de la RUTA POST /api/facturar-masivo/validar
//  Backend real en memoria contra un Supabase FALSO en localhost (sin red, sin PAC, sin timbres).
//  Uso:  cd backend && node test-facturacion-masiva-ruta.js
// ============================================================
import http from 'http';
import { once } from 'events';

const roles = { 'tok-contador': 'contador', 'tok-vendedor': 'vendedor' };
const jwt = (sub) => 'h.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.s';
const TOKENS = { contador: jwt('u-contador'), vendedor: jwt('u-vendedor') };
const rolDe = { [TOKENS.contador]: 'contador', [TOKENS.vendedor]: 'vendedor' };

const fake = http.createServer((req, res) => {
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/auth/v1/user') return rolDe[tok] ? send(200, { id: tok.slice(0, 8), email: 'x@x.mx' }) : send(401, { msg: 'no' });
  if (url.pathname === '/rest/v1/perfiles') return send(200, { roles: { nombre: rolDe[tok] } });
  send(404, {});
});
fake.listen(0); await once(fake, 'listening');
process.env.SUPABASE_URL = 'http://127.0.0.1:' + fake.address().port;
process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_ROLE_KEY = 's'; process.env.REQUIRE_AUTH = 'true';

const { default: express } = await import('express');
const { invoicesRouter } = await import('./src/routes/invoices.js');
const app = express(); app.use(express.json()); app.use('/api', invoicesRouter);
const srv = app.listen(0); await once(srv, 'listening');
const BASE = 'http://127.0.0.1:' + srv.address().port + '/api';

let fallas = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const post = async (cuerpo, token) => {
  const r = await fetch(BASE + '/facturar-masivo/validar', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(cuerpo) });
  return { status: r.status, j: await r.json() };
};
const fac = (extra = {}) => ({ receptor: { rfc: 'EKU9003173C9', nombre: 'ESCUELA', usoCfdi: 'G03', cp: '42501', regimen: '601' }, conceptos: [{ descripcion: 'Servicio', cantidad: 2, precioUnitario: 50 }], tasaIva: '16', metodoPago: 'PUE', formaPago: '03', ...extra });

let r = await post({ facturas: [fac()] });
ok(r.status === 401, 'sin sesión: 401');
r = await post({ facturas: [fac()] }, TOKENS.vendedor);
ok(r.status === 403, 'un vendedor no puede (mismo rol que para timbrar): 403');
r = await post({ facturas: [fac(), fac({ metodoPago: 'ZZ' })] }, TOKENS.contador);
ok(r.status === 200 && r.j.ok && r.j.resultados.length === 2 && r.j.resultados[0].ok && !r.j.resultados[1].ok, 'contador: revisa y devuelve un resultado por factura');
ok(r.j.resumen.validas === 1 && r.j.resumen.conError === 1 && r.j.resumen.importe === 116, 'resumen con totales (100 + 16% = 116)');
r = await post({ facturas: Array.from({ length: 51 }, () => fac()) }, TOKENS.contador);
ok(r.status === 400 && /Máximo 50/.test(r.j.error), 'más de 50 facturas: 400');
r = await post({}, TOKENS.contador);
ok(r.status === 400, 'sin facturas: 400');

srv.close(); fake.close();
console.log(fallas ? `\n${fallas} FALLA(S)` : `\nTODO OK · ${n} pruebas`);
process.exit(fallas ? 1 : 0);
