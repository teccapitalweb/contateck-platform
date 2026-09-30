// ============================================================
//  CONTATECK · Backend · Ruta /api/config-contable
//  OT-0020
//  GET /api/config-contable  -> lee la configuración de la empresa
//  PUT /api/config-contable  -> guarda/actualiza (solo roles contables)
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerConfigContable, guardarConfigContable, obtenerEmpresaId } from '../supabaseConfigContable.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';

export const configContableRouter = Router();
configContableRouter.use(verifyAuth);

function obtenerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

configContableRouter.get('/config-contable', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const resultado = await obtenerConfigContable(token);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

configContableRouter.put('/config-contable', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const rol = await obtenerRolUsuario(token);
  if (!rol || !['contador', 'admin', 'director'].includes(rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para editar la configuración contable.' });
  }
  const empresaId = await obtenerEmpresaId(token);
  if (!empresaId) return res.status(400).json({ ok: false, error: 'No se encontró tu perfil/empresa.' });

  const resultado = await guardarConfigContable(token, empresaId, req.body || {});
  res.status(resultado.ok ? 200 : 400).json(resultado);
});
