// ============================================================
//  CONTATECK · Backend · CFDI de nómina (OT-0064)
//  Funciones PURAS (sin red ni base de datos): arman el CFDI 4.0 tipo "N" con el complemento
//  de nómina 1.2 a partir de un renglón de nómina guardado y los datos fiscales del empleado.
//  El PAC (Fiscalapi) recibe el CFDI "por valores"; aquí no se llama a nadie.
//
//  CRITERIOS FISCALES — por validar con un contador (ver OT-0064):
//   · Sueldo base = percepción 001; otras percepciones = 038 (Otros ingresos por salarios); todo gravado.
//   · ISR: deducción 002 = ISR de la tarifa (bruto) y Otros pagos 002 = subsidio aplicado, de modo que
//     (deducción − otro pago) = ISR retenido. Desde mayo de 2024 el excedente del subsidio no se entrega.
//   · IMSS obrero = deducción 001; otras deducciones capturadas a mano = 004.
//  Solo se usa en el ambiente de pruebas del PAC mientras no los valide un contador.
// ============================================================

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// c_PeriodicidadPago del SAT.
export const PERIODICIDAD_SAT = { semanal: '02', catorcenal: '03', quincenal: '04', mensual: '05' };

const RFC_PERSONA_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Datos que el SAT exige y el empleado debe tener capturados. Devuelve la lista (vacía = completo).
export function faltantesEmpleado(emp) {
  const e = emp || {};
  const f = [];
  const rfc = String(e.rfc || '').toUpperCase().trim();
  const curp = String(e.curp || '').toUpperCase().trim();
  if (!RFC_PERSONA_FISICA.test(rfc)) f.push('RFC (13 caracteres)');
  if (!CURP.test(curp)) f.push('CURP (18 caracteres)');
  if (!/^\d{5}$/.test(String(e.cp_fiscal || '').trim())) f.push('código postal fiscal (5 dígitos)');
  if (!String(e.tipo_contrato || '').trim()) f.push('tipo de contrato');
  if (!/^[A-Z]{3}$/.test(String(e.clave_entidad || '').toUpperCase().trim())) f.push('entidad federativa (3 letras)');
  return f;
}

// Desglose del renglón guardado. Devuelve { ok:false, error } si la nómina se guardó sin desglose
// (antes de OT-0064) o si las partes no cuadran con el total de deducciones.
export function desgloseRenglon(r) {
  const base = round2(r.sueldo_base);
  const extras = round2(r.otras_percepciones);
  const ded = round2(r.deducciones);
  const isrRet = num(r.isr_retenido), imss = num(r.imss);
  if (isrRet === null || imss === null) {
    return { ok: false, error: 'Esta nómina se guardó sin el desglose de ISR e IMSS. Vuelve a calcularla y pagarla para poder timbrarla.' };
  }
  const isrBruto = num(r.isr_bruto) === null ? isrRet : round2(r.isr_bruto);
  const subsidioCausado = round2(num(r.subsidio) || 0);
  const otras = round2(num(r.otras_deducciones) || 0);
  const subsidioAplicado = round2(Math.max(0, isrBruto - round2(isrRet)));
  if (Math.abs(round2(isrRet) + round2(imss) + otras - ded) > 0.02) {
    return { ok: false, error: 'El desglose (ISR + IMSS + otras deducciones) no coincide con el total de deducciones del renglón.' };
  }
  const deduccionIsr = round2(round2(isrRet) + subsidioAplicado);
  const totalDeducciones = round2(deduccionIsr + round2(imss) + otras);
  const totalOtrosPagos = subsidioAplicado;
  const totalPercepciones = round2(base + extras);
  return {
    ok: true, base, extras, isrRetenido: round2(isrRet), isrBruto, imss: round2(imss), otras,
    subsidioCausado, subsidioAplicado, deduccionIsr, totalDeducciones, totalOtrosPagos, totalPercepciones,
    neto: round2(totalPercepciones + totalOtrosPagos - totalDeducciones),
  };
}

// Antigüedad en semanas (formato PnW), contada de la fecha de ingreso al fin del periodo, día final incluido.
export function antiguedadSemanas(fechaIngreso, fechaFin) {
  if (!FECHA.test(String(fechaIngreso || '')) || !FECHA.test(String(fechaFin || ''))) return null;
  const d = (new Date(fechaFin + 'T00:00:00Z') - new Date(fechaIngreso + 'T00:00:00Z')) / 86400000 + 1;
  if (!(d > 0)) return null;
  return 'P' + Math.floor(d / 7) + 'W';
}

const hoyDe = (fechaHora) => String(fechaHora || '').slice(0, 10);

// Día (AAAA-MM-DD) en hora de México de una marca de tiempo; null si no es válida.
function diaMexico(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Fecha de pago del CFDI: el día en que se aprobó y pagó la nómina en el sistema (no el día en que se timbra),
// sin ir antes del inicio del periodo ni después de hoy. Si la nómina no trae su fecha de proceso, el fin del
// periodo (recortado a hoy). El sistema no guarda otra fecha de pago.
export function fechaDePago(nomina, hoy) {
  const base = diaMexico(nomina.created_at) || nomina.fecha_fin;
  const f = base < nomina.fecha_inicio ? nomina.fecha_inicio : base;
  return f > hoy ? hoy : f;
}

// Construye la factura de nómina para UN empleado. `contexto`:
//   { nomina, renglon, empleado, emisor, cpExpedicion, fecha, registroPatronal? }
// Devuelve { ok:true, invoice, desglose } o { ok:false, error }.
export function construirCfdiNomina(contexto) {
  const { nomina, renglon, empleado, emisor, cpExpedicion, fecha, registroPatronal } = contexto;
  const falta = faltantesEmpleado(empleado);
  if (falta.length) return { ok: false, error: 'Faltan datos fiscales del empleado: ' + falta.join(', ') + '.' };
  const periodicidad = PERIODICIDAD_SAT[nomina.periodicidad];
  if (!periodicidad) return { ok: false, error: 'Periodicidad de nómina no reconocida: ' + nomina.periodicidad + '.' };
  if (!FECHA.test(String(nomina.fecha_inicio)) || !FECHA.test(String(nomina.fecha_fin))) {
    return { ok: false, error: 'La nómina no tiene fechas de periodo válidas.' };
  }
  const d = desgloseRenglon(renglon);
  if (!d.ok) return d;
  if (!(d.totalPercepciones > 0)) return { ok: false, error: 'El renglón no tiene percepciones que timbrar.' };

  const fechaPago = fechaDePago(nomina, hoyDe(fecha));
  const sdi = num(renglon.sdi);
  const conImss = Boolean(registroPatronal);   // el SAT pide registro patronal cuando se informa el NSS
  const clabe = String(empleado.cuenta_bancaria || '').replace(/\D/g, '');

  const percepciones = [{ earningTypeCode: '001', code: '001', concept: 'Sueldos, Salarios Rayas y Jornal', taxedAmount: d.base, exemptAmount: 0 }];
  if (d.extras > 0) percepciones.push({ earningTypeCode: '038', code: '038', concept: 'Otros ingresos por salarios', taxedAmount: d.extras, exemptAmount: 0 });
  const deducciones = [];
  if (d.imss > 0) deducciones.push({ deductionTypeCode: '001', code: '001', concept: 'Seguridad social', amount: d.imss });
  if (d.deduccionIsr > 0) deducciones.push({ deductionTypeCode: '002', code: '002', concept: 'ISR', amount: d.deduccionIsr });
  if (d.otras > 0) deducciones.push({ deductionTypeCode: '004', code: '004', concept: 'Otras deducciones', amount: d.otras });
  // Para el tipo de régimen 02 (sueldos) el SAT/PAC exige siempre el otro pago 002 (NOM105), aunque sea de 0.00.
  const otrosPagos = [{ otherPaymentTypeCode: '002', code: '002', concept: 'Subsidio para el empleo (efectivamente entregado al trabajador)', amount: d.subsidioAplicado, subsidyCaused: d.subsidioCausado }];

  const employeeData = {
    curp: String(empleado.curp).toUpperCase().trim(),
    satContractTypeId: String(empleado.tipo_contrato).trim(),
    satTaxRegimeTypeId: '02',                       // Sueldos (c_TipoRegimen)
    employeeNumber: String(empleado.numero_empleado || String(empleado.id || '').slice(0, 8) || '1'),
    satPaymentPeriodicityId: periodicidad,
    satPayrollStateId: String(empleado.clave_entidad).toUpperCase().trim(),
  };
  if (conImss && empleado.nss) employeeData.socialSecurityNumber = String(empleado.nss).replace(/\D/g, '');
  if (FECHA.test(String(empleado.fecha_ingreso || ''))) {
    employeeData.laborRelationStartDate = empleado.fecha_ingreso;
    const ant = antiguedadSemanas(empleado.fecha_ingreso, nomina.fecha_fin);
    if (ant) employeeData.seniority = ant;
  }
  if (empleado.tipo_jornada) employeeData.satWorkdayTypeId = String(empleado.tipo_jornada).trim();
  if (empleado.riesgo_puesto) employeeData.satJobRiskId = String(empleado.riesgo_puesto).trim();
  if (empleado.departamento) employeeData.department = String(empleado.departamento).trim().slice(0, 100);
  if (empleado.puesto) employeeData.position = String(empleado.puesto).trim().slice(0, 100);
  if (clabe.length === 18) employeeData.bankAccount = clabe;   // CLABE: no necesita banco
  if (sdi !== null && sdi > 0) { employeeData.baseSalaryForContributions = round2(sdi); employeeData.integratedDailySalary = round2(sdi); }

  const issuer = { ...emisor };
  if (registroPatronal) issuer.employerData = { employerRegistration: String(registroPatronal) };

  const invoice = {
    versionCode: '4.0',
    series: 'NOM',
    date: fecha,
    // El PAC rechaza FormaPago en comprobantes tipo N (CFDI40103): no se manda.
    paymentMethodCode: 'PUE',
    currencyCode: 'MXN',
    typeCode: 'N',
    expeditionZipCode: cpExpedicion,
    exportCode: '01',
    issuer,
    recipient: {
      tin: String(empleado.rfc).toUpperCase().trim(),
      legalName: String(empleado.nombre || renglon.nombre || '').toUpperCase().trim(),
      zipCode: String(empleado.cp_fiscal).trim(),
      taxRegimeCode: '605',                          // Sueldos y salarios e ingresos asimilados a salarios
      cfdiUseCode: 'CN01',                           // Nómina
      employeeData,
    },
    items: [{
      itemCode: '84111505',
      quantity: '1',
      unitOfMeasurementCode: 'ACT',
      description: 'Pago de nómina',
      unitPrice: (d.totalPercepciones + d.totalOtrosPagos).toFixed(2),
      discount: d.totalDeducciones.toFixed(2),
      taxObjectCode: '01',
    }],
    complement: {
      payroll: {
        version: '1.2',
        payrollTypeCode: 'O',
        paymentDate: fechaPago,
        initialPaymentDate: nomina.fecha_inicio,
        finalPaymentDate: nomina.fecha_fin,
        daysPaid: Number(nomina.dias) || 0,
        earnings: { earnings: percepciones, otherPayments: otrosPagos },
        deductions: deducciones,
      },
    },
  };
  return { ok: true, invoice, desglose: d };
}
