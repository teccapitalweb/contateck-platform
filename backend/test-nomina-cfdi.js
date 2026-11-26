// ============================================================
//  CONTATECK · Pruebas del timbrado de CFDI de nómina (OT-0064)
//  Sin red ni base de datos: el PAC y el registro se simulan; el frontend real se ejecuta en un contexto aislado.
//  Ejecutar:  npm run test:nomina-cfdi
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { faltantesEmpleado, desgloseRenglon, construirCfdiNomina, antiguedadSemanas, fechaDePago, PERIODICIDAD_SAT } from './src/nominaCfdi.js';
import { timbrarNomina, mensajeDelPac } from './src/timbradoNomina.js';
import { columnaFaltante } from './src/supabaseNominas.js';

process.env.TZ = 'America/Mexico_City';   // la zona horaria de los usuarios: ahí el periodo se veía un día corrido
const aqui = path.dirname(fileURLToPath(import.meta.url));
const leer = (...p) => fs.readFileSync(path.join(aqui, ...p), 'utf8').replace(/\r\n/g, '\n');
let pruebas = 0;
const ok = async (nombre, fn) => { await fn(); pruebas++; console.log('  ✔ ' + nombre); };

const emp = { id: 'aaaaaaaa-1111-2222-3333-444444444444', nombre: 'Karla Fuente Nolasco', puesto: 'Contadora', departamento: 'Contabilidad', fecha_ingreso: '2024-03-01', rfc: 'FUNK671228PH6', curp: 'FUNK671228MDFNLR08', nss: '12345678901', cuenta_bancaria: null, cp_fiscal: '01160', tipo_contrato: '01', tipo_jornada: '01', riesgo_puesto: '1', clave_entidad: 'CMX' };
const nomina = { periodicidad: 'quincenal', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-15', dias: 15 };
const ren = { id: 'r1', empleado_id: emp.id, nombre: emp.nombre, sueldo_base: 6000, otras_percepciones: 0, deducciones: 292, isr_bruto: 342, isr_retenido: 142, subsidio: 200, imss: 150, otras_deducciones: 0, sdi: 210.5 };
const EMISOR = { tin: 'EKU9003173C9', legalName: 'ESCUELA KEMPER URGATE', taxRegimeCode: '601', taxCredentials: [{ fileType: 0 }] };
const FECHA = '2026-11-25T10:00:00';
const ctx = (extra = {}) => ({ nomina, renglon: ren, empleado: emp, emisor: EMISOR, cpExpedicion: '42501', fecha: FECHA, registroPatronal: 'B5510768108', ...extra });

console.log('\nTimbrado de CFDI de nómina (OT-0064)\n');

await ok('datos fiscales del empleado: se pide RFC, CURP, código postal, contrato y entidad; lo que falta se nombra', () => {
  assert.deepEqual(faltantesEmpleado(emp), []);
  assert.equal(faltantesEmpleado({}).length, 5);
  assert.deepEqual(faltantesEmpleado({ ...emp, cp_fiscal: '1160' }), ['código postal fiscal (5 dígitos)']);
  assert.deepEqual(faltantesEmpleado({ ...emp, rfc: 'ABC' }), ['RFC (13 caracteres)']);          // una persona moral o un RFC corto no sirven para un empleado
  assert.deepEqual(faltantesEmpleado({ ...emp, clave_entidad: 'Jalisco' }), ['entidad federativa (3 letras)']);
  assert.deepEqual(faltantesEmpleado({ ...emp, rfc: ' funk671228ph6 ', curp: 'funk671228mdfnlr08' }), [], 'minúsculas y espacios no estorban');
});

await ok('desglose: con subsidio, ISR de tarifa en deducciones y el subsidio aplicado como otro pago (neto intacto)', () => {
  const d = desgloseRenglon(ren);
  assert.equal(d.ok, true);
  assert.equal(d.deduccionIsr, 342); assert.equal(d.subsidioAplicado, 200); assert.equal(d.subsidioCausado, 200);
  assert.equal(d.totalDeducciones, 492); assert.equal(d.totalOtrosPagos, 200); assert.equal(d.totalPercepciones, 6000);
  assert.equal(d.neto, 5708, 'percepciones + otros pagos − deducciones = neto del renglón (6000 − 292)');
  // el subsidio causado puede exceder al ISR: solo se aplica hasta el ISR (desde mayo de 2024 el excedente no se entrega)
  const e = desgloseRenglon({ ...ren, sueldo_base: 1000, deducciones: 20, isr_bruto: 100, isr_retenido: 0, subsidio: 300, imss: 20 });
  assert.equal(e.subsidioAplicado, 100); assert.equal(e.subsidioCausado, 300); assert.equal(e.neto, 980);
  // sin subsidio
  const s = desgloseRenglon({ ...ren, deducciones: 292, isr_bruto: 142, subsidio: 0 });
  assert.equal(s.subsidioAplicado, 0); assert.equal(s.totalDeducciones, 292); assert.equal(s.neto, 5708);
});

await ok('desglose: una nómina guardada sin desglose, o que no cuadra, no se timbra y se explica', () => {
  const sin = desgloseRenglon({ ...ren, isr_retenido: null, imss: null });
  assert.equal(sin.ok, false); assert.match(sin.error, /Vuelve a calcularla/);
  const mal = desgloseRenglon({ ...ren, deducciones: 999 });
  assert.equal(mal.ok, false); assert.match(mal.error, /no coincide/);
});

await ok('CFDI de nómina: tipo N, sin forma de pago, concepto 84111505, uso CN01, régimen 605 y complemento con percepciones, deducciones y otro pago', () => {
  const r = construirCfdiNomina(ctx());
  assert.equal(r.ok, true);
  const i = r.invoice;
  assert.equal(i.typeCode, 'N'); assert.equal(i.versionCode, '4.0'); assert.equal(i.currencyCode, 'MXN');
  assert.ok(!('paymentFormCode' in i), 'el PAC rechaza FormaPago en tipo N (CFDI40103)');
  assert.equal(i.paymentMethodCode, 'PUE'); assert.equal(i.expeditionZipCode, '42501'); assert.equal(i.date, FECHA);
  assert.equal(i.recipient.cfdiUseCode, 'CN01'); assert.equal(i.recipient.taxRegimeCode, '605'); assert.equal(i.recipient.zipCode, '01160');
  assert.equal(i.recipient.tin, 'FUNK671228PH6'); assert.equal(i.recipient.legalName, 'KARLA FUENTE NOLASCO');
  const it = i.items[0];
  assert.equal(it.itemCode, '84111505'); assert.equal(it.unitOfMeasurementCode, 'ACT'); assert.equal(it.taxObjectCode, '01');
  assert.equal(it.unitPrice, '6200.00'); assert.equal(it.discount, '492.00'); assert.equal(it.quantity, '1');
  const p = i.complement.payroll;
  assert.equal(p.version, '1.2'); assert.equal(p.payrollTypeCode, 'O'); assert.equal(p.daysPaid, 15);
  assert.equal(p.initialPaymentDate, '2026-11-01'); assert.equal(p.finalPaymentDate, '2026-11-15'); assert.equal(p.paymentDate, '2026-11-15');
  assert.deepEqual(p.earnings.earnings.map((x) => [x.earningTypeCode, x.taxedAmount, x.exemptAmount]), [['001', 6000, 0]]);
  assert.deepEqual(p.deductions.map((x) => [x.deductionTypeCode, x.amount]), [['001', 150], ['002', 342]]);
  assert.deepEqual(p.earnings.otherPayments.map((x) => [x.otherPaymentTypeCode, x.amount, x.subsidyCaused]), [['002', 200, 200]]);
  // el neto del CFDI (subtotal − descuento) es el neto del renglón
  assert.equal(Number(it.unitPrice) - Number(it.discount), 5708);
  assert.equal(i.issuer.employerData.employerRegistration, 'B5510768108');
  assert.equal(i.issuer.tin, 'EKU9003173C9'); assert.equal(EMISOR.employerData, undefined, 'no se modifica el emisor original');
});

await ok('CFDI de nómina: datos del empleado (periodicidad, antigüedad, NSS solo con registro patronal, CLABE, SDI) y otras percepciones/deducciones', () => {
  const e = construirCfdiNomina(ctx()).invoice.recipient.employeeData;
  assert.equal(e.curp, 'FUNK671228MDFNLR08'); assert.equal(e.satPaymentPeriodicityId, '04'); assert.equal(e.satContractTypeId, '01'); assert.equal(e.satTaxRegimeTypeId, '02');
  assert.equal(e.satPayrollStateId, 'CMX'); assert.equal(e.satWorkdayTypeId, '01'); assert.equal(e.satJobRiskId, '1'); assert.equal(e.employeeNumber, 'aaaaaaaa');
  assert.equal(e.laborRelationStartDate, '2024-03-01'); assert.equal(e.seniority, 'P141W');
  assert.equal(e.socialSecurityNumber, '12345678901'); assert.equal(e.integratedDailySalary, 210.5); assert.equal(e.baseSalaryForContributions, 210.5);
  assert.equal(e.bankAccount, undefined, 'una cuenta que no es CLABE no se informa (pediría el banco)');
  const sinRp = construirCfdiNomina(ctx({ registroPatronal: '' })).invoice;
  assert.equal(sinRp.recipient.employeeData.socialSecurityNumber, undefined, 'el SAT pide registro patronal cuando se informa el NSS');
  assert.equal(sinRp.issuer.employerData, undefined);
  const clabe = construirCfdiNomina(ctx({ empleado: { ...emp, cuenta_bancaria: '012345678901234567' } })).invoice.recipient.employeeData;
  assert.equal(clabe.bankAccount, '012345678901234567');
  const mas = construirCfdiNomina(ctx({ renglon: { ...ren, otras_percepciones: 500, deducciones: 342, otras_deducciones: 50 } })).invoice;
  const p = mas.complement.payroll;
  assert.deepEqual(p.earnings.earnings.map((x) => x.earningTypeCode), ['001', '038']);
  assert.deepEqual(p.deductions.map((x) => x.deductionTypeCode), ['001', '002', '004']);
  assert.equal(mas.items[0].unitPrice, '6700.00'); assert.equal(mas.items[0].discount, '542.00');
  for (const [k, v] of [['semanal', '02'], ['catorcenal', '03'], ['quincenal', '04'], ['mensual', '05']]) assert.equal(PERIODICIDAD_SAT[k], v);
  assert.equal(antiguedadSemanas('2026-11-01', '2026-11-07'), 'P1W'); assert.equal(antiguedadSemanas('2026-11-15', '2026-11-01'), null); assert.equal(antiguedadSemanas('x', '2026-11-01'), null);
});

await ok('CFDI de nómina: sin subsidio igual lleva el otro pago 002 en cero (lo exige el SAT con régimen 02); la fecha de pago no es futura', () => {
  const r = construirCfdiNomina(ctx({ renglon: { ...ren, isr_bruto: 142, subsidio: 0 }, nomina: { ...nomina, fecha_fin: '2026-12-15' }, fecha: '2026-11-25T10:00:00' }));
  const p = r.invoice.complement.payroll;
  assert.deepEqual(p.earnings.otherPayments.map((x) => [x.amount, x.subsidyCaused]), [[0, 0]]);
  assert.equal(p.deductions.find((x) => x.deductionTypeCode === '002').amount, 142);
  assert.equal(p.paymentDate, '2026-11-25', 'la fecha de pago se recorta al día de hoy');
  assert.equal(p.finalPaymentDate, '2026-12-15');
});

await ok('CFDI de nómina: no se arma con datos faltantes ni con periodicidad o fechas inválidas', () => {
  assert.match(construirCfdiNomina(ctx({ empleado: { ...emp, cp_fiscal: null, tipo_contrato: '' } })).error, /Faltan datos fiscales del empleado: .*código postal.*tipo de contrato/);
  assert.match(construirCfdiNomina(ctx({ nomina: { ...nomina, periodicidad: 'anual' } })).error, /Periodicidad/);
  assert.match(construirCfdiNomina(ctx({ nomina: { ...nomina, fecha_inicio: 'ayer' } })).error, /fechas/);
  assert.match(construirCfdiNomina(ctx({ renglon: { ...ren, isr_retenido: null, imss: null } })).error, /desglose/);
  assert.match(construirCfdiNomina(ctx({ renglon: { ...ren, sueldo_base: 0, deducciones: 0, isr_bruto: 0, isr_retenido: 0, subsidio: 0, imss: 0 } })).error, /percepciones/);
});

// ---------- orquestador ----------
function entorno(sobre = {}) {
  const llamadas = { timbrar: [], registrar: [] };
  const deps = {
    emisor: EMISOR, cpExpedicion: '42501', registroPatronal: 'B5510768108', fecha: () => FECHA, log: { error() {}, warn() {} },
    async timbrar(inv) { llamadas.timbrar.push(inv); return sobre.timbrar ? sobre.timbrar(inv, llamadas.timbrar.length) : { ok: true, status: 200, data: { id: 'pac-' + llamadas.timbrar.length, uuid: '00000000-0000-4000-8000-00000000000' + llamadas.timbrar.length } }; },
    async registrar(id, d) { llamadas.registrar.push([id, d]); return sobre.registrar ? sobre.registrar(id, d) : { ok: true }; },
  };
  return { deps, llamadas };
}
const emp2 = { ...emp, id: 'bbbbbbbb-1111-2222-3333-444444444444', nombre: 'Beto', rfc: 'BEPB800101AB1', curp: 'BEPB800101HDFRRT09' };
const datos = (detalle, empleados = [emp, emp2]) => ({ nomina, detalle, empleados });

await ok('timbra cada empleado, anota su UUID y no vuelve a timbrar al que ya tiene uno', async () => {
  const { deps, llamadas } = entorno();
  const r = await timbrarNomina(datos([ren, { ...ren, id: 'r2', empleado_id: emp2.id, nombre: 'Beto' }, { ...ren, id: 'r3', cfdi_uuid: 'ya-timbrado-uuid' }]), deps);
  assert.equal(r.ok, true);
  assert.deepEqual(r.resumen, { total: 3, timbrados: 2, yaTimbrados: 1, errores: 0, omitidos: 0 });
  assert.equal(llamadas.timbrar.length, 2, 'el ya timbrado no llega al PAC');
  assert.deepEqual(llamadas.registrar.map((x) => x[0]), ['r1', 'r2']);
  assert.equal(llamadas.registrar[0][1].uuid, '00000000-0000-4000-8000-000000000001'); assert.equal(llamadas.registrar[0][1].fiscalapiId, 'pac-1');
  assert.deepEqual(r.resultados.map((x) => x.estado), ['timbrado', 'timbrado', 'ya_timbrado']);
});

await ok('el error de datos de UN empleado no detiene a los demás y nunca llega al PAC', async () => {
  const { deps, llamadas } = entorno();
  const r = await timbrarNomina(datos([{ ...ren, empleado_id: 'otro-sin-ficha', id: 'r9' }, { ...ren, id: 'r2', empleado_id: emp2.id, nombre: 'Beto' }, { ...ren, id: 'r3', empleado_id: emp.id, isr_retenido: null, imss: null }], [emp, { ...emp2, cp_fiscal: '' }]), deps);
  assert.equal(r.resumen.errores, 3); assert.equal(llamadas.timbrar.length, 0);
  assert.match(r.resultados[0].error, /ya no existe/); assert.match(r.resultados[1].error, /código postal/); assert.match(r.resultados[2].error, /desglose/);
});

await ok('un rechazo del PAC por datos se informa y sigue; un error de sesión o de servidor detiene el lote (los demás quedan "omitidos")', async () => {
  const a = entorno({ timbrar: (inv, n) => (n === 1 ? { ok: false, status: 400, message: 'NOM42-algo', details: 'detalle' } : { ok: true, data: { id: 'p', uuid: '00000000-0000-4000-8000-000000000009' } }) });
  const r1 = await timbrarNomina(datos([ren, { ...ren, id: 'r2' }]), a.deps);
  assert.deepEqual(r1.resultados.map((x) => x.estado), ['error', 'timbrado']); assert.match(r1.resultados[0].error, /NOM42-algo detalle/);
  const b = entorno({ timbrar: () => ({ ok: false, status: 503, message: 'caído' }) });
  const r2 = await timbrarNomina(datos([ren, { ...ren, id: 'r2' }, { ...ren, id: 'r3' }]), b.deps);
  assert.deepEqual(r2.resultados.map((x) => x.estado), ['error', 'omitido', 'omitido']); assert.equal(b.llamadas.timbrar.length, 1); assert.match(r2.detenido, /503/);
  const c = entorno({ timbrar: () => { throw new Error('red'); } });
  const r3 = await timbrarNomina(datos([ren, { ...ren, id: 'r2' }]), c.deps);
  assert.equal(r3.resultados[0].estado, 'error'); assert.equal(r3.resultados[1].estado, 'omitido');
});

await ok('si el PAC timbró pero no se pudo anotar el UUID, el lote se detiene (reintentar duplicaría el timbre) y el UUID se devuelve', async () => {
  const { deps, llamadas } = entorno({ registrar: () => ({ ok: false, error: 'falla de red' }) });
  const r = await timbrarNomina(datos([ren, { ...ren, id: 'r2' }]), deps);
  assert.equal(r.resultados[0].estado, 'timbrado_sin_registro'); assert.ok(r.resultados[0].uuid); assert.match(r.resultados[0].error, /Anota el UUID/);
  assert.equal(r.resultados[1].estado, 'omitido'); assert.equal(llamadas.timbrar.length, 1); assert.match(r.detenido, /no se pudo anotar/);
  const sinUuid = entorno({ timbrar: () => ({ ok: true, data: { id: 'p' } }) });
  const r2 = await timbrarNomina(datos([ren, { ...ren, id: 'r2' }]), sinUuid.deps);
  assert.equal(r2.resultados[0].estado, 'error'); assert.equal(r2.resultados[1].estado, 'omitido'); assert.equal(sinUuid.llamadas.registrar.length, 0);
});

await ok('sin registro patronal, sin nómina o sin empleados no se llama al PAC', async () => {
  const { deps, llamadas } = entorno();
  assert.match((await timbrarNomina(datos([ren]), { ...deps, registroPatronal: '' })).error, /registro patronal/);
  assert.match((await timbrarNomina({ nomina: null, detalle: [], empleados: [] }, deps)).error, /No encontré esa nómina/);
  assert.match((await timbrarNomina(datos([]), deps)).error, /no tiene empleados/);
  assert.equal(llamadas.timbrar.length, 0);
});

await ok('la ruta exige rol (rh, admin o director) y un id válido ANTES de leer datos o llamar al PAC, con candado por nómina; el XML sale por RLS', () => {
  const ruta = leer('src', 'routes', 'nominas.js');
  const i = ruta.indexOf("'/nominas/:id/timbrar'");
  const iRol = ruta.indexOf('obtenerRolUsuario(req.token)', i), iId = ruta.indexOf('UUID_RE.test(id)', i), iCand = ruta.indexOf('enCurso.set(id', i), iLee = ruta.indexOf('leerParaTimbrar(req.token', i), iPac = ruta.indexOf('invoices.create', i);
  assert.ok(i > 0 && iRol > i && iId > iRol && iCand > iId && iLee > iCand && iPac > iLee, 'rol → id → candado → lectura → PAC');
  assert.ok(ruta.includes("['rh', 'admin', 'director']") && ruta.includes('enCurso.delete(id)'));
  const sx = leer('src', 'supabaseNominas.js');
  assert.ok(!/service_?role/i.test(sx) && !/service_?role/i.test(ruta), 'se lee y escribe con el token del usuario, nunca con llave de servicio');
  assert.ok(sx.includes("rpc('registrar_timbre_nomina'") && sx.includes("eq('id', detalleId)"));
  assert.ok(!/EMISOR_CSD|csdPassword|csdKey/i.test(ruta), 'la ruta no toca llaves del emisor');
  assert.equal(columnaFaltante({ message: 'column nomina_detalle.isr_bruto does not exist', code: '42703' }), true);
  assert.equal(columnaFaltante({ message: 'Could not find the function public.registrar_timbre_nomina', code: 'PGRST202' }), true);
  assert.equal(columnaFaltante({ message: 'permission denied for table nomina_detalle', code: '42501' }), false);
});

await ok('el SQL propuesto es aditivo (no borra nada), guarda el desglose y limita quién anota timbres', () => {
  const sql = leer('..', 'database', 'OT-0064-timbrado-nomina-PROPUESTA.sql');
  const sinComentarios = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/\bdrop\s+(table|column)|\btruncate\b|\bdelete\s+from\b/i.test(sinComentarios), 'no borra datos ni columnas');
  for (const c of ['isr_bruto', 'isr_retenido', 'subsidio', 'imss', 'otras_deducciones', 'sdi', 'cfdi_uuid', 'cfdi_fiscalapi_id', 'cp_fiscal', 'tipo_contrato', 'clave_entidad']) assert.ok(sinComentarios.includes('add column if not exists ' + c), c);
  assert.ok(sinComentarios.includes('periodo_esta_cerrado') && sinComentarios.includes("Empleado no válido"), 'conserva las validaciones de OT-0047');
  assert.ok(sinComentarios.includes("auth_rol() not in ('rh', 'admin', 'director')"));
  assert.ok(sinComentarios.includes('revoke all on function public.registrar_timbre_nomina') && sinComentarios.includes('from public, anon'));
  assert.ok(/create unique index if not exists nomina_detalle_cfdi_uuid_uk/.test(sinComentarios));
});

await ok('frontend: el resultado y el detalle escapan todo; el recibo timbrado muestra el UUID; la nómina guarda el desglose; el empleado captura sus datos fiscales', () => {
  const nom = leer('..', 'frontend', 'nomina.js');
  const a = nom.indexOf('/*RECIBO-INICIO*/'), b = nom.indexOf('/*RECIBO-FIN*/'), c = nom.indexOf('/*TIMBRADO-INICIO*/'), d = nom.indexOf('/*TIMBRADO-FIN*/');
  assert.ok(a > 0 && b > a && c > 0 && d > c);
  const cx = vm.createContext({
    money: (n) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtFecha: (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—'),
    PERIODO_ETIQUETAS: { quincenal: 'Quincenal' },
  });
  vm.runInContext(nom.slice(a, b) + '\n' + nom.slice(c, d) + '\nthis.res = resultadoTimbradoHtml; this.celda = celdaCfdi; this.recibo = reciboNominaHtml;', cx);
  const h = cx.res({ ok: true, resumen: { timbrados: 1, yaTimbrados: 1, errores: 1, omitidos: 0 }, detenido: '<i>x</i>', resultados: [
    { nombre: 'Ana <b>P</b>', estado: 'timbrado', uuid: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb' }, { nombre: 'Beto', estado: 'error', error: '<script>alert(1)</script> falta CP' }, { nombre: 'Cleo', estado: 'ya_timbrado', uuid: 'u' }] });
  assert.ok(h.includes('Ana &lt;b&gt;P&lt;/b&gt;') && !h.includes('<b>P</b>') && !h.includes('<script>') && h.includes('&lt;script&gt;') && !h.includes('<i>x</i>'));
  assert.ok(h.includes('Timbrados: <b>1</b>') && h.includes('Con error: <b>1</b>') && h.includes('Ya estaba timbrado') && h.includes('no tienen efecto fiscal real'));
  assert.ok(cx.res({ ok: false, error: 'Falta aplicar el SQL <x>' }).includes('&lt;x&gt;'));
  assert.ok(cx.celda({}).includes('Sin timbrar'));
  const cel = cx.celda({ id: 'i"1', cfdi_uuid: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb' });
  assert.ok(cel.includes('aaaaaaaa…') && cel.includes('data-nom-xml="i&quot;1"') && cel.includes('>XML<'));
  assert.ok(cel.includes('data-nom-pdf="i&quot;1"') && cel.includes('>PDF<') && !cel.includes('data-nom-pdf="i"1"'), 'OT-0069: el botón PDF escapa el id igual que el XML');
  const rec = cx.recibo({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-15', periodicidad: 'quincenal' }, [{ nombre: 'Ana', sueldo_base: 1, otras_percepciones: 0, deducciones: 0, neto: 1, cfdi_uuid: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb' }, { nombre: 'Beto', sueldo_base: 1, otras_percepciones: 0, deducciones: 0, neto: 1 }], {});
  assert.ok(rec.includes('UUID: aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb') && rec.includes('ambiente de PRUEBAS') && rec.includes('No es un CFDI de nómina'), 'timbrado muestra el UUID; el que no, aclara que no es un CFDI');
  for (const k of ['isr_bruto: f.isrBruto', 'isr_retenido: f.isr', 'subsidio: f.subsidio', 'imss: f.imss', 'otras_deducciones: f.deducciones', 'sdi: f.sdi']) assert.ok(nom.includes(k), k);
  assert.ok(nom.includes('data-hist-timbrar') && nom.includes('puedeProcesar() ? \' <button') && nom.includes('/timbrar'));
  const fs2 = leer('..', 'frontend', 'data-firestore.js');
  for (const k of ['cp_fiscal', 'clave_entidad', 'tipo_contrato', 'tipo_jornada', 'riesgo_puesto']) assert.ok(fs2.includes('k: "' + k + '"'), k);
  assert.ok(fs2.includes('Object.assign({') && fs2.includes('}, fiscales)'), 'los datos fiscales solo viajan si se capturaron');
  assert.ok(leer('src', 'supabaseCrud.js').includes("'cp_fiscal', 'tipo_contrato', 'tipo_jornada', 'riesgo_puesto', 'clave_entidad'"));
  assert.ok(leer('..', 'frontend', 'dashboard.html').includes('nomina.js?v=6') && leer('..', 'frontend', 'dashboard.html').includes('data-firestore.js?v=15'));
});

await ok('el motivo del rechazo del PAC se muestra limpio: se extrae el mensaje real y el RFC que no existe en el SAT (NOM9) se explica', () => {
  const crudo = { ok: false, status: 400, message: 'Request failed with status code 400',
    details: '{"data":null,"succeeded":false,"message":"NOM9-El atributo Comprobante.Receptor.Rfc debe estar en la lista de RFC inscritos no cancelados en el SAT.","details":null,"httpStatusCode":400}' };
  const t = mensajeDelPac(crudo);
  assert.match(t, /^El RFC del empleado no está inscrito en el SAT/); assert.ok(t.includes('(NOM9)') && !t.includes('{') && !t.includes('Request failed'));
  const otro = mensajeDelPac({ message: 'Request failed with status code 400', details: '{"message":"NOM42-Falta algo","details":"Detalle del campo","httpStatusCode":400}' });
  assert.equal(otro, 'NOM42-Falta algo Detalle del campo');
  assert.equal(mensajeDelPac({ message: 'NOM42-algo', details: 'detalle' }), 'NOM42-algo detalle');
  assert.equal(mensajeDelPac({ message: 'x', details: '{no es json' }), 'x {no es json');
  assert.equal(mensajeDelPac({}), 'El PAC rechazó el timbrado.'); assert.equal(mensajeDelPac(null), 'El PAC rechazó el timbrado.');
});

await ok('fecha de pago del CFDI: el día en que se aprobó la nómina (hora de México), sin salirse del periodo ni pasar de hoy', () => {
  const n = { fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' };
  assert.equal(fechaDePago({ ...n, created_at: '2026-11-26T03:30:00Z' }, '2026-11-26'), '2026-11-25', 'las 21:30 del 25 en México, no el 26 en UTC');
  assert.equal(fechaDePago({ ...n, created_at: '2026-10-20T18:00:00Z' }, '2026-11-26'), '2026-11-01', 'no antes del inicio del periodo');
  assert.equal(fechaDePago({ ...n, created_at: '2026-12-20T18:00:00Z' }, '2026-11-26'), '2026-11-26', 'no después de hoy');
  assert.equal(fechaDePago(n, '2026-11-26'), '2026-11-26', 'sin fecha de proceso: el fin del periodo recortado a hoy');
  assert.equal(fechaDePago({ ...n, fecha_fin: '2026-11-15' }, '2026-11-26'), '2026-11-15');
  const r = construirCfdiNomina(ctx({ nomina: { ...nomina, fecha_fin: '2026-11-30', created_at: '2026-11-20T18:00:00Z' }, fecha: '2026-11-25T10:00:00' }));
  assert.equal(r.invoice.complement.payroll.paymentDate, '2026-11-20');
  assert.ok(leer('src', 'supabaseNominas.js').includes("estado, created_at')"), 'la lectura para timbrar trae la fecha de proceso');
});

await ok('fechas del historial: una fecha sin hora no se corre un día en la zona horaria de México', () => {
  const nom = leer('..', 'frontend', 'nomina.js');
  const a = nom.indexOf('function fmtFecha'), b = nom.indexOf('const PERIODO_ETIQUETAS');
  assert.ok(a > 0 && b > a);
  const cx = vm.createContext({});
  vm.runInContext(nom.slice(a, b) + '\nthis.f = fmtFecha;', cx);
  assert.equal(cx.f('2026-11-01'), '01/11/2026'); assert.equal(cx.f('2026-11-30'), '30/11/2026'); assert.equal(cx.f('2026-01-01'), '01/01/2026');
  assert.equal(cx.f(null), '—'); assert.equal(cx.f('texto raro'), 'texto raro');
  assert.match(cx.f('2026-11-16T18:00:00Z'), /^\d{2}\/\d{2}\/2026$/, 'una fecha con hora se sigue mostrando');
});

console.log(`\n✔ ${pruebas} pruebas de timbrado de nómina pasaron\n`);
