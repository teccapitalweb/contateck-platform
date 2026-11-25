// ============================================================
//  CONTATECK · Backend · Rutas de la IA Contable (OT-0053)
//    GET  /api/ia/estado     → si la IA está configurada y si el rol del usuario puede usarla (sin llaves)
//    POST /api/ia/consultar  → { pregunta, historial? } → { ok, respuesta, herramientas_usadas }
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { config } from '../config.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { ROLES_IA, consultarIA, crearHerramientasReales, crearLimitador } from '../iaContable.js';

export const iaRouter = Router();
iaRouter.use(verifyAuth);

const permitir = crearLimitador({ max: config.ia.maxPorHora });

async function rolConAcceso(req) {
  const rol = await obtenerRolUsuario(req.token);
  return { rol, permitido: ROLES_IA.includes(rol) };
}

iaRouter.get('/ia/estado', async (req, res) => {
  if (!req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const { permitido } = await rolConAcceso(req);
  res.json({ ok: true, disponible: Boolean(config.ia.apiKey), rolPermitido: permitido });
});

iaRouter.post('/ia/consultar', async (req, res) => {
  if (!req.token || !req.user) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const { permitido } = await rolConAcceso(req);
  if (!permitido) return res.status(403).json({ ok: false, codigo: 'ROL_SIN_ACCESO', error: 'Tu rol no tiene acceso a la IA Contable.' });
  if (!config.ia.apiKey) return res.status(503).json({ ok: false, codigo: 'IA_NO_CONFIGURADA', error: 'La IA Contable todavía no está configurada en el servidor.' });
  if (!permitir(req.user.uid)) return res.status(429).json({ ok: false, codigo: 'LIMITE_DE_USO', error: 'Llegaste al límite de consultas por hora. Inténtalo más tarde.' });

  const { pregunta, historial } = req.body || {};
  const r = await consultarIA({ pregunta, historial }, {
    apiKey: config.ia.apiKey,
    model: config.ia.model,
    maxTokens: config.ia.maxTokens,
    herramientas: crearHerramientasReales(req.token),
  });
  const estado = r.ok ? 200 : (r.codigo === 'CONSULTA_INVALIDA' ? 400 : r.codigo === 'IA_NO_CONFIGURADA' ? 503 : 502);
  res.status(estado).json(r);
});
