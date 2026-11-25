// ============================================================
//  CONTATECK · Backend · Rutas del Asistente contable (OT-0053 IA, OT-0054 reglas)
//    GET  /api/ia/estado     → { modo, disponible, rolPermitido } (sin llaves)
//    POST /api/ia/consultar  → { pregunta, historial? } → { ok, respuesta, ... }
//
//  Dos modos, elegidos con ASISTENTE_MODO en el .env:
//    · "reglas" (por defecto): chatbot sin IA de pago (asistenteContable.js). No necesita llave ni cuesta por consulta.
//    · "ia": usa un modelo de IA con las mismas herramientas de solo lectura (iaContable.js). Necesita ANTHROPIC_API_KEY.
//  En ambos modos: sesión obligatoria, solo lectura, datos con el permiso del propio usuario (RLS) y rol permitido.
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { config } from '../config.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { ROLES_IA, consultarIA, crearHerramientasReales, crearLimitador } from '../iaContable.js';
import { responderPorReglas } from '../asistenteContable.js';

export const iaRouter = Router();
iaRouter.use(verifyAuth);

const permitirIA = crearLimitador({ max: config.ia.maxPorHora });
const permitirReglas = crearLimitador({ max: config.ia.maxPorHoraReglas });

async function rolConAcceso(req) {
  const rol = await obtenerRolUsuario(req.token);
  return { rol, permitido: ROLES_IA.includes(rol) };
}

iaRouter.get('/ia/estado', async (req, res) => {
  if (!req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const { permitido } = await rolConAcceso(req);
  const modo = config.ia.modo;
  res.json({ ok: true, modo, disponible: modo === 'reglas' ? true : Boolean(config.ia.apiKey), rolPermitido: permitido });
});

iaRouter.post('/ia/consultar', async (req, res) => {
  if (!req.token || !req.user) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const { permitido } = await rolConAcceso(req);
  if (!permitido) return res.status(403).json({ ok: false, codigo: 'ROL_SIN_ACCESO', error: 'Tu rol no tiene acceso al asistente contable.' });
  const { pregunta, historial } = req.body || {};

  if (config.ia.modo === 'reglas') {
    if (!permitirReglas(req.user.uid)) return res.status(429).json({ ok: false, codigo: 'LIMITE_DE_USO', error: 'Llegaste al límite de consultas por hora. Inténtalo más tarde.' });
    const r = await responderPorReglas({ pregunta }, { herramientas: crearHerramientasReales(req.token) });
    return res.status(r.ok ? 200 : 400).json(r);
  }

  if (!config.ia.apiKey) return res.status(503).json({ ok: false, codigo: 'IA_NO_CONFIGURADA', error: 'La IA Contable todavía no está configurada en el servidor.' });
  if (!permitirIA(req.user.uid)) return res.status(429).json({ ok: false, codigo: 'LIMITE_DE_USO', error: 'Llegaste al límite de consultas por hora. Inténtalo más tarde.' });
  const r = await consultarIA({ pregunta, historial }, {
    apiKey: config.ia.apiKey,
    model: config.ia.model,
    maxTokens: config.ia.maxTokens,
    herramientas: crearHerramientasReales(req.token),
  });
  const estado = r.ok ? 200 : (r.codigo === 'CONSULTA_INVALIDA' ? 400 : r.codigo === 'IA_NO_CONFIGURADA' ? 503 : 502);
  res.status(estado).json(r);
});
