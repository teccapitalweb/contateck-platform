// ============================================================
//  CONTATECK · Backend · Rutas de Equipo
//    GET /api/equipo
//    PUT /api/equipo/:id/estado    { activo: true|false }
//    PUT /api/equipo/:id/rol       { rolId }
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { listarEquipo, cambiarEstadoMiembro, cambiarRolMiembro } from '../supabaseEquipo.js';

export const equipoRouter = Router();
equipoRouter.use(verifyAuth);

function requireAuth(req, res) {
  if (!req.user || !req.token) { res.status(401).json({ ok: false, error: 'Falta autenticación.' }); return false; }
  return true;
}

equipoRouter.get('/equipo', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarEquipo(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});

equipoRouter.put('/equipo/:id/estado', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await cambiarEstadoMiembro(req.token, req.params.id, (req.body || {}).activo);
  res.status(r.ok ? 200 : 400).json(r);
});

equipoRouter.put('/equipo/:id/rol', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await cambiarRolMiembro(req.token, req.params.id, (req.body || {}).rolId);
  res.status(r.ok ? 200 : 400).json(r);
});
