// ============================================================
//  CONTATECK · Backend · Rutas de Nómina interna (Pieza 4)
//    POST /api/nominas                         -> guarda una nómina procesada (encabezado
//                                                 + detalle) vía RPC atómica crear_nomina.
//    POST /api/nominas/:id/timbrar             -> OT-0064: timbra el CFDI de nómina de cada
//                                                 empleado (ambiente de pruebas del PAC).
//    GET  /api/nominas/detalle/:detalleId/xml  -> OT-0064: XML del CFDI de un empleado.
//  El candado de rol (rh/admin/director) vive dentro de la RPC y en
//  la política RLS de INSERT — aquí solo se exige autenticación
//  (el timbrado además exige el rol aquí, ANTES de llamar al PAC).
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { crearNomina, listarNominas, detalleNomina, leerParaTimbrar, registrarTimbre, idPacDeRenglon } from '../supabaseNominas.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { getFiscalapi, unwrap } from '../fiscalapi.js';
import { EMISOR_PRUEBA, CP_EMISOR, fechaMexico } from '../demo-data.js';
import { config } from '../config.js';
import { timbrarNomina } from '../timbradoNomina.js';
export const nominasRouter = Router();
nominasRouter.use(verifyAuth);

const ROLES_NOMINA = ['rh', 'admin', 'director'];
const REGISTRO_PATRONAL_PRUEBA = 'B5510768108';   // solo para el emisor de pruebas (el PAC lo exige con contratos 01 a 08)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enCurso = new Map();   // candado: una sola corrida de timbrado por nómina a la vez
const TIEMPO_MAX_MS = 5 * 60 * 1000;

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

// OT-0064 · Timbrar el CFDI de nómina de todos los empleados de una nómina (los ya timbrados se respetan).
nominasRouter.post('/nominas/:id/timbrar', async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const rol = await obtenerRolUsuario(req.token);
  if (!rol || !ROLES_NOMINA.includes(rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para timbrar nómina (tu rol no lo permite).' });
  }
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Identificador de nómina no válido.' });

  const t = enCurso.get(id);
  if (t && Date.now() - t < TIEMPO_MAX_MS) {
    return res.status(409).json({ ok: false, codigo: 'EN_PROCESO', error: 'Esta nómina ya se está timbrando. Espera a que termine y revisa el resultado.' });
  }
  enCurso.set(id, Date.now());
  try {
    const datos = await leerParaTimbrar(req.token, id);
    if (!datos.ok) return res.status(400).json(datos);
    if (!datos.nomina) return res.status(404).json({ ok: false, error: 'No encontré esa nómina en tu empresa.' });
    const fiscalapi = getFiscalapi();
    const r = await timbrarNomina(datos, {
      emisor: EMISOR_PRUEBA,
      cpExpedicion: CP_EMISOR,
      // Con el emisor de pruebas del SAT se usa un registro patronal de ejemplo; con un emisor real se exige el propio.
      registroPatronal: (config.emisor && config.emisor.registroPatronal) || (EMISOR_PRUEBA.tin === 'EKU9003173C9' ? REGISTRO_PATRONAL_PRUEBA : ''),
      fecha: fechaMexico,
      timbrar: async (invoice) => unwrap(await fiscalapi.invoices.create(invoice)),
      registrar: (detalleId, d) => registrarTimbre(req.token, detalleId, d),
    });
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (err) {
    console.error('[nómina] timbrar:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al timbrar la nómina.' });
  } finally {
    enCurso.delete(id);
  }
});

// OT-0064 · XML del CFDI de nómina de un empleado (solo de la empresa del usuario, por RLS).
nominasRouter.get('/nominas/detalle/:detalleId/xml', async (req, res) => {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  if (!UUID_RE.test(String(req.params.detalleId || ''))) return res.status(400).json({ ok: false, error: 'Identificador no válido.' });
  const l = await idPacDeRenglon(req.token, req.params.detalleId);
  if (!l.ok) return res.status(400).json(l);
  if (!l.renglon || !l.renglon.cfdi_fiscalapi_id) return res.status(404).json({ ok: false, error: 'Ese empleado no tiene CFDI de nómina timbrado.' });
  try {
    const r = unwrap(await getFiscalapi().invoices.getXml(l.renglon.cfdi_fiscalapi_id));
    const b64 = r.data && (r.data.base64File || r.data.base64Content);
    if (!r.ok || !b64) return res.status(r.status || 400).json({ ok: false, error: r.message || 'No se pudo obtener el XML.' });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${(r.data.fileName || 'nomina-' + l.renglon.cfdi_uuid + '.xml').replace(/[^\w.\-]/g, '_')}"`);
    return res.send(Buffer.from(b64, 'base64'));
  } catch (err) {
    console.error('[nómina] xml:', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener el XML.' });
  }
});
