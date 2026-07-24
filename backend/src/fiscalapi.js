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
    details: apiResponse.details || '',
    data: apiResponse.data ?? null,
  };
}
