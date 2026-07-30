// ============================================================
//  CONTATECK · Backend · Ruta /api/dashboard
//  OT-0013A — Épica 2: Evolución UX/UI
//  Devuelve agregados reales (facturación, pólizas, nómina) del
//  usuario logueado, desde Postgres. Misma vista para todos los
//  roles en esta primera fase (ver OT-0013B para personalización).
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerDashboard } from '../supabaseDashboard.js';

export const dashboardRouter = Router();
dashboardRouter.use(verifyAuth);

dashboardRouter.get('/dashboard', async (req, res) => {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const r = await obtenerDashboard(req.token);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  return res.json(r);
});
