// ============================================================
//  CONTATECK · Prueba 4 de OT-0011 · Aislamiento RLS entre empresas
//  Verifica que un usuario de una empresa NO pueda ver los CFDIs
//  de otra empresa, usando el mismo camino que usaría la app real
//  (JWT de Supabase Auth + anonKey, NUNCA la service_role key).
//
//  Uso:
//    cd backend
//    node ../test-rls-aislamiento.js
//  (ajusta la ruta si el archivo no queda en la raíz del repo)
//
//  Te va a pedir el correo y contraseña por consola (oculta),
//  no los escribas nunca en el chat de Claude.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

const SUPABASE_URL = 'https://ctwmrsgqczaqenxbnobd.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0d21yc2dxY3phcWVueGJub2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDA5ODMsImV4cCI6MjEwMDQxNjk4M30.lESxVwnyTGUGasQNzdNmiDpYPf4QYLbkEVdRJunPZ1w';

// UUID del CFDI que timbraste con demo.director.c (Empresa Demo C)
const UUID_A_BUSCAR = '97ee5455-64be-4d9f-8f31-829272dc971e';

function preguntar(texto, ocultar = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!ocultar) {
      rl.question(texto, (r) => { rl.close(); resolve(r); });
      return;
    }
    // Oculta lo que se teclea (contraseña)
    const stdin = process.openStdin();
    process.stdout.write(texto);
    let pass = '';
    const onData = (char) => {
      char = char + '';
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(pass);
        return;
      }
      if (char === '\u0003') process.exit();
      if (char === '\u007f') { pass = pass.slice(0, -1); return; }
      pass += char;
    };
    process.stdin.setRawMode && process.stdin.setRawMode(true);
    stdin.on('data', onData);
  });
}

async function probarUsuario(email, password) {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

  if (authError) {
    console.log(`  ❌ No se pudo iniciar sesión con ${email}: ${authError.message}`);
    return;
  }

  console.log(`  ✅ Sesión iniciada como ${email} (uid: ${authData.user.id})`);

  // Lee su propio perfil (para confirmar empresa_id, respetando RLS)
  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('empresa_id, nombre, rol_id')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (perfilError) {
    console.log(`  ⚠️  No se pudo leer el perfil: ${perfilError.message}`);
  } else {
    console.log(`  → empresa_id: ${perfil?.empresa_id}`);
  }

  // Consulta la tabla cfdis TAL CUAL la vería la app (con RLS activo)
  const { data: cfdis, error: cfdisError } = await supabase
    .from('cfdis')
    .select('id, uuid_sat, receptor_rfc, empresa_id, estatus');

  if (cfdisError) {
    console.log(`  ⚠️  Error consultando cfdis: ${cfdisError.message}`);
  } else {
    console.log(`  → cfdis visibles para este usuario: ${cfdis.length}`);
    cfdis.forEach((c) => console.log(`     · ${c.uuid_sat} (empresa ${c.empresa_id}, ${c.estatus})`));
    const loEncontro = cfdis.some((c) => c.uuid_sat === UUID_A_BUSCAR);
    console.log(
      loEncontro
        ? `  🚨 ALERTA: este usuario SÍ puede ver el CFDI ${UUID_A_BUSCAR} — revisar políticas RLS.`
        : `  ✅ Correcto: este usuario NO puede ver el CFDI ${UUID_A_BUSCAR}.`
    );
  }

  await supabase.auth.signOut();
}

async function main() {
  console.log('=== Prueba 4 de OT-0011 · Aislamiento RLS entre empresas ===\n');

  console.log('Usuario 1 (el que SÍ debe ver el CFDI, ej. demo.director.c):');
  const email1 = await preguntar('  Email: ');
  const pass1 = await preguntar('  Password: ', true);
  await probarUsuario(email1, pass1);

  console.log('\nUsuario 2 (el que NO debe ver el CFDI, ej. prueba2):');
  const email2 = await preguntar('  Email: ');
  const pass2 = await preguntar('  Password: ', true);
  await probarUsuario(email2, pass2);

  console.log('\n=== Fin de la prueba ===');
  process.exit(0);
}

main();
