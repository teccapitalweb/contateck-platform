// ============================================================
//  CONTATECK · Backend · Rutas SAT y Fiscal (Parte A)
//    GET  /api/fiscal/obligaciones
//    POST /api/fiscal/obligaciones
//    PUT  /api/fiscal/obligaciones/:id
//    GET  /api/fiscal/declaraciones
//    POST /api/fiscal/declaraciones
//    PUT  /api/fiscal/declaraciones/:id
//    GET  /api/fiscal/documentos
//    POST /api/fiscal/documentos
//    GET  /api/fiscal/calendario
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import {
  listarObligaciones, crearObligacion, actualizarObligacion,
  listarDeclaraciones, crearDeclaracion, actualizarDeclaracion,
  listarDocumentosFiscales, crearDocumentoFiscal,
  obtenerCalendario,
} from '../supabaseFiscal.js';

export const fiscalRouter = Router();
fiscalRouter.use(verifyAuth);

function requireAuth(req, res) {
  if (!req.user || !req.token) { res.status(401).json({ ok: false, error: 'Falta autenticación.' }); return false; }
  return true;
}

fiscalRouter.get('/fiscal/obligaciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarObligaciones(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});
fiscalRouter.post('/fiscal/obligaciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await crearObligacion(req.token, req.user.uid, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});
fiscalRouter.put('/fiscal/obligaciones/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await actualizarObligacion(req.token, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

fiscalRouter.get('/fiscal/declaraciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarDeclaraciones(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});
fiscalRouter.post('/fiscal/declaraciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await crearDeclaracion(req.token, req.user.uid, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});
fiscalRouter.put('/fiscal/declaraciones/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await actualizarDeclaracion(req.token, req.user.uid, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

fiscalRouter.get('/fiscal/documentos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarDocumentosFiscales(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});
fiscalRouter.post('/fiscal/documentos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await crearDocumentoFiscal(req.token, req.user.uid, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

fiscalRouter.get('/fiscal/calendario', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await obtenerCalendario(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});
