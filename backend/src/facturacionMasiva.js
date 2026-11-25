// ============================================================
//  CONTATECK · Backend · Timbrado masivo (OT-0061)
//
//  El timbrado masivo NO es un camino nuevo al PAC: el panel timbra cada factura del lote
//  con el mismo POST /api/facturar de siempre (mismas validaciones, mismo candado contra
//  duplicados, mismo registro en Postgres, mismos permisos). Lo único nuevo en el servidor es
//  esta REVISIÓN PREVIA, que no gasta ningún timbre: valida cada factura del lote con las
//  mismas reglas que /facturar (validarFactura) más dos reglas que antes solo vivían en el
//  formulario del navegador (RFC genérico ⇒ régimen 616; usos D01–D10 solo para personas
//  físicas), para que el usuario vea todos los errores de golpe antes de empezar.
// ============================================================
import { validarFactura, rfcValido } from './validaciones.js';

export const MAX_FACTURAS_LOTE = 50;

const RFC_GENERICOS = ['XAXX010101000', 'XEXX010101000'];
const USO_SOLO_FISICAS = /^D(0[1-9]|10)$/; // c_UsoCFDI: deducciones personales

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export function subtotalDe(factura) {
  return round2((factura.conceptos || []).reduce((s, c) => s + Number(c.cantidad) * Number(c.precioUnitario), 0));
}

// Reglas del formulario que el backend no tenía. Devuelve null o el mensaje.
export function validarReglasDeReceptor(datos) {
  const r = datos.receptor || {};
  const rfc = String(r.rfc || '').toUpperCase().trim();
  const regimen = String(r.regimen || '').trim();
  if (RFC_GENERICOS.includes(rfc) && regimen !== '616') {
    return `El RFC genérico "${rfc}" exige régimen fiscal 616 ("Sin obligaciones fiscales"); el SAT no acepta otro con este RFC.`;
  }
  const uso = String(r.usoCfdi || '').toUpperCase().trim();
  if (uso && USO_SOLO_FISICAS.test(uso) && rfc.length !== 13) {
    return `El uso de CFDI ${uso} solo aplica a personas físicas; este RFC es de persona moral.`;
  }
  return null;
}

// facturas: arreglo de cuerpos de /api/facturar. Devuelve un resultado por factura, en el mismo orden.
export function validarLote(facturas) {
  if (!Array.isArray(facturas) || facturas.length === 0) return { error: 'No hay facturas que revisar.' };
  if (facturas.length > MAX_FACTURAS_LOTE) {
    return { error: `Máximo ${MAX_FACTURAS_LOTE} facturas por lote (el archivo trae ${facturas.length}). Divídelo en varios archivos.` };
  }
  const resultados = facturas.map((f, i) => {
    const base = { indice: i };
    if (!f || typeof f !== 'object') return { ...base, ok: false, error: 'Factura vacía o con formato inválido.' };
    const e = validarFactura(f) || validarReglasDeReceptor(f);
    if (e) return { ...base, ok: false, error: e };
    const subtotal = subtotalDe(f);
    const tasa = f.tasaIva === 'exento' ? 0 : Number(f.tasaIva === undefined ? 16 : f.tasaIva) / 100;
    return { ...base, ok: true, subtotal, total: round2(subtotal * (1 + tasa)) };
  });

  // Aviso (no bloquea): la misma factura repetida dentro del archivo. El candado de /facturar
  // la detendría al timbrar la segunda, pero conviene verlo antes.
  const vistas = new Map();
  resultados.forEach((r, i) => {
    if (!r.ok) return;
    const f = facturas[i];
    const clave = [String(f.receptor.rfc).toUpperCase().trim(), r.subtotal, (f.conceptos || []).map((c) => String(c.descripcion).trim().toLowerCase()).join('|')].join('::');
    if (vistas.has(clave)) r.aviso = `Se parece a la factura ${vistas.get(clave) + 1} de este archivo (mismo cliente, importe y conceptos).`;
    else vistas.set(clave, i);
  });

  const validas = resultados.filter((r) => r.ok);
  return {
    resultados,
    resumen: {
      total: resultados.length,
      validas: validas.length,
      conError: resultados.length - validas.length,
      subtotal: round2(validas.reduce((s, r) => s + r.subtotal, 0)),
      importe: round2(validas.reduce((s, r) => s + r.total, 0)),
    },
  };
}

export { rfcValido };
