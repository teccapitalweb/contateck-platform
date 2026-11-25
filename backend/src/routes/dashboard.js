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
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { obtenerIndicadoresFiscales } from '../indicadoresFiscales.js';
import { ROLES_IA } from '../iaContable.js';

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

// OT-0061: indicadores fiscales de referencia (IVA del mes e ISR estimado). Solo roles de contabilidad: para rh y vendedor,
// las pólizas no son visibles y mostrarían ceros engañosos.
dashboardRouter.get('/indicadores-fiscales', async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const rol = await obtenerRolUsuario(req.token);
  if (!ROLES_IA.includes(rol)) return res.json({ ok: true, restringido: true });
  const r = await obtenerIndicadoresFiscales(req.token);
  return res.status(r.ok ? 200 : 400).json(r);
});
