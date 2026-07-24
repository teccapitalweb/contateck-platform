// ============================================================
//  CONTATECK · Backend de timbrado · Configuración
//  Lee todas las variables de entorno en un solo lugar.
// ============================================================
import 'dotenv/config';

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(v).toLowerCase());
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),

  // ---- Fiscalapi (PAC) ----
  fiscalapi: {
    // PRUEBAS: https://test.fiscalapi.com   ·   PRODUCCIÓN: https://live.fiscalapi.com
    apiUrl: process.env.FISCALAPI_URL || 'https://test.fiscalapi.com',
    apiKey: process.env.FISCALAPI_KEY || '',
    tenant: process.env.FISCALAPI_TENANT || '',
  },

  // ---- Emisor (TU RFC y CSD reales, para PRODUCCIÓN) ----
  // Si NO defines estas variables, el backend usa el CSD público de pruebas
  // (ESCUELA KEMPER URGATE) que está en demo-data.js. Para facturar de verdad,
  // define TODAS estas con tus datos y tu CSD real en base64.
  //   - EMISOR_REGIMEN: persona física suele ser 612 (Act. empresarial/profesional)
  //     o 626 (RESICO). NO uses 601 (ese es de persona moral).
  emisor: {
    rfc: (process.env.EMISOR_RFC || '').toUpperCase().trim(),
    nombre: (process.env.EMISOR_NOMBRE || '').toUpperCase().trim(),
    regimen: process.env.EMISOR_REGIMEN || '',
    cp: process.env.EMISOR_CP || '',
    csdCerBase64: process.env.EMISOR_CSD_CER || '',
    csdKeyBase64: process.env.EMISOR_CSD_KEY || '',
    csdPassword: process.env.EMISOR_CSD_PASSWORD || '',
  },

  // ---- Firebase Admin (opcional al inicio) ----
  // Pega el JSON completo del service account en una sola variable.
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',

  // ---- Seguridad ----
  // Si es true, TODA petición a /api/* exige un idToken de Firebase válido.
  // Déjalo en false para la primera prueba de timbrado; ponlo en true para producción.
  requireAuth: bool(process.env.REQUIRE_AUTH, false),

  // Orígenes permitidos para CORS (separados por coma). Ej: https://teccapitalweb.github.io
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

// Avisos útiles al arrancar (no detienen el servidor)
export function logConfigWarnings(log = console) {
  if (!config.fiscalapi.apiKey || !config.fiscalapi.tenant) {
    log.warn('[config] FALTA FISCALAPI_KEY o FISCALAPI_TENANT — el timbrado fallará hasta configurarlas.');
  }
  if (config.fiscalapi.apiUrl.includes('test.')) {
    log.warn('[config] Fiscalapi en ambiente de PRUEBAS (test). Las facturas NO tienen validez fiscal.');
  }
  const e = config.emisor || {};
  const emisorReal = e.rfc && e.csdCerBase64 && e.csdKeyBase64 && e.csdPassword;
  if (emisorReal) {
    log.warn(`[config] Emisor REAL configurado: ${e.rfc} (régimen ${e.regimen || '—'}). Facturará con TU RFC.`);
  } else {
    log.warn('[config] Sin emisor real (EMISOR_RFC/EMISOR_CSD_*). Se usa el CSD público de PRUEBAS (ESCUELA KEMPER URGATE).');
  }
  if (!config.firebaseServiceAccount) {
    log.warn('[config] Sin FIREBASE_SERVICE_ACCOUNT: no se verifican usuarios ni se guarda en Firestore (modo solo-timbrado).');
  }
  if (config.allowedOrigins.includes('*')) {
    log.warn('[config] CORS abierto a todos los orígenes (*). En producción pon tu dominio en ALLOWED_ORIGINS.');
  }
}
