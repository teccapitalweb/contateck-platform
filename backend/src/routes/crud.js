// ============================================================
//  CONTATECK · Backend · Ruta CRUD genérica
//  OT-0008-C
//  POST   /api/registro/:tabla       → crear
//  PUT    /api/registro/:tabla/:id   → actualizar
//  DELETE /api/registro/:tabla/:id   → eliminar (o baja/rechazo, según tabla)
//  PUT    /api/registro/:tabla/:id/reactivar → regresar de baja suave a servicio
//
//  :tabla solo puede ser una de las ya migradas: clientes,
//  productos, empleados, polizas, cuentas_contables. Cualquier otro
//  valor se rechaza explícitamente (evita que alguien intente
//  escribir en otra tabla del esquema, como empresas o
//  auditoria_log, vía esta ruta).
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { tablaValida, crear, actualizar, eliminar, reactivar } from '../supabaseCrud.js';

export const crudRouter = Router();
crudRouter.use(verifyAuth);

function obtenerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

crudRouter.post('/registro/:tabla', async (req, res) => {
  const { tabla } = req.params;
  if (!tablaValida(tabla)) return res.status(400).json({ ok: false, error: `Tabla no permitida: ${tabla}` });
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });

  const resultado = await crear(tabla, token, req.body || {});
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

crudRouter.put('/registro/:tabla/:id', async (req, res) => {
  const { tabla, id } = req.params;
  if (!tablaValida(tabla)) return res.status(400).json({ ok: false, error: `Tabla no permitida: ${tabla}` });
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });

  const resultado = await actualizar(tabla, token, id, req.body || {});
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

crudRouter.put('/registro/:tabla/:id/reactivar', async (req, res) => {
  const { tabla, id } = req.params;
  if (!tablaValida(tabla)) return res.status(400).json({ ok: false, error: `Tabla no permitida: ${tabla}` });
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });

  const resultado = await reactivar(tabla, token, id);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

crudRouter.delete('/registro/:tabla/:id', async (req, res) => {
  const { tabla, id } = req.params;
  if (!tablaValida(tabla)) return res.status(400).json({ ok: false, error: `Tabla no permitida: ${tabla}` });
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });

  const resultado = await eliminar(tabla, token, id);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});
