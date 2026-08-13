// ============================================================
//  CONTATECK · Backend · Cliente Fiscalapi (PAC)
//  Crea una sola instancia del SDK y la reutiliza.
// ============================================================
import { FiscalapiClient } from 'fiscalapi';
import { config } from './config.js';

let client = null;

export function getFiscalapi() {
  if (client) return client;
  client = FiscalapiClient.create({
    apiUrl: config.fiscalapi.apiUrl,
    apiKey: config.fiscalapi.apiKey,
    tenant: config.fiscalapi.tenant,
  });
  return client;
}

// Fiscalapi a veces regresa "details" como un bloque de JSON crudo con
// varios errores de validación (formato FluentValidation: [{propertyName,
// errorMessage, ...}]) — esto lo convierte en una lista legible en vez de
// enseñar el JSON tal cual (que además se cortaba a la mitad al truncarlo).
function limpiarDetalles(details) {
  if (!details) return '';
  try {
    const parsed = typeof details === 'string' ? JSON.parse(details) : details;
    if (Array.isArray(parsed) && parsed.length && parsed[0].errorMessage) {
      return parsed.map((e) => e.errorMessage).join(' · ');
    }
  } catch (e) {
    // No era JSON de validación — se deja el texto original tal cual.
  }
  return String(details);
}

// Extrae el mensaje de error MÁS ÚTIL posible de una excepción, sin
// importar su forma exacta:
//   - Si Fiscalapi respondió con un cuerpo de error real (err.response.data
//     — típico cuando el SDK usa axios por dentro), se usa ESE, que trae
//     el mensaje real del PAC.
//   - Si no hay nada de eso, se usa err.message como último recurso —
//     aunque sea genérico ("Request failed with status code 400"), es
//     mejor que nada.
export function mensajeDeError(err) {
  const cuerpoReal = err && err.response && err.response.data;
  if (cuerpoReal) {
    return {
      status: cuerpoReal.httpStatusCode || err.response.status || 500,
      error: cuerpoReal.message || 'El PAC rechazó la operación.',
      details: limpiarDetalles(cuerpoReal.details),
    };
  }
  return { status: 500, error: 'Error al timbrar.', details: (err && err.message) || 'Error desconocido.' };
}

// Normaliza la respuesta del SDK (ApiResponse) a algo simple de manejar.
// El SDK regresa: { data, succeeded, message, details, httpStatusCode }
export function unwrap(apiResponse) {
  if (!apiResponse) {
    return { ok: false, status: 500, message: 'Sin respuesta del PAC.', details: '', data: null };
  }
  return {
    ok: apiResponse.succeeded === true,
    status: apiResponse.httpStatusCode || (apiResponse.succeeded ? 200 : 400),
    message: apiResponse.message || '',
    details: limpiarDetalles(apiResponse.details),
    data: apiResponse.data ?? null,
  };
}
