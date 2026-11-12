// ============================================================
//  CONTATECK · OT-0038 · Fase 2 · Prueba de aislamiento entre empresas (SOLO LECTURA)
//
//  Responde: "¿un usuario de una empresa puede ver filas de otra empresa en alguna tabla?"
//  Con UN solo inicio de sesión (el de una persona de DEV), compara por tabla:
//    - lo que EXISTE de otras empresas (leído con la llave de servicio, que no pasa por RLS), contra
//    - lo que ESE usuario puede ver de otras empresas (con su propia sesión, bajo RLS).
//  Lo segundo debe ser 0 en todas las tablas. También revisa el bucket de Storage "documentos".
//
//  Resultado por tabla:
//    OK          hay filas de otras empresas y el usuario no ve ninguna.
//    SIN PRUEBA  no existen filas de otras empresas en esa tabla: no se puede concluir nada. Hay que sembrar
//                datos de una segunda empresa (en DEV) o correr la prueba con una cuenta de otra empresa.
//    FUGA        el usuario ve filas de otra empresa. Es un problema de seguridad.
//    ERROR       no se pudo consultar (se muestra el motivo).
//
//  No escribe NADA: solo select. Lo que NO cubre: intentos de insertar/actualizar/borrar filas de otra empresa
//  (eso se revisa leyendo las políticas con database/OT-0038-introspeccion-rls.sql).
//
//  Uso (desde backend/, donde está el .env; la contraseña va oculta, no la pegues en el chat):
//    node test-aislamiento-empresas.js
//  Conviene correrla dos veces, con una cuenta de cada empresa.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';
import { pathToFileURL } from 'url';

// tipo: 'empresa' (columna empresa_id) | 'propia' (la tabla es la empresa) | 'hija' (se llega por su padre)
//       | 'cerrada' (ningún usuario debe ver nada) | 'catalogo' (compartida por diseño: no se compara)
export const TABLAS = [
  { t: 'empresas', tipo: 'propia', col: 'id' },
  { t: 'perfiles' }, { t: 'invitaciones' }, { t: 'cuentas_contables' }, { t: 'configuracion_contable' },
  { t: 'clientes' }, { t: 'productos' }, { t: 'empleados' },
  { t: 'polizas' }, { t: 'poliza_partidas', tipo: 'hija', fk: 'poliza_id', padre: 'polizas' },
  { t: 'cfdis' }, { t: 'cfdis_saldo' }, { t: 'cfdis_proveedor' }, { t: 'cfdis_proveedor_saldo' },
  { t: 'pagos_cliente' }, { t: 'pagos_proveedor' }, { t: 'ventas' },
  { t: 'nominas' }, { t: 'nomina_detalle', tipo: 'hija', fk: 'nomina_id', padre: 'nominas' },
  { t: 'obligaciones_fiscales' }, { t: 'declaraciones' }, { t: 'documentos_fiscales' },
  { t: 'periodos_contables' }, { t: 'folios_contador' }, { t: 'auditoria_log' },
  { t: 'administradores_plataforma', tipo: 'cerrada' },
  { t: 'roles', tipo: 'catalogo' },
];
const LOTE = 100; // ids por consulta (la URL tiene límite de largo)
const MAX_PADRES = 1000;

const esTablaFaltante = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''));
// Un error de PostgREST en una consulta HEAD puede venir con el mensaje vacío: no mostrar "[object Object]".
const motivo = (e) => {
  const m = e && (e.message || e.code || e.details || e.hint);
  if (m) return String(m).slice(0, 90);
  try { return JSON.stringify(e).slice(0, 90); } catch (x) { return 'error sin detalle'; }
};
// "Acceso denegado": lo que se espera de una tabla cerrada para quien tiene sesión.
const esDenegado = (r) => !!r.error && (r.error.code === '42501' || r.status === 401 || r.status === 403 || /permission denied|not authorized/i.test(r.error.message || ''));

async function contar(consulta) {
  const { count, error } = await consulta;
  if (error) throw error;
  return count || 0;
}

// Revisa UNA tabla. admin = cliente con llave de servicio; usuario = cliente con la sesión de la persona.
export async function revisarTabla(spec, { admin, usuario, empresaId }) {
  const { t } = spec, tipo = spec.tipo || 'empresa';
  const base = { tabla: t, tipo, existen: 0, ve: 0 };
  try {
    const muestra = await admin.from(t).select('*').limit(1);
    if (muestra.error) {
      if (esTablaFaltante(muestra.error)) return { ...base, veredicto: 'NO EXISTE', nota: 'la tabla no está en esta base' };
      throw muestra.error;
    }
    if (tipo === 'catalogo') return { ...base, veredicto: 'OMITIDA', nota: 'catálogo compartido por diseño' };

    if (tipo === 'cerrada') { // nadie con sesión debe ver nada: lo normal es "acceso denegado"
      const total = await contar(admin.from(t).select('*', { count: 'exact', head: true }));
      const r = await usuario.from(t).select('*').limit(1); // sin head: así el error trae su mensaje
      if (esDenegado(r)) return { ...base, existen: total, ve: 0, veredicto: 'OK', nota: 'acceso denegado a usuarios con sesión (correcto)' };
      if (r.error) throw r.error;
      const ve = (r.data || []).length;
      return { ...base, existen: total, ve, veredicto: ve > 0 ? 'FUGA' : 'OK', nota: ve > 0 ? 'una tabla cerrada se puede leer' : 'cerrada: no devuelve filas' };
    }

    if (tipo === 'hija') {
      const { data: padres, error: eP } = await admin.from(spec.padre).select('id').neq('empresa_id', empresaId).limit(MAX_PADRES);
      if (eP) throw eP;
      const ids = (padres || []).map((p) => p.id);
      let existen = 0, ve = 0;
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        existen += await contar(admin.from(t).select('*', { count: 'exact', head: true }).in(spec.fk, lote));
        ve += await contar(usuario.from(t).select('*', { count: 'exact', head: true }).in(spec.fk, lote));
      }
      const nota = ids.length >= MAX_PADRES ? `se revisaron ${MAX_PADRES} filas padre de otras empresas` : '';
      return { ...base, existen, ve, veredicto: ve > 0 ? 'FUGA' : existen > 0 ? 'OK' : 'SIN PRUEBA', nota };
    }

    // tabla con columna de empresa
    const col = spec.col || 'empresa_id';
    if (muestra.data && muestra.data.length && !(col in muestra.data[0])) {
      return { ...base, veredicto: 'ERROR', nota: `no tiene la columna ${col}` };
    }
    const total = await contar(admin.from(t).select('*', { count: 'exact', head: true }));
    const propias = await contar(admin.from(t).select('*', { count: 'exact', head: true }).eq(col, empresaId));
    const existen = total - propias;
    const ajenas = await contar(usuario.from(t).select('*', { count: 'exact', head: true }).neq(col, empresaId));
    const sinEmpresa = await contar(usuario.from(t).select('*', { count: 'exact', head: true }).is(col, null));
    const ve = ajenas + sinEmpresa;
    return { ...base, existen, ve, propias, veredicto: ve > 0 ? 'FUGA' : existen > 0 ? 'OK' : 'SIN PRUEBA',
      nota: sinEmpresa > 0 ? `${sinEmpresa} filas sin ${col} visibles` : '' };
  } catch (e) {
    return { ...base, veredicto: 'ERROR', nota: motivo(e) };
  }
}

// Storage: cada empresa tiene su carpeta (el primer nivel del nombre es el id de la empresa).
export async function revisarStorage({ admin, usuario, empresaId, bucket = 'documentos' }) {
  const base = { tabla: `storage:${bucket}`, tipo: 'storage', existen: 0, ve: 0 };
  try {
    const { data: raiz, error } = await admin.storage.from(bucket).list('', { limit: 200 });
    if (error) throw error;
    const ajenas = (raiz || []).map((o) => o.name).filter((n) => n && n !== empresaId);
    if (!ajenas.length) return { ...base, veredicto: 'SIN PRUEBA', nota: 'no hay carpetas de otras empresas' };
    let ve = 0;
    for (const carpeta of ajenas.slice(0, 5)) {
      const { data, error: eU } = await usuario.storage.from(bucket).list(carpeta, { limit: 5 });
      if (!eU && data && data.length) ve += data.length;
    }
    return { ...base, existen: ajenas.length, ve, veredicto: ve > 0 ? 'FUGA' : 'OK', nota: `${ajenas.length} carpetas de otras empresas` };
  } catch (e) {
    return { ...base, veredicto: 'ERROR', nota: motivo(e) };
  }
}

export async function ejecutar({ admin, usuario, empresaId, tablas = TABLAS, conStorage = true }) {
  const filas = [];
  for (const spec of tablas) filas.push(await revisarTabla(spec, { admin, usuario, empresaId }));
  if (conStorage) filas.push(await revisarStorage({ admin, usuario, empresaId }));
  const cuenta = (v) => filas.filter((f) => f.veredicto === v).length;
  const resumen = { ok: cuenta('OK'), sinPrueba: cuenta('SIN PRUEBA'), fuga: cuenta('FUGA'), error: cuenta('ERROR'), noExiste: cuenta('NO EXISTE') };
  return { filas, resumen, pasa: resumen.fuga === 0 && resumen.error === 0 };
}

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
  const { url, anonKey, serviceRoleKey } = config.supabase;
  if (!url || !anonKey || !serviceRoleKey) { console.error('Falta SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en backend/.env'); process.exitCode = 1; return; }
  const opc = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceRoleKey, opc);
  const usuario = createClient(url, anonKey, opc);

  console.log(`Base: ${new URL(url).host}   (solo lectura; no se escribe nada)`);
  const email = await preguntar('Correo de una persona de DEV (cualquier rol): ');
  const pass = await preguntar('Contraseña: ', true);
  const { data: sesion, error: eLogin } = await usuario.auth.signInWithPassword({ email: email.trim(), password: pass });
  if (eLogin) { console.error('No se pudo iniciar sesión:', eLogin.message); process.exitCode = 1; return; }
  try {
    const { data: perfil } = await usuario.from('perfiles').select('empresa_id').eq('id', sesion.user.id).maybeSingle();
    if (!perfil || !perfil.empresa_id) { console.error('Esa cuenta no tiene perfil/empresa.'); process.exitCode = 1; return; }
    const { data: emp } = await admin.from('empresas').select('nombre').eq('id', perfil.empresa_id).maybeSingle();
    console.log(`Sesión de la empresa: ${emp ? emp.nombre : perfil.empresa_id}\n`);

    const r = await ejecutar({ admin, usuario, empresaId: perfil.empresa_id });
    const ancho = Math.max(...r.filas.map((f) => f.tabla.length));
    console.log(`${'tabla'.padEnd(ancho)}  ${'de otras'.padStart(8)}  ${'ve'.padStart(4)}  resultado`);
    for (const f of r.filas) {
      console.log(`${f.tabla.padEnd(ancho)}  ${String(f.existen).padStart(8)}  ${String(f.ve).padStart(4)}  ${f.veredicto}${f.nota ? '  · ' + f.nota : ''}`);
    }
    console.log(`\nResumen: OK ${r.resumen.ok} · sin prueba ${r.resumen.sinPrueba} · FUGA ${r.resumen.fuga} · error ${r.resumen.error} · no existe ${r.resumen.noExiste}`);
    if (r.resumen.fuga > 0) console.log('✘ HAY FUGAS: este usuario ve filas de otras empresas. Revisa las políticas RLS de esas tablas.');
    else if (r.resumen.error > 0) console.log('? No se pudo revisar alguna tabla; revisa los ERROR de arriba.');
    else console.log('✔ Ninguna fuga: este usuario no ve filas de otras empresas en las tablas con prueba.');
    if (r.resumen.sinPrueba > 0) console.log(`  (${r.resumen.sinPrueba} tablas sin prueba: no hay filas de otras empresas; no se puede concluir nada de ellas.)`);
    if (!r.pasa) process.exitCode = 1;
  } finally {
    await usuario.auth.signOut();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
