// ============================================================
//  CONTATECK · Backend · Validaciones de entrada (Facturación)
//  OT-0030 · El backend ya no confía en lo que manda el navegador:
//  valida formato y rangos ANTES de gastar un timbre en el PAC.
//  Cada función devuelve null si todo está bien, o el mensaje de error.
// ============================================================

const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;   // 12 caracteres
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;  // 13 caracteres
const UUID_SAT = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const TASAS_IVA = ['16', '8', '0', 'exento'];
const METODOS_PAGO = ['PUE', 'PPD'];
const MAX_CONCEPTOS = 100;
const MAX_IMPORTE = 999999999.99;

export function rfcValido(rfc) {
  const r = String(rfc || '').toUpperCase().trim();
  return RFC_MORAL.test(r) || RFC_FISICA.test(r);
}

export function uuidValido(uuid) {
  return UUID_SAT.test(String(uuid || '').trim());
}

// Receptor: datos fiscales completos. Antes el backend rellenaba lo que
// faltara con el receptor de PRUEBAS (ESCUELA KEMPER URGATE, CP 42501,
// régimen 601): en producción eso timbraba a un tercero con datos ajenos.
export function validarReceptor(r) {
  if (!r || typeof r !== 'object') return 'Falta el receptor.';
  if (!rfcValido(r.rfc)) return `El RFC del receptor "${String(r.rfc || '').slice(0, 20)}" no tiene un formato válido.`;
  if (!String(r.nombre || '').trim()) return 'Falta el nombre o razón social del receptor.';
  if (!/^\d{5}$/.test(String(r.cp || '').trim())) return 'Falta el código postal fiscal del receptor (5 dígitos).';
  if (!/^\d{3}$/.test(String(r.regimen || '').trim())) return 'Falta el régimen fiscal del receptor.';
  if (r.usoCfdi !== undefined && !/^[A-Z]{1,2}\d{2}$/.test(String(r.usoCfdi).trim())) {
    return 'El uso de CFDI del receptor no es válido.';
  }
  return null;
}

export function validarConceptos(conceptos) {
  if (!Array.isArray(conceptos) || conceptos.length === 0) return 'Agrega al menos un concepto.';
  if (conceptos.length > MAX_CONCEPTOS) return `Máximo ${MAX_CONCEPTOS} conceptos por factura.`;
  for (let i = 0; i < conceptos.length; i++) {
    const c = conceptos[i] || {};
    const n = i + 1;
    if (!String(c.descripcion || '').trim()) return `El concepto ${n} no tiene descripción.`;
    const cantidad = Number(c.cantidad);
    const precio = Number(c.precioUnitario);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return `La cantidad del concepto ${n} debe ser mayor a cero.`;
    if (!Number.isFinite(precio) || precio <= 0) return `El precio del concepto ${n} debe ser mayor a cero.`;
    if (cantidad * precio > MAX_IMPORTE) return `El importe del concepto ${n} es demasiado grande.`;
  }
  return null;
}

// Retenciones: tasas como decimal (0.106667 = 10.6667%).
function validarRetenciones(ret) {
  if (ret === undefined || ret === null) return null;
  if (typeof ret !== 'object') return 'Las retenciones no tienen un formato válido.';
  for (const k of ['iva', 'isr']) {
    if (ret[k] === undefined || ret[k] === null || ret[k] === '') continue;
    const v = Number(ret[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1) return `La tasa de retención de ${k.toUpperCase()} no es válida.`;
  }
  return null;
}

// Factura de ingreso (POST /api/facturar).
export function validarFactura(datos) {
  const e = validarReceptor(datos.receptor) || validarConceptos(datos.conceptos);
  if (e) return e;
  if (datos.tasaIva !== undefined && !TASAS_IVA.includes(String(datos.tasaIva))) {
    return 'La tasa de IVA no es válida (16, 8, 0 o exento).';
  }
  if (datos.metodoPago !== undefined && !METODOS_PAGO.includes(String(datos.metodoPago))) {
    return 'El método de pago debe ser PUE o PPD.';
  }
  if (datos.formaPago !== undefined && !/^\d{2}$/.test(String(datos.formaPago))) {
    return 'La forma de pago no es válida.';
  }
  return validarRetenciones(datos.retenciones);
}

export function validarCorreo(email) {
  const s = String(email || '').trim();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Correo del destinatario inválido.';
  return null;
}
