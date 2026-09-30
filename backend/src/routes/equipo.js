// ============================================================
//  CONTATECK · Backend · Rutas de Equipo
//    GET /api/equipo                -> lista completa (solo RH/admin/director)
//    GET /api/equipo/nombres        -> solo id+nombre (cualquier usuario)
//    PUT /api/equipo/:id/estado     { activo: true|false }
//    PUT /api/equipo/:id/rol        { rolId }
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { listarEquipo, listarNombresEquipo, cambiarEstadoMiembro, cambiarRolMiembro } from '../supabaseEquipo.js';
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
// OT-mejoras-ventas: ruta ligera, sin el candado de rol de arriba —
// solo id+nombre, para que cualquier usuario pueda ver nombres reales
// (ej. "quién registró este pago" en Ventas y Pagos) sin necesitar
// permisos de gestión de equipo.
equipoRouter.get('/equipo/nombres', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarNombresEquipo(req.token);
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
