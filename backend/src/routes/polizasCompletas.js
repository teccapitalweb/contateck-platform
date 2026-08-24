// ============================================================
//  CONTATECK · Backend · Ruta /api/polizas-completas
//  OT-0010
//  POST /api/polizas-completas      → crear encabezado + partidas
//  PUT  /api/polizas-completas/:id  → reemplazar encabezado + partidas
//  El cuadre Debe=Haber se valida DENTRO de la función de Postgres,
//  no aquí — así queda garantizado aunque alguien llame la API
//  directamente sin pasar por el frontend.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { crearPolizaCompleta, actualizarPolizaCompleta, corregirPolizaConAjuste, obtenerPolizasConPartidas } from '../supabasePolizasCompletas.js';

export const polizasCompletasRouter = Router();
polizasCompletasRouter.use(verifyAuth);

function obtenerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

polizasCompletasRouter.post('/polizas-completas', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  // OT-0012: el folio ya NO lo manda el cliente — lo genera Postgres de
  // forma atómica dentro de crear_poliza_completa, para que dos capturas
  // simultáneas (dos dispositivos, dos usuarios) nunca repitan folio.
  const { tipo, fecha, concepto, partidas } = req.body || {};
  if (!tipo || !fecha || !concepto || !Array.isArray(partidas)) {
    return res.status(400).json({ ok: false, error: 'Faltan datos de la póliza.' });
  }
  const resultado = await crearPolizaCompleta(token, { tipo, fecha, concepto, partidas });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

polizasCompletasRouter.put('/polizas-completas/:id', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const { tipo, fecha, concepto, partidas } = req.body || {};
  if (!tipo || !fecha || !concepto || !Array.isArray(partidas)) {
    return res.status(400).json({ ok: false, error: 'Faltan datos de la póliza.' });
  }
  const resultado = await actualizarPolizaCompleta(token, req.params.id, { tipo, fecha, concepto, partidas });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0025: corrección con asientos de ajuste. No sobreescribe la
// original — genera reversa + corregida ligadas, de forma atómica.
polizasCompletasRouter.post('/polizas-completas/:id/corregir', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const { motivo, partidasCorrectas } = req.body || {};
  if (!motivo || !String(motivo).trim()) {
    return res.status(400).json({ ok: false, error: 'El motivo de la corrección es obligatorio.' });
  }
  if (!Array.isArray(partidasCorrectas) || partidasCorrectas.length < 2) {
    return res.status(400).json({ ok: false, error: 'La corrección necesita al menos 2 movimientos.' });
  }
  const resultado = await corregirPolizaConAjuste(token, req.params.id, { motivo, partidasCorrectas });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0025: encabezado + partidas de pólizas específicas (ids separados
// por coma). El frontend lo usa para alimentar el Libro Mayor con las
// partidas de la reversa/corrección recién creadas en el backend.
polizasCompletasRouter.get('/polizas-completas/con-partidas', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const resultado = await obtenerPolizasConPartidas(token, ids);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});
