// ============================================================
//  CONTATECK · Backend · Rutas de Nómina interna (Pieza 4)
//    POST /api/nominas  -> guarda una nómina procesada (encabezado
//                          + detalle) vía RPC atómica crear_nomina.
//  El candado de rol (rh/admin/director) vive dentro de la RPC y en
//  la política RLS de INSERT — aquí solo se exige autenticación.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { crearNomina, listarNominas, detalleNomina } from '../supabaseNominas.js';
export const nominasRouter = Router();
nominasRouter.use(verifyAuth);
nominasRouter.post('/nominas', async (req, res) => {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const b = req.body || {};
  if (!b.periodicidad || !b.fechaInicio || !b.fechaFin || !Array.isArray(b.detalle) || !b.detalle.length) {
    return res.status(400).json({ ok: false, error: 'Faltan datos de la nómina (periodicidad, fechas o detalle).' });
  }
  const r = await crearNomina(req.token, {
    periodicidad: b.periodicidad,
    fechaInicio: b.fechaInicio,
    fechaFin: b.fechaFin,
    dias: b.dias,
    detalle: b.detalle,
  });
  res.status(r.ok ? 200 : 400).json(r);
});
// Historial: lista de nóminas pagadas.
nominasRouter.get('/nominas', async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const r = await listarNominas(req.token);
  res.status(r.ok ? 200 : 400).json(r);
});
// Historial: detalle (empleados) de una nómina específica.
nominasRouter.get('/nominas/:id/detalle', async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const r = await detalleNomina(req.token, req.params.id);
  res.status(r.ok ? 200 : 400).json(r);
});
