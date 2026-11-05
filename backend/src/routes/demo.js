// ============================================================
//  CONTATECK · Backend · Ruta de DEMOSTRACIÓN
//    GET /api/demo/timbrar  -> timbra una factura de prueba
//    con el CSD público del SAT (sandbox). Pensado para abrirse
//    directo en el navegador y comprobar el flujo de punta a punta.
//  (Esta ruta es solo para pruebas; en producción se quita.)
//
//  OT-0030: antes era pública (cualquiera que conociera la URL podía
//  gastar timbres del PAC). Ahora:
//   · solo existe cuando Fiscalapi está en ambiente de PRUEBAS (en
//     producción responde 404, aunque se olvide quitar la ruta);
//   · exige sesión y rol de facturación, así que ya no se abre "directo en
//     el navegador": hay que llamarla con el token (Authorization: Bearer).
// ============================================================
import { Router } from 'express';
import { getFiscalapi, unwrap } from '../fiscalapi.js';
import { facturaDePrueba } from '../demo-data.js';
import { config } from '../config.js';
import { verifyAuth } from '../supabaseAuth.js';
import { requireRolFacturacion } from './invoices.js';

export const demoRouter = Router();

demoRouter.use((_req, res, next) => {
  if (!config.fiscalapi.apiUrl.includes('test.')) {
    return res.status(404).json({ ok: false, error: 'Ruta no encontrada.' });
  }
  next();
});
demoRouter.use(verifyAuth, requireRolFacturacion);

demoRouter.get('/timbrar', async (_req, res) => {
  try {
    const fiscalapi = getFiscalapi();
    const invoice = facturaDePrueba();
    const r = unwrap(await fiscalapi.invoices.create(invoice));

    if (!r.ok) {
      return res.status(r.status || 400).json({
        ok: false,
        paso: 'timbrado',
        error: r.message || 'El PAC rechazó el timbrado.',
        details: r.details || '',
        ayuda: 'Revisa que tengas suscripción activa y timbres disponibles en Fiscalapi.',
      });
    }

    const d = r.data || {};
    const uuid = d.uuid || d.invoiceUuid || d.taxStamp?.uuid || null;

    return res.json({
      ok: true,
      mensaje: '🎉 ¡Factura de prueba TIMBRADA con éxito! El flujo completo funciona.',
      uuid,
      id: d.id || null,
      total: d.total ?? null,
      emisor: d.issuer?.tin ?? 'EKU9003173C9',
      receptor: d.recipient?.tin ?? 'EKU9003173C9',
      nota: 'Esta factura NO tiene validez fiscal (ambiente de pruebas).',
      siguientePaso: 'Para descargar el PDF/XML usa /api/cfdi/' + (d.id || '<id>') + '/pdf',
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      paso: 'conexión',
      error: err.message,
      ayuda: 'Revisa que las variables FISCALAPI_KEY y FISCALAPI_TENANT estén bien en Railway.',
    });
  }
});
