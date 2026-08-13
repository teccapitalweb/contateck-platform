// ============================================================
//  CONTATECK · Backend · Rutas de Onboarding (Fase 1)
//    GET  /api/onboarding/estado
//    POST /api/onboarding/crear-empresa
//    POST /api/onboarding/aceptar-invitacion
//    GET  /api/onboarding/invitaciones
//    POST /api/onboarding/invitaciones
//    PUT  /api/onboarding/invitaciones/:id/cancelar
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import {
  verificarEstadoOnboarding, crearEmpresaYDirector, aceptarInvitacionPendiente,
  listarInvitaciones, crearInvitacion, cancelarInvitacion, reenviarInvitacion,
} from '../supabaseOnboarding.js';

export const onboardingRouter = Router();
onboardingRouter.use(verifyAuth);

function requireAuth(req, res) {
  if (!req.user || !req.token) { res.status(401).json({ ok: false, error: 'Falta autenticación.' }); return false; }
  return true;
}

onboardingRouter.get('/onboarding/estado', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await verificarEstadoOnboarding(req.token, req.user.email);
  res.status(r.ok ? 200 : 400).json(r);
});

onboardingRouter.post('/onboarding/crear-empresa', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { nombreEmpresa, nombrePersona } = req.body || {};
  const r = await crearEmpresaYDirector(req.token, req.user.email, nombreEmpresa, nombrePersona);
  res.status(r.ok ? 200 : 400).json(r);
});

onboardingRouter.post('/onboarding/aceptar-invitacion', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await aceptarInvitacionPendiente(req.token, req.user.email);
  res.status(r.ok ? 200 : 400).json(r);
});

onboardingRouter.get('/onboarding/invitaciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await listarInvitaciones(req.token);
  res.status(r.ok ? 200 : 403).json(r);
});

onboardingRouter.post('/onboarding/invitaciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await crearInvitacion(req.token, req.user.uid, req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

onboardingRouter.put('/onboarding/invitaciones/:id/cancelar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await cancelarInvitacion(req.token, req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});

onboardingRouter.put('/onboarding/invitaciones/:id/reenviar', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const r = await reenviarInvitacion(req.token, req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
