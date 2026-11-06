// ============================================================
//  CONTATECK · Backend · Validaciones de entrada (Contabilidad)
//  OT-0034 · Defensa en profundidad: las funciones de Postgres ya
//  validan lo importante (rol, periodo cerrado, Debe = Haber, saldo
//  al REGISTRAR un pago), pero el backend dejaba pasar cualquier cosa
//  (texto en lugar de número, fechas inválidas, listas enormes) hasta
//  la base. Aquí se corta antes con mensajes claros. Cada función
//  devuelve null si está bien, o el mensaje de error.
// ============================================================
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_IMPORTE = 999999999.99;

export const esUuid = (v) => typeof v === 'string' && UUID.test(v);

export function fechaIsoValida(v) {
  const m = typeof v === 'string' ? FECHA.exec(v) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2100;
}

// Importe positivo con a lo más 2 decimales.
export function importeValido(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 && x <= MAX_IMPORTE && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
}

// Texto opcional con tope de longitud.
function textoOk(v, max) { return v == null || v === '' || (typeof v === 'string' && v.length <= max); }

// Pago de cliente (cobranza) o a proveedor: mismos campos, distinto id de factura/cuenta.
export function validarPago({ facturaId, monto, fechaPago, cuentaId, referencia, notas, comprobanteUrl }) {
  if (!esUuid(facturaId)) return 'La factura no es válida.';
  if (!importeValido(monto)) return 'El monto debe ser mayor a cero y tener máximo 2 decimales.';
  if (!fechaIsoValida(fechaPago)) return 'La fecha del pago no es válida.';
  if (!esUuid(cuentaId)) return 'La cuenta no es válida.';
  if (!textoOk(referencia, 120)) return 'La referencia es demasiado larga (máximo 120 caracteres).';
  if (!textoOk(notas, 500)) return 'Las notas son demasiado largas (máximo 500 caracteres).';
  if (comprobanteUrl != null && comprobanteUrl !== '' && (typeof comprobanteUrl !== 'string' || comprobanteUrl.length > 300 || /(^|\/)\.\.(\/|$)/.test(comprobanteUrl))) {
    return 'La ruta del comprobante no es válida.';
  }
  return null;
}

// Póliza (alta o edición).
export function validarPoliza({ tipo, fecha, concepto, partidas }) {
  if (typeof tipo !== 'string' || !tipo.trim() || tipo.length > 20) return 'El tipo de póliza no es válido.';
  if (!fechaIsoValida(fecha)) return 'La fecha de la póliza no es válida.';
  if (typeof concepto !== 'string' || !concepto.trim()) return 'Falta el concepto de la póliza.';
  if (concepto.length > 500) return 'El concepto es demasiado largo (máximo 500 caracteres).';
  if (!Array.isArray(partidas) || partidas.length < 2) return 'La póliza necesita al menos 2 movimientos.';
  if (partidas.length > 200) return 'La póliza tiene demasiados movimientos (máximo 200).';
  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i] || {};
    const d = Number(p.debe || 0), h = Number(p.haber || 0);
    if (!p.codigo || typeof p.codigo !== 'string') return `El movimiento ${i + 1} no tiene cuenta.`;
    if (!Number.isFinite(d) || !Number.isFinite(h) || d < 0 || h < 0) return `El movimiento ${i + 1} tiene importes no válidos.`;
  }
  return null;
}

export function validarPeriodo(anio, mes) {
  const a = Number(anio), m = Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return 'El año no es válido.';
  if (!Number.isInteger(m) || m < 1 || m > 12) return 'El mes no es válido.';
  return null;
}
