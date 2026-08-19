// ============================================================
//  CONTATECK · Backend · Rutas de Cuentas por Pagar
//  OT-0023
//  GET  /api/cfdis-proveedor-saldo         -> facturas con saldo por pagar
//  POST /api/pagos-proveedor               -> registrar pago (paso A)
//  POST /api/pagos-proveedor/:id/confirmar -> confirmar y generar póliza (paso B)
//  GET  /api/pagos-proveedor?cfdiProveedorId= -> historial de una factura
// ============================================================
import { Router } from 'express';
import { verifyAuth } from '../supabaseAuth.js';
import { obtenerRolUsuario } from '../supabaseCfdis.js';
import { listarCfdisProveedorSaldo, listarCfdisProveedorTodas, guardarCfdiProveedor } from '../supabaseCfdisProveedor.js';
import { registrarPagoProveedor, confirmarPagoProveedor, listarPagosProveedor, obtenerPagoParaComprobante } from '../supabasePagosProveedor.js';
import { generarPdfComprobantePagoProveedor } from '../pdf-comprobante-pago-proveedor.js';

export const pagosProveedorRouter = Router();
pagosProveedorRouter.use(verifyAuth);

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
    return res.status(403).json({ ok: false, error: 'No tienes permiso para registrar o confirmar pagos a proveedores.' });
  }
  next();
}

pagosProveedorRouter.get('/cfdis-proveedor-saldo', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const resultado = await listarCfdisProveedorSaldo(token);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0024: TODAS las facturas de proveedor (pagadas o no) para la
// pantalla "Cuentas por Pagar".
pagosProveedorRouter.get('/cfdis-proveedor', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const resultado = await listarCfdisProveedorTodas(token);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0023: "Importar XML recibido" arma la póliza de causación como ya
// hacía (sin cambios ahí) — este endpoint aparte guarda la factura como
// documento persistente, ligada a esa póliza, para que quede consultable
// y con saldo por pagar de aquí en adelante.
pagosProveedorRouter.post('/cfdis-proveedor', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const { datos, polizaId } = req.body || {};
  if (!datos) return res.status(400).json({ ok: false, error: 'Faltan los datos de la factura.' });
  const resultado = await guardarCfdiProveedor(token, datos, polizaId);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

pagosProveedorRouter.get('/pagos-proveedor', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const cfdiProveedorId = req.query.cfdiProveedorId;
  if (!cfdiProveedorId) return res.status(400).json({ ok: false, error: 'Falta el parámetro cfdiProveedorId.' });
  const resultado = await listarPagosProveedor(token, cfdiProveedorId);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

pagosProveedorRouter.post('/pagos-proveedor', requireRolCobranza, async (req, res) => {
  const token = obtenerToken(req);
  const { cfdiProveedorId, monto, fechaPago, formaPago, cuentaOrigenId, referencia, notas, comprobanteUrl } = req.body || {};
  if (!cfdiProveedorId || !monto || !fechaPago || !cuentaOrigenId) {
    return res.status(400).json({ ok: false, error: 'Faltan datos del pago (factura, monto, fecha o cuenta de origen).' });
  }
  const resultado = await registrarPagoProveedor(token, { cfdiProveedorId, monto, fechaPago, formaPago, cuentaOrigenId, referencia, notas, comprobanteUrl });
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

pagosProveedorRouter.post('/pagos-proveedor/:id/confirmar', requireRolCobranza, async (req, res) => {
  const token = obtenerToken(req);
  const resultado = await confirmarPagoProveedor(token, req.params.id);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

// OT-0024: comprobante interno de pago a proveedor en PDF.
pagosProveedorRouter.get('/pagos-proveedor/:id/comprobante-pdf', async (req, res) => {
  const token = obtenerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
  const datos = await obtenerPagoParaComprobante(token, req.params.id);
  if (!datos.ok) return res.status(400).json(datos);
  try {
    const buffer = await generarPdfComprobantePagoProveedor(datos);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ComprobantePagoProveedor_${req.params.id.slice(0, 8)}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[comprobante-pdf-proveedor] Error generando PDF:', err);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF.', details: err.message });
  }
});
