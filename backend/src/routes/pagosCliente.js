// ============================================================
//  CONTATECK · Backend · Rutas de cobranza
//  OT-0020
//  GET  /api/cfdis-saldo             -> facturas con saldo pendiente
//  POST /api/pagos-cliente           -> registrar pago (paso A)
//  POST /api/pagos-cliente/:id/confirmar -> confirmar y generar póliza (paso B)
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { listarCfdisSaldo, registrarPagoCliente, confirmarPagoCliente, listarPagosCfdi, obtenerPagoParaComprobante } from '../supabasePagosCliente.js';
import { generarPdfComprobantePago } from '../pdf-comprobante-pago.js';

export const pagosClienteRouter = Router();
pagosClienteRouter.use(verifyAuth);

function obtenerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

const ROLES_COBRANZA = ['contador', 'admin', 'director'];
async function requireRolCobranza(req, res, next) {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const rol = await obtenerRolUsuario(token);
  if (!rol || !ROLES_COBRANZA.includes(rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para registrar o confirmar pagos.' });
  }
  next();
}

pagosClienteRouter.get('/cfdis-saldo', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const resultado = await listarCfdisSaldo(token);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

pagosClienteRouter.post('/pagos-cliente', requireRolCobranza, async (req, res) => {
  const token = obtenerToken(req);
  const { cfdiId, monto, fechaPago, formaPago, cuentaDestinoId, referencia, notas, comprobanteUrl } = req.body || {};
  if (!cfdiId || !monto || !fechaPago || !cuentaDestinoId) {
    return res.status(400).json({ ok: false, error: 'Faltan datos del pago (factura, monto, fecha o cuenta destino).' });
  }
  const resultado = await registrarPagoCliente(token, { cfdiId, monto, fechaPago, formaPago, cuentaDestinoId, referencia, notas, comprobanteUrl });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

pagosClienteRouter.post('/pagos-cliente/:id/confirmar', requireRolCobranza, async (req, res) => {
  const token = obtenerToken(req);
  const resultado = await confirmarPagoCliente(token, req.params.id);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0021: historial de pagos de una factura (lectura — el RLS de la
// tabla ya limita a la empresa del usuario, no requiere rol contable).
pagosClienteRouter.get('/pagos-cliente', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const cfdiId = req.query.cfdiId;
  if (!cfdiId) return res.status(400).json({ ok: false, error: 'Falta el parámetro cfdiId.' });
  const resultado = await listarPagosCfdi(token, cfdiId);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0022: comprobante interno de pago en PDF — documento administrativo
// limpio con los datos reales de Postgres. No es CFDI ni REP y lo dice.
pagosClienteRouter.get('/pagos-cliente/:id/comprobante-pdf', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const datos = await obtenerPagoParaComprobante(token, req.params.id);
  if (!datos.ok) return res.status(400).json(datos);
  try {
    const buffer = await generarPdfComprobantePago(datos);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ComprobantePago_${req.params.id.slice(0, 8)}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[comprobante-pdf] Error generando PDF:', err);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF.', details: err.message });
  }
});
