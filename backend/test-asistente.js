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
    sin_poliza: ['¿Qué facturas no tienen póliza?', 'facturas sin contabilizar', 'cuáles facturas no están contabilizadas', 'cfdi sin póliza'],
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
  async cfdis_sin_poliza() { return { total: 2, facturas: [{ folio: 'CT-29', fecha: '2026-11-08T11:10:21+00:00', total: 142.68, tipo: 'I' }, { folio: null, fecha: '2026-11-10', total: 50, tipo: 'I' }] }; },
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

await ok('una pregunta que menciona clientes y proveedores contesta las dos cosas, en ese orden, con una sola intención combinada', async () => {
  const dos = await preguntar('¿Cuánto me deben mis clientes y cuánto debo a proveedores?', herramientas({
    async cuentas_por_cobrar_y_pagar() { return { por_cobrar_clientes: { facturas_con_saldo: 1, importe_total: 42.68 }, por_pagar_proveedores: { facturas_con_saldo: 3, importe_total: 27.84 } }; },
  }));
  assert.equal(dos.intencion, 'por_cobrar_y_pagar');
  const i = dos.respuesta.indexOf('te deben'), j = dos.respuesta.indexOf('Debes');
  assert.ok(i >= 0 && j > i, 'primero lo que te deben y luego lo que debes');
  assert.match(dos.respuesta, /\$42\.68/); assert.match(dos.respuesta, /\$27\.84\*\* a proveedores en 3 facturas/);
  const solo = await preguntar('¿Cuánto me deben?', herramientas());
  assert.equal(solo.intencion, 'por_cobrar'); assert.ok(!/Debes/.test(solo.respuesta));
  const soloPagar = await preguntar('¿Cuánto debo?', herramientas());
  assert.equal(soloPagar.intencion, 'por_pagar'); assert.ok(!/te deben/.test(soloPagar.respuesta));
});

await ok('aclara qué cubre cada cifra: el IVA de un mes es el movimiento del mes, y sin movimientos sugiere preguntar por el año', async () => {
  const iva = await preguntar('¿Cómo va el IVA este mes?', herramientas());
  assert.match(iva.respuesta, /Es el movimiento de noviembre de 2026/); assert.match(iva.respuesta, /saldo del año/);
  const vacio = await preguntar('¿Cuánto gané este mes?', herramientas({ async saldos_de_cuentas() { return { cuentas: [], totales_por_digito: {} }; } }));
  assert.match(vacio.respuesta, /¿cuánto gané este año\?/);
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

// ---------------- Base de conocimiento (OT-0056): conceptos y guías del sistema ----------------
const { ENTRADAS, buscarConocimiento, esPreguntaConceptual, esPreguntaGuia } = await import('./src/baseConocimiento.js');
const sinDatos = herramientas({ async resumen_general() { throw new Error('no debe consultarse'); }, async iva_del_periodo() { throw new Error('no debe consultarse'); } });
const raiz = path.join(aqui, '..', 'frontend');
const frontend = ['dashboard.html', 'app.js', 'auth-guard.js', 'contabilidad.js', 'facturacion.js', 'fiscal.js', 'nomina.js', 'ventas.js', 'invitaciones.js']
  .map((f) => fs.readFileSync(path.join(raiz, f), 'utf8')).join('\n');

await ok('base de conocimiento: conceptos básicos ("¿qué es…?") se contestan con la explicación, sin consultar los datos de la empresa', async () => {
  const casos = {
    iva: ['¿Qué es el IVA?', 'qué significa iva', 'explícame el IVA', 'cómo funciona el iva', '¿qué es el IVA trasladado?'],
    cfdi: ['¿Qué es un CFDI?', 'qué es una factura electrónica'], timbrar: ['¿Qué es timbrar?', 'qué significa el uuid', 'qué es el pac'],
    complemento_pago: ['¿Qué es PPD?', 'qué es el complemento de pago', 'qué significa PUE'], nota_credito: ['¿Qué es una nota de crédito?'],
    poliza: ['¿Qué es una póliza?', 'para qué sirve una póliza'], debe_haber: ['¿Qué es el debe y el haber?', 'qué es la naturaleza deudora'],
    catalogo_cuentas: ['¿Qué es el catálogo de cuentas?'], codigo_agrupador: ['¿Qué es el código agrupador?', 'qué es el anexo 24'],
    contabilidad_electronica: ['¿Qué es la contabilidad electrónica?'], balanza: ['¿Qué es la balanza de comprobación?', 'para qué sirve la balanza'],
    balance_general: ['¿Qué es el balance general?'], estado_resultados: ['¿Qué es el estado de resultados?', 'qué es la utilidad'],
    activo_pasivo_capital: ['¿Qué es el activo?', 'qué es el pasivo', 'qué es el capital contable'], ingresos_costos_gastos: ['¿Qué es un costo?', 'qué son los gastos'],
    libro_mayor: ['¿Qué es el libro mayor?'], causacion: ['¿Qué es causar una factura?', 'qué es una póliza de causación'], cuentas_cobrar_pagar: ['¿Qué son las cuentas por cobrar?'],
    diot: ['¿Qué es la DIOT?'], isr: ['¿Qué es el ISR?', 'cómo se calcula el isr'], rfc: ['¿Qué es el RFC?'], regimen_fiscal: ['¿Qué es el régimen fiscal?'],
    periodo_cierre: ['¿Qué es el cierre de periodo?'], nomina: ['¿Qué es la nómina?', 'qué es el imss'], obligaciones_fiscales: ['¿Qué son las obligaciones fiscales?'],
    soy_ia: ['¿Eres una IA?', '¿eres un robot?', 'quién eres', 'cómo funcionas'], contateck: ['¿Qué es CONTATECK?', 'para qué sirve esta plataforma'],
  };
  for (const [id, preguntas] of Object.entries(casos)) {
    for (const q of preguntas) {
      const r = await preguntar(q, sinDatos);
      assert.equal(r.intencion, 'conocimiento:' + id, `"${q}" debería explicar ${id} y fue ${r.intencion}`);
      assert.equal(r.fuente, 'guía de CONTATECK');
    }
  }
  const iva = await preguntar('¿Qué es el IVA?', sinDatos);
  assert.match(iva.respuesta, /16%/); assert.match(iva.respuesta, /IVA trasladado/); assert.match(iva.respuesta, /Para ver el dato de tu empresa pregunta: "¿Cómo va el IVA este mes\?"/);
});

await ok('base de conocimiento: guías de uso ("¿cómo registro…?") dicen dónde y quién puede, sin consultar los datos', async () => {
  const casos = {
    guia_venta: ['¿Cómo registro una venta?', 'cómo puedo registrar una venta', 'dónde creo una nueva venta'], guia_timbrar: ['¿Cómo timbro una factura?', 'cómo hago una factura', 'cómo emito un cfdi'],
    guia_cancelar_cfdi: ['¿Cómo cancelo una factura?', 'cómo hago una nota de crédito'], guia_cobro: ['¿Cómo registro un cobro?', 'cómo cobro una factura', 'cómo registro que me pagó un cliente'],
    guia_pago_proveedor: ['¿Cómo pago a un proveedor?'], guia_contabilizar_cfdi: ['¿Cómo contabilizo una factura?', 'cómo importo una factura de proveedor'],
    guia_poliza: ['¿Cómo creo una póliza?', 'cómo registro una póliza'], guia_cuenta: ['¿Cómo creo una cuenta?', 'cómo agrego una cuenta'],
    guia_configuracion: ['¿Cómo configuro la contabilidad?'], guia_cerrar_periodo: ['¿Cómo cierro un periodo?', 'cómo cierro el mes', 'quién puede cerrar un periodo'],
    guia_xml_sat: ['¿Cómo descargo el XML para el SAT?', 'cómo genero el xml de la balanza'], guia_codigo_agrupador: ['¿Cómo cargo los códigos agrupador?'],
    guia_declaracion: ['¿Cómo registro una declaración?', 'cómo marco una declaración presentada'], guia_invitar: ['¿Cómo invito a un usuario?', 'cómo agrego un usuario'],
    guia_roles: ['¿Qué roles hay?', 'qué puede hacer un contador', 'qué puede hacer un auditor'], guia_nomina: ['¿Cómo calculo la nómina?', 'cómo doy de alta un empleado'],
    guia_sesion: ['¿Cómo cierro sesión?', 'cómo cambio el tema'], guia_dashboard: ['¿Qué muestra el dashboard?'],
  };
  for (const [id, preguntas] of Object.entries(casos)) {
    for (const q of preguntas) {
      const r = await preguntar(q, sinDatos);
      assert.equal(r.intencion, 'conocimiento:' + id, `"${q}" debería ser la guía ${id} y fue ${r.intencion}`);
    }
  }
  const venta = (await preguntar('¿Cómo registro una venta?', sinDatos)).respuesta;
  assert.match(venta, /Ventas → Nueva venta/); assert.match(venta, /Tomar para revisión/);
});

await ok('las preguntas sobre los DATOS de la empresa siguen yendo a los datos, no a la explicación (sin regresiones)', async () => {
  const datos = { '¿Cómo va el IVA este mes?': 'iva', '¿Cómo va el Balance General?': 'balance', '¿Cuánto me deben?': 'por_cobrar', '¿Cuánto gané este mes?': 'resultado', '¿Qué obligaciones vencen pronto?': 'obligaciones', '¿Tengo alertas?': 'alertas', 'cuánto hay en bancos': 'bancos', 'hola': 'ayuda', '¿qué puedes hacer?': 'ayuda', 'ayuda': 'ayuda', 'iva': 'iva', 'diot': 'obligaciones', 'balance': 'balance' };
  for (const [q, esperada] of Object.entries(datos)) {
    assert.equal(buscarConocimiento(q), null, `"${q}" no debe contestarse con una explicación`);
    assert.equal((await preguntar(q, herramientas())).intencion, esperada, q);
  }
  assert.equal(esPreguntaConceptual('¿Cómo va el IVA este mes?'), false); assert.equal(esPreguntaGuia('¿Cómo va el IVA este mes?'), false);
  // un concepto desconocido no se inventa
  const raro = await preguntar('¿Qué es la fotosíntesis?', herramientas());
  assert.equal(raro.intencion, null); assert.match(raro.respuesta, /No estoy seguro/);
});

await ok('la base es consistente: ids únicos, claves normalizadas, textos presentes, y cada sugerencia de datos lleva a una intención real', () => {
  const ids = ENTRADAS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  assert.ok(ENTRADAS.filter((e) => e.tipo === 'concepto').length >= 25 && ENTRADAS.filter((e) => e.tipo === 'guia').length >= 15);
  for (const e of ENTRADAS) {
    assert.ok(['concepto', 'guia'].includes(e.tipo), e.id);
    assert.ok(e.titulo && e.respuesta.length > 40 && e.claves.length > 0, e.id);
    for (const c of e.claves) assert.equal(normalizar(c).trim(), c, `la clave "${c}" de ${e.id} debe estar normalizada`);
    if (e.datos) assert.notEqual(detectarIntencion(e.datos), null, `la sugerencia de ${e.id} debe llevar a una intención de datos`);
  }
});

await ok('las pantallas y botones que citan las guías existen de verdad en el frontend', () => {
  const etiquetas = ['Nueva venta', 'Tomar para revisión', 'Timbrar CFDI', 'Cancelar CFDI', 'Me pagó un cliente', 'Cuentas por Pagar', 'Captura rápida', 'Importar desde factura timbrada',
    'Importar CFDI', 'Nueva póliza', 'Nueva cuenta', 'Configuración contable', 'Cerrar periodo', 'SAT / Declaraciones', 'Descargar XML Catálogo', 'Descargar XML Balanza',
    'Hoja de cuentas para la contadora', 'Cargar códigos agrupador', '+ Declaración', 'Marcar presentada', '+ Obligación', 'Cargar comunes', 'Libro Mayor', 'Estados financieros',
    'Balanza', 'Calcular', 'Empleado', 'Equipo', 'Cerrar sesión'];
  for (const e of etiquetas) assert.ok(frontend.includes(e), `"${e}" ya no existe en el frontend: actualiza la guía`);
  const citadas = ENTRADAS.map((x) => x.respuesta).join('\n');
  for (const e of ['Nueva venta', 'Timbrar CFDI', 'Cerrar periodo', 'Nueva póliza', 'Libro Mayor', 'Cargar comunes']) assert.ok(citadas.includes(e), `la guía debería citar "${e}"`);
});

await ok('los roles que dicen las guías coinciden con los del código (ventas, nómina, facturación, SAT y Fiscal, invitaciones)', () => {
  const leer = (...p) => fs.readFileSync(path.join(aqui, ...p), 'utf8');
  const lista = (src, nombre) => { const m = new RegExp(nombre + '\\s*=\\s*\\[([^\\]]*)\\]').exec(src); assert.ok(m, nombre); return m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean).sort(); };
  assert.deepEqual(lista(leer('..', 'frontend', 'ventas.js'), 'ROLES_VALIDADORES'), ['admin', 'contador', 'director']);
  assert.deepEqual(lista(leer('src', 'supabaseVentas.js'), 'ROLES_REGISTRO'), ['admin', 'contador', 'director', 'vendedor']);
  assert.deepEqual(lista(leer('..', 'frontend', 'nomina.js'), 'ROLES_PROCESAN'), ['admin', 'director', 'rh']);
  assert.deepEqual(lista(leer('src', 'routes', 'invoices.js'), 'ROLES_FACTURACION'), ['admin', 'contador', 'director']);
  assert.deepEqual(lista(leer('..', 'frontend', 'fiscal.js'), 'ROLES_CONFIGURAN'), ['admin', 'director']);
  assert.deepEqual(lista(leer('..', 'frontend', 'fiscal.js'), 'ROLES_REGISTRAN'), ['admin', 'contador', 'director']);
  assert.deepEqual(lista(leer('src', 'supabaseOnboarding.js'), 'ROLES_INVITAN'), ['admin', 'director', 'rh']);
  const g = (id) => ENTRADAS.find((e) => e.id === id).respuesta;
  assert.match(g('guia_venta'), /vendedor, contador, admin y director/); assert.match(g('guia_timbrar'), /director, admin y contador/);
  assert.match(g('guia_cerrar_periodo'), /contador, admin o director/); assert.match(g('guia_nomina'), /rh, admin y director/);
  assert.match(g('guia_invitar'), /rh, admin y director/); assert.match(g('guia_declaracion'), /solo admin y director/);
});

await ok('los textos no prometen lo que el sistema no hace: ISR sin cálculo y timbrado de nómina no disponible', () => {
  const t = (id) => ENTRADAS.find((e) => e.id === id).respuesta;
  assert.match(t('isr'), /no lo calcula por ti/); assert.match(t('nomina'), /no está disponible/); assert.match(t('guia_nomina'), /no está disponible/);
  assert.match(t('soy_ia'), /No soy inteligencia artificial/);
  const ayuda = textoAyuda(); assert.match(ayuda, /¿Qué es el IVA\?/); assert.match(ayuda, /¿Cómo registro una venta\?/);
});

// ---------------- Mejoras de la OT-0058: memoria, saldo de una cuenta, facturas sin póliza y faltas de ortografía ----------------
const { detectarCuenta, corregirTexto } = await import('./src/asistenteContable.js');
const conHistorial = (pregunta, historial, h = herramientas()) => responderPorReglas({ pregunta, historial }, { herramientas: h, hoy: HOY, log: sinLog });

await ok('saldo de una cuenta: reconoce el código en la pregunta, pide solo esa cuenta y explica el saldo negativo', async () => {
  for (const [q, c] of [['¿Cuánto hay en la cuenta 102?', '102'], ['saldo de la 105', '105'], ['cuál es el saldo de la cuenta número 4010', '4010'], ['cuánto tengo en la 102', '102']]) assert.equal(detectarCuenta(q), c, q);
  assert.equal(detectarCuenta('cuánto hay en bancos'), null); assert.equal(detectarCuenta('el mes 11 de 2026'), null);
  let pedido = null;
  const r = await preguntar('¿Cuánto hay en la cuenta 101 este mes?', herramientas({ async saldos_de_cuentas(e) { pedido = e; return { cuentas: [{ codigo: '101', nombre: 'Caja', naturaleza: 'deudora', debe: 0, haber: 1000, saldo: -1000 }, { codigo: '1010', nombre: 'otra', naturaleza: 'deudora', debe: 5, haber: 0, saldo: 5 }] }; } }));
  assert.deepEqual(pedido, { anio: 2026, mes: 11, prefijo: '101' });
  assert.equal(r.intencion, 'saldo_cuenta'); assert.match(r.respuesta, /Caja \(101\)/); assert.match(r.respuesta, /Saldo: -\$1,000\.00/); assert.match(r.respuesta, /saldo negativo/);
  assert.ok(!/otra/.test(r.respuesta), 'solo la cuenta exacta, no las que empiezan igual');
  const nada = await preguntar('saldo de la cuenta 999', herramientas({ async saldos_de_cuentas() { return { cuentas: [] }; } }));
  assert.match(nada.respuesta, /No encontré movimientos en la cuenta 999/);
});

await ok('facturas sin póliza: lista folio, fecha e importe (sin nombres) y dice cómo contabilizarlas; si no hay, lo dice', async () => {
  const r = await preguntar('¿Qué facturas no tienen póliza?', herramientas());
  assert.equal(r.intencion, 'sin_poliza'); assert.match(r.respuesta, /Tienes \*\*2\*\* facturas emitidas vigentes sin póliza/);
  assert.match(r.respuesta, /CT-29 \(2026-11-08\) · \$142\.68/); assert.match(r.respuesta, /sin folio \(2026-11-10\) · \$50\.00/); assert.match(r.respuesta, /Importar desde factura timbrada/);
  const vacia = await preguntar('facturas sin contabilizar', herramientas({ async cfdis_sin_poliza() { return { total: 0, facturas: [] }; } }));
  assert.match(vacia.respuesta, /Todas tus facturas emitidas vigentes ya tienen su póliza/);
  const err = await preguntar('facturas sin póliza', herramientas({ async cfdis_sin_poliza() { return { error: 'secreto interno' }; } }));
  assert.ok(!/secreto/.test(JSON.stringify(err)));
});

await ok('memoria: "¿y el mes pasado?" repite la pregunta de datos anterior con el periodo nuevo; sin historial o sin periodo no inventa', async () => {
  let pedido = null;
  const h = herramientas({ async iva_del_periodo(e) { pedido = e; return { trasladado: 10, acreditable: 4, resultado: 6 }; } });
  const hist = [{ rol: 'usuario', texto: '¿Cómo va el IVA este mes?' }, { rol: 'ia', texto: 'respuesta anterior' }];
  const r = await conHistorial('¿y el mes pasado?', hist, h);
  assert.equal(r.ok, true); assert.equal(r.intencion, 'iva'); assert.equal(r.seguimiento, true);
  assert.deepEqual(pedido, { anio: 2026, mes: 10 }); assert.match(r.respuesta, /octubre de 2026/);
  assert.equal((await conHistorial('¿y en septiembre?', hist, h)).intencion, 'iva');
  assert.equal((await conHistorial('¿y el año pasado?', [{ rol: 'usuario', texto: 'cuánto gané este año' }])).intencion, 'resultado');
  // sin historial no hay a qué darle seguimiento
  const sola = await conHistorial('¿y el mes pasado?', []);
  assert.equal(sola.intencion, null); assert.match(sola.respuesta, /No estoy seguro/);
  // el seguimiento ignora las explicaciones (conceptos) y sigue con la última pregunta de datos
  const mixto = await conHistorial('¿y octubre?', [{ rol: 'usuario', texto: '¿Cómo va el IVA?' }, { rol: 'usuario', texto: '¿Qué es una póliza?' }], h);
  assert.equal(mixto.intencion, 'iva');
  // un historial raro no rompe nada
  assert.equal((await conHistorial('¿y el mes pasado?', 'basura')).intencion, null);
  assert.equal((await conHistorial('hola', [null, 5, { rol: 'x' }])).intencion, 'ayuda');
  // memoria también para el saldo de una cuenta
  let cuentaPedida = null;
  const rc = await conHistorial('¿y el mes pasado?', [{ rol: 'usuario', texto: 'saldo de la cuenta 102' }], herramientas({ async saldos_de_cuentas(e) { cuentaPedida = e; return { cuentas: [] }; } }));
  assert.equal(rc.intencion, 'saldo_cuenta'); assert.deepEqual(cuentaPedida, { anio: 2026, mes: 10, prefijo: '102' });
});

await ok('faltas de ortografía: solo se corrigen cuando la pregunta tal cual no se entendió, y con una letra de diferencia', async () => {
  assert.equal(corregirTexto('¿Cómo va el balnce general?').includes('balance'), true);
  for (const [q, esperada] of [['¿cómo va el balnce?', 'balance'], ['cuanto hay en bancs', 'bancos'], ['¿qué obligacions vencen?', 'obligaciones'], ['cuánto me deban mis clientes', 'por_cobrar'], ['resumn', 'alertas'], ['¿qué es un cfdi? ', 'conocimiento:cfdi'], ['¿qué es la polza?', 'conocimiento:poliza']]) {
    const r = await preguntar(q, herramientas());
    assert.equal(r.intencion, esperada, q);
  }
  assert.equal((await preguntar('¿cómo va el balnce?', herramientas())).corregida, true);
  // lo que ya se entiende no se toca, y lo que no se parece a nada no se inventa
  const bien = await preguntar('¿Cómo va el balance?', herramientas()); assert.equal(bien.corregida, undefined);
  for (const q of ['asdfghjkl qwertyuiop', 'cuéntame un chiste de contadores', 'zzzzz xxxxx']) assert.equal((await preguntar(q, herramientas())).intencion, null, q);
  // los números y los meses no se alteran
  assert.equal(corregirTexto('cuenta 102 de octubre').includes('102'), true);
});

await ok('el periodo "año pasado" se reconoce, y la ruta pasa el historial al asistente', async () => {
  assert.deepEqual(detectarPeriodo('¿cuánto gané el año pasado?', HOY), { anio: 2025, etiqueta: 'el año 2025' });
  assert.deepEqual(detectarPeriodo('iva del año anterior', '2026-01-05'), { anio: 2025, etiqueta: 'el año 2025' });
  const ruta = fs.readFileSync(path.join(aqui, 'src', 'routes', 'ia.js'), 'utf8');
  assert.ok(ruta.includes('responderPorReglas({ pregunta, historial }'));
});

console.log(`\n✔ ${pruebas} pruebas del asistente contable por reglas pasaron\n`);
