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
//    PUT  /api/fiscal/declaraciones/:id/datos  (corregir periodo y fecha límite; admin/director)
//    DELETE /api/fiscal/declaraciones/:id      (eliminar pendiente sin acuse; admin/director)
//    GET  /api/fiscal/proveedores-diot     (RFC y nombre por UUID, para la DIOT)
//    PUT  /api/fiscal/codigos-agrupador    (lote: { cuentas: [{ id, codigoAgrupador }] })
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { CODIGOS_AGRUPADOR_SAT } from '../catalogoCodigoAgrupador.js';
import {
  listarObligaciones, crearObligacion, actualizarObligacion,
  listarDeclaraciones, crearDeclaracion, actualizarDeclaracion,
  listarDocumentosFiscales, crearDocumentoFiscal,
  obtenerCalendario, listarProveedoresDiot, guardarCodigosAgrupador, corregirDeclaracion, eliminarDeclaracion,
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

fiscalRouter.get('/fiscal/proveedores-diot', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarProveedoresDiot(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});

// Catálogo oficial de Códigos Agrupadores del SAT (dato público y fijo): el panel lo usa para
// avisar, antes de guardar, qué códigos de la hoja no existen.
fiscalRouter.get('/fiscal/codigos-agrupador/catalogo', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json({ ok: true, codigos: CODIGOS_AGRUPADOR_SAT });
});

fiscalRouter.put('/fiscal/codigos-agrupador', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await guardarCodigosAgrupador(req.token, (req.body || {}).cuentas);
  res.status(r.ok ? 200 : 400).json(r);
});

fiscalRouter.put('/fiscal/declaraciones/:id/datos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await corregirDeclaracion(req.token, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

fiscalRouter.delete('/fiscal/declaraciones/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await eliminarDeclaracion(req.token, req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
