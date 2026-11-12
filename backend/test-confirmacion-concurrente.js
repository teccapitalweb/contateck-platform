// ============================================================
//  CONTATECK · OT-0029 · Prueba de carrera: confirmar dos pagos de la
//  misma factura AL MISMO TIEMPO.
//
//  Qué hace (ESCRIBE en la base a la que apunte backend/.env):
//    1. Entra con tu correo y contraseña (se piden por consola; la contraseña
//       va oculta; nunca las pegues en el chat).
//    2. Elige una factura con saldo (o la que indiques) y registra DOS pagos
//       de ~60% del saldo cada uno: cada uno cabe solo, los dos juntos no.
//    3. Los confirma en paralelo, con dos llamadas simultáneas.
//
//  Esperado con OT-0029-confirmacion-atomica.sql aplicado:
//    exactamente UNO se confirma y el otro recibe "dejaría la factura pagada
//    de más". Sin el SQL (solo con el chequeo del backend, que aquí no
//    interviene) pasan los DOS y el saldo queda negativo.
//
//  Deja datos de prueba: 1 pago confirmado con su póliza y 1 pago que
//  queda "registrado". Úsalo SOLO en DEV, con una factura de prueba.
//
//  Uso (desde la carpeta backend, donde está el .env):
//    node test-confirmacion-concurrente.js cliente            # factura elegida sola
//    node test-confirmacion-concurrente.js proveedor <id>     # factura que tú indiques
// ============================================================
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';
import { config } from './src/config.js';

const modo = (process.argv[2] || 'cliente').toLowerCase();
const idArg = process.argv[3] || null;
if (!['cliente', 'proveedor'].includes(modo)) { console.error('Uso: node test-confirmacion-concurrente.js cliente|proveedor [idFactura]'); process.exit(1); }
if (!config.supabase.url || !config.supabase.anonKey) { console.error('Falta la configuración de Supabase en backend/.env'); process.exit(1); }

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => { if (s.startsWith(texto)) rl.output.write(texto); else rl.output.write('*'.repeat(Math.max(0, s.length - (s.includes('\n') ? 1 : 0))) + (s.includes('\n') ? '\n' : '')); };
    }
    rl.question(texto, (r) => { rl.close(); resolve(r); });
  });
}

const T = modo === 'cliente'
  ? { saldo: 'cfdis_saldo', idCol: 'cfdi_id', registrar: 'registrar_pago_cliente', confirmar: 'confirmar_pago_cliente', pagos: 'pagos_cliente', facturaCol: 'cfdi_id' }
  : { saldo: 'cfdis_proveedor_saldo', idCol: 'cfdi_proveedor_id', registrar: 'registrar_pago_proveedor', confirmar: 'confirmar_pago_proveedor', pagos: 'pagos_proveedor', facturaCol: 'cfdi_proveedor_id' };

const email = await preguntar('Correo (usuario contador/admin/director de DEV): ');
const pass = await preguntar('Contraseña: ', true);
const sb = createClient(config.supabase.url, config.supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: eLogin } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
if (eLogin) { console.error('No se pudo iniciar sesión:', eLogin.message); process.exit(1); }

// Factura de prueba
let q = sb.from(T.saldo).select(`${T.idCol}, saldo_pendiente, total`).gte('saldo_pendiente', 10).order('saldo_pendiente', { ascending: true }).limit(1);
if (idArg) q = sb.from(T.saldo).select(`${T.idCol}, saldo_pendiente, total`).eq(T.idCol, idArg).limit(1);
const { data: filas, error: eF } = await q;
if (eF || !filas || !filas.length) { console.error('No encontré una factura con saldo >= $10.', eF ? eF.message : ''); process.exit(1); }
const factura = filas[0];
const facturaId = factura[T.idCol];
const saldo = Number(factura.saldo_pendiente);
const monto = Math.ceil(saldo * 0.6 * 100) / 100; // cabe solo (<= saldo); dos juntos no (> saldo)

// Cuenta de banco de la configuración contable de la empresa
const { data: conf } = await sb.from('configuracion_contable').select('cuenta_bancos_id').limit(1).maybeSingle();
if (!conf || !conf.cuenta_bancos_id) { console.error('La empresa no tiene cuenta de Bancos configurada.'); process.exit(1); }

console.log(`\nFactura ${facturaId}\n  saldo actual: $${saldo.toFixed(2)}\n  se registrarán 2 pagos de $${monto.toFixed(2)} (suman $${(monto * 2).toFixed(2)}, más que el saldo)`);
const ok = (await preguntar('Esto ESCRIBE en la base. ¿Seguir? (escribe SI): ')).trim();
if (ok !== 'SI') { console.log('Cancelado, no se escribió nada.'); process.exit(0); }

const hoy = new Date().toISOString().slice(0, 10);
async function registrar(n) {
  const base = { p_monto: monto, p_fecha_pago: hoy, p_forma_pago: '03', p_referencia: `prueba-carrera-${n}`, p_notas: 'OT-0029 prueba de confirmación concurrente', p_comprobante_url: null };
  const args = modo === 'cliente'
    ? { p_cfdi_id: facturaId, p_cuenta_destino_id: conf.cuenta_bancos_id, ...base }
    : { p_cfdi_proveedor_id: facturaId, p_cuenta_origen_id: conf.cuenta_bancos_id, ...base };
  const { data, error } = await sb.rpc(T.registrar, args);
  if (error) { console.error(`No se pudo registrar el pago ${n}:`, error.message); process.exit(1); }
  return data;
}
const pagoA = await registrar(1);
const pagoB = await registrar(2);
console.log('Pagos registrados. Confirmando los dos a la vez...');

const [rA, rB] = await Promise.all([
  sb.rpc(T.confirmar, { p_pago_id: pagoA }),
  sb.rpc(T.confirmar, { p_pago_id: pagoB }),
]);
const informe = (n, r) => r.error ? `  pago ${n}: RECHAZADO → ${r.error.message}` : `  pago ${n}: CONFIRMADO → póliza ${r.data && r.data.folio}`;
console.log('\nResultado:\n' + informe(1, rA) + '\n' + informe(2, rB));

const { data: despues } = await sb.from(T.saldo).select('saldo_pendiente').eq(T.idCol, facturaId).maybeSingle();
const saldoFinal = despues ? Number(despues.saldo_pendiente) : NaN;
console.log(`\nSaldo final de la factura: $${saldoFinal.toFixed(2)}`);
const nOk = [rA, rB].filter((r) => !r.error).length;
if (nOk === 1 && saldoFinal >= 0) console.log('✔ CORRECTO: se confirmó uno solo y el saldo no quedó negativo.');
else if (nOk === 2 || saldoFinal < 0) console.log('✘ FALLA: los dos pasaron y la factura quedó pagada de más. ¿Se aplicó OT-0029-confirmacion-atomica.sql?');
else console.log('? Ninguno se confirmó; revisa el mensaje de arriba (¿configuración contable incompleta?).');
await sb.auth.signOut();
