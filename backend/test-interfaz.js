// ============================================================
//  CONTATECK · Pruebas de interfaz: sin botones muertos ni "Próximamente" engañosos (OT-0060)
//  Sin navegador: cargan el código real del frontend en un contexto aislado y revisan el texto de las pantallas.
//  Ejecutar:  npm run test:interfaz
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log('  ✔ ' + nombre); };

const app = leer('app.js'), html = leer('dashboard.html'), fiscal = leer('fiscal.js'), inv = leer('invitaciones.js'), css = leer('styles.css');

console.log('\nInterfaz sin botones muertos (OT-0060)\n');

ok('Exportar del Dashboard genera un CSV que Excel abre bien: BOM, secciones, números sin tocar y textos de usuario neutralizados', () => {
  const ini = app.indexOf('/*CSV-INICIO*/'), fin = app.indexOf('/*CSV-FIN*/');
  assert.ok(ini > 0 && fin > ini, 'no se encontró el generador de CSV');
  const ctx = vm.createContext({});
  vm.runInContext(app.slice(ini, fin) + '\nthis.dashboardACsv = dashboardACsv;', ctx);
  const csv = ctx.dashboardACsv({
    ok: true, facturacion: { montoMes: 500, timbradasMes: 2, canceladasMes: 1 }, operacion: { ingresosMes: 448, egresosMes: 1552.16, utilidadMes: -1104.16 },
    nomina: { empleadosActivos: 1, nominaMensualEstimada: 15000 }, balanceGeneral: { totalActivo: -424.57, totalPasivo: -510.78, totalCapital: 0, resultadoDelPeriodo: 86.21, cuadra: true },
    composicionGastos: [{ cuenta: 'Gastos de operación', monto: 172.41 }],
    alertas: [{ titulo: '=HYPERLINK("http://malo")', texto: '+cmd|calc' }, { titulo: 'Normal', texto: 'texto, con "comillas"' }],
    proximasObligacionesSat: [{ obligacion: 'IVA mensual', periodo: 'octubre 2026', fechaVencimiento: '2026-11-17' }],
  }, 'Empresa "Demo", C', '2026-11-25');
  assert.ok(csv.startsWith('﻿"CONTATECK · Resumen del Dashboard"'));
  assert.ok(csv.endsWith('\r\n'));
  assert.match(csv, /"Empresa","Empresa ""Demo"", C"/);                       // comillas y comas escapadas
  assert.match(csv, /"Ingresos menos egresos \(no es la utilidad contable\)",-1104\.16/);   // número negativo SIN apóstrofo
  assert.match(csv, /"Activo",-424\.57/); assert.match(csv, /"Cuadra","Sí"/);
  assert.match(csv, /"Gastos de operación",172\.41/);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/malo""\)","'\+cmd\|calc"/);       // fórmulas neutralizadas
  assert.match(csv, /"Normal","texto, con ""comillas"""/);
  assert.match(csv, /"IVA mensual","octubre 2026","2026-11-17"/);
  const vacio = ctx.dashboardACsv({ ok: true }, 'X', '2026-11-25');
  assert.match(vacio, /"Sin alertas"/); assert.match(vacio, /"Facturado",0/);
});

ok('el Dashboard ofrece Exportar (Excel) e Imprimir / PDF funcionando, y ya no hay "llega en la siguiente fase"', () => {
  assert.ok(html.includes('data-dash-exportar') && html.includes('data-dash-imprimir'));
  assert.ok(html.includes('Exportar (Excel)') && html.includes('Imprimir / PDF'));
  assert.ok(!html.includes('La exportación a Excel/PDF llega en la siguiente fase'));
  assert.ok(app.includes('window.__ctDashDatos = datos') && app.includes('window.print()'));
  assert.ok(/@media print[\s\S]*\.side[\s\S]*display: none/.test(css), 'la impresión oculta el menú y la barra');
});

ok('no queda ningún botón de "siguiente fase": el timbrado masivo tiene función real (OT-0063) y la nómina ofrece cálculo, historial y recibos', () => {
  const pendientes = [...html.matchAll(/data-soon="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(pendientes.length, 0, 'no debe quedar ningún aviso "siguiente fase": ' + JSON.stringify(pendientes));
  assert.ok(!html.includes('Timbrar nómina'));
  // OT-0063: el botón de Timbrado masivo existe, abre su ventana (data-fac-masivo) y NO es un aviso data-soon.
  assert.ok(/<button[^>]*data-fac-masivo[^>]*>[\s\S]*?Timbrado masivo/.test(html) && !/data-soon=[^>]*Timbrado masivo/.test(html));
  const fac = leer('facturacion.js');
  assert.ok(fac.includes('[data-fac-masivo]') && fac.includes('function openMasivo()') && html.includes('facturacion-masiva-csv.js'), 'el botón debe estar conectado a su función');
  assert.ok(html.includes('Cálculo, historial y recibos') && !html.includes('Cálculo y timbrado'));
});

ok('SAT y Fiscal no muestra botones deshabilitados: explica que las declaraciones se presentan en el portal del SAT y aquí se registra', () => {
  assert.ok(!/no disponible<\/button>/.test(fiscal) && !fiscal.includes('Presentar declaración · no disponible') && !fiscal.includes('Descargar XML del SAT · no disponible'));
  assert.ok(fiscal.includes('Las declaraciones se presentan en el portal del SAT con tu e.firma'));
  assert.ok(!fiscal.includes('todavía no están disponibles'));
});

ok('las tarjetas vacías ya no se rotulan "Próximamente": dicen "Sin información"', () => {
  assert.ok(!app.includes('margin-bottom:.2rem">Próximamente</b>'));
  assert.ok(app.includes('margin-bottom:.2rem">Sin información</b>'));
});

ok('invitaciones: "Enviar por correo" arma el mensaje con el enlace, el correo y el rol, y abre el correo del usuario', () => {
  assert.ok(!inv.includes('El envío automático de correo todavía no está activo'));
  assert.ok(inv.includes('data-inv-correo') && inv.includes('mailto:') && inv.includes('encodeURIComponent'));
  const a = inv.indexOf('function textoCorreoInvitacion'), b = inv.indexOf('function enviarInvitacionPorCorreo');
  assert.ok(a > 0 && b > a);
  const ctx = vm.createContext({ window: { CONTATECK_EMPRESA_PG: { nombre: 'Empresa Demo C' }, location: { origin: 'https://ejemplo.mx' } }, nombreRol: () => 'rh', fmtFecha: () => '02/12/2026' });
  vm.runInContext(inv.slice(a, b) + '\nthis.textoCorreoInvitacion = textoCorreoInvitacion;', ctx);
  const m = ctx.textoCorreoInvitacion({ correo: 'persona@ejemplo.mx', rol_id: 'r1', expira_en: '2026-12-02' });
  assert.equal(m.para, 'persona@ejemplo.mx'); assert.match(m.asunto, /Empresa Demo C/);
  assert.match(m.cuerpo, /https:\/\/ejemplo\.mx\/login\.html/); assert.match(m.cuerpo, /ESTE mismo correo: persona@ejemplo\.mx/); assert.match(m.cuerpo, /rol de rh/); assert.match(m.cuerpo, /vence el 02\/12\/2026/);
  assert.ok(!/contrase[ñn]a: /i.test(m.cuerpo), 'el correo nunca lleva contraseñas');
});

ok('recibos de nómina: uno por empleado, con periodo, importes y neto; todo texto se escapa; aclara que no es un CFDI', () => {
  const nom = leer('nomina.js');
  const a = nom.indexOf('/*RECIBO-INICIO*/'), b = nom.indexOf('/*RECIBO-FIN*/');
  assert.ok(a > 0 && b > a, 'no se encontró el generador de recibos');
  const ctx = vm.createContext({
    money: (n) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtFecha: (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—'),
    PERIODO_ETIQUETAS: { quincenal: 'Quincenal', mensual: 'Mensual' },
  });
  vm.runInContext(nom.slice(a, b) + '\nthis.recibo = reciboNominaHtml; this.esc = escNom;', ctx);
  const html1 = ctx.recibo({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-15', periodicidad: 'quincenal', created_at: '2026-11-16' },
    [{ nombre: 'Ana <b>Pérez</b>', puesto: 'Contadora', sueldo_base: 7500, otras_percepciones: 100, deducciones: 850.5, neto: 6749.5, notas: '<img src=x onerror=alert(1)>' }, { nombre: 'Beto', sueldo_base: 5000, otras_percepciones: 0, deducciones: 400, neto: 4600 }],
    { nombre: 'Empresa "Demo" C', rfc: 'DEMO030303C03' });
  assert.equal((html1.match(/class="recibo"/g) || []).length, 2, 'un recibo por empleado');
  assert.ok(html1.includes('Ana &lt;b&gt;Pérez&lt;/b&gt;') && !html1.includes('<b>Pérez</b>'), 'nombres escapados');
  assert.ok(!html1.includes('<img src=x') && html1.includes('&lt;img src=x'), 'las notas se escapan');
  assert.ok(html1.includes('Empresa &quot;Demo&quot; C') && html1.includes('RFC DEMO030303C03'));
  assert.ok(html1.includes('01/11/2026 al 15/11/2026 (Quincenal)'));
  assert.ok(html1.includes('$7,500.00') && html1.includes('-$850.50') && html1.includes('$6,749.50') && html1.includes('Neto pagado'));
  assert.ok(html1.includes('No es un CFDI de nómina'));
  assert.ok(ctx.recibo({}, [], {}).includes('no tiene empleados'));
  assert.ok(nom.includes('data-hist-recibos') && nom.includes('imprimirRecibosNomina'));
  // el detalle de la nómina tampoco pinta nombres sin escapar
  assert.ok(nom.includes('escNom(d.nombre)') && !/"<tr><td>" \+ d\.nombre/.test(nom));
});

ok('las páginas cargan las versiones nuevas de los archivos cambiados (para saltar el caché)', () => {
  for (const v of ['app.js?v=23', 'fiscal.js?v=6', 'invitaciones.js?v=4', 'styles.css?v=5', 'nomina.js?v=7']) assert.ok(html.includes(v), v);
});

console.log(`\n✔ ${pruebas} pruebas de interfaz pasaron\n`);
