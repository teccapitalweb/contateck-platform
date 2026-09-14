// ============================================================
//  CONTATECK · Motor Fiscal · Pieza 1: Factor de Integración y SDI
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
    // PENDIENTE: pegar la tarifa SEMANAL exacta del Anexo 8 cuando se
    // conecte la corrida semanal real (operación viernes-jueves). La
    // estructura ya la soporta: solo es agregar `semanal: [...]` aquí.
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
