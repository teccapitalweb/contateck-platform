// ============================================================
//  CONTATECK · Backend · Rutas de ADMINISTRACIÓN DE PLATAFORMA (OT-0037)
//    GET /api/plataforma/yo                     -> ¿soy administrador de plataforma? (cualquier sesión)
//    GET /api/plataforma/resumen                -> totales
//    GET /api/plataforma/empresas               -> empresas con conteos
//    GET /api/plataforma/empresas/:id/usuarios  -> usuarios de una empresa
//    GET /api/plataforma/actividad?limite=50    -> movimientos recientes de todas las empresas
//    GET /api/plataforma/salud                  -> estado del sistema
//
//  Solo lectura. Todo (menos /yo) exige estar en `administradores_plataforma`;
//  el navegador nunca decide quién es administrador.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import {
  consultarAdministrador, resumenPlataforma, listarEmpresas, listarUsuariosEmpresa,
  actividadReciente, saludPlataforma,
} from '../supabasePlataforma.js';

export const plataformaRouter = Router();

async function requirePlataforma(req, res, next) {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const r = await consultarAdministrador(req.user.uid);
  if (!r.ok) return res.status(r.status || 500).json({ ok: false, error: r.error });
  if (!r.esAdmin) return res.status(403).json({ ok: false, error: 'No tienes acceso a la administración de plataforma.' });
  req.plataforma = { nivel: r.nivel };
  console.log(`[plataforma] ${req.user.email} (${r.nivel}) ${req.method} ${req.originalUrl}`);
  next();
}

function responder(res, r) {
  res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? r : { ok: false, error: r.error });
}

// /yo contesta 200 siempre (con esAdmin true/false) para que el login lo use sin ruido de errores.
plataformaRouter.get('/plataforma/yo', verifyAuth, async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const r = await consultarAdministrador(req.user.uid);
  if (!r.ok) return res.status(r.status || 500).json({ ok: false, error: r.error });
  res.json({ ok: true, esAdmin: !!r.esAdmin, nivel: r.nivel || null, tablaFaltante: !!r.tablaFaltante });
});

plataformaRouter.get('/plataforma/resumen', verifyAuth, requirePlataforma, async (_req, res) => responder(res, await resumenPlataforma()));
plataformaRouter.get('/plataforma/empresas', verifyAuth, requirePlataforma, async (_req, res) => responder(res, await listarEmpresas()));
plataformaRouter.get('/plataforma/empresas/:id/usuarios', verifyAuth, requirePlataforma, async (req, res) => responder(res, await listarUsuariosEmpresa(req.params.id)));
plataformaRouter.get('/plataforma/actividad', verifyAuth, requirePlataforma, async (req, res) => responder(res, await actividadReciente(req.query.limite)));
plataformaRouter.get('/plataforma/salud', verifyAuth, requirePlataforma, async (_req, res) => responder(res, await saludPlataforma()));
