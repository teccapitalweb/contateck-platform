// ============================================================
//  CONTATECK · Backend · Asistente contable por reglas (OT-0054)
//
//  Un chatbot SIN inteligencia artificial de pago: reconoce la intención de la pregunta por palabras clave y contesta con
//  los datos reales de la empresa, usando las MISMAS herramientas de solo lectura que usaría una IA (iaContable.js).
//  Es determinista (misma pregunta + mismos datos = misma respuesta), no cuesta por consulta y no envía datos a terceros.
//  Si más adelante se decide usar un modelo de IA, solo cambia quién redacta la respuesta; las herramientas y los permisos
//  son los mismos (ver ASISTENTE_MODO en config.js).
//
//  Reglas: solo lectura; sin RFC ni nombres de personas; no inventa: si no entiende o no hay datos, lo dice.
// ============================================================
import { hoyMexico } from './validacionesFiscal.js';
import { normalizar } from './textoUtil.js';
import { buscarConocimiento, ENTRADAS } from './baseConocimiento.js';

export const MAX_PREGUNTA_ASISTENTE = 300;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export { normalizar };

export const dinero = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
const num = (n) => Number(n) || 0;
// "de el año 2026" → "del año 2026"; "de octubre de 2026" queda igual.
const de = (etiqueta) => (String(etiqueta).startsWith('el ') ? 'del ' + String(etiqueta).slice(3) : 'de ' + etiqueta);
const redondea = (n) => Math.round(num(n) * 100) / 100;

// ---------------- Intenciones ----------------
// Cada intención tiene palabras o frases clave (ya normalizadas). Gana la de mayor puntaje; las frases largas pesan más.
export const INTENCIONES = [
  { id: 'ayuda', claves: ['ayuda', 'que puedes', 'que sabes', 'que haces', 'opciones', 'menu', 'como funciona', 'hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes', 'buenas noches', 'gracias'] },
  { id: 'balance', claves: ['balance', 'balance general', 'activo', 'activos', 'pasivo', 'pasivos', 'capital contable', 'capital social', 'cuadra', 'situacion financiera'] },
  { id: 'bancos', claves: ['banco', 'bancos', 'caja', 'efectivo', 'disponible', 'liquidez', 'cuanto dinero', 'cuanto tengo', 'dinero'] },
  { id: 'por_cobrar', claves: ['me deben', 'por cobrar', 'cobrar', 'cuentas por cobrar', 'clientes deben', 'deudores', 'cobranza', 'cuanto me deben'] },
  { id: 'por_pagar', claves: ['debo', 'por pagar', 'cuentas por pagar', 'proveedores', 'adeudo', 'adeudos', 'cuanto debo', 'pagos pendientes'] },
  { id: 'iva', claves: ['iva', 'impuesto al valor agregado', 'trasladado', 'acreditable', 'iva por pagar', 'iva a favor'] },
  { id: 'obligaciones', claves: ['obligacion', 'obligaciones', 'declaracion', 'declaraciones', 'vence', 'vencen', 'vencimiento', 'vencimientos', 'vencida', 'vencidas', 'sat', 'fecha limite', 'diot', 'impuestos pendientes', 'calendario fiscal'] },
  { id: 'resultado', claves: ['utilidad', 'resultado', 'ganancia', 'perdida', 'cuanto gane', 'estado de resultados', 'ganando', 'perdiendo'] },
  { id: 'ingresos_egresos', claves: ['ingreso', 'ingresos', 'egreso', 'egresos', 'vendi', 'ventas', 'facturado', 'facturacion', 'facturas emitidas', 'gaste', 'gastos', 'cuanto facture'] },
  { id: 'sin_poliza', claves: ['sin poliza', 'sin contabilizar', 'no contabilizada', 'no contabilizadas', 'por contabilizar', 'pendientes de contabilizar', 'facturas sin poliza', 'cfdi sin poliza', 'no tienen poliza', 'no estan contabilizadas'] },
  { id: 'alertas', claves: ['alerta', 'alertas', 'pendiente', 'pendientes', 'revisar', 'problema', 'problemas', 'que debo atender', 'que debo revisar', 'que debo hacer', 'que tengo pendiente', 'atencion', 'urgente', 'resumen'] },
  { id: 'nomina', claves: ['nomina', 'empleados', 'sueldos', 'salarios', 'trabajadores', 'plantilla'] },
];

function puntosDeIntencion(pregunta, id) {
  const t = normalizar(pregunta);
  const it = INTENCIONES.find((x) => x.id === id);
  return it ? it.claves.reduce((a, c) => a + (t.includes(' ' + c + ' ') ? c.split(' ').length : 0), 0) : 0;
}

/** Devuelve la intención ganadora o null si ninguna palabra clave coincide. */
export function detectarIntencion(pregunta) {
  const t = normalizar(pregunta);
  let mejor = null, mejorPuntos = 0;
  for (const it of INTENCIONES) {
    let puntos = 0;
    for (const c of it.claves) {
      if (t.includes(' ' + c + ' ')) puntos += c.split(' ').length;
    }
    // Saludos y ayuda: valen lo mismo sin importar cuántas palabras de cortesía junte la frase ("buenas tardes, hola"),
    // y siempre pierden contra una pregunta real ("hola, ¿cuánto hay en bancos?" debe ganar bancos).
    if (it.id === 'ayuda' && puntos > 0) puntos = 0.5;
    if (puntos > mejorPuntos) { mejor = it.id; mejorPuntos = puntos; }
  }
  return mejor;
}

/** Periodo mencionado en la pregunta: { anio, mes, etiqueta } | { anio, etiqueta } | null (si no menciona ninguno). */
export function detectarPeriodo(pregunta, hoy = hoyMexico()) {
  const t = normalizar(pregunta);
  const [aHoy, mHoy] = hoy.split('-').map(Number);
  const mesesAtras = (n) => { const d = new Date(Date.UTC(aHoy, mHoy - 1 - n, 1)); return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }; };
  const etiqueta = (a, m) => `${MESES[m - 1]} de ${a}`;
  if (t.includes(' mes pasado ') || t.includes(' mes anterior ') || t.includes(' ultimo mes ')) { const p = mesesAtras(1); return { ...p, etiqueta: etiqueta(p.anio, p.mes) }; }
  if (t.includes(' este mes ') || t.includes(' mes actual ') || t.includes(' del mes ') || t.includes(' en el mes ')) return { anio: aHoy, mes: mHoy, etiqueta: etiqueta(aHoy, mHoy) };
  const m = /\b(20[0-9]{2})\b/.exec(t);
  const anioDicho = m ? Number(m[1]) : null;
  for (let i = 0; i < MESES.length; i++) {
    if (t.includes(' ' + MESES[i] + ' ')) { const a = anioDicho || aHoy; return { anio: a, mes: i + 1, etiqueta: etiqueta(a, i + 1) }; }
  }
  if (t.includes(' ano pasado ') || t.includes(' ano anterior ')) return { anio: aHoy - 1, etiqueta: `el año ${aHoy - 1}` };
  if (anioDicho) return { anio: anioDicho, etiqueta: `el año ${anioDicho}` };
  if (t.includes(' este ano ') || t.includes(' del ano ') || t.includes(' ejercicio ') || t.includes(' acumulado ')) return { anio: aHoy, etiqueta: `el año ${aHoy}` };
  return null;
}

/** Código de cuenta que menciona la pregunta ("la cuenta 102", "saldo de la 105"), o null. */
export function detectarCuenta(pregunta) {
  const t = normalizar(pregunta);
  const m = /\bcuenta (?:numero |no |codigo )?([0-9]{2,8})\b/.exec(t) || /\bsaldo (?:de |en )?(?:la )?([0-9]{2,8})\b/.exec(t) || /\b(?:hay|tengo) en la ([0-9]{3,8})\b/.exec(t);
  return m ? m[1] : null;
}

// ----- Faltas de ortografía: solo se intentan si la pregunta, tal cual, no se entendió -----
const distancia1 = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
};
let VOCABULARIO = null;
function vocabulario() {
  if (VOCABULARIO) return VOCABULARIO;
  const v = new Set(MESES);
  for (const frase of [...INTENCIONES.flatMap((i) => i.claves), ...ENTRADAS.flatMap((e) => e.claves)]) for (const w of frase.split(' ')) if (w.length >= 5) v.add(w);
  return (VOCABULARIO = [...v]);
}
/** Corrige palabras con una letra de más, de menos o cambiada ("balnce" → "balance"). Devuelve el texto igual si no hay nada que corregir. */
export function corregirTexto(pregunta) {
  const voc = vocabulario(), conocidas = new Set(voc);
  return normalizar(pregunta).trim().split(' ').map((w) => {
    if (w.length < 5 || conocidas.has(w) || /^[0-9]+$/.test(w)) return w;
    const c = voc.find((x) => x[0] === w[0] && distancia1(w, x));
    return c || w;
  }).join(' ');
}

// ---------------- Respuestas ----------------
const SUGERENCIAS = [
  '¿Cómo va el Balance General?',
  '¿Cuánto hay en bancos y caja?',
  '¿Cuánto me deben mis clientes y cuánto debo a proveedores?',
  '¿Cómo va el IVA este mes?',
  '¿Qué obligaciones fiscales vencen pronto?',
  '¿Cuánto gané este mes?',
  '¿Tengo alertas pendientes?',
];
const SUGERENCIAS_GENERALES = ['¿Qué es el IVA?', '¿Qué es una póliza?', '¿Cómo registro una venta?', '¿Cómo cierro un periodo?'];

export function textoAyuda() {
  return [
    '**Hola, soy el asistente contable de CONTATECK.** Contesto preguntas frecuentes con los datos de tu empresa (solo lectura, no modifico nada).',
    '',
    'Puedes preguntarme, por ejemplo:',
    ...SUGERENCIAS.map((s) => '- ' + s),
    '',
    'También explico lo básico y cómo se usa el sistema:',
    ...SUGERENCIAS_GENERALES.map((s) => '- ' + s),
    '',
    'Entiendo preguntas con palabras como balance, bancos, clientes, proveedores, IVA, obligaciones, utilidad, ingresos, alertas y nómina, y meses como "octubre" o "el mes pasado". Si no entiendo algo, te lo digo.',
  ].join('\n');
}

const NO_ENTIENDO = (pregunta) => ({
  intencion: null,
  respuesta: [
    'No estoy seguro de qué me preguntas. Todavía contesto solo ciertos temas.',
    '',
    'Prueba con:',
    ...SUGERENCIAS.map((s) => '- ' + s),
    ...SUGERENCIAS_GENERALES.map((s) => '- ' + s),
  ].join('\n'),
  pregunta_normalizada: normalizar(pregunta).trim(),
});

const ERROR_DATOS = (que) => `No pude consultar ${que} en este momento. Inténtalo de nuevo; si sigue igual, avisa al administrador.`;
const NOTA_NEGATIVO = 'Un saldo negativo en una cuenta de activo suele indicar movimientos registrados sin su póliza de origen (por ejemplo, un cobro sin la factura contabilizada). Revísalo en Contabilidad.';
const AVISO_VALIDAR = 'Cifra de referencia calculada con tus pólizas; no sustituye la revisión de tu contador.';

function sumaPorPrefijo(cuentas, prefijo) {
  return redondea((cuentas || []).filter((c) => String(c.codigo).startsWith(prefijo)).reduce((a, c) => a + num(c.saldo), 0));
}

// Cada manejador recibe (pregunta, periodo, h) con h = herramientas de solo lectura y devuelve { respuesta, fuente }.
const MANEJADORES = {
  async ayuda() { return { respuesta: textoAyuda() }; },

  async balance(_p, _per, h) {
    const d = await h.resumen_general();
    const b = d && d.balance_general;
    if (!b) return { respuesta: ERROR_DATOS('el Balance General') };
    const lineas = [
      '**Balance General** (acumulado con tus pólizas):',
      `- Activo: ${dinero(b.totalActivo)}`,
      `- Pasivo: ${dinero(b.totalPasivo)}`,
      `- Capital: ${dinero(b.totalCapital)}`,
      `- Resultado del periodo: ${dinero(b.resultadoDelPeriodo)}`,
      b.cuadra ? 'El balance **cuadra** (Activo = Pasivo + Capital + Resultado).' : '**El balance NO cuadra**: revisa las pólizas y el catálogo de cuentas en Contabilidad.',
    ];
    if (num(b.totalActivo) < 0 || num(b.totalPasivo) < 0) lineas.push('', NOTA_NEGATIVO);
    return { respuesta: lineas.join('\n'), fuente: 'Balance General del Dashboard' };
  },

  async bancos(_p, per, h) {
    const r = await h.saldos_de_cuentas({ ...(per || {}), prefijo: '1' });
    if (!r || r.error) return { respuesta: ERROR_DATOS('los saldos de bancos') };
    const cuentas = (r.cuentas || []).filter((c) => /caja|banco/.test(normalizar(c.nombre)));
    if (!cuentas.length) return { respuesta: 'No encontré cuentas de caja o bancos con movimientos' + (per ? ` en ${per.etiqueta}` : '') + '.' };
    const total = redondea(cuentas.reduce((a, c) => a + num(c.saldo), 0));
    const lineas = [`**Caja y bancos** (${per ? per.etiqueta : 'acumulado'}):`, ...cuentas.map((c) => `- ${c.nombre} (${c.codigo}): ${dinero(c.saldo)}`), `Total: **${dinero(total)}**.`];
    if (cuentas.some((c) => num(c.saldo) < 0)) lineas.push('', NOTA_NEGATIVO);
    if (r.aviso) lineas.push('', r.aviso);
    return { respuesta: lineas.join('\n'), fuente: 'saldos de las cuentas de caja y bancos' };
  },

  async por_cobrar(_p, _per, h) {
    const r = await h.cuentas_por_cobrar_y_pagar();
    if (!r || r.error) return { respuesta: ERROR_DATOS('las cuentas por cobrar') };
    const c = r.por_cobrar_clientes;
    return { respuesta: c.facturas_con_saldo
      ? `Tus clientes te deben **${dinero(c.importe_total)}** en ${c.facturas_con_saldo} factura${c.facturas_con_saldo > 1 ? 's' : ''} con saldo pendiente.`
      : 'No tienes facturas emitidas con saldo pendiente de cobro.', fuente: 'saldos de facturas emitidas' };
  },

  async por_pagar(_p, _per, h) {
    const r = await h.cuentas_por_cobrar_y_pagar();
    if (!r || r.error) return { respuesta: ERROR_DATOS('las cuentas por pagar') };
    const p = r.por_pagar_proveedores;
    return { respuesta: p.facturas_con_saldo
      ? `Debes **${dinero(p.importe_total)}** a proveedores en ${p.facturas_con_saldo} factura${p.facturas_con_saldo > 1 ? 's' : ''} con saldo pendiente.`
      : 'No tienes facturas de proveedores con saldo pendiente de pago.', fuente: 'saldos de facturas de proveedores' };
  },

  async iva(_p, per, h) {
    const periodo = per || (() => { const [a, m] = hoyMexico().split('-').map(Number); return { anio: a, mes: m, etiqueta: `${MESES[m - 1]} de ${a}` }; })();
    const r = await h.iva_del_periodo({ anio: periodo.anio, mes: periodo.mes });
    if (!r || r.error) return { respuesta: (r && r.error) || ERROR_DATOS('el IVA') };
    const lineas = [
      `**IVA** ${de(periodo.etiqueta || 'el periodo')} (cifra de referencia):`,
      `- IVA trasladado (cobrado a tus clientes): ${dinero(r.trasladado)}`,
      `- IVA acreditable (pagado a proveedores): ${dinero(r.acreditable)}`,
      r.resultado > 0 ? `- Resultado: **${dinero(r.resultado)} a cargo** (por pagar al SAT).` : r.resultado < 0 ? `- Resultado: **${dinero(-r.resultado)} a favor**.` : '- Resultado: $0.00.',
      '', ...(periodo.mes ? ['Es el movimiento de ' + periodo.etiqueta + '. Para el saldo del año pregunta, por ejemplo, "¿cómo va el IVA este año?".'] : []), AVISO_VALIDAR,
    ];
    return { respuesta: lineas.join('\n'), fuente: 'cuentas de IVA según la Configuración contable' };
  },

  async obligaciones(_p, _per, h) {
    const r = await h.obligaciones_fiscales();
    if (!r || r.error) return { respuesta: (r && r.error) || ERROR_DATOS('el calendario fiscal') };
    const lista = r.proximas || [];
    if (!lista.length) return { respuesta: 'No tienes obligaciones fiscales pendientes en el calendario. Si esperabas alguna, revisa SAT y Fiscal.' };
    const fila = (o) => `- ${o.obligacion} (${o.periodo}): vence el ${o.fecha_limite} · ${o.dias_restantes < 0 ? `**vencida hace ${-o.dias_restantes} día${o.dias_restantes === -1 ? '' : 's'}**` : o.dias_restantes === 0 ? '**vence hoy**' : `faltan ${o.dias_restantes} día${o.dias_restantes === 1 ? '' : 's'}`}`;
    const vencidas = lista.filter((o) => o.dias_restantes < 0).length;
    return { respuesta: ['**Obligaciones fiscales pendientes:**', ...lista.slice(0, 6).map(fila), vencidas ? `Tienes **${vencidas}** vencida${vencidas > 1 ? 's' : ''}: revísalas en SAT y Fiscal.` : ''].filter((x) => x !== '').join('\n'), fuente: 'calendario de SAT y Fiscal' };
  },

  async resultado(_p, per, h) {
    const periodo = per || (() => { const [a, m] = hoyMexico().split('-').map(Number); return { anio: a, mes: m, etiqueta: `${MESES[m - 1]} de ${a}` }; })();
    const r = await h.saldos_de_cuentas({ anio: periodo.anio, mes: periodo.mes });
    if (!r || r.error) return { respuesta: ERROR_DATOS('el resultado del periodo') };
    // Los totales por dígito se calculan con TODAS las cuentas; la lista de cuentas puede venir recortada.
    const tot = r.totales_por_digito || {};
    const ingresos = tot['4'] != null ? tot['4'] : sumaPorPrefijo(r.cuentas, '4');
    const costos = tot['5'] != null ? tot['5'] : sumaPorPrefijo(r.cuentas, '5');
    const gastos = tot['6'] != null ? tot['6'] : sumaPorPrefijo(r.cuentas, '6');
    const resultado = redondea(ingresos - costos - gastos);
    if (!ingresos && !costos && !gastos) return { respuesta: `No hay movimientos de ingresos, costos ni gastos en ${periodo.etiqueta}. Para ver el acumulado pregunta, por ejemplo, "¿cuánto gané este año?".` };
    const lineas = [
      `**Resultado ${de(periodo.etiqueta)}** (con las cuentas de ingresos, costos y gastos):`,
      `- Ingresos: ${dinero(ingresos)}`, `- Costos: ${dinero(costos)}`, `- Gastos: ${dinero(gastos)}`,
      resultado >= 0 ? `- **Utilidad: ${dinero(resultado)}**` : `- **Pérdida: ${dinero(-resultado)}**`,
      '', AVISO_VALIDAR,
    ];
    if (r.aviso) lineas.push(r.aviso);
    return { respuesta: lineas.join('\n'), fuente: 'saldos de las cuentas de ingresos, costos y gastos' };
  },

  async ingresos_egresos(_p, per, h) {
    const d = await h.resumen_general();
    if (!d || d.error) return { respuesta: ERROR_DATOS('los ingresos y egresos') };
    const f = d.facturacion_del_mes, o = d.movimientos_de_polizas_del_mes;
    const lineas = ['**Este mes:**'];
    if (f) lineas.push(`- Facturado: ${dinero(f.montoMes)} en ${f.timbradasMes} CFDI${f.canceladasMes ? ` (${f.canceladasMes} cancelado${f.canceladasMes > 1 ? 's' : ''})` : ''}`);
    if (o) lineas.push(`- Ingresos en pólizas: ${dinero(o.ingresos)}`, `- Egresos en pólizas: ${dinero(o.egresos)}`, `- Ingresos menos egresos: ${dinero(o.ingresos_menos_egresos)} (movimientos de pólizas; **no es la utilidad contable**: para eso pregúntame "¿cuánto gané este mes?")`);
    if (per && !(per.mes && per.anio && hoyMexico().startsWith(`${per.anio}-${String(per.mes).padStart(2, '0')}`))) lineas.push('', 'Por ahora esta respuesta solo cubre el mes en curso. Para otro mes, pregúntame por la utilidad o los saldos de ese mes.');
    return { respuesta: lineas.join('\n'), fuente: 'Dashboard' };
  },

  async saldo_cuenta(p, per, h) {
    const codigo = detectarCuenta(p);
    const r = await h.saldos_de_cuentas({ ...(per ? { anio: per.anio, ...(per.mes ? { mes: per.mes } : {}) } : {}), prefijo: codigo });
    if (!r || r.error) return { respuesta: ERROR_DATOS('el saldo de esa cuenta') };
    const c = (r.cuentas || []).find((x) => String(x.codigo) === codigo);
    const cuando = per ? per.etiqueta : 'acumulado';
    if (!c) return { respuesta: `No encontré movimientos en la cuenta ${codigo} (${cuando}). Revisa que el código exista en el catálogo de cuentas.` };
    const lineas = [`**${c.nombre} (${c.codigo})** — ${cuando}:`, `- Cargos (Debe): ${dinero(c.debe)}`, `- Abonos (Haber): ${dinero(c.haber)}`, `- **Saldo: ${dinero(c.saldo)}** (cuenta de naturaleza ${c.naturaleza})`];
    if (c.saldo < 0) lineas.push('', NOTA_NEGATIVO);
    return { respuesta: lineas.join('\n'), fuente: 'saldos de las cuentas' };
  },

  async sin_poliza(_p, _per, h) {
    const r = await h.cfdis_sin_poliza();
    if (!r || r.error) return { respuesta: ERROR_DATOS('las facturas sin póliza') };
    if (!r.total) return { respuesta: 'Todas tus facturas emitidas vigentes ya tienen su póliza de causación.' };
    const fila = (f) => `- ${f.folio || 'sin folio'} (${f.fecha ? String(f.fecha).slice(0, 10) : 's/f'}) · ${dinero(f.total)}`;
    return { respuesta: [`Tienes **${r.total}** factura${r.total > 1 ? 's' : ''} emitida${r.total > 1 ? 's' : ''} vigente${r.total > 1 ? 's' : ''} sin póliza:`, ...(r.facturas || []).map(fila), '', 'Para contabilizarla: Contabilidad → Captura rápida → Venta → "Importar desde factura timbrada".'].join('\n'), fuente: 'facturas emitidas y pólizas' };
  },

  async alertas(_p, _per, h) {
    const d = await h.resumen_general();
    if (!d || d.error) return { respuesta: ERROR_DATOS('las alertas') };
    const a = d.alertas || [];
    if (!a.length) return { respuesta: 'No tienes alertas pendientes en este momento.' };
    return { respuesta: [`Tienes **${a.length}** alerta${a.length > 1 ? 's' : ''}:`, ...a.map((x) => `- ${x.titulo}${x.detalle ? ` — ${x.detalle}` : ''}`)].join('\n'), fuente: 'alertas del Dashboard' };
  },

  async nomina(_p, _per, h) {
    const d = await h.resumen_general();
    const n = d && d.nomina;
    if (!n) return { respuesta: ERROR_DATOS('la nómina') };
    return { respuesta: `Tienes **${n.empleadosActivos}** empleado${n.empleadosActivos === 1 ? '' : 's'} activo${n.empleadosActivos === 1 ? '' : 's'}. La nómina mensual estimada es **${dinero(n.nominaMensualEstimada)}** (sueldo diario × 30; es una estimación, no una nómina calculada).`, fuente: 'Dashboard' };
  },
};

const limpiaHistorial = (h) => (Array.isArray(h) ? h : []).filter((x) => x && (x.rol === 'usuario' || x.rol === 'ia') && typeof x.texto === 'string').slice(-12);

/** Qué entendió el asistente de un texto: { tipo: 'saber' | 'cuenta' | 'intencion', ... } o null. */
function entender(texto) {
  const saber = buscarConocimiento(texto);
  if (saber) return { tipo: 'saber', saber };
  const cuenta = detectarCuenta(texto);
  if (cuenta) return { tipo: 'cuenta', cuenta, intencion: 'saldo_cuenta' };
  const intencion = detectarIntencion(texto);
  return intencion ? { tipo: 'intencion', intencion } : null;
}

/**
 * Contesta una pregunta. `herramientas` son las de solo lectura (crearHerramientasReales o simuladas).
 * `historial` (opcional) son los mensajes anteriores [{ rol: 'usuario'|'ia', texto }]: permite contestar "¿y el mes pasado?".
 * Nunca lanza: regresa { ok, respuesta, intencion, fuente? } o { ok:false, error, codigo }.
 */
export async function responderPorReglas({ pregunta, historial }, { herramientas = {}, hoy = hoyMexico(), log = console } = {}) {
  let p = typeof pregunta === 'string' ? pregunta.trim() : '';
  if (!p) return { ok: false, codigo: 'CONSULTA_INVALIDA', error: 'Escribe una pregunta.' };
  if (p.length > MAX_PREGUNTA_ASISTENTE) return { ok: false, codigo: 'CONSULTA_INVALIDA', error: `La pregunta es muy larga (máximo ${MAX_PREGUNTA_ASISTENTE} caracteres).` };

  let ent = entender(p);
  let corregida = false;
  if (!ent) { const c = corregirTexto(p); if (c.trim() !== normalizar(p).trim()) { const e2 = entender(c); if (e2) { ent = e2; p = c; corregida = true; } } }

  // Seguimiento: "¿y el mes pasado?" repite la pregunta de datos anterior con el periodo nuevo.
  let seguimiento = false;
  if (!ent && detectarPeriodo(p, hoy) && normalizar(p).trim().split(' ').length <= 8) {
    const previas = limpiaHistorial(historial).filter((x) => x.rol === 'usuario').reverse();
    for (const prev of previas) { const e = entender(prev.texto); if (e && e.tipo !== 'saber') { ent = e; seguimiento = true; p = e.tipo === 'cuenta' ? prev.texto + ' ' + p : p; break; } }
  }
  if (!ent) return { ok: true, ...NO_ENTIENDO(p) };

  // Concepto o guía: respuestas fijas, sin datos de la empresa.
  if (ent.tipo === 'saber') {
    const saber = ent.saber;
    const pista = saber.datos ? '\n\nPara ver el dato de tu empresa pregunta: "' + saber.datos + '"' : '';
    return { ok: true, intencion: 'conocimiento:' + saber.id, respuesta: saber.respuesta + pista, fuente: 'guía de CONTATECK' };
  }

  const intencion = ent.intencion;
  try {
    const periodo = detectarPeriodo(p, hoy);
    const r = await MANEJADORES[intencion](p, periodo, herramientas);
    // "¿Cuánto me deben mis clientes y cuánto debo a proveedores?" menciona las dos: se contestan las dos.
    const par = { por_cobrar: 'por_pagar', por_pagar: 'por_cobrar' }[intencion];
    if (par && puntosDeIntencion(p, par) > 0) {
      const r2 = await MANEJADORES[par](p, periodo, herramientas);
      const [primero, segundo] = intencion === 'por_cobrar' ? [r, r2] : [r2, r];
      return { ok: true, intencion: 'por_cobrar_y_pagar', respuesta: primero.respuesta + '\n' + segundo.respuesta, fuente: 'saldos de facturas emitidas y de proveedores' };
    }
    return { ok: true, intencion, respuesta: r.respuesta, fuente: r.fuente || null, ...(corregida ? { corregida: true } : {}), ...(seguimiento ? { seguimiento: true } : {}) };
  } catch (e) {
    log.warn('[asistente] falló la intención', intencion);
    return { ok: true, intencion, respuesta: ERROR_DATOS('esos datos') };
  }
}
