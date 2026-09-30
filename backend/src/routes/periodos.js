// ============================================================
//  CONTATECK · Backend · Rutas de Periodos contables (OT-0026)
//    GET  /api/periodos
//    POST /api/periodos/cerrar
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { listarPeriodos, cerrarPeriodo } from '../supabasePeriodos.js';

export const periodosRouter = Router();
periodosRouter.use(verifyAuth);

function obtenerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

periodosRouter.get('/periodos', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const resultado = await listarPeriodos(token);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

periodosRouter.post('/periodos/cerrar', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const { anio, mes } = req.body || {};
  if (!anio || !mes) return res.status(400).json({ ok: false, error: 'Falta año o mes.' });
  const resultado = await cerrarPeriodo(token, { anio: Number(anio), mes: Number(mes) });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});
