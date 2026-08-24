// ============================================================
//  CONTATECK · Backend · Periodos contables
//  OT-0026 · Cierre de periodos: una vez cerrado un mes, ya no se
//  pueden crear ni corregir pólizas con fecha dentro de él. Llama a
//  las funciones RPC de Postgres que validan permiso y cuadre.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}

// Lista los periodos con movimientos + su estado (abierto/cerrado).
// Combina: (a) los periodos que ya tienen registro explícito en
// periodos_contables, y (b) los meses que tienen pólizas pero aún no
// tienen registro (se muestran como 'abierto' implícito).
export async function listarPeriodos(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const [{ data: registrados, error: e1 }, { data: polizas, error: e2 }] = await Promise.all([
    supabase.from('periodos_contables').select('anio, mes, estado, cerrado_en').order('anio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('polizas').select('fecha'),
  ]);
  if (e1) { log.warn('[postgres] listarPeriodos registrados:', e1.message); return { ok: false, error: e1.message }; }
  if (e2) { log.warn('[postgres] listarPeriodos polizas:', e2.message); return { ok: false, error: e2.message }; }

  const mapa = {};
  (registrados || []).forEach((r) => {
    mapa[`${r.anio}-${r.mes}`] = { anio: r.anio, mes: r.mes, estado: r.estado, cerradoEn: r.cerrado_en };
  });
  (polizas || []).forEach((p) => {
    const [anio, mes] = String(p.fecha || '').split('-');
    if (!anio || !mes) return;
    const key = `${Number(anio)}-${Number(mes)}`;
    if (!mapa[key]) mapa[key] = { anio: Number(anio), mes: Number(mes), estado: 'abierto', cerradoEn: null };
  });
  const periodos = Object.values(mapa).sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes));
  return { ok: true, periodos };
}

export async function cerrarPeriodo(accessToken, { anio, mes }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('cerrar_periodo', { p_anio: anio, p_mes: mes });
  if (error) {
    log.warn('[postgres] cerrar_periodo:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, ...data };
}
