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
