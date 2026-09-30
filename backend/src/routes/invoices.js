// ============================================================
//  CONTATECK · Backend · Rutas de facturación
//    POST /api/timbrar           -> timbra un CFDI
//    POST /api/cancelar          -> cancela un CFDI
//    GET  /api/cfdis             -> lista CFDIs de la empresa (OT-0012)
//    GET  /api/cfdi/:id/pdf      -> PDF (base64)
//    GET  /api/cfdi/:id/xml      -> XML (base64)
//    GET  /api/cfdi/:id/status   -> estatus ante el SAT
// ============================================================
import { Router } from 'express';
import { getFiscalapi, unwrap } from '../fiscalapi.js';
import { verifyAuth } from '../supabaseAuth.js';
import { saveCfdi, markCfdiCancelled } from '../firebase.js';
import { guardarCfdi, marcarCfdiCancelado, obtenerRolUsuario, listarCfdis } from '../supabaseCfdis.js';
import { construirFactura, construirNotaCredito, construirREP, EMISOR_PRUEBA } from '../demo-data.js';
import { generarPdfCfdi } from '../pdf-cfdi.js';

export const invoicesRouter = Router();
invoicesRouter.use(verifyAuth);

// OT-0011 (Opción A): Postgres es el destino principal del registro de
// CFDIs. Firestore queda SOLO como respaldo de emergencia — un CFDI ya
// timbrado ante el SAT es válido exista o no nuestro registro interno,
// así que si Postgres fallara (ej. caída de red), igual se intenta
// guardar en Firestore para no perder el dato por completo, y se deja
// bien marcado en el log para revisión manual.
async function guardarConRespaldo(req, resumen, rawData, log = console) {
  const r = await guardarCfdi(req.token, resumen, rawData, log);
  if (r.ok) return r;
  log.error('[OT-0011] Postgres rechazó/falló al guardar el CFDI, usando respaldo Firestore:', r.error);
  const idFirestore = await saveCfdi({ ...resumen, raw: rawData }, log);
  return { ok: !!idFirestore, respaldoFirestore: true, error: r.error };
}

// OT-0011 · aprobado: solo director/admin/contador pueden iniciar timbrado
// o cancelación — mismo criterio que las políticas RLS de insert/update en
// `cfdis`. Corta ANTES de llamar a Fiscalapi/SAT, para no generar un CFDI
// real que después no se pudiera registrar bien en Postgres.
const ROLES_FACTURACION = ['director', 'admin', 'contador'];
async function requireRolFacturacion(req, res, next) {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const rol = await obtenerRolUsuario(req.token);
  if (!rol || !ROLES_FACTURACION.includes(rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para timbrar o cancelar CFDIs (tu rol no lo permite).' });
  }
  next();
}

// Extrae los campos clave de una factura timbrada (defensivo: la API
// puede nombrar el UUID de varias formas según el modo).
// OT-0019: el folio real de Fiscalapi NO es data.folio/data.invoiceNumber
// (esos siempre vienen null) — es series + consecutive, confirmado
// contra datos reales en Postgres (ver database/addendum_folio_metodopago.sql).
// De paso se captura paymentMethodCode (PUE/PPD) y paymentFormCode, que
// antes ni se guardaban.
function resumenCfdi(data, user) {
  if (!data) return {};
  const uuid =
    data.uuid ||
    data.invoiceUuid ||
    data.taxStamp?.uuid ||
    data.responses?.[0]?.uuid ||
    null;
  const serie = data.series ?? null;
  const consecutivo = data.consecutive ?? null;
  return {
    id: data.id || null,
    uuid,
    serie,
    folio: (serie && consecutivo != null) ? `${serie}-${consecutivo}` : null,
    total: data.total ?? null,
    subtotal: data.subtotal ?? null,
    moneda: data.currencyCode ?? null,
    tipo: data.typeCode ?? null,
    fecha: data.date ?? null,
    receptorRfc: data.recipient?.tin ?? null,
    receptorNombre: data.recipient?.legalName ?? null,
    emisorRfc: data.issuer?.tin ?? null,
    estatus: 'vigente',
    // OT-0019: PUE = pago de contado, PPD = pago diferido/parcialidades.
    // Una PPD necesita un REP (Recibo Electrónico de Pago) aparte cuando
    // de verdad llega el dinero — "Importar desde factura timbrada" en
    // Contabilidad bloquea las PPD hasta que la contadora confirme cómo
    // debe registrarse ese segundo momento (ver OT-0019.md).
    metodoPago: data.paymentMethodCode ?? null,
    formaPago: data.paymentFormCode ?? null,
    uid: user?.uid ?? null,
    emailUsuario: user?.email ?? null,
  };
}

// ---------- FACTURAR (desde el frontend: recibe datos simples) ----------
// El frontend manda solo receptor + conceptos; el backend agrega el emisor
// y su CSD de forma segura, arma el CFDI y lo timbra.
invoicesRouter.post('/facturar', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  if (!datos.receptor || !datos.receptor.rfc) {
    return res.status(400).json({ ok: false, error: 'Falta el RFC del receptor.' });
  }
  if (!Array.isArray(datos.conceptos) || datos.conceptos.length === 0) {
    return res.status(400).json({ ok: false, error: 'Agrega al menos un concepto.' });
  }

  try {
    const fiscalapi = getFiscalapi();
    const invoice = construirFactura(datos);
    const r = unwrap(await fiscalapi.invoices.create(invoice));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó el timbrado.',
        details: r.details || '',
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    const savedId = await guardarConRespaldo(req, resumen, r.data);

    return res.json({
      ok: true,
      mensaje: 'CFDI timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: resumen.total,
      firestoreId: savedId,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar.', details: err.message });
  }
});

// ---------- NOTA DE CRÉDITO (CFDI de Egreso, tipo "E") ----------
// Recibe el UUID de la factura original + los conceptos del descuento/devolución.
invoicesRouter.post('/nota-credito', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  if (!datos.uuidRelacionado) {
    return res.status(400).json({ ok: false, error: 'Falta el UUID de la factura original a la que se aplica la nota de crédito.' });
  }
  if (!Array.isArray(datos.conceptos) || datos.conceptos.length === 0) {
    return res.status(400).json({ ok: false, error: 'Agrega al menos un concepto (el monto del descuento o devolución).' });
  }

  try {
    const fiscalapi = getFiscalapi();
    const egreso = construirNotaCredito(datos);
    const r = unwrap(await fiscalapi.invoices.create(egreso));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó la nota de crédito.',
        details: r.details || '',
        diagnostico: r.data,
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    resumen.tipo = 'E';
    resumen.relacionadoCon = datos.uuidRelacionado;
    const savedId = await guardarConRespaldo(req, resumen, r.data);

    return res.json({
      ok: true,
      mensaje: 'Nota de crédito timbrada correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: resumen.total,
      firestoreId: savedId,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar la nota de crédito.', details: err.message });
  }
});

// ---------- REP · Complemento de Pago (CFDI de Pago, tipo "P") ----------
// Recibe los datos de la factura PPD pagada y el monto del pago recibido.
invoicesRouter.post('/rep', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  const f = datos.facturaPagada || {};
  if (!f.uuid) {
    return res.status(400).json({ ok: false, error: 'Falta el UUID de la factura PPD que se está pagando.' });
  }
  const monto = Number(datos.pago?.monto || f.montoPagado || 0);
  if (!(monto > 0)) {
    return res.status(400).json({ ok: false, error: 'El monto del pago debe ser mayor a cero.' });
  }

  try {
    const fiscalapi = getFiscalapi();
    const rep = construirREP(datos);
    const r = unwrap(await fiscalapi.invoices.create(rep));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó el complemento de pago (REP).',
        details: r.details || '',
        diagnostico: r.data,
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    resumen.tipo = 'P';
    resumen.pagoDe = f.uuid;
    resumen.total = monto;
    const savedId = await guardarConRespaldo(req, resumen, r.data);

    return res.json({
      ok: true,
      mensaje: 'Complemento de pago (REP) timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: monto,
      firestoreId: savedId,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar el complemento de pago.', details: err.message });
  }
});

// ---------- ENVIAR POR CORREO (Fiscalapi manda el PDF + XML) ----------
// Recibe el id de la factura y el correo destino; opcionalmente logo y color.
invoicesRouter.post('/enviar-correo', async (req, res) => {
  const { id, email, base64Logo, bandColor, fontColor } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Falta el id de la factura.' });
  if (!email || !/.+@.+\..+/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Correo del destinatario inválido.' });
  }

  try {
    const fiscalapi = getFiscalapi();
    const sendReq = { invoiceId: id, toEmail: email };
    if (base64Logo) sendReq.base64Logo = base64Logo;
    if (bandColor) sendReq.bandColor = bandColor;
    if (fontColor) sendReq.fontColor = fontColor;
    const r = unwrap(await fiscalapi.invoices.send(sendReq));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'No se pudo enviar el correo.',
        details: r.details || '',
        diagnostico: r.data,
      });
    }
    return res.json({ ok: true, mensaje: `Factura enviada a ${email}.` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al enviar el correo.', details: err.message });
  }
});

// ---------- CATÁLOGOS DEL SAT (búsqueda en vivo vía Fiscalapi) ----------
// GET /api/catalogo/:nombre/:q  -> busca en un catálogo del SAT.
// Catálogos útiles: SatProductCodes, SatUnitMeasurements, SatPaymentForms,
// SatCfdiUses, SatTaxRegimes. La búsqueda requiere mínimo 3 caracteres.
invoicesRouter.get('/catalogo/:nombre/:q', async (req, res) => {
  const { nombre, q } = req.params;
  const texto = String(q || '').trim();
  if (texto.length < 3) {
    return res.status(400).json({ ok: false, error: 'Escribe al menos 3 caracteres para buscar.' });
  }
  try {
    const fiscalapi = getFiscalapi();
    const r = unwrap(await fiscalapi.catalogs.searchCatalog(nombre, texto, 1, 20));
    if (!r.ok) {
      return res.status(r.status || 400).json({ ok: false, error: r.message || 'No se pudo buscar en el catálogo.', details: r.details || '' });
    }
    // r.data es un PagedList: { items: [{ id, description }], ... }
    const items = (r.data && (r.data.items || r.data.records || r.data.data)) || [];
    return res.json({
      ok: true,
      items: items.map((it) => ({ clave: it.id ?? it.key ?? '', descripcion: it.description ?? it.descripcion ?? '' })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al buscar en el catálogo.', details: err.message });
  }
});

// ---------- TIMBRAR (avanzado: recibe el invoice ya armado) ----------
invoicesRouter.post('/timbrar', requireRolFacturacion, async (req, res) => {
  const invoice = req.body?.invoice ?? req.body;
  if (!invoice || typeof invoice !== 'object') {
    return res.status(400).json({ ok: false, error: 'Falta el objeto "invoice" en el body.' });
  }

  try {
    const fiscalapi = getFiscalapi();
    const r = unwrap(await fiscalapi.invoices.create(invoice));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó el timbrado.',
        details: r.details || '',
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    // OT-0011: Postgres primero, Firestore solo como respaldo de emergencia.
    const savedId = await guardarConRespaldo(req, resumen, r.data);

    return res.json({
      ok: true,
      mensaje: 'CFDI timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      firestoreId: savedId,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar.', details: err.message });
  }
});

// ---------- CANCELAR ----------
invoicesRouter.post('/cancelar', requireRolFacturacion, async (req, res) => {
  const { id, invoiceUuid, cancellationReasonCode, replacementUuid } = req.body || {};
  if (!cancellationReasonCode) {
    return res
      .status(400)
      .json({ ok: false, error: 'Falta el motivo de cancelación (01, 02, 03 o 04).' });
  }
  if (!id && !invoiceUuid) {
    return res.status(400).json({ ok: false, error: 'Indica el id o el UUID del CFDI a cancelar.' });
  }
  // El motivo 01 (comprobante emitido con errores con relación) exige el UUID
  // de la factura que lo sustituye.
  if (cancellationReasonCode === '01' && !replacementUuid) {
    return res.status(400).json({ ok: false, error: 'El motivo 01 requiere el UUID de la factura que sustituye.' });
  }

  try {
    const fiscalapi = getFiscalapi();
    // Cancelación "por valores": se usa el UUID + el CSD del emisor (no el id
    // interno), porque la factura se timbró pasando los valores del emisor.
    const cancelReq = {
      tin: EMISOR_PRUEBA.tin,
      cancellationReasonCode,
      replacementUuid: replacementUuid || undefined,
      taxCredentials: EMISOR_PRUEBA.taxCredentials,
    };
    if (invoiceUuid) cancelReq.invoiceUuid = invoiceUuid;
    else if (id) cancelReq.id = id;
    const r = unwrap(await fiscalapi.invoices.cancel(cancelReq));

    if (!r.ok) {
      return res
        .status(r.status || 400)
        .json({ ok: false, error: r.message || 'No se pudo cancelar.', details: r.details || '', diagnostico: r.data });
    }

    const cancelResultado = await marcarCfdiCancelado(
      req.token,
      { fiscalapiId: id, uuidSat: invoiceUuid },
      { acuse: r.data?.base64CancellationAcknowledgement || null }
    );
    if (!cancelResultado.ok) {
      console.error('[OT-0011] Postgres no pudo marcar cancelado, usando respaldo Firestore:', cancelResultado.error);
      await markCfdiCancelled(id, { acuse: r.data?.base64CancellationAcknowledgement || null });
    }

    return res.json({ ok: true, mensaje: 'CFDI cancelado.', resultado: r.data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al cancelar.', details: err.message });
  }
});

// ---------- PDF (devuelve el archivo directo, se abre en el navegador) ----------
invoicesRouter.get('/cfdi/:id/pdf', async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const raw = await fiscalapi.invoices.getPdf({ invoiceId: req.params.id });
    const r = unwrap(raw);
    // La API devuelve el contenido en "base64File" (aunque el tipo del SDK diga "base64Content").
    const b64 = r.data?.base64File || r.data?.base64Content;
    if (!r.ok || !b64) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'No se pudo generar el PDF.',
        details: r.details || '',
        invoiceId: req.params.id,
        diagnostico: raw,
      });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', r.data.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.pdf'}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, invoiceId: req.params.id, stack: String(err.stack || '').slice(0, 500) });
  }
});

// ---------- PDF CON LOGO (POST: el logo base64 no cabe en un GET) ----------
// El frontend manda { base64Logo, bandColor, fontColor } y recibe el PDF con marca.
invoicesRouter.post('/cfdi/:id/pdf', async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const { base64Logo, bandColor, fontColor } = req.body || {};
    const pdfReq = { invoiceId: req.params.id };
    if (base64Logo) pdfReq.base64Logo = base64Logo;
    if (bandColor) pdfReq.bandColor = bandColor;
    if (fontColor) pdfReq.fontColor = fontColor;
    const raw = await fiscalapi.invoices.getPdf(pdfReq);
    const r = unwrap(raw);
    const b64 = r.data?.base64File || r.data?.base64Content;
    if (!r.ok || !b64) {
      return res.status(r.status || 400).json({
        ok: false, error: r.message || 'No se pudo generar el PDF.', details: r.details || '',
        invoiceId: req.params.id, diagnostico: raw,
      });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', r.data.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.pdf'}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, invoiceId: req.params.id });
  }
});

// ---------- XML (devuelve el archivo directo) ----------
invoicesRouter.get('/cfdi/:id/xml', async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const raw = await fiscalapi.invoices.getXml(req.params.id);
    const r = unwrap(raw);
    const b64 = r.data?.base64File || r.data?.base64Content;
    if (!r.ok || !b64) {
      return res.status(r.status || 400).json({ ok: false, error: r.message || 'No se pudo obtener el XML.', details: r.details || '', invoiceId: req.params.id, diagnostico: raw });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.xml'}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, invoiceId: req.params.id });
  }
});

// ---------- PDF PROPIO (representación impresa con diseño CONTATECK) ----------
// Obtiene el XML timbrado de Fiscalapi y genera el PDF con NUESTRO layout
// (limpio, con QR del SAT y sin marca de agua de terceros).
async function obtenerXmlString(id) {
  const fiscalapi = getFiscalapi();
  const raw = await fiscalapi.invoices.getXml(id);
  const r = unwrap(raw);
  const b64 = r.data?.base64File || r.data?.base64Content;
  if (!r.ok || !b64) {
    const e = new Error(r.message || 'No se pudo obtener el XML para el PDF.');
    e.diagnostico = raw; e.status = r.status || 400; e.details = r.details || '';
    throw e;
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
}

invoicesRouter.get('/cfdi/:id/pdf-pro', async (req, res) => {
  try {
    const xml = await obtenerXmlString(req.params.id);
    const buffer = await generarPdfCfdi(xml, {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CFDI_${req.params.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message, details: err.details || '', invoiceId: req.params.id, diagnostico: err.diagnostico });
  }
});

invoicesRouter.post('/cfdi/:id/pdf-pro', async (req, res) => {
  try {
    const { base64Logo, bandColor, marcaNombre } = req.body || {};
    const xml = await obtenerXmlString(req.params.id);
    const buffer = await generarPdfCfdi(xml, { base64Logo, bandColor, marcaNombre });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CFDI_${req.params.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message, details: err.details || '', invoiceId: req.params.id, diagnostico: err.diagnostico });
  }
});

// ---------- LISTADO (OT-0012) ----------
// Solo lectura, cualquier rol autenticado (vendedor incluido: "Solo lectura
// de facturación y pólizas"). RLS filtra por empresa_id automáticamente.
invoicesRouter.get('/cfdis', async (req, res) => {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const r = await listarCfdis(req.token);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  return res.json({ ok: true, cfdis: r.cfdis });
});

// ---------- ESTATUS SAT ----------
invoicesRouter.get('/cfdi/:id/status', async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const r = unwrap(await fiscalapi.invoices.getStatus({ id: req.params.id }));
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.message });
    return res.json({ ok: true, estatus: r.data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
