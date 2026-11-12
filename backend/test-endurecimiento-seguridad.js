// ============================================================
//  CONTATECK · OT-0038 · Prueba del endurecimiento de seguridad (database/OT-0038-endurecimiento-seguridad.sql)
//
//  Con UN inicio de sesión de una persona de DEV, intenta lo que antes se podía y ahora NO debe poder:
//    1. Leer las llaves del CSD de su empresa con la API directa.
//    2. Cambiarse a sí misma el rol, la empresa o el estado (activo) en `perfiles`.
//    3. Pedir un folio / consultar un periodo de una empresa que no es la suya.
//    4. Ejecutar funciones de escritura sin sesión (como `anon`).
//
//  SEGURIDAD DE LA PRUEBA: los intentos de cambiar el perfil se hacen sobre la cuenta con la que entras. Si la
//  base AÚN NO está protegida y un intento sí se aplica, la prueba lo detecta y RESTAURA el valor original con la
//  llave de servicio en el acto (y lo reporta como FALLA). Usa una cuenta de PRUEBA de DEV, nunca una real.
//  Para el folio y el periodo se usa un id de empresa inventado: nunca se toca el contador de otra empresa real
//  (si la base no está protegida y se llega a crear una fila de prueba, se borra).
//
//  Uso (desde backend/, donde está el .env; la contraseña va oculta, no la pegues en el chat):
//    node test-endurecimiento-seguridad.js
//  Antes de aplicar el SQL debe dar FALLA en 1 a 4 (eso confirma el hueco); después, todo OK.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import readline from 'readline';
import { pathToFileURL } from 'url';

const denegado = (e) => !!e && (e.code === '42501' || /permission denied|not authorized/i.test(e.message || ''));
const texto = (e) => (e && (e.message || e.code || e.details)) ? String(e.message || e.code || e.details).slice(0, 110) : (e ? JSON.stringify(e).slice(0, 110) : '');

// Ejecuta todas las comprobaciones. Clientes: admin (llave de servicio), usuario (sesión de la persona), anon (sin sesión).
export async function ejecutar({ admin, usuario, anon, uid }) {
  const filas = [];
  const anota = (id, nombre, ok, nota) => filas.push({ id, nombre, veredicto: ok ? 'OK' : 'FALLA', nota: nota || '' });

  const { data: original, error: eO } = await admin.from('perfiles').select('id, empresa_id, rol_id, activo').eq('id', uid).maybeSingle();
  if (eO || !original) throw new Error('No pude leer el perfil de la cuenta con la llave de servicio.');
  const { data: roles } = await admin.from('roles').select('id, nombre');
  const rolDe = (nombre) => (roles || []).find((r) => r.nombre === nombre);
  const { data: otras } = await admin.from('empresas').select('id').neq('id', original.empresa_id).limit(1);

  // --- 1. CSD ---
  const csd = await usuario.from('empresas').select('csd_password').limit(1);
  if (denegado(csd.error)) anota('1a', 'El CSD de la empresa no se puede leer con sesión', true, 'acceso denegado a las columnas csd_*');
  else if (csd.error) anota('1a', 'El CSD de la empresa no se puede leer con sesión', false, 'error inesperado: ' + texto(csd.error));
  else anota('1a', 'El CSD de la empresa no se puede leer con sesión', false, 'LAS LLAVES DEL CSD SON LEGIBLES con la API directa');
  const normal = await usuario.from('empresas').select('id, nombre, rfc, regimen_fiscal, plan, status').limit(1);
  anota('1b', 'La lectura normal de la empresa sigue funcionando', !normal.error && (normal.data || []).length === 1, normal.error ? texto(normal.error) : 'columnas no secretas disponibles');

  // --- 2. Cambiarse a uno mismo ---
  // Cada intento se verifica por el VALOR final en la base; si cambió, se restaura.
  // OJO: el UPDATE va SIN .select(). Con RETURNING, PostgREST exige que la fila NUEVA siga siendo visible para quien la
  // actualiza; al pasarse a otra empresa ya no lo es y el cambio sale "rechazado" aunque sin RETURNING SÍ se aplicaría
  // (así lo haría quien ataca). En la primera corrida real (2026-11-12) esto hizo que 2b saliera OK sin serlo.
  const intento = async (id, nombre, campos) => {
    const r = await usuario.from('perfiles').update(campos).eq('id', uid);
    const { data: despues } = await admin.from('perfiles').select('id, empresa_id, rol_id, activo').eq('id', uid).maybeSingle();
    const cambio = !despues || Object.keys(campos).some((k) => despues[k] !== original[k]);
    if (cambio) {
      await admin.from('perfiles').update({ empresa_id: original.empresa_id, rol_id: original.rol_id, activo: original.activo }).eq('id', uid); // restaurar
      anota(id, nombre, false, 'SE APLICÓ el cambio (ya se restauró el valor original)');
    } else {
      anota(id, nombre, true, r.error ? 'rechazado: ' + texto(r.error) : 'sin efecto');
    }
  };
  const destino = rolDe('director') && rolDe('director').id !== original.rol_id ? rolDe('director') : rolDe('vendedor');
  if (destino && destino.id !== original.rol_id) await intento('2a', 'No puedes cambiarte tu propio rol', { rol_id: destino.id });
  else anota('2a', 'No puedes cambiarte tu propio rol', false, 'no encontré otro rol para el intento');
  if (otras && otras.length) await intento('2b', 'No puedes pasarte a otra empresa', { empresa_id: otras[0].id });
  else anota('2b', 'No puedes pasarte a otra empresa', false, 'no hay otra empresa para el intento');
  await intento('2c', 'No puedes cambiarte tu propio estado (activo)', { activo: original.activo === false ? true : false });

  // --- 3. Folio y periodo de una empresa que no es la tuya (id inventado: no toca datos de nadie) ---
  const inventada = randomUUID();
  const folio = await usuario.rpc('siguiente_folio_pago', { p_empresa_id: inventada });
  await admin.from('folios_contador').delete().eq('empresa_id', inventada); // por si la base no estaba protegida
  anota('3a', 'siguiente_folio_pago rechaza una empresa que no es la tuya', !!folio.error && /Empresa no válida/i.test(folio.error.message || ''), folio.error ? texto(folio.error) : 'NO la rechazó');
  const folioP = await usuario.rpc('siguiente_folio_pago_proveedor', { p_empresa_id: inventada });
  await admin.from('folios_contador').delete().eq('empresa_id', inventada);
  anota('3b', 'siguiente_folio_pago_proveedor rechaza una empresa que no es la tuya', !!folioP.error && /Empresa no válida/i.test(folioP.error.message || ''), folioP.error ? texto(folioP.error) : 'NO la rechazó');
  const per = await usuario.rpc('periodo_esta_cerrado', { p_empresa_id: inventada, p_fecha: '2026-11-01' });
  anota('3c', 'periodo_esta_cerrado rechaza una empresa que no es la tuya', !!per.error && /Empresa no válida/i.test(per.error.message || ''), per.error ? texto(per.error) : 'NO la rechazó');
  const perPropio = await usuario.rpc('periodo_esta_cerrado', { p_empresa_id: original.empresa_id, p_fecha: '2026-11-01' });
  anota('3d', 'periodo_esta_cerrado sigue funcionando con tu empresa', !perPropio.error && typeof perPropio.data === 'boolean', perPropio.error ? texto(perPropio.error) : 'responde ' + perPropio.data);

  // --- 4. Sin sesión (anon) ---
  const sinSesion = await anon.rpc('confirmar_pago_cliente', { p_pago_id: randomUUID() });
  anota('4a', 'Sin sesión no se pueden ejecutar las funciones de escritura', denegado(sinSesion.error), sinSesion.error ? texto(sinSesion.error) : 'respondió algo');

  // --- Estado final del perfil ---
  const { data: final } = await admin.from('perfiles').select('empresa_id, rol_id, activo').eq('id', uid).maybeSingle();
  const intacto = !!final && final.empresa_id === original.empresa_id && final.rol_id === original.rol_id && final.activo === original.activo;
  anota('5', 'Tu perfil quedó igual que al empezar', intacto, intacto ? 'sin cambios' : 'REVISAR el perfil a mano');

  const fallas = filas.filter((f) => f.veredicto === 'FALLA').length;
  return { filas, fallas, pasa: fallas === 0 };
}

function preguntar(t, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => { if (s.startsWith(t)) rl.output.write(t); else rl.output.write('*'.repeat(Math.max(0, s.length - (s.includes('\n') ? 1 : 0))) + (s.includes('\n') ? '\n' : '')); };
    }
    rl.question(t, (r) => { rl.close(); resolve(r); });
  });
}

async function main() {
  const { config } = await import('./src/config.js');
  const { url, anonKey, serviceRoleKey } = config.supabase;
  if (!url || !anonKey || !serviceRoleKey) { console.error('Falta SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en backend/.env'); process.exitCode = 1; return; }
  const opc = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceRoleKey, opc);
  const usuario = createClient(url, anonKey, opc);
  const anon = createClient(url, anonKey, opc);

  console.log(`Base: ${new URL(url).host}\nUsa una cuenta de PRUEBA de DEV (se intentan cambios sobre su perfil y se restauran si llegan a aplicarse).`);
  const email = await preguntar('Correo de la cuenta de prueba: ');
  const pass = await preguntar('Contraseña: ', true);
  const { data: sesion, error: eLogin } = await usuario.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (eLogin) { console.error('No se pudo iniciar sesión:', eLogin.message); process.exitCode = 1; return; }
  const ok = (await preguntar('Esto intenta cambios sobre ese perfil y los deshace. ¿Seguir? (escribe SI): ')).trim().toUpperCase();
  if (ok !== 'SI') { console.log('Cancelado, no se hizo ningún intento.'); await usuario.auth.signOut(); return; }
  try {
    const r = await ejecutar({ admin, usuario, anon, uid: sesion.user.id });
    for (const f of r.filas) console.log(`  ${f.veredicto === 'OK' ? '✔' : '✘'} ${f.id.padEnd(3)} ${f.nombre}${f.nota ? '  → ' + f.nota : ''}`);
    console.log(r.pasa ? '\n✔ TODO OK: el endurecimiento está aplicado y funciona.' : `\n✘ ${r.fallas} FALLA(S): la base no está protegida contra eso (si aún no aplicaste el SQL, es lo esperado).`);
    if (!r.pasa) process.exitCode = 1;
  } catch (e) {
    console.error('Error durante la prueba:', e.message); process.exitCode = 1;
  } finally {
    await usuario.auth.signOut();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
