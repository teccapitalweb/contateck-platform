// ============================================================
//  CONTATECK · Backend · Rutas de Ventas y Pagos
//  OT-0014 — Épica 2: Evolución UX/UI
//    POST /api/ventas                -> registrar venta (pendiente)
//    GET  /api/ventas                -> listar (filtrado por RLS)
//    POST /api/ventas/:id/tomar      -> pendiente -> revision (manual)
//    POST /api/ventas/:id/confirmar  -> revision -> confirmado
//    POST /api/ventas/:id/rechazar   -> revision -> rechazado
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { crearVenta, listarVentas, tomarParaRevision, confirmarVenta, rechazarVenta } from '../supabaseVentas.js';

export const ventasRouter = Router();
ventasRouter.use(verifyAuth);

function requireAuth(req, res) {
  if (!req.user || !req.token) {
    res.status(401).json({ ok: false, error: 'Falta autenticación.' });
    return false;
  }
  return true;
}

ventasRouter.post('/ventas', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await crearVenta(req.token, req.user.uid, req.body || {});
  if (!r.ok) return res.status(400).json(r);
  return res.json(r);
});

ventasRouter.get('/ventas', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarVentas(req.token);
  if (!r.ok) return res.status(400).json(r);
  return res.json(r);
});

ventasRouter.post('/ventas/:id/tomar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await tomarParaRevision(req.token, req.user.uid, req.params.id);
  if (!r.ok) return res.status(400).json(r);
  return res.json(r);
});

ventasRouter.post('/ventas/:id/confirmar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await confirmarVenta(req.token, req.user.uid, req.params.id);
  if (!r.ok) return res.status(400).json(r);
  return res.json(r);
});

ventasRouter.post('/ventas/:id/rechazar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await rechazarVenta(req.token, req.user.uid, req.params.id);
  if (!r.ok) return res.status(400).json(r);
  return res.json(r);
});
