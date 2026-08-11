// ============================================================
//  CONTATECK · Backend · Ruta /api/perfil
//  OT-0006 — Fase A
//  Devuelve la empresa y el perfil del usuario logueado, leídos
//  de Postgres (Supabase). Si no hay datos o Postgres no está
//  configurado, responde fuente:"local" para que el frontend siga
//  usando su arreglo EMPRESAS de data.js sin romperse.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerEmpresaYPerfil, isPostgresDataReady } from '../supabaseData.js';

export const perfilRouter = Router();
perfilRouter.use(verifyAuth);

perfilRouter.get('/perfil', async (req, res) => {
  if (!isPostgresDataReady()) {
    return res.json({ ok: true, fuente: 'local', empresa: null, perfil: null });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.json({ ok: true, fuente: 'local', empresa: null, perfil: null });
  }

  const datos = await obtenerEmpresaYPerfil(token);
  if (!datos) {
    return res.json({ ok: true, fuente: 'local', empresa: null, perfil: null });
  }

  res.json({ ok: true, fuente: 'postgres', ...datos });
});
