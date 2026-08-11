// ============================================================
//  CONTATECK · Backend · Ruta /api/catalogo
//  OT-0007 — Fase A
//  Devuelve clientes/productos del usuario logueado desde Postgres.
//  Si no hay datos o Postgres no está configurado, responde
//  fuente:"local" para que el frontend siga con Firestore/local.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerCatalogo } from '../supabaseCatalogo.js';

export const catalogoRouter = Router();
catalogoRouter.use(verifyAuth);

catalogoRouter.get('/catalogo', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.json({ ok: true, fuente: 'local', clientes: [], productos: [] });
  }

  const datos = await obtenerCatalogo(token);
  if (!datos) {
    return res.json({ ok: true, fuente: 'local', clientes: [], productos: [] });
  }

  res.json({ ok: true, fuente: 'postgres', ...datos });
});
