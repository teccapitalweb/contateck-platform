// ============================================================
//  CONTATECK · OT-0029 · Prueba de bloqueo bajo carga (cuentas por pagar)
//
//  Complementa a test-confirmacion-concurrente.js (2 pagos). Aquí se
//  confirman 8 pagos de la MISMA factura al mismo tiempo, y solo caben 4:
//    - Si el bloqueo de la factura (for no key update) funciona, las
//      confirmaciones se forman en fila: se confirman EXACTAMENTE 4, las
//      otras 4 reciben "dejaría la factura pagada de más", cada una de
//      las 4 deja su propia póliza y el saldo final es el esperado.
//    - Sin el bloqueo, varias lecturas ven el mismo saldo y pasan más de 4.
//  Mientras tanto se registran 2 pagos de $1 y se mide cuánto tardan: el
//  bloqueo "no key update" no debe frenar el REGISTRO de pagos.
//
//  Seguridad: solo corre contra una factura de proveedor marcada como
//  prueba (raw.prueba = 'OT-0029'). Con cualquier otra se detiene sin
//  escribir nada. Nunca borra registros: deja los pagos y pólizas de
//  prueba en la base (DEV).
//
//  ESCRIBE en la base a la que apunte backend/.env. Se piden el correo y la
//  contraseña por consola (la contraseña va oculta; no la pegues en el chat).
//
//  Uso (desde backend/, donde está el .env):
//    node test-bloqueo-concurrente.js <idFacturaProveedorDePrueba>
// ============================================================
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';
import { pathToFileURL } from 'url';
import { performance } from 'perf_hooks';

const MARCA_PRUEBA = 'OT-0029';
const EXTRAS_RECHAZADOS = 4; // cuántos intentos de más (que no caben) se lanzan
const REGISTROS_PARALELOS = 2; // pagos de $1 que se registran durante las confirmaciones

// Cada pago vale 22% del saldo: caben exactamente 4 juntos y el 5º ya no.
// Todo en centavos enteros, para no arrastrar errores de punto flotante.
export function planear(saldoCentavos) {
  const montoCentavos = Math.floor((saldoCentavos * 22) / 100);
  if (saldoCentavos < 5000 || montoCentavos < 100) return null; // saldo < $50: no sirve para la prueba
  const caben = Math.floor(saldoCentavos / montoCentavos);
  return { montoCentavos, caben, intentos: caben + EXTRAS_RECHAZADOS, remanenteCentavos: saldoCentavos - caben * montoCentavos };
}

// Devuelve la lista de fallas (vacía = la prueba pasó).
export function evaluar({ saldoInicialC, montoC, caben, confirmados, saldoFinalC, polizasDistintas }) {
  const fallas = [];
  if (confirmados !== caben) fallas.push(`se esperaban ${caben} confirmados y fueron ${confirmados}`);
  if (saldoFinalC < 0) fallas.push('el saldo quedó negativo');
  if (saldoFinalC !== saldoInicialC - confirmados * montoC) fallas.push('el saldo final no coincide con lo confirmado');
  if (polizasDistintas !== confirmados) fallas.push(`hay ${polizasDistintas} pólizas distintas para ${confirmados} pagos confirmados`);
  return fallas;
}

const aCentavos = (n) => Math.round(Number(n) * 100);
const aPesos = (c) => (c / 100).toFixed(2);

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => { if (s.startsWith(texto)) rl.output.write(texto); else rl.output.write('*'.repeat(Math.max(0, s.length - (s.includes('\n') ? 1 : 0))) + (s.includes('\n') ? '\n' : '')); };
    }
    rl.question(texto, (r) => { rl.close(); resolve(r); });
  });
}

async function main() {
  const { config } = await import('./src/config.js');
  const facturaId = process.argv[2];
  if (!facturaId) { console.error('Uso: node test-bloqueo-concurrente.js <idFacturaProveedorDePrueba>'); process.exitCode = 1; return; }
  if (!config.supabase.url || !config.supabase.anonKey) { console.error('Falta la configuración de Supabase en backend/.env'); process.exitCode = 1; return; }

  const email = await preguntar('Correo (usuario contador/admin/director de DEV): ');
  const pass = await preguntar('Contraseña: ', true);
  const sb = createClient(config.supabase.url, config.supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: eLogin } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (eLogin) { console.error('No se pudo iniciar sesión:', eLogin.message); process.exitCode = 1; return; }

  try {
    // 1) Solo facturas marcadas como prueba.
    const { data: fac, error: eFac } = await sb.from('cfdis_proveedor').select('id, folio, emisor_nombre, raw').eq('id', facturaId).maybeSingle();
    if (eFac || !fac) { console.error('No encontré esa factura de proveedor en tu empresa.', eFac ? eFac.message : ''); process.exitCode = 1; return; }
    if (!fac.raw || fac.raw.prueba !== MARCA_PRUEBA) { console.error(`Esa factura no está marcada como prueba (raw.prueba = '${MARCA_PRUEBA}'). No se escribe nada.`); process.exitCode = 1; return; }

    // 2) Saldo y plan.
    const { data: s, error: eS } = await sb.from('cfdis_proveedor_saldo').select('saldo_pendiente').eq('cfdi_proveedor_id', facturaId).maybeSingle();
    if (eS || !s) { console.error('No pude leer el saldo de la factura.', eS ? eS.message : ''); process.exitCode = 1; return; }
    const saldoInicialC = aCentavos(s.saldo_pendiente);
    const plan = planear(saldoInicialC);
    if (!plan) { console.error(`La factura tiene saldo $${aPesos(saldoInicialC)}; hacen falta al menos $50.00 para esta prueba.`); process.exitCode = 1; return; }

    const { data: conf } = await sb.from('configuracion_contable').select('cuenta_bancos_id').limit(1).maybeSingle();
    if (!conf || !conf.cuenta_bancos_id) { console.error('La empresa no tiene cuenta de Bancos configurada.'); process.exitCode = 1; return; }

    console.log(`\nFactura ${fac.folio} (${fac.emisor_nombre})\n  saldo actual: $${aPesos(saldoInicialC)}`);
    console.log(`  se registrarán ${plan.intentos} pagos de $${aPesos(plan.montoCentavos)}; caben ${plan.caben} (sobrarían $${aPesos(plan.remanenteCentavos)})`);
    console.log(`  y se confirmarán los ${plan.intentos} AL MISMO TIEMPO; mientras tanto se registran ${REGISTROS_PARALELOS} pagos de $1.00`);
    const ok = (await preguntar('Esto ESCRIBE en la base (DEV) y no borra nada. ¿Seguir? (escribe SI): ')).trim().toUpperCase();
    if (ok !== 'SI') { console.log('Cancelado, no se escribió nada.'); return; }

    const hoy = new Date().toISOString().slice(0, 10);
    const registrar = async (etiqueta, centavos) => {
      const { data, error } = await sb.rpc('registrar_pago_proveedor', {
        p_cfdi_proveedor_id: facturaId, p_cuenta_origen_id: conf.cuenta_bancos_id, p_monto: centavos / 100, p_fecha_pago: hoy,
        p_forma_pago: '03', p_referencia: `prueba-bloqueo-${etiqueta}`, p_notas: 'OT-0029 prueba de bloqueo bajo carga', p_comprobante_url: null,
      });
      if (error) throw new Error(`No se pudo registrar el pago ${etiqueta}: ${error.message}`);
      return data;
    };

    // 3) Registro (en fila) de los pagos que se van a confirmar.
    const pagos = [];
    for (let n = 1; n <= plan.intentos; n++) pagos.push(await registrar(String(n), plan.montoCentavos));
    console.log(`Se registraron ${pagos.length} pagos. Confirmando todos a la vez...`);

    // 4) Confirmaciones en paralelo + registros de $1 durante la espera.
    const t0 = performance.now();
    const medir = async (fn) => { const ini = performance.now() - t0; const r = await fn(); return { r, ini, fin: performance.now() - t0 }; };
    const confirmaciones = pagos.map((id, i) => medir(() => sb.rpc('confirmar_pago_proveedor', { p_pago_id: id })).then((m) => ({ n: i + 1, ...m })));
    const registros = Array.from({ length: REGISTROS_PARALELOS }, (_, i) =>
      medir(async () => { try { await registrar(`extra-${i + 1}`, 100); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } }).then((m) => ({ n: i + 1, ...m })));
    const [resConf, resReg] = await Promise.all([Promise.all(confirmaciones), Promise.all(registros)]);

    // 5) Informe
    console.log('\nConfirmaciones (en el orden en que terminaron):');
    for (const c of [...resConf].sort((a, b) => a.fin - b.fin)) {
      const txt = c.r.error ? `RECHAZADO → ${c.r.error.message.slice(0, 80)}…` : `CONFIRMADO → póliza ${c.r.data && c.r.data.folio}`;
      console.log(`  pago ${c.n}: ${txt}   [terminó a los ${(c.fin / 1000).toFixed(2)} s]`);
    }
    console.log('\nRegistros de $1.00 hechos durante las confirmaciones:');
    for (const g of resReg) console.log(`  registro ${g.n}: ${g.r.ok ? 'OK' : 'ERROR ' + g.r.error}   [tardó ${(g.fin - g.ini).toFixed(0)} ms]`);
    const maxConf = Math.max(...resConf.map((c) => c.fin));
    console.log(`  (la última confirmación terminó a los ${(maxConf / 1000).toFixed(2)} s)`);

    // 6) Verificación en la base
    const confirmados = resConf.filter((c) => !c.r.error).length;
    const { data: filas } = await sb.from('pagos_proveedor').select('id, estado, poliza_id').in('id', pagos);
    const polizas = new Set((filas || []).filter((f) => f.estado === 'confirmado' && f.poliza_id).map((f) => f.poliza_id));
    const { data: despues } = await sb.from('cfdis_proveedor_saldo').select('saldo_pendiente').eq('cfdi_proveedor_id', facturaId).maybeSingle();
    const saldoFinalC = despues ? aCentavos(despues.saldo_pendiente) : NaN;
    // Los $1 registrados no cuentan: siguen "registrados" y el saldo solo descuenta confirmados.
    console.log(`\nSaldo final de la factura: $${aPesos(saldoFinalC)} (esperado: $${aPesos(saldoInicialC - confirmados * plan.montoCentavos)})`);
    console.log(`Pagos confirmados: ${confirmados} de ${plan.intentos}; pólizas distintas: ${polizas.size}`);

    const fallas = evaluar({ saldoInicialC, montoC: plan.montoCentavos, caben: plan.caben, confirmados, saldoFinalC, polizasDistintas: polizas.size });
    const registrosOk = resReg.every((g) => g.r.ok);
    if (!registrosOk) fallas.push('algún registro de $1 falló mientras se confirmaba (¿el bloqueo frenó el registro?)');
    if (fallas.length === 0) console.log(`✔ CORRECTO: se confirmaron exactamente ${plan.caben}, el resto se rechazó, una póliza por pago y el saldo cuadra.`);
    else { console.log('✘ FALLA:'); fallas.forEach((f) => console.log('   - ' + f)); process.exitCode = 1; }
  } catch (e) {
    console.error('Error durante la prueba:', e.message);
    process.exitCode = 1;
  } finally {
    await sb.auth.signOut();
  }
}

// Solo corre si se invoca directamente (así las funciones puras se pueden probar importando el archivo).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
