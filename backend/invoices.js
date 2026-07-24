// ============================================================
//  CONTATECK · Backend · Rutas de facturación
//    POST /api/timbrar           -> timbra un CFDI
//    POST /api/cancelar          -> cancela un CFDI
//    GET  /api/cfdi/:id/pdf      -> PDF (base64)
//    GET  /api/cfdi/:id/xml      -> XML (base64)
//    GET  /api/cfdi/:id/status   -> estatus ante el SAT
// ============================================================
import { Router } from 'express';
import { getFiscalapi, unwrap } from '../fiscalapi.js';
import { verifyAuth, saveCfdi, markCfdiCancelled } from '../firebase.js';
import { construirFactura, EMISOR_PRUEBA } from '../demo-data.js';

export const invoicesRouter = Router();
invoicesRouter.use(verifyAuth);

// Extrae los campos clave de una factura timbrada (defensivo: la API
// puede nombrar el UUID de varias formas según el modo).
function resumenCfdi(data, user) {
  if (!data) return {};
  const uuid =
    data.uuid ||
    data.invoiceUuid ||
    data.taxStamp?.uuid ||
    data.responses?.[0]?.uuid ||
    null;
  return {
    id: data.id || null,
    uuid,
    serie: data.series ?? null,
    folio: data.folio ?? data.invoiceNumber ?? null,
    total: data.total ?? null,
    subtotal: data.subtotal ?? null,
    moneda: data.currencyCode ?? null,
    tipo: data.typeCode ?? null,
    fecha: data.date ?? null,
    receptorRfc: data.recipient?.tin ?? null,
    receptorNombre: data.recipient?.legalName ?? null,
    emisorRfc: data.issuer?.tin ?? null,
    estatus: 'vigente',
    uid: user?.uid ?? null,
    emailUsuario: user?.email ?? null,
  };
}

// ---------- FACTURAR (desde el frontend: recibe datos simples) ----------
// El frontend manda solo receptor + conceptos; el backend agrega el emisor
// y su CSD de forma segura, arma el CFDI y lo timbra.
invoicesRouter.post('/facturar', async (req, res) => {
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
    const savedId = await saveCfdi({ ...resumen, raw: r.data });

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

// ---------- TIMBRAR (avanzado: recibe el invoice ya armado) ----------
invoicesRouter.post('/timbrar', async (req, res) => {
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
    // Guarda en Firestore (no-op si no está configurado). Conserva el bruto por si acaso.
    const savedId = await saveCfdi({ ...resumen, raw: r.data });

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
invoicesRouter.post('/cancelar', async (req, res) => {
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
    const r = unwrap(
      await fiscalapi.invoices.cancel({
        id,
        invoiceUuid,
        tin: EMISOR_PRUEBA.tin,                 // emisor de prueba (en prod: el de la consultora)
        cancellationReasonCode,
        replacementUuid: replacementUuid || undefined,
        taxCredentials: EMISOR_PRUEBA.taxCredentials, // CSD del lado seguro (backend)
      })
    );

    if (!r.ok) {
      return res
        .status(r.status || 400)
        .json({ ok: false, error: r.message || 'No se pudo cancelar.', details: r.details || '', diagnostico: r.data });
    }

    await markCfdiCancelled(id, { acuse: r.data?.base64CancellationAcknowledgement || null });

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
