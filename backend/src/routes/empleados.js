// ============================================================
//  CONTATECK · Backend · Ruta de Empleados (Nómina — Parte A)
//  OT-0017
//    GET /api/empleados -> lista real, columnas según rol
//  Alta/edición/baja siguen usando el CRUD genérico ya existente:
//    POST   /api/registro/empleados
//    PUT    /api/registro/empleados/:id
//    DELETE /api/registro/empleados/:id   (soft-delete -> baja)
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { listarEmpleados } from '../supabaseEmpleados.js';

export const empleadosRouter = Router();
empleadosRouter.use(verifyAuth);

empleadosRouter.get('/empleados', async (req, res) => {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const r = await listarEmpleados(req.token);
  if (!r.ok) return res.status(403).json(r);
  return res.json(r);
});
