// ============================================================
//  CONTATECK · Backend · Rutas de facturación
//    POST /api/facturar          -> timbra una factura (datos simples)
//    POST /api/nota-credito      -> nota de crédito (CFDI de Egreso)
//    POST /api/rep               -> complemento de pago (CFDI de Pago)
//    POST /api/timbrar           -> timbra un invoice armado (SOLO pruebas)
//    POST /api/cancelar          -> cancela un CFDI
//    GET  /api/cfdis             -> lista CFDIs de la empresa (OT-0012)
//    GET  /api/cfdi/:id/pdf      -> PDF (base64)
//    GET  /api/cfdi/:id/xml      -> XML (base64)
//    GET  /api/cfdi/:id/status   -> estatus ante el SAT
//
//  OT-0030 · Pulido de seguridad y registro:
//   · Todo lo que opera sobre un CFDI existente (PDF, XML, estatus, correo,
//     cancelar, nota de crédito, REP) comprueba PRIMERO que ese CFDI sea de
//     la empresa del usuario (la RLS de `cfdis` lo filtra). Antes cualquier
//     usuario con sesión —o sin ella con REQUIRE_AUTH=false— podía pedir el
//     PDF/XML de otra empresa o cancelar su factura con solo conocer el id.
//   · Si un CFDI se timbra pero NO se puede guardar, la respuesta lo avisa
//     (antes decía "timbrado correctamente" y el CFDI quedaba huérfano).
//   · Los datos del receptor ya no se completan con el receptor de pruebas.
// ============================================================
import { Router } from 'express';
import { getFiscalapi, unwrap } from '../fiscalapi.js';
import { config } from '../config.js';
import { verifyAuth } from '../supabaseAuth.js';
import { saveCfdi, markCfdiCancelled } from '../firebase.js';
import { guardarCfdi, marcarCfdiCancelado, obtenerRolUsuario, listarCfdis, buscarCfdi, buscarDuplicadoReciente } from '../supabaseCfdis.js';
import { construirFactura, construirNotaCredito, construirREP, EMISOR_PRUEBA } from '../demo-data.js';
import { generarPdfCfdi } from '../pdf-cfdi.js';
import { validarFactura, validarConceptos, validarReceptor, validarCorreo, uuidValido } from '../validaciones.js';

export const invoicesRouter = Router();
invoicesRouter.use(verifyAuth);

// En pruebas se devuelve el diagnóstico crudo del PAC (ayuda a depurar);
// en producción NO: puede traer datos internos que el navegador no necesita.
const EN_PRUEBAS = config.fiscalapi.apiUrl.includes('test.');
const diag = (x) => (EN_PRUEBAS ? x : undefined);

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

// OT-0030: antes las rutas ignoraban el resultado de guardarConRespaldo y
// respondían "timbrado correctamente" aunque el CFDI no quedara en ningún
// lado. Ahora se informa: el CFDI SÍ existe ante el SAT, pero no está en el
// panel, y se deja el UUID en el log del servidor para recuperarlo a mano.
function estadoRegistro(g, resumen, log = console) {
  if (g && g.ok && !g.respaldoFirestore) return { registroGuardado: true };
  const motivo = (g && g.error) || 'error desconocido';
  log.error(`[CFDI SIN REGISTRO] UUID ${resumen.uuid} (fiscalapi ${resumen.id}) timbrado pero NO guardado en Postgres: ${motivo}`);
  return {
    registroGuardado: false,
    aviso: `El CFDI ${resumen.uuid || ''} SÍ quedó timbrado ante el SAT, pero no se pudo guardar en el panel (${motivo}). ` +
      'Anota el UUID y avisa a soporte para registrarlo.',
  };
}

// OT-0011 · aprobado: solo director/admin/contador pueden iniciar timbrado
// o cancelación — mismo criterio que las políticas RLS de insert/update en
// `cfdis`. Corta ANTES de llamar a Fiscalapi/SAT, para no generar un CFDI
// real que después no se pudiera registrar bien en Postgres.
const ROLES_FACTURACION = ['director', 'admin', 'contador'];
export async function requireRolFacturacion(req, res, next) {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  const rol = await obtenerRolUsuario(req.token);
  if (!rol || !ROLES_FACTURACION.includes(rol)) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para timbrar o cancelar CFDIs (tu rol no lo permite).' });
  }
  next();
}

// ---------- OT-0030 · Protección contra duplicados ----------
// Un timbrado es real e irreversible (solo se puede cancelar ante el SAT). Dos
// casos lo duplicaban: (a) doble clic / dos pestañas a la vez, y (b) se pierde
// la respuesta (red, cierre de pestaña) y el usuario reintenta sin saber que
// la primera SÍ se timbró. Defensas, sin cambiar el esquema de la base:
//  1) Candado en memoria: no dejar pasar dos timbrados iguales a la vez del
//     mismo usuario (se libera al terminar o a los 90 s por si algo se cuelga).
//  2) Aviso de posible duplicado: si en la base ya hay un CFDI vigente del
//     mismo tipo, mismo receptor y mismo importe de hace pocos minutos, se
//     responde 409 POSIBLE_DUPLICADO con los datos del existente; el usuario
//     puede confirmar (confirmarDuplicado: true) si de verdad quería otro.
const VENTANA_DUPLICADO_MIN = 15;
const TIEMPO_MAX_CANDADO_MS = 90 * 1000;
const candados = new Map();
function tomarCandado(clave) {
  const t = candados.get(clave);
  if (t && Date.now() - t < TIEMPO_MAX_CANDADO_MS) return false;
  candados.set(clave, Date.now());
  return true;
}
const soltarCandado = (clave) => candados.delete(clave);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const subtotalConceptos = (conceptos) =>
  round2((conceptos || []).reduce((s, c) => s + round2(Number(c.cantidad) * Number(c.precioUnitario)), 0));

// Devuelve la clave del candado (el llamador DEBE soltarla en `finally`) o null
// si ya respondió (409) porque hay un timbrado igual en curso o un posible duplicado.
async function protegerDuplicado(req, res, { tipo, receptorRfc, subtotal, total, confirmar }) {
  const rfc = String(receptorRfc || '').toUpperCase().trim();
  const clave = `${req.user.uid}|${tipo}|${rfc}|${subtotal ?? total}`;
  if (!tomarCandado(clave)) {
    res.status(409).json({
      ok: false, codigo: 'EN_PROCESO',
      error: 'Ya hay un timbrado igual en proceso. Espera unos segundos y revisa la lista antes de volver a intentar.',
    });
    return null;
  }
  if (!confirmar) {
    const d = await buscarDuplicadoReciente(req.token, { tipo, receptorRfc: rfc, subtotal, total, minutos: VENTANA_DUPLICADO_MIN });
    if (d.ok && d.duplicado) {
      soltarCandado(clave);
      res.status(409).json({
        ok: false, codigo: 'POSIBLE_DUPLICADO',
        error: `Ya hay un CFDI ${d.duplicado.folio || ''} para este receptor por el mismo importe, emitido hace pocos minutos.`.replace('  ', ' '),
        duplicado: { folio: d.duplicado.folio, uuid: d.duplicado.uuid_sat, creado: d.duplicado.created_at },
      });
      return null;
    }
    // Si la revisión falló (d.ok === false) NO se bloquea el timbrado: solo queda en el log.
    if (!d.ok) console.warn('[duplicados] no se pudo revisar, se continúa:', d.error);
  }
  return clave;
}

// OT-0030: sesión obligatoria SIEMPRE (aunque REQUIRE_AUTH esté en false):
// estas rutas consumen el PAC o muestran documentos fiscales.
function requireSesion(req, res, next) {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  next();
}

// OT-0030: el CFDI de la URL (:id = id de Fiscalapi) debe ser de la empresa
// del usuario. Cualquier rol de la empresa puede LEER (el vendedor ve la
// facturación en solo lectura); quien opera (timbrar/cancelar/correo) además
// pasa por requireRolFacturacion.
async function requireCfdiDeMiEmpresa(req, res, next) {
  if (!req.user || !req.token) return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  const r = await buscarCfdi(req.token, { fiscalapiId: req.params.id });
  if (!r.ok) return res.status(500).json({ ok: false, error: 'No se pudo verificar el CFDI.' });
  if (!r.cfdi) return res.status(404).json({ ok: false, error: 'No encontré ese CFDI en tu empresa.' });
  req.cfdi = r.cfdi;
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

// OT-0030: nota de crédito y REP ya NO reciben el receptor del navegador
// (que, por un campo que no se mapeaba, caía siempre en el RFC de pruebas):
// se toma de la factura ORIGINAL guardada. Lo que falte se completa con lo
// que mande el navegador y, si aun así no está completo, se rechaza.
function receptorDesdeCfdi(cfdi, extra = {}) {
  const rec = (cfdi && cfdi.raw && cfdi.raw.recipient) || {};
  return {
    rfc: cfdi.receptor_rfc || rec.tin || extra.rfc,
    nombre: cfdi.receptor_nombre || rec.legalName || extra.nombre,
    cp: rec.zipCode || extra.cp,
    regimen: rec.taxRegimeCode || extra.regimen,
    email: rec.email || extra.email,
  };
}

// Busca la factura original por UUID y comprueba que sirva para el trámite.
// Devuelve { error: {status, msg} } o { cfdi }.
async function facturaOriginal(req, uuid, { exigirPPD = false } = {}) {
  const r = await buscarCfdi(req.token, { uuidSat: uuid });
  if (!r.ok) return { error: { status: 500, msg: 'No se pudo verificar la factura original.' } };
  if (!r.cfdi) return { error: { status: 404, msg: 'La factura original no existe en tu empresa.' } };
  if (r.cfdi.estatus === 'cancelado') return { error: { status: 409, msg: 'La factura original está cancelada.' } };
  if (r.cfdi.tipo && r.cfdi.tipo !== 'I') return { error: { status: 400, msg: 'Solo se puede aplicar a facturas de ingreso.' } };
  if (exigirPPD && r.cfdi.metodo_pago === 'PUE') {
    return { error: { status: 400, msg: 'Esa factura es PUE (pago en una exhibición): no lleva complemento de pago.' } };
  }
  return { cfdi: r.cfdi };
}

// ---------- FACTURAR (desde el frontend: recibe datos simples) ----------
// El frontend manda solo receptor + conceptos; el backend agrega el emisor
// y su CSD de forma segura, arma el CFDI y lo timbra.
invoicesRouter.post('/facturar', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  const errValidacion = validarFactura(datos);
  if (errValidacion) return res.status(400).json({ ok: false, error: errValidacion });

  const clave = await protegerDuplicado(req, res, {
    tipo: 'I', receptorRfc: datos.receptor.rfc, subtotal: subtotalConceptos(datos.conceptos),
    confirmar: datos.confirmarDuplicado === true,
  });
  if (!clave) return;

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
    const registro = estadoRegistro(await guardarConRespaldo(req, resumen, r.data), resumen);

    return res.json({
      ok: true,
      mensaje: 'CFDI timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: resumen.total,
      ...registro,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar.', details: err.message });
  } finally {
    soltarCandado(clave);
  }
});

// ---------- NOTA DE CRÉDITO (CFDI de Egreso, tipo "E") ----------
// Recibe el UUID de la factura original + los conceptos del descuento/devolución.
invoicesRouter.post('/nota-credito', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  if (!uuidValido(datos.uuidRelacionado)) {
    return res.status(400).json({ ok: false, error: 'Falta el UUID de la factura original a la que se aplica la nota de crédito.' });
  }
  const errConceptos = validarConceptos(datos.conceptos);
  if (errConceptos) return res.status(400).json({ ok: false, error: errConceptos });
  if (datos.tipoRelacion !== undefined && !/^\d{2}$/.test(String(datos.tipoRelacion))) {
    return res.status(400).json({ ok: false, error: 'El tipo de relación no es válido.' });
  }

  const orig = await facturaOriginal(req, datos.uuidRelacionado);
  if (orig.error) return res.status(orig.error.status).json({ ok: false, error: orig.error.msg });
  const receptor = receptorDesdeCfdi(orig.cfdi, datos.receptor || {});
  const errReceptor = validarReceptor(receptor);
  if (errReceptor) {
    return res.status(400).json({ ok: false, error: `No pude obtener los datos fiscales del receptor de la factura original. ${errReceptor}` });
  }

  const clave = await protegerDuplicado(req, res, {
    tipo: 'E', receptorRfc: receptor.rfc, subtotal: subtotalConceptos(datos.conceptos),
    confirmar: datos.confirmarDuplicado === true,
  });
  if (!clave) return;

  try {
    const fiscalapi = getFiscalapi();
    const egreso = construirNotaCredito({ ...datos, receptor });
    const r = unwrap(await fiscalapi.invoices.create(egreso));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó la nota de crédito.',
        details: r.details || '',
        diagnostico: diag(r.data),
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    resumen.tipo = 'E';
    resumen.relacionadoCon = datos.uuidRelacionado;
    const registro = estadoRegistro(await guardarConRespaldo(req, resumen, r.data), resumen);

    return res.json({
      ok: true,
      mensaje: 'Nota de crédito timbrada correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: resumen.total,
      ...registro,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar la nota de crédito.', details: err.message });
  } finally {
    soltarCandado(clave);
  }
});

// ---------- REP · Complemento de Pago (CFDI de Pago, tipo "P") ----------
// Recibe los datos de la factura PPD pagada y el monto del pago recibido.
invoicesRouter.post('/rep', requireRolFacturacion, async (req, res) => {
  const datos = req.body || {};
  const f = datos.facturaPagada || {};
  if (!uuidValido(f.uuid)) {
    return res.status(400).json({ ok: false, error: 'Falta el UUID de la factura PPD que se está pagando.' });
  }
  const monto = Number(datos.pago?.monto || f.montoPagado || 0);
  if (!Number.isFinite(monto) || !(monto > 0)) {
    return res.status(400).json({ ok: false, error: 'El monto del pago debe ser mayor a cero.' });
  }

  const orig = await facturaOriginal(req, f.uuid, { exigirPPD: true });
  if (orig.error) return res.status(orig.error.status).json({ ok: false, error: orig.error.msg });
  const receptor = receptorDesdeCfdi(orig.cfdi, datos.receptor || {});
  const errReceptor = validarReceptor(receptor);
  if (errReceptor) {
    return res.status(400).json({ ok: false, error: `No pude obtener los datos fiscales del receptor de la factura original. ${errReceptor}` });
  }

  const clave = await protegerDuplicado(req, res, {
    tipo: 'P', receptorRfc: receptor.rfc, total: round2(monto),
    confirmar: datos.confirmarDuplicado === true,
  });
  if (!clave) return;

  try {
    const fiscalapi = getFiscalapi();
    const rep = construirREP({ ...datos, receptor });
    const r = unwrap(await fiscalapi.invoices.create(rep));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'El PAC rechazó el complemento de pago (REP).',
        details: r.details || '',
        diagnostico: diag(r.data),
      });
    }

    const resumen = resumenCfdi(r.data, req.user);
    resumen.tipo = 'P';
    resumen.pagoDe = f.uuid;
    resumen.total = monto;
    const registro = estadoRegistro(await guardarConRespaldo(req, resumen, r.data), resumen);

    return res.json({
      ok: true,
      mensaje: 'Complemento de pago (REP) timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      total: monto,
      ...registro,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar el complemento de pago.', details: err.message });
  } finally {
    soltarCandado(clave);
  }
});

// ---------- ENVIAR POR CORREO (Fiscalapi manda el PDF + XML) ----------
// Recibe el id de la factura y el correo destino; opcionalmente logo y color.
// OT-0030: antes lo podía llamar cualquiera con sesión (o sin ella) y mandar
// el CFDI de CUALQUIER empresa a CUALQUIER correo usando la cuenta del PAC.
// Ahora exige rol de facturación y que el CFDI sea de la empresa.
invoicesRouter.post('/enviar-correo', requireRolFacturacion, async (req, res) => {
  const { id, email, base64Logo, bandColor, fontColor } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Falta el id de la factura.' });
  const errCorreo = validarCorreo(email);
  if (errCorreo) return res.status(400).json({ ok: false, error: errCorreo });

  const propio = await buscarCfdi(req.token, { fiscalapiId: id });
  if (!propio.ok) return res.status(500).json({ ok: false, error: 'No se pudo verificar el CFDI.' });
  if (!propio.cfdi) return res.status(404).json({ ok: false, error: 'No encontré ese CFDI en tu empresa.' });

  try {
    const fiscalapi = getFiscalapi();
    const sendReq = { invoiceId: id, toEmail: String(email).trim() };
    if (base64Logo) sendReq.base64Logo = base64Logo;
    if (bandColor) sendReq.bandColor = bandColor;
    if (fontColor) sendReq.fontColor = fontColor;
    const r = unwrap(await fiscalapi.invoices.send(sendReq));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        error: r.message || 'No se pudo enviar el correo.',
        details: r.details || '',
        diagnostico: diag(r.data),
      });
    }
    return res.json({ ok: true, mensaje: `Factura enviada a ${String(email).trim()}.` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al enviar el correo.', details: err.message });
  }
});

// ---------- CATÁLOGOS DEL SAT (búsqueda en vivo vía Fiscalapi) ----------
// GET /api/catalogo/:nombre/:q  -> busca en un catálogo del SAT.
// Catálogos útiles: SatProductCodes, SatUnitMeasurements, SatPaymentForms,
// SatCfdiUses, SatTaxRegimes. La búsqueda requiere mínimo 3 caracteres.
invoicesRouter.get('/catalogo/:nombre/:q', requireSesion, async (req, res) => {
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
// OT-0030: acepta CUALQUIER invoice (incluido el emisor y su CSD) tal como
// llega del cliente, y el panel no lo usa (usa /api/facturar). Se deja solo
// para pruebas con Postman/curl en ambiente de PRUEBAS; en producción no existe.
invoicesRouter.post('/timbrar', requireRolFacturacion, async (req, res) => {
  if (!EN_PRUEBAS) {
    return res.status(404).json({ ok: false, error: 'Ruta no disponible en producción. Usa /api/facturar.' });
  }
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
    const registro = estadoRegistro(await guardarConRespaldo(req, resumen, r.data), resumen);

    return res.json({
      ok: true,
      mensaje: 'CFDI timbrado correctamente.',
      uuid: resumen.uuid,
      id: resumen.id,
      ...registro,
      cfdi: resumen,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al timbrar.', details: err.message });
  }
});

// ---------- CANCELAR ----------
invoicesRouter.post('/cancelar', requireRolFacturacion, async (req, res) => {
  const { id, invoiceUuid, cancellationReasonCode, replacementUuid } = req.body || {};
  if (!['01', '02', '03', '04'].includes(String(cancellationReasonCode || ''))) {
    return res
      .status(400)
      .json({ ok: false, error: 'Falta el motivo de cancelación (01, 02, 03 o 04).' });
  }
  if (!id && !invoiceUuid) {
    return res.status(400).json({ ok: false, error: 'Indica el id o el UUID del CFDI a cancelar.' });
  }
  // El motivo 01 (comprobante emitido con errores con relación) exige el UUID
  // de la factura que lo sustituye.
  if (cancellationReasonCode === '01' && !uuidValido(replacementUuid)) {
    return res.status(400).json({ ok: false, error: 'El motivo 01 requiere el UUID de la factura que sustituye.' });
  }

  // OT-0030: ANTES de pedirle al SAT que cancele nada, el CFDI tiene que ser
  // de la empresa del usuario y seguir vigente. Y el UUID que se manda al SAT
  // es el guardado en nuestra base, no el que diga el navegador.
  const propio = await buscarCfdi(req.token, invoiceUuid ? { uuidSat: invoiceUuid } : { fiscalapiId: id });
  if (!propio.ok) return res.status(500).json({ ok: false, error: 'No se pudo verificar el CFDI.' });
  if (!propio.cfdi) return res.status(404).json({ ok: false, error: 'No encontré ese CFDI en tu empresa.' });
  if (propio.cfdi.estatus === 'cancelado') return res.status(409).json({ ok: false, error: 'Ese CFDI ya está cancelado.' });
  const cfdi = propio.cfdi;

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
    if (cfdi.uuid_sat) cancelReq.invoiceUuid = cfdi.uuid_sat;
    else cancelReq.id = cfdi.fiscalapi_id;
    const r = unwrap(await fiscalapi.invoices.cancel(cancelReq));

    if (!r.ok) {
      return res
        .status(r.status || 400)
        .json({ ok: false, error: r.message || 'No se pudo cancelar.', details: r.details || '', diagnostico: diag(r.data) });
    }

    const acuse = r.data?.base64CancellationAcknowledgement || null;
    const cancelResultado = await marcarCfdiCancelado(
      req.token,
      { cfdiId: cfdi.id },
      { acuse, rawActual: cfdi.raw }
    );
    if (!cancelResultado.ok) {
      console.error(`[CFDI CANCELADO SIN ACTUALIZAR] UUID ${cfdi.uuid_sat} cancelado ante el SAT pero no marcado en Postgres:`, cancelResultado.error);
      await markCfdiCancelled(cfdi.fiscalapi_id, { acuse });
      return res.json({
        ok: true,
        mensaje: 'CFDI cancelado ante el SAT.',
        registroActualizado: false,
        aviso: `El CFDI quedó cancelado ante el SAT, pero no se pudo actualizar en el panel (${cancelResultado.error}). Avisa a soporte para marcarlo.`,
        resultado: r.data,
      });
    }

    return res.json({ ok: true, mensaje: 'CFDI cancelado.', registroActualizado: true, resultado: r.data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al cancelar.', details: err.message });
  }
});

// ---------- PDF (devuelve el archivo directo, se abre en el navegador) ----------
invoicesRouter.get('/cfdi/:id/pdf', requireCfdiDeMiEmpresa, async (req, res) => {
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
        diagnostico: diag(raw),
      });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', r.data.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.pdf'}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[pdf] error:', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF.', invoiceId: req.params.id });
  }
});

// ---------- PDF CON LOGO (POST: el logo base64 no cabe en un GET) ----------
// El frontend manda { base64Logo, bandColor, fontColor } y recibe el PDF con marca.
invoicesRouter.post('/cfdi/:id/pdf', requireCfdiDeMiEmpresa, async (req, res) => {
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
        invoiceId: req.params.id, diagnostico: diag(raw),
      });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', r.data.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.pdf'}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[pdf] error:', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF.', invoiceId: req.params.id });
  }
});

// ---------- XML (devuelve el archivo directo) ----------
invoicesRouter.get('/cfdi/:id/xml', requireCfdiDeMiEmpresa, async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const raw = await fiscalapi.invoices.getXml(req.params.id);
    const r = unwrap(raw);
    const b64 = r.data?.base64File || r.data?.base64Content;
    if (!r.ok || !b64) {
      return res.status(r.status || 400).json({ ok: false, error: r.message || 'No se pudo obtener el XML.', details: r.details || '', invoiceId: req.params.id, diagnostico: diag(raw) });
    }
    const buffer = Buffer.from(b64, 'base64');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'cfdi.xml'}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[xml] error:', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener el XML.', invoiceId: req.params.id });
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

invoicesRouter.get('/cfdi/:id/pdf-pro', requireCfdiDeMiEmpresa, async (req, res) => {
  try {
    const xml = await obtenerXmlString(req.params.id);
    const buffer = await generarPdfCfdi(xml, {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CFDI_${req.params.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message, details: err.details || '', invoiceId: req.params.id, diagnostico: diag(err.diagnostico) });
  }
});

invoicesRouter.post('/cfdi/:id/pdf-pro', requireCfdiDeMiEmpresa, async (req, res) => {
  try {
    const { base64Logo, bandColor, marcaNombre } = req.body || {};
    const xml = await obtenerXmlString(req.params.id);
    const buffer = await generarPdfCfdi(xml, { base64Logo, bandColor, marcaNombre });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CFDI_${req.params.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message, details: err.details || '', invoiceId: req.params.id, diagnostico: diag(err.diagnostico) });
  }
});

// ---------- LISTADO (OT-0012) ----------
// Solo lectura, cualquier rol autenticado (vendedor incluido: "Solo lectura
// de facturación y pólizas"). RLS filtra por empresa_id automáticamente.
invoicesRouter.get('/cfdis', async (req, res) => {
  if (!req.user || !req.token) {
    return res.status(401).json({ ok: false, error: 'Falta autenticación.' });
  }
  // OT-0030: ?pagina=2&limite=200 para cargar más; responde también `total`.
  const r = await listarCfdis(req.token, { pagina: req.query.pagina, limite: req.query.limite });
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  return res.json({ ok: true, cfdis: r.cfdis, total: r.total, pagina: r.pagina, limite: r.limite });
});

// ---------- ESTATUS SAT ----------
invoicesRouter.get('/cfdi/:id/status', requireCfdiDeMiEmpresa, async (req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const r = unwrap(await fiscalapi.invoices.getStatus({ id: req.params.id }));
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.message });
    return res.json({ ok: true, estatus: r.data });
  } catch (err) {
    console.error('[status] error:', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar el estatus.' });
  }
});
