// ============================================================
//  CONTATECK · Backend · Ruta /api/operacion
//  OT-0008 — Fase A
//  Devuelve empleados/pólizas del usuario logueado desde Postgres.
//  fuente:"local" si no hay datos o Postgres no está configurado.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerEmpleadosYPolizas } from '../supabaseOperacion.js';

export const operacionRouter = Router();
operacionRouter.use(verifyAuth);

operacionRouter.get('/operacion', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.json({ ok: true, fuente: 'local', empleados: [], polizas: [] });
  }

  const datos = await obtenerEmpleadosYPolizas(token);
  if (!datos) {
    return res.json({ ok: true, fuente: 'local', empleados: [], polizas: [] });
  }

  res.json({ ok: true, fuente: 'postgres', ...datos });
});
