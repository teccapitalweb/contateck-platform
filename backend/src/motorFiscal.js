// ============================================================
//  CONTATECK · Motor Fiscal · Pieza 1: Factor de Integración y SDI
//
//  ⚠ ESPEJO: este archivo existe en DOS lugares y deben ser
//  idénticos — backend/src/motorFiscal.js (para el timbrado real)
//  y frontend/motorFiscal.js (para el Simulador Fiscal). Si
//  actualizas tablas (ISR/UMA/SM/CEAV cambian cada año), copia
//  el archivo completo a AMBOS destinos.
//
//  Basado en la Ley Federal del Trabajo (LFT) vigente (reforma
//  2023+). Funciona como módulo ES puro, sin dependencias — se
//  puede usar en backend (Node.js) y frontend (navegador).
//
//  Reglas de negocio:
//    - Aguinaldo: 15 días (Art. 87 LFT, mínimo legal).
//    - Prima vacacional: 25% (Art. 80 LFT, mínimo legal).
//    - Días de vacaciones: según antigüedad (Art. 76 LFT,
//      reforma 2023: primer año = 12 días, +2 por año hasta
//      el 5to, después +2 cada 5 años).
//
//  Fórmula:
//    Factor = 1 + (aguinaldo / 365) + ((vacaciones × prima) / 365)
//    SDI = salario_diario × factor
//
//  Validado contra el dictamen de contabilidad:
//    $6,000/mes → $200/día → 1 año → factor 1.0493 → SDI $209.86
// ============================================================

// ---------- Tabla de vacaciones (Art. 76 LFT, reforma 2023) ----------
// Después del año 5, se incrementa 2 días cada 5 años de servicio.
const VACACIONES_POR_ANIO = {
  1: 12, 2: 14, 3: 16, 4: 18, 5: 20,
};

/**
 * Devuelve los días de vacaciones que corresponden según la antigüedad.
 * @param {number} aniosAntiguedad — años completos de servicio (≥1).
 * @returns {number} días de vacaciones.
 */
export function diasVacaciones(aniosAntiguedad) {
  const anios = Math.max(1, Math.floor(aniosAntiguedad));
  if (anios <= 5) return VACACIONES_POR_ANIO[anios];
  // A partir del año 6, se suman 2 días cada 5 años sobre la base de 20.
  const quinqueniosExtra = Math.floor((anios - 1) / 5); // año 6-10 = 1, 11-15 = 2, etc.
  return 20 + (quinqueniosExtra * 2);
}

// ---------- Constantes legales (mínimos de ley) ----------
const DIAS_AGUINALDO = 15;
const PRIMA_VACACIONAL = 0.25;
const DIAS_DEL_ANIO = 365;

/**
 * Calcula el factor de integración según la LFT.
 * @param {number} aniosAntiguedad — años completos de servicio.
 * @param {object} [opciones] — permite sobreescribir los mínimos de ley
 *   si una empresa da más (ej. 20 días de aguinaldo en vez de 15).
 *   { aguinaldo: 15, primaVacacional: 0.25 }
 * @returns {number} factor redondeado a 4 decimales.
 */
export function factorIntegracion(aniosAntiguedad, opciones) {
  const opts = opciones || {};
  const aguinaldo = opts.aguinaldo || DIAS_AGUINALDO;
  const prima = opts.primaVacacional != null ? opts.primaVacacional : PRIMA_VACACIONAL;
  const vacaciones = diasVacaciones(aniosAntiguedad);

  const factor = 1 + (aguinaldo / DIAS_DEL_ANIO) + ((vacaciones * prima) / DIAS_DEL_ANIO);
  return Math.round(factor * 10000) / 10000; // 4 decimales
}

/**
 * Calcula el Salario Diario Integrado (SDI).
 * @param {number} salarioDiario — salario diario base (sin integrar).
 * @param {number} aniosAntiguedad — años completos de servicio.
 * @param {object} [opciones] — mismas opciones que factorIntegracion.
 * @returns {{ factor: number, sdi: number, vacaciones: number }}
 */
export function calcularSDI(salarioDiario, aniosAntiguedad, opciones) {
  const factor = factorIntegracion(aniosAntiguedad, opciones);
  const sdi = Math.round(salarioDiario * factor * 100) / 100; // 2 decimales para pesos
  return {
    salarioDiario,
    aniosAntiguedad,
    vacaciones: diasVacaciones(aniosAntiguedad),
    factor,
    sdi,
  };
}

// ============================================================
//  PIEZA 2 · ISR y Subsidio al Empleo
//
//  Tarifas del Anexo 8 de la RMF 2026 (DOF 28-dic-2025) — se
//  actualizan cada año que la inflación acumulada rebase 10%.
//  Estructura versionada por año para que actualizar sea pegar
//  la tabla nueva, sin tocar lógica.
//
//  SUBSIDIO — dos mecánicas soportadas:
//   · "vigente" (default): desde may-2024 es cuota fija mensual
//     = UMA mensual × % del decreto (2026: 15.02%, tope de
//     ingreso mensual $11,492.66). Periodos < 1 mes: entre 30.4
//     × días. El excedente sobre el ISR NO se entrega.
//   · "tabla-2023": la tabla de rangos derogada (vigente hasta
//     abr-2024). Se conserva SOLO como referencia/comparación —
//     es la que usó contabilidad en su ejemplo ($145.35).
// ============================================================

// ---------- Tarifas ISR (Anexo 8 RMF) ----------
export const TARIFAS_ISR = {
  2026: {
    quincenal: [
      { li: 0.01,      ls: 416.70,     cuota: 0.00,     pct: 0.0192 },
      { li: 416.71,    ls: 3537.15,    cuota: 7.95,     pct: 0.0640 },
      { li: 3537.16,   ls: 6216.15,    cuota: 207.75,   pct: 0.1088 },
      { li: 6216.16,   ls: 7225.95,    cuota: 499.20,   pct: 0.1600 },
      { li: 7225.96,   ls: 8651.40,    cuota: 660.75,   pct: 0.1792 },
      { li: 8651.41,   ls: 17448.75,   cuota: 916.20,   pct: 0.2136 },
      { li: 17448.76,  ls: 27501.60,   cuota: 2795.25,  pct: 0.2352 },
      { li: 27501.61,  ls: 52505.25,   cuota: 5159.70,  pct: 0.3000 },
      { li: 52505.26,  ls: 70006.95,   cuota: 12660.75, pct: 0.3200 },
      { li: 70006.96,  ls: 210020.70,  cuota: 18261.30, pct: 0.3400 },
      { li: 210020.71, ls: Infinity,   cuota: 65866.05, pct: 0.3500 },
    ],
    mensual: [
      { li: 0.01,      ls: 844.59,     cuota: 0.00,      pct: 0.0192 },
      { li: 844.60,    ls: 7168.51,    cuota: 16.22,     pct: 0.0640 },
      { li: 7168.52,   ls: 12598.02,   cuota: 420.95,    pct: 0.1088 },
      { li: 12598.03,  ls: 14644.64,   cuota: 1011.68,   pct: 0.1600 },
      { li: 14644.65,  ls: 17533.64,   cuota: 1339.14,   pct: 0.1792 },
      { li: 17533.65,  ls: 35362.83,   cuota: 1856.84,   pct: 0.2136 },
      { li: 35362.84,  ls: 55736.68,   cuota: 5665.16,   pct: 0.2352 },
      { li: 55736.69,  ls: 106410.50,  cuota: 10457.09,  pct: 0.3000 },
      { li: 106410.51, ls: 141880.66,  cuota: 25659.23,  pct: 0.3200 },
      { li: 141880.67, ls: 425641.99,  cuota: 37009.69,  pct: 0.3400 },
      { li: 425642.00, ls: Infinity,   cuota: 133488.54, pct: 0.3500 },
    ],
    semanal: [
      { li: 0.01,     ls: 194.46,    cuota: 0.00,     pct: 0.0192 },
      { li: 194.47,   ls: 1650.67,   cuota: 3.71,     pct: 0.0640 },
      { li: 1650.68,  ls: 2900.87,   cuota: 96.95,    pct: 0.1088 },
      { li: 2900.88,  ls: 3372.11,   cuota: 232.96,   pct: 0.1600 },
      { li: 3372.12,  ls: 4037.32,   cuota: 308.35,   pct: 0.1792 },
      { li: 4037.33,  ls: 8142.75,   cuota: 427.56,   pct: 0.2136 },
      { li: 8142.76,  ls: 12834.08,  cuota: 1304.45,  pct: 0.2352 },
      { li: 12834.09, ls: 24502.45,  cuota: 2407.86,  pct: 0.3000 },
      { li: 24502.46, ls: 32669.91,  cuota: 5908.35,  pct: 0.3200 },
      { li: 32669.92, ls: 98009.66,  cuota: 8521.94,  pct: 0.3400 },
      { li: 98009.67, ls: Infinity,  cuota: 30737.49, pct: 0.3500 },
    ],
    // Catorcenal: el Anexo 8 NO publica tarifa de 14 días — la práctica
    // estándar (Art. 96 LISR, proporcionalidad) es derivarla de la
    // tarifa diaria × 14, que equivale exactamente a la semanal × 2.
    catorcenal: [
      { li: 0.01,      ls: 388.92,    cuota: 0.00,     pct: 0.0192 },
      { li: 388.93,    ls: 3301.34,   cuota: 7.42,     pct: 0.0640 },
      { li: 3301.35,   ls: 5801.74,   cuota: 193.90,   pct: 0.1088 },
      { li: 5801.75,   ls: 6744.22,   cuota: 465.92,   pct: 0.1600 },
      { li: 6744.23,   ls: 8074.64,   cuota: 616.70,   pct: 0.1792 },
      { li: 8074.65,   ls: 16285.50,  cuota: 855.12,   pct: 0.2136 },
      { li: 16285.51,  ls: 25668.16,  cuota: 2608.90,  pct: 0.2352 },
      { li: 25668.17,  ls: 49004.90,  cuota: 4815.72,  pct: 0.3000 },
      { li: 49004.91,  ls: 65339.82,  cuota: 11816.70, pct: 0.3200 },
      { li: 65339.83,  ls: 196019.32, cuota: 17043.88, pct: 0.3400 },
      { li: 196019.33, ls: Infinity,  cuota: 61474.98, pct: 0.3500 },
    ],
  },
};

// ---------- Subsidio al empleo · mecánica VIGENTE (decreto) ----------
export const SUBSIDIO_VIGENTE = {
  2026: {
    umaMensual: 3566.22,        // UMA 2026 (INEGI, vigente desde 01-feb-2026)
    pct: 0.1502,                // 15.02% (feb-dic 2026; enero fue 15.59% transitorio)
    topeIngresoMensual: 11492.66, // ingreso mensual máximo para tener derecho
  },
};

// ---------- Subsidio al empleo · tabla DEROGADA (referencia) ----------
// Vigente hasta abril 2024. Se conserva para comparar contra cálculos
// hechos "a la antigua" (como el ejemplo de contabilidad). NO usar como
// default en cálculos reales.
export const SUBSIDIO_TABLA_2023 = {
  quincenal: [
    { hasta: 872.85,   subsidio: 200.85 },
    { hasta: 1309.20,  subsidio: 200.70 },
    { hasta: 1713.60,  subsidio: 200.70 },
    { hasta: 1745.70,  subsidio: 193.80 },
    { hasta: 2193.75,  subsidio: 188.70 },
    { hasta: 2327.55,  subsidio: 174.75 },
    { hasta: 2632.65,  subsidio: 160.35 },
    { hasta: 3071.40,  subsidio: 145.35 },
    { hasta: 3510.15,  subsidio: 125.10 },
    { hasta: 3642.60,  subsidio: 107.40 },
    { hasta: Infinity, subsidio: 0.00 },
  ],
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ISR bruto (antes de subsidio) según la tarifa del Anexo 8.
 * @param {number} baseGravable — ingreso gravado del periodo.
 * @param {"quincenal"|"mensual"} periodo
 * @param {number} [anio=2026]
 * @returns {{ isrBruto:number, renglon:object }}
 */
export function isrBruto(baseGravable, periodo, anio = 2026) {
  const tabla = TARIFAS_ISR[anio] && TARIFAS_ISR[anio][periodo];
  if (!tabla) throw new Error(`Sin tarifa ISR para ${periodo} ${anio} — agregar al catálogo TARIFAS_ISR.`);
  const r = tabla.find((x) => baseGravable >= x.li && baseGravable <= x.ls);
  if (!r) throw new Error(`Base gravable ${baseGravable} fuera de tarifa ${periodo} ${anio}.`);
  return { isrBruto: round2(r.cuota + (baseGravable - r.li) * r.pct), renglon: r };
}

/**
 * Subsidio al empleo del periodo con la mecánica VIGENTE (decreto):
 * cuota fija mensual (UMA × %), proporcional a días (÷30.4 × días),
 * con tope al monto mensual, y SOLO si el ingreso mensual ordinario
 * no rebasa el tope del decreto.
 */
export function subsidioVigente(ingresoMensualOrdinario, dias, anio = 2026) {
  const cfg = SUBSIDIO_VIGENTE[anio];
  if (!cfg) throw new Error(`Sin parámetros de subsidio para ${anio}.`);
  if (ingresoMensualOrdinario > cfg.topeIngresoMensual) return 0;
  const mensual = cfg.umaMensual * cfg.pct;
  const delPeriodo = (mensual / 30.4) * dias;
  return round2(Math.min(delPeriodo, mensual));
}

/** Subsidio con la tabla derogada (solo comparación/referencia). */
export function subsidioTabla2023(baseGravable, periodo) {
  const tabla = SUBSIDIO_TABLA_2023[periodo];
  if (!tabla) throw new Error(`Sin tabla 2023 para periodo ${periodo}.`);
  const r = tabla.find((x) => baseGravable <= x.hasta);
  return r ? r.subsidio : 0;
}

/**
 * Cálculo completo de ISR del periodo.
 * @param {object} p
 * @param {number} p.baseGravable — ingreso gravado del periodo.
 * @param {"quincenal"|"mensual"} p.periodo
 * @param {number} p.dias — días del periodo (15 quincenal, 30.4 mensual...).
 * @param {number} p.ingresoMensualOrdinario — para el tope del subsidio.
 * @param {number} [p.anio=2026]
 * @param {"vigente"|"tabla-2023"} [p.mecanicaSubsidio="vigente"]
 * @returns {{ isrBruto, subsidio, isrRetenido, mecanica }}
 *  isrRetenido = max(isrBruto - subsidio, 0). Desde may-2024 el
 *  excedente de subsidio NO se entrega al trabajador.
 */
export function calcularISR(p) {
  const anio = p.anio || 2026;
  const mecanica = p.mecanicaSubsidio || "vigente";
  const { isrBruto: bruto } = isrBruto(p.baseGravable, p.periodo, anio);
  const subsidio = mecanica === "tabla-2023"
    ? subsidioTabla2023(p.baseGravable, p.periodo)
    : subsidioVigente(p.ingresoMensualOrdinario, p.dias, anio);
  const retenido = round2(Math.max(bruto - subsidio, 0));
  return { isrBruto: bruto, subsidio, isrRetenido: retenido, mecanica };
}

// ============================================================
//  PIEZA 3 · IMSS Cuota Obrera (lo que se retiene al trabajador)
//
//  Tasas de la Ley del Seguro Social — estables desde 1997 (no
//  cambian cada año). Todas aplican sobre el Salario Base de
//  Cotización (SBC = SDI, topado a 25 UMA):
//   · Enf. y Mat. prestaciones en dinero (art. 107):   0.250%
//   · Enf. y Mat. gastos médicos pensionados (art. 25): 0.375%
//   · Invalidez y vida (art. 147):                      0.625%
//   · Cesantía en edad avanzada y vejez (art. 168):     1.125%
//   Suma fija: 2.375% del SBC del periodo.
//   · Excedente (art. 106-II): +0.40% pero SOLO sobre la parte
//     del SDI que rebase 3 UMA (los sueldos bajos no lo pagan).
//
//  Redondeo: los conceptos se suman con precisión completa y se
//  redondea UNA vez al final (así cuadra el $74.76 del dictamen
//  de contabilidad; redondear cada concepto daría $74.75).
// ============================================================

export const UMA_DIARIA = {
  2026: 117.31, // INEGI, vigente desde 01-feb-2026
};
export const TOPE_SBC_UMAS = 25; // tope legal del SBC (art. 28 LSS)

export const IMSS_OBRERO = {
  prestacionesDinero: 0.0025,
  gastosMedicosPension: 0.00375,
  invalidezVida: 0.00625,
  cesantiaVejez: 0.01125,
  excedente3Uma: 0.0040,
};

/**
 * Cuota obrera IMSS del periodo (lo que se retiene al trabajador).
 * @param {object} p
 * @param {number} p.sdi — Salario Diario Integrado (de calcularSDI).
 * @param {number} p.dias — días del periodo.
 * @param {number} [p.anio=2026]
 * @returns {{ base, excedenteBase, cuotaExcedente, total }}
 */
export function cuotaObreroIMSS(p) {
  const anio = p.anio || 2026;
  const uma = UMA_DIARIA[anio];
  if (!uma) throw new Error(`Sin UMA registrada para ${anio} — agregar a UMA_DIARIA.`);

  // SBC topado a 25 UMA (sueldos muy altos cotizan solo hasta el tope).
  const sdiTopado = Math.min(p.sdi, uma * TOPE_SBC_UMAS);
  const base = sdiTopado * p.dias;

  const pctFijo = IMSS_OBRERO.prestacionesDinero + IMSS_OBRERO.gastosMedicosPension +
    IMSS_OBRERO.invalidezVida + IMSS_OBRERO.cesantiaVejez; // 2.375%
  let total = base * pctFijo;

  // Excedente: 0.40% solo sobre la parte del SDI que rebase 3 UMA.
  let cuotaExcedente = 0;
  let excedenteBase = 0;
  if (sdiTopado > 3 * uma) {
    excedenteBase = (sdiTopado - 3 * uma) * p.dias;
    cuotaExcedente = excedenteBase * IMSS_OBRERO.excedente3Uma;
    total += cuotaExcedente;
  }

  return {
    base: round2(base),
    excedenteBase: round2(excedenteBase),
    cuotaExcedente: round2(cuotaExcedente),
    total: round2(total),
  };
}

// ============================================================
//  PIEZA 4 · IMSS Cuota Patronal (lo que paga la empresa)
//
//  Tasas fijas de la LSS (no cambian por año):
//   · EyM cuota fija (art. 106-I): 20.40% de UNA UMA diaria × días
//     (por asegurado, sin importar su sueldo).
//   · EyM excedente (art. 106-II): 1.10% sobre (SDI − 3 UMA).
//   · EyM prestaciones en dinero: 0.70% del SBC.
//   · Gastos médicos pensionados: 1.05% del SBC.
//   · Invalidez y vida: 1.75% del SBC.
//   · Retiro: 2.00% del SBC.
//   · Guarderías y prest. sociales: 1.00% del SBC.
//   · Riesgo de trabajo: la PRIMA de cada empresa (parámetro).
//
//  La ÚNICA que cambia cada año (reforma de pensiones DOF
//  16-dic-2020, sube gradual 2023→2030): Cesantía y Vejez
//  patronal, por rango salarial. Tabla 2026 abajo.
//
//  NOTA: Infonavit (5% del SBC) es de OTRO instituto — se
//  calcula aparte en el resultado, NO va dentro del total IMSS.
// ============================================================

export const SALARIO_MINIMO_DIARIO = {
  2026: 315.04, // general; zona libre frontera norte es distinto (configurable a futuro)
};

// Primas medias de Riesgo de Trabajo por clase (art. 73 LSS) —
// referencia para empresas nuevas; cada empresa tiene SU prima real.
export const PRIMAS_RIESGO_CLASE = {
  I: 0.0054355, II: 0.0113065, III: 0.0259840, IV: 0.0465325, V: 0.0758875,
};

export const IMSS_PATRONAL = {
  cuotaFijaUma: 0.2040,
  excedente3Uma: 0.0110,
  prestacionesDinero: 0.0070,
  gastosMedicosPension: 0.0105,
  invalidezVida: 0.0175,
  retiro: 0.0200,
  guarderias: 0.0100,
};
export const INFONAVIT_PATRONAL = 0.05; // instituto aparte, se reporta separado

// Cesantía y Vejez patronal 2026 (DOF 16-dic-2020, 4to escalón).
// Rangos en UMAs del SDI; el renglón de salario mínimo (≤ 1 SM) se
// resuelve aparte con SALARIO_MINIMO_DIARIO (protección al SM).
export const CEAV_PATRONAL = {
  2026: {
    salarioMinimoPct: 0.03150,
    rangos: [
      { hastaUma: 1.50, pct: 0.03676 },
      { hastaUma: 2.00, pct: 0.04851 },
      { hastaUma: 2.50, pct: 0.05556 },
      { hastaUma: 3.00, pct: 0.06026 },
      { hastaUma: 3.50, pct: 0.06361 },
      { hastaUma: 4.00, pct: 0.06613 },
      { hastaUma: Infinity, pct: 0.07513 },
    ],
  },
};

/** Tasa CEAV patronal según el SDI (con protección de salario mínimo). */
export function tasaCeavPatronal(sdi, anio = 2026) {
  const cfg = CEAV_PATRONAL[anio];
  if (!cfg) throw new Error(`Sin tabla CEAV patronal para ${anio}.`);
  const sm = SALARIO_MINIMO_DIARIO[anio];
  if (sm && sdi <= sm) return cfg.salarioMinimoPct;
  const umas = sdi / UMA_DIARIA[anio];
  const r = cfg.rangos.find((x) => umas <= x.hastaUma);
  return r.pct;
}

/**
 * Cuota patronal IMSS del periodo (+ Infonavit reportado aparte).
 * @param {object} p
 * @param {number} p.sdi — Salario Diario Integrado.
 * @param {number} p.dias — días del periodo.
 * @param {number} p.primaRiesgo — prima de RT de la empresa (fracción,
 *   ej. 0.0054355 para Clase I). Obligatoria: cada empresa tiene la suya.
 * @param {number} [p.anio=2026]
 * @param {number} [p.ceavPctOverride] — SOLO para simulaciones/comparar
 *   contra cálculos externos; en producción usar la tabla oficial.
 * @returns desglose por ramo + total IMSS + infonavit (aparte)
 */
export function cuotaPatronalIMSS(p) {
  const anio = p.anio || 2026;
  const uma = UMA_DIARIA[anio];
  if (!uma) throw new Error(`Sin UMA registrada para ${anio}.`);
  if (p.primaRiesgo == null) throw new Error('Falta primaRiesgo (fracción, ej. 0.0054355 Clase I).');

  const sdiTopado = Math.min(p.sdi, uma * TOPE_SBC_UMAS);
  const base = sdiTopado * p.dias;

  const cuotaFija = uma * IMSS_PATRONAL.cuotaFijaUma * p.dias;
  const excedente = sdiTopado > 3 * uma
    ? (sdiTopado - 3 * uma) * p.dias * IMSS_PATRONAL.excedente3Uma : 0;
  const prestDinero = base * IMSS_PATRONAL.prestacionesDinero;
  const gmp = base * IMSS_PATRONAL.gastosMedicosPension;
  const iv = base * IMSS_PATRONAL.invalidezVida;
  const riesgoTrabajo = base * p.primaRiesgo;
  const guarderias = base * IMSS_PATRONAL.guarderias;
  const retiro = base * IMSS_PATRONAL.retiro;
  const ceavPct = p.ceavPctOverride != null ? p.ceavPctOverride : tasaCeavPatronal(sdiTopado, anio);
  const ceav = base * ceavPct;

  const total = cuotaFija + excedente + prestDinero + gmp + iv + riesgoTrabajo + guarderias + retiro + ceav;

  return {
    base: round2(base),
    cuotaFija: round2(cuotaFija),
    excedente: round2(excedente),
    prestDinero: round2(prestDinero),
    gmp: round2(gmp),
    iv: round2(iv),
    riesgoTrabajo: round2(riesgoTrabajo),
    guarderias: round2(guarderias),
    retiro: round2(retiro),
    ceavPct,
    ceav: round2(ceav),
    total: round2(total),
    infonavit: round2(base * INFONAVIT_PATRONAL), // aparte, no va en total
  };
}

// ============================================================
//  PRUEBAS INTERNAS (se ejecutan al correr este archivo directo)
//  node --input-type=module motorFiscal.js
// ============================================================
function test() {
  const VERDE = "\x1b[32m✓\x1b[0m";
  const ROJO = "\x1b[31m✗\x1b[0m";
  let ok = 0, fail = 0;

  function assert(nombre, obtenido, esperado) {
    if (obtenido === esperado) {
      console.log(`  ${VERDE} ${nombre}: ${obtenido}`);
      ok++;
    } else {
      console.log(`  ${ROJO} ${nombre}: obtuvo ${obtenido}, esperaba ${esperado}`);
      fail++;
    }
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  CONTATECK · Motor Fiscal · Pruebas");
  console.log("══════════════════════════════════════════════\n");

  // ---------- Tabla de vacaciones ----------
  console.log("Días de vacaciones por antigüedad:");
  assert("1 año",  diasVacaciones(1),  12);
  assert("2 años", diasVacaciones(2),  14);
  assert("3 años", diasVacaciones(3),  16);
  assert("4 años", diasVacaciones(4),  18);
  assert("5 años", diasVacaciones(5),  20);
  assert("6 años", diasVacaciones(6),  22);
  assert("10 años", diasVacaciones(10), 22);
  assert("11 años", diasVacaciones(11), 24);
  assert("15 años", diasVacaciones(15), 24);
  assert("16 años", diasVacaciones(16), 26);
  assert("20 años", diasVacaciones(20), 26);
  assert("25 años", diasVacaciones(25), 28);
  assert("30 años", diasVacaciones(30), 30);

  // ---------- Caso de prueba validado por contabilidad ----------
  console.log("\nCaso contabilidad: $6,000/mes, 1 año:");
  const salarioDiario = 6000 / 30;
  const r = calcularSDI(salarioDiario, 1);
  assert("Salario diario", r.salarioDiario, 200);
  assert("Vacaciones", r.vacaciones, 12);
  assert("Factor", r.factor, 1.0493);
  assert("SDI", r.sdi, 209.86);

  // ---------- Caso extra: 5 años de antigüedad ----------
  console.log("\nCaso extra: $6,000/mes, 5 años:");
  const r2 = calcularSDI(200, 5);
  // Factor: 1 + 15/365 + (20*0.25)/365 = 1 + 0.04109 + 0.01370 = 1.0548
  assert("Vacaciones 5 años", r2.vacaciones, 20);
  assert("Factor 5 años", r2.factor, 1.0548);
  assert("SDI 5 años", r2.sdi, 210.96);

  // ---------- Caso extra: empresa con prestaciones superiores ----------
  console.log("\nCaso prestaciones superiores: 20 días aguinaldo, 30% prima:");
  const r3 = calcularSDI(200, 1, { aguinaldo: 20, primaVacacional: 0.30 });
  // Factor: 1 + 20/365 + (12*0.30)/365 = 1 + 0.05479 + 0.00986 = 1.0647
  assert("Factor sup.", r3.factor, 1.0647);

  // ══════════ PIEZA 2 · ISR y Subsidio ══════════

  // ---------- ISR bruto con tarifa quincenal 2026 ----------
  console.log("\nISR bruto quincenal 2026 ($3,000 gravados):");
  const b = isrBruto(3000, "quincenal", 2026);
  // Renglón 2: 7.95 + (3000 - 416.71) × 6.40% = 7.95 + 165.33 = 173.28
  assert("ISR bruto", b.isrBruto, 173.28);

  // ---------- Reproducir EXACTO el cálculo de contabilidad ----------
  // (mecánica de subsidio con tabla derogada, como calculó ella)
  console.log("\nReproducción del ejemplo de contabilidad (tabla-2023):");
  const conta = calcularISR({
    baseGravable: 3000, periodo: "quincenal", dias: 15,
    ingresoMensualOrdinario: 6000, mecanicaSubsidio: "tabla-2023",
  });
  assert("Subsidio (tabla vieja)", conta.subsidio, 145.35);
  assert("ISR retenido (= conta)", conta.isrRetenido, 27.93);

  // ---------- Mismo caso con la mecánica VIGENTE (sep-2026) ----------
  console.log("\nMismo caso con mecánica vigente (decreto UMA 15.02%):");
  const hoy = calcularISR({
    baseGravable: 3000, periodo: "quincenal", dias: 15,
    ingresoMensualOrdinario: 6000,
  });
  // Subsidio quincenal: (3566.22 × 0.1502) ÷ 30.4 × 15 = 264.30
  assert("Subsidio vigente", hoy.subsidio, 264.30);
  // 173.28 - 264.30 < 0 → retención $0 (el excedente no se entrega)
  assert("ISR retenido vigente", hoy.isrRetenido, 0);

  // ---------- Tope de ingreso: sueldo alto NO recibe subsidio ----------
  console.log("\nSueldo alto ($30,000/mes, mensual) — sin subsidio:");
  const alto = calcularISR({
    baseGravable: 30000, periodo: "mensual", dias: 30.4,
    ingresoMensualOrdinario: 30000,
  });
  assert("Subsidio (sobre tope)", alto.subsidio, 0);
  // 1,856.84 + (30,000 - 17,533.65) × 21.36% = 4,519.65
  assert("ISR retenido", alto.isrRetenido, 4519.65);

  // ---------- Tarifa SEMANAL 2026 (operación viernes-jueves) ----------
  console.log("\nISR semanal 2026 ($1,400/semana = $200 diario):");
  const sem = calcularISR({
    baseGravable: 1400, periodo: "semanal", dias: 7,
    ingresoMensualOrdinario: 6000,
  });
  // Bruto: 3.71 + (1,400 − 194.47) × 6.40% = 80.86
  assert("ISR bruto semanal", sem.isrBruto, 80.86);
  // Subsidio 7 días: (3,566.22 × 15.02%) ÷ 30.4 × 7 = 123.34 > ISR → $0
  assert("Subsidio semanal", sem.subsidio, 123.34);
  assert("ISR retenido semanal", sem.isrRetenido, 0);

  console.log("\nISR semanal, sueldo alto ($4,000/semana — caso Alondra):");
  const sem2 = calcularISR({
    baseGravable: 4000, periodo: "semanal", dias: 7,
    ingresoMensualOrdinario: 17142.86, // 4000/7×30 > tope → sin subsidio
  });
  // Renglón 17.92%: 308.35 + (4,000 − 3,372.12) × 17.92% = 420.87
  assert("ISR bruto $4,000/sem", sem2.isrBruto, 420.87);
  assert("Sin subsidio (sobre tope)", sem2.subsidio, 0);
  assert("ISR retenido", sem2.isrRetenido, 420.87);

  console.log("\nISR catorcenal (derivada, $2,800 = $200 × 14 días):");
  const cat = calcularISR({
    baseGravable: 2800, periodo: "catorcenal", dias: 14,
    ingresoMensualOrdinario: 6000,
  });
  // 7.42 + (2,800 − 388.93) × 6.40% = 161.73; subsidio 14 días = 246.68 → $0
  assert("ISR bruto catorcenal", cat.isrBruto, 161.73);
  assert("Subsidio catorcenal", cat.subsidio, 246.68);
  assert("ISR retenido", cat.isrRetenido, 0);

  // ══════════ PIEZA 3 · IMSS Cuota Obrera ══════════

  // ---------- Caso contabilidad: SDI $209.86, 15 días ----------
  console.log("\nIMSS obrero, caso contabilidad (SDI $209.86 × 15 días):");
  const imssConta = cuotaObreroIMSS({ sdi: 209.86, dias: 15 });
  assert("Base (SBC quincenal)", imssConta.base, 3147.9);
  // SDI < 3 UMA ($351.93): sueldos bajos NO pagan excedente
  assert("Excedente (no aplica)", imssConta.cuotaExcedente, 0);
  // 3,147.90 × 2.375% = 74.762625 → 74.76 (= conta)
  assert("Cuota obrera (= conta)", imssConta.total, 74.76);

  // ---------- SDI alto: SÍ paga el 0.40% del excedente ----------
  console.log("\nIMSS obrero, SDI alto ($500 diario, 15 días):");
  const imssAlto = cuotaObreroIMSS({ sdi: 500, dias: 15 });
  // Fijo: 7,500 × 2.375% = 178.125
  // Excedente: (500 − 351.93) × 15 × 0.40% = 8.8842 → total 187.0092
  assert("Excedente base", imssAlto.excedenteBase, 2221.05);
  assert("Cuota obrera total", imssAlto.total, 187.01);

  // ---------- Tope de 25 UMA: cotiza solo hasta el tope ----------
  console.log("\nIMSS obrero, SDI sobre tope ($5,000 diario):");
  const imssTope = cuotaObreroIMSS({ sdi: 5000, dias: 15 });
  // SBC topado: 25 × 117.31 = 2,932.75 diario
  assert("Base topada", imssTope.base, 43991.25);

  // ══════════ PIEZA 4 · IMSS Cuota Patronal ══════════

  // ---------- Componentes fijos, caso contabilidad ----------
  console.log("\nIMSS patronal, componentes (SDI $209.86 × 15, Clase I):");
  const pat = cuotaPatronalIMSS({ sdi: 209.86, dias: 15, primaRiesgo: PRIMAS_RIESGO_CLASE.I });
  // Cuota fija: 117.31 × 20.40% × 15 = 358.97 (por asegurado, no por sueldo)
  assert("Cuota fija EyM", pat.cuotaFija, 358.97);
  assert("Excedente (SDI<3UMA)", pat.excedente, 0);
  assert("Prest. dinero 0.70%", pat.prestDinero, 22.04);
  assert("GMP 1.05%", pat.gmp, 33.05);
  assert("Inv. y vida 1.75%", pat.iv, 55.09);
  assert("Riesgo trab. 0.54355%", pat.riesgoTrabajo, 17.11);
  assert("Guarderías 1.00%", pat.guarderias, 31.48);
  assert("Retiro 2.00%", pat.retiro, 62.96);
  // SDI $209.86 < SM 2026 ($315.04) → protección: CEAV 3.150%
  assert("CEAV pct (≤SM: 3.150%)", pat.ceavPct, 0.0315);
  assert("CEAV monto", pat.ceav, 99.16);
  // Total oficial 2026 (con protección SM): $679.85
  assert("Total patronal oficial", pat.total, 679.85);
  assert("Infonavit (aparte)", pat.infonavit, 157.4);

  // ---------- Reproducir el "aprox $712.97" de contabilidad ----------
  // Su número implica CEAV 4.202% (tasa que NO corresponde a 2026 para
  // este SDI — con override lo reproducimos para demostrar el origen).
  console.log("\nReproducción del aprox. de contabilidad (CEAV 4.202%):");
  const patConta = cuotaPatronalIMSS({
    sdi: 209.86, dias: 15, primaRiesgo: PRIMAS_RIESGO_CLASE.I, ceavPctOverride: 0.04202,
  });
  assert("Total (= conta aprox)", patConta.total, 712.97);

  // ---------- SDI alto: excedente + CEAV tope 7.513% ----------
  console.log("\nIMSS patronal, SDI alto ($500 diario, Clase I):");
  const patAlto = cuotaPatronalIMSS({ sdi: 500, dias: 15, primaRiesgo: PRIMAS_RIESGO_CLASE.I });
  // 500/117.31 = 4.26 UMA → renglón final 7.513%
  assert("CEAV pct (4.26 UMA)", patAlto.ceavPct, 0.07513);
  // Excedente patronal: (500−351.93) × 15 × 1.10% = 24.43
  assert("Excedente patronal", patAlto.excedente, 24.43);
  assert("Total patronal", patAlto.total, 1475.14);

  console.log("\n──────────────────────────────────────────────");
  console.log(`  Resultado: ${ok} pasaron, ${fail} fallaron`);
  console.log("──────────────────────────────────────────────\n");

  return fail === 0;
}

// Si se ejecuta directamente (no importado), corre las pruebas.
const isMain = typeof process !== "undefined" && process.argv[1] && (
  process.argv[1].endsWith("motorFiscal.js") ||
  process.argv[1] === "[stdin]"
);
if (isMain || (typeof process !== "undefined" && process.env.TEST_FISCAL)) {
  const passed = test();
  if (!passed) process.exit(1);
}
