// ============================================================
//  CONTATECK · Crea usuarios de PRUEBA en Supabase Auth (DEV) para revisar roles.
//  Uso (PowerShell, desde C:\RESIDENCIA\PROYECTO\contateck-repo\backend):
//     $env:DEMO_PASSWORD = "la-contraseña-que-tú-elijas"
//     node crear-usuarios-demo.mjs
//     Remove-Item Env:DEMO_PASSWORD
//  - Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de backend\.env (no las imprime).
//  - La contraseña viene de la variable DEMO_PASSWORD que escribes tú; no se guarda ni se muestra.
//  - Solo crea cuentas de Auth con el correo ya confirmado. La empresa y el rol los asigna la app al
//    primer inicio de sesión, con la invitación pendiente de Empresa Demo C.
// ============================================================
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CORREOS = ['demo.rh@contateck.mx', 'demo.vendedor.c@contateck.mx'];
const url = process.env.SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
// La contraseña viene de DEMO_PASSWORD o, si esa variable no llega, del primer argumento que no sea una opción.
const clave = process.env.DEMO_PASSWORD || process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!url || !llave) { console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend\\.env (ejecuta el script desde la carpeta backend).'); process.exit(1); }
if (!url.includes('ctwmrsgqczaqenxbnobd')) { console.error('Este script solo corre contra el proyecto DEV (contateck-dev). Revisa SUPABASE_URL.'); process.exit(1); }
console.log(`Contraseña leída: ${clave ? clave.length : 0} caracteres · proyecto DEV: ${url.includes('ctwmrsgqczaqenxbnobd') ? 'sí' : 'NO'} · llave de administración: ${llave ? 'presente' : 'FALTA'}`);
if (!clave || clave.length < 8) { console.error('Define primero DEMO_PASSWORD (mínimo 8 caracteres): $env:DEMO_PASSWORD = "..."'); process.exit(1); }
if (process.argv.includes('--solo-probar')) { console.log('Prueba sin crear nada: todo listo para crear ' + CORREOS.join(' y ') + '.'); process.exit(0); }

const admin = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });

for (const email of CORREOS) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true });
  if (error) console.log(`✖ ${email}: ${error.message}`);
  else console.log(`✔ ${email}: cuenta creada (id ${String(data.user.id).slice(0, 8)}…)`);
}
