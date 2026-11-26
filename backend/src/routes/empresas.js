// ============================================================
//  CONTATECK · Backend · Rutas de multiempresa (OT-0056)
//    GET  /api/empresas                          -> mis empresas + invitaciones a otras empresas
//    POST /api/empresas/cambiar                  { empresaId }
//    POST /api/empresas/invitaciones/:id/aceptar -> unirme a otra empresa con una invitación a mi correo
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { listarMisEmpresas, cambiarEmpresa, aceptarInvitacionComoMiembro, olvidarEmpresaActual } from '../supabaseEmpresas.js';

export const empresasRouter = Router();
empresasRouter.use(verifyAuth);

function requireAuth(req, res) {
  if (!req.user || !req.token) { res.status(401).json({ ok: false, error: 'Falta autenticación.' }); return false; }
  return true;
}

empresasRouter.get('/empresas', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarMisEmpresas(req.token, req.user.uid, req.user.email);
  res.status(r.ok ? 200 : 500).json(r);
});

empresasRouter.post('/empresas/cambiar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await cambiarEmpresa(req.token, req.user.uid, (req.body || {}).empresaId);
  res.status(r.ok ? 200 : 400).json(r);
});

empresasRouter.post('/empresas/invitaciones/:id/aceptar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await aceptarInvitacionComoMiembro(req.user.uid, req.user.email, req.params.id);
  if (r.ok) olvidarEmpresaActual(req.user.uid);
  res.status(r.ok ? 200 : 400).json(r);
});
