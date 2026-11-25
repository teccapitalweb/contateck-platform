// ============================================================
//  CONTATECK · Pruebas del asistente contable por reglas (OT-0054)
//  Sin red, sin llave de IA y sin base de datos: las herramientas de lectura se simulan.
//  Ejecutar:  npm run test:asistente
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTENCIONES, MAX_PREGUNTA_ASISTENTE, normalizar, dinero, detectarIntencion, detectarPeriodo, textoAyuda, responderPorReglas,
} from './src/asistenteContable.js';
import { ROLES_IA } from './src/iaContable.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };
const sinLog = { warn: () => {} };
const HOY = '2026-11-25';
const preguntar = (pregunta, herramientas, hoy = HOY) => responderPorReglas({ pregunta }, { herramientas, hoy, log: sinLog });

console.log('\nAsistente contable por reglas (OT-0054)\n');

await ok('normaliza acentos, mayúsculas y signos', () => {
  assert.equal(normalizar('  ¿Cuánto GANÉ, este mes?!  '), ' cuanto gane este mes ');
  assert.equal(normalizar(null), '  ');
  assert.equal(dinero(1234.5), '$1,234.50'); assert.equal(dinero(-1000), '-$1,000.00');
});

await ok('reconoce la intención de las preguntas frecuentes, con acentos, mayúsculas y distintas formas de decirlo', () => {
  const casos = {
    balance: ['¿Cómo va el Balance General?', 'balance', 'cuánto tengo de activo y pasivo', 'el balance cuadra?', 'situación financiera'],
    bancos: ['¿Cuánto hay en bancos?', 'cuanto dinero tengo en caja', 'saldo del banco', 'tengo efectivo disponible?', 'cuánto tengo en el banco'],
    por_cobrar: ['¿Cuánto me deben mis clientes?', 'cuentas por cobrar', 'cuánto me deben'],
    por_pagar: ['¿Cuánto debo a proveedores?', 'cuentas por pagar', 'cuánto debo', 'mis adeudos'],
    iva: ['¿Cómo va el IVA este mes?', 'iva por pagar', 'cuánto iva trasladado', 'IVA a favor'],
    obligaciones: ['¿Qué obligaciones fiscales vencen pronto?', 'tengo declaraciones pendientes del SAT', 'cuándo vence la DIOT', 'fecha limite de impuestos'],
    resultado: ['¿Cuánto gané este mes?', 'cuál es mi utilidad', 'estoy ganando o perdiendo', 'resultado de octubre'],
    ingresos_egresos: ['¿Cuánto vendí este mes?', 'mis ingresos', 'cuánto facturé', 'cuánto gasté', 'egresos del mes'],
    alertas: ['¿Tengo alertas pendientes?', 'qué debo revisar', 'hay algún problema', 'resumen'],
    nomina: ['¿Cuántos empleados tengo?', 'cuánto es la nómina', 'sueldos'],
    ayuda: ['hola', 'ayuda', '¿qué puedes hacer?', 'buenos días', 'gracias'],
  };
  for (const [esperada, preguntas] of Object.entries(casos)) {
    for (const p of preguntas) assert.equal(detectarIntencion(p), esperada, `"${p}" debería ser ${esperada}`);
  }
  assert.deepEqual([...new Set(Object.keys(casos))].sort(), INTENCIONES.map((i) => i.id).sort(), 'todas las intenciones tienen casos de prueba');
});

await ok('un saludo no le gana a la pregunta real, y lo que no entiende no se adivina', () => {
  assert.equal(detectarIntencion('Hola, ¿cuánto hay en bancos?'), 'bancos');
  assert.equal(detectarIntencion('buenas tardes, cómo va el IVA'), 'iva');
  for (const p of ['¿Cuál es la capital de Francia?', 'cuéntame un chiste', 'asdf qwer', '   ', '12345']) assert.equal(detectarIntencion(p), null, p);
});

await ok('detecta el periodo: este mes, mes pasado (incluso en enero), un mes por nombre, un año o el ejercicio', () => {
  const p = (q, hoy) => detectarPeriodo(q, hoy);
  assert.deepEqual(p('cuánto gané este mes', HOY), { anio: 2026, mes: 11, etiqueta: 'noviembre de 2026' });
  assert.deepEqual(p('el mes pasado', HOY), { anio: 2026, mes: 10, etiqueta: 'octubre de 2026' });
  assert.deepEqual(p('el mes pasado', '2026-01-10'), { anio: 2025, mes: 12, etiqueta: 'diciembre de 2025' });
  assert.deepEqual(p('resultado de octubre', HOY), { anio: 2026, mes: 10, etiqueta: 'octubre de 2026' });
  assert.deepEqual(p('IVA de enero de 2025', HOY), { anio: 2025, mes: 1, etiqueta: 'enero de 2025' });
  assert.deepEqual(p('ventas en 2025', HOY), { anio: 2025, etiqueta: 'el año 2025' });
  assert.deepEqual(p('utilidad de este año', HOY), { anio: 2026, etiqueta: 'el año 2026' });
  assert.equal(p('cuánto hay en bancos', HOY), null);
});

// Herramientas simuladas (solo lectura) con datos de ejemplo
const herramientas = (extra = {}) => ({
  async resumen_general() {
    return {
      facturacion_del_mes: { montoMes: 500, timbradasMes: 2, canceladasMes: 1 },
      movimientos_de_polizas_del_mes: { ingresos: 448, egresos: 1552.16, ingresos_menos_egresos: -1104.16, nota: 'x' },
      nomina: { empleadosActivos: 1, nominaMensualEstimada: 15000 },
      balance_general: { totalActivo: 1000, totalPasivo: 400, totalCapital: 500, resultadoDelPeriodo: 100, cuadra: true },
      gastos_por_cuenta: [], alertas: [{ tipo: 'warn', titulo: '1 CFDI vigente sin póliza contable', detalle: 'Aún no tiene póliza.' }],
    };
  },
  async saldos_de_cuentas() {
    return { periodo: 'x', cuentas: [
      { codigo: '101', nombre: 'Caja', naturaleza: 'deudora', saldo: -1000 }, { codigo: '102', nombre: 'Bancos', naturaleza: 'deudora', saldo: 995.84 },
      { codigo: '105', nombre: 'Clientes', naturaleza: 'deudora', saldo: 50 },
    ], totales_por_digito: { 4: 5000, 5: 1000, 6: 1500 }, recortado: true };
  },
  async cuentas_por_cobrar_y_pagar() { return { por_cobrar_clientes: { facturas_con_saldo: 2, importe_total: 150.5 }, por_pagar_proveedores: { facturas_con_saldo: 0, importe_total: 0 } }; },
  async iva_del_periodo() { return { periodo: '2026-11', trasladado: 160, acreditable: 100, resultado: 60 }; },
  async obligaciones_fiscales() { return { proximas: [
    { obligacion: 'IVA mensual', periodo: 'octubre 2026', fecha_limite: '2026-11-17', dias_restantes: -8 },
    { obligacion: 'DIOT', periodo: 'octubre 2026', fecha_limite: '2026-11-30', dias_restantes: 5 },
  ] }; },
  ...extra,
});

await ok('balance, bancos, cobrar, pagar: cifras con formato de pesos, plural/singular y aviso cuando hay saldos negativos', async () => {
  const b = await preguntar('¿Cómo va el Balance General?', herramientas());
  assert.equal(b.ok, true); assert.equal(b.intencion, 'balance');
  assert.match(b.respuesta, /Activo: \$1,000\.00/); assert.match(b.respuesta, /Pasivo: \$400\.00/); assert.match(b.respuesta, /\*\*cuadra\*\*/);
  const nb = await preguntar('balance', herramientas({ async resumen_general() { return { balance_general: { totalActivo: -424.57, totalPasivo: -510.78, totalCapital: 0, resultadoDelPeriodo: 86.21, cuadra: false } }; } }));
  assert.match(nb.respuesta, /NO cuadra/); assert.match(nb.respuesta, /saldo negativo/);
  const bk = await preguntar('¿Cuánto hay en bancos?', herramientas());
  assert.match(bk.respuesta, /Caja \(101\): -\$1,000\.00/); assert.match(bk.respuesta, /Bancos \(102\): \$995\.84/);
  assert.ok(!/Clientes/.test(bk.respuesta), 'solo caja y bancos'); assert.match(bk.respuesta, /Total: \*\*-\$4\.16\*\*/); assert.match(bk.respuesta, /saldo negativo/);
  const c = await preguntar('¿Cuánto me deben?', herramientas());
  assert.match(c.respuesta, /\*\*\$150\.50\*\* en 2 facturas/);
  const p = await preguntar('¿Cuánto debo a proveedores?', herramientas());
  assert.match(p.respuesta, /No tienes facturas de proveedores con saldo pendiente/);
});

await ok('IVA: a cargo, a favor, periodo pedido y error de configuración explicado', async () => {
  let pedido = null;
  const cargo = await preguntar('¿Cómo va el IVA de octubre?', herramientas({ async iva_del_periodo(e) { pedido = e; return { trasladado: 160, acreditable: 100, resultado: 60 }; } }));
  assert.deepEqual(pedido, { anio: 2026, mes: 10 });
  assert.match(cargo.respuesta, /octubre de 2026/); assert.match(cargo.respuesta, /\$60\.00 a cargo/); assert.match(cargo.respuesta, /no sustituye la revisión de tu contador/);
  const favor = await preguntar('iva', herramientas({ async iva_del_periodo() { return { trasladado: 10, acreditable: 50, resultado: -40 }; } }));
  assert.match(favor.respuesta, /\$40\.00 a favor/);
  const sinConfig = await preguntar('iva', herramientas({ async iva_del_periodo() { return { error: 'Faltan las cuentas de IVA trasladado y acreditable en la Configuración contable.' }; } }));
  assert.match(sinConfig.respuesta, /Configuración contable/);
});

await ok('obligaciones: marca vencidas y días restantes; sin obligaciones lo dice', async () => {
  const o = await preguntar('¿Qué obligaciones vencen pronto?', herramientas());
  assert.match(o.respuesta, /IVA mensual \(octubre 2026\): vence el 2026-11-17 · \*\*vencida hace 8 días\*\*/);
  assert.match(o.respuesta, /DIOT[^\n]*faltan 5 días/); assert.match(o.respuesta, /Tienes \*\*1\*\* vencida/);
  const vacia = await preguntar('obligaciones', herramientas({ async obligaciones_fiscales() { return { proximas: [] }; } }));
  assert.match(vacia.respuesta, /No tienes obligaciones fiscales pendientes/);
});

await ok('resultado: usa los totales de TODAS las cuentas aunque la lista venga recortada; utilidad o pérdida; sin movimientos', async () => {
  let pedido = null;
  const u = await preguntar('¿Cuánto gané este mes?', herramientas({ async saldos_de_cuentas(e) { pedido = e; return { cuentas: [], totales_por_digito: { 4: 5000, 5: 1000, 6: 1500 }, recortado: true }; } }));
  assert.deepEqual(pedido, { anio: 2026, mes: 11 });
  assert.match(u.respuesta, /Ingresos: \$5,000\.00/); assert.match(u.respuesta, /Costos: \$1,000\.00/); assert.match(u.respuesta, /Gastos: \$1,500\.00/); assert.match(u.respuesta, /Utilidad: \$2,500\.00/);
  const per = await preguntar('resultado', herramientas({ async saldos_de_cuentas() { return { cuentas: [], totales_por_digito: { 4: 100, 6: 400 } }; } }));
  assert.match(per.respuesta, /Pérdida: \$300\.00/);
  const nada = await preguntar('utilidad de octubre', herramientas({ async saldos_de_cuentas() { return { cuentas: [], totales_por_digito: {} }; } }));
  assert.match(nada.respuesta, /No hay movimientos de ingresos, costos ni gastos en octubre de 2026/);
});

await ok('ingresos y egresos, alertas y nómina: no llama utilidad a ingresos menos egresos, y avisa que otro mes no está cubierto', async () => {
  const i = await preguntar('¿Cuánto vendí este mes?', herramientas());
  assert.match(i.respuesta, /Facturado: \$500\.00 en 2 CFDI \(1 cancelado\)/); assert.match(i.respuesta, /Ingresos menos egresos: -\$1,104\.16/); assert.match(i.respuesta, /no es la utilidad contable/);
  assert.ok(!/Utilidad:/.test(i.respuesta));
  const otroMes = await preguntar('cuánto vendí en octubre', herramientas());
  assert.match(otroMes.respuesta, /solo cubre el mes en curso/);
  assert.match((await preguntar('¿Tengo alertas?', herramientas())).respuesta, /Tienes \*\*1\*\* alerta:\n- 1 CFDI vigente sin póliza contable — Aún no tiene póliza\./);
  assert.match((await preguntar('alertas', herramientas({ async resumen_general() { return { alertas: [] }; } }))).respuesta, /No tienes alertas pendientes/);
  assert.match((await preguntar('¿Cuántos empleados tengo?', herramientas())).respuesta, /\*\*1\*\* empleado activo[\s\S]*\$15,000\.00/);
});

await ok('ayuda y lo que no entiende: da ejemplos y no inventa respuesta', async () => {
  const a = await preguntar('hola', herramientas());
  assert.equal(a.intencion, 'ayuda'); assert.equal(a.respuesta, textoAyuda()); assert.match(a.respuesta, /Balance General/);
  const n = await preguntar('cuéntame un chiste', herramientas());
  assert.equal(n.ok, true); assert.equal(n.intencion, null); assert.match(n.respuesta, /No estoy seguro de qué me preguntas/); assert.match(n.respuesta, /¿Cuánto hay en bancos y caja\?/);
});

await ok('si una herramienta falla o lanza un error, contesta con un mensaje amable y sin detalles internos', async () => {
  const lanza = await preguntar('balance', herramientas({ async resumen_general() { throw new Error('postgres://usuario:clave@host falló'); } }));
  assert.equal(lanza.ok, true); assert.match(lanza.respuesta, /No pude consultar/); assert.ok(!/postgres|clave/.test(JSON.stringify(lanza)));
  const error = await preguntar('¿cuánto me deben?', herramientas({ async cuentas_por_cobrar_y_pagar() { return { error: 'secreto interno' }; } }));
  assert.match(error.respuesta, /No pude consultar/); assert.ok(!/secreto/.test(JSON.stringify(error)));
  const sinDatos = await preguntar('balance', herramientas({ async resumen_general() { return { error: 'x' }; } }));
  assert.match(sinDatos.respuesta, /No pude consultar/);
});

await ok('valida la pregunta y es determinista (misma pregunta y datos, misma respuesta)', async () => {
  assert.equal((await preguntar('   ', herramientas())).ok, false);
  assert.equal((await preguntar(undefined, herramientas())).codigo, 'CONSULTA_INVALIDA');
  const larga = await preguntar('a'.repeat(MAX_PREGUNTA_ASISTENTE + 1), herramientas());
  assert.equal(larga.ok, false); assert.match(larga.error, /muy larga/);
  const a = await preguntar('¿Cómo va el IVA?', herramientas()), b = await preguntar('¿Cómo va el IVA?', herramientas());
  assert.deepEqual(a, b);
});

await ok('el asistente no escribe, no usa la red ni la base por su cuenta, y la ruta lo usa por defecto sin exigir llave', () => {
  const fuente = fs.readFileSync(path.join(aqui, 'src', 'asistenteContable.js'), 'utf8');
  assert.ok(!/fetch\(|https?:\/\/|supabase|createClient|\.insert\(|\.update\(|\.delete\(|\.rpc\(/i.test(fuente.replace(/\/\/.*$/gm, '')), 'solo recibe herramientas ya hechas');
  const cfg = fs.readFileSync(path.join(aqui, 'src', 'config.js'), 'utf8');
  assert.ok(cfg.includes("process.env.ASISTENTE_MODO || 'reglas'"), 'el modo por defecto debe ser reglas');
  const ruta = fs.readFileSync(path.join(aqui, 'src', 'routes', 'ia.js'), 'utf8');
  const iRol = ruta.indexOf('ROL_SIN_ACCESO'), iReglas = ruta.indexOf('responderPorReglas('), iLlave = ruta.indexOf('IA_NO_CONFIGURADA');
  assert.ok(iRol > 0 && iRol < iReglas && iReglas < iLlave, 'primero el rol, luego el modo reglas (sin llave), y solo después se exige la llave de la IA');
  assert.deepEqual([...ROLES_IA].sort(), ['admin', 'auditor', 'contador', 'director']);
});

console.log(`\n✔ ${pruebas} pruebas del asistente contable por reglas pasaron\n`);
