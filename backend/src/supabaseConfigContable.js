// ============================================================
//  CONTATECK · Backend · Configuración contable de la empresa
//  OT-0020 · Mapea roles contables (Bancos, Clientes, Proveedores,
//  Ventas, IVA trasladado, IVA acreditable, Gastos) a las cuentas
//  REALES del catálogo de cada empresa. Elimina los códigos de
//  cuenta que antes estaban quemados directo en el frontend.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function idDeToken(accessToken) {
  try {
    const json = Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch (e) {
    return null;
  }
}

export async function obtenerEmpresaId(accessToken) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return null;
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (error || !data) return null;
  return data.empresa_id;
}

const CAMPOS = [
  'cuenta_bancos_id', 'cuenta_clientes_id', 'cuenta_proveedores_id',
  'cuenta_ventas_id', 'cuenta_iva_trasladado_id', 'cuenta_iva_acreditable_id',
  'cuenta_gastos_id',
];

export async function obtenerConfigContable(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('configuracion_contable')
    .select(CAMPOS.join(', ') + ', updated_at')
    .maybeSingle();
  if (error) {
    log.warn('[postgres] obtenerConfigContable:', error.message);
    return { ok: false, error: error.message };
  }
  // null = todavía nadie la ha configurado; el frontend debe mostrar
  // los 7 campos vacíos, nunca inventar un valor.
  return { ok: true, config: data || {} };
}

// El RLS de la tabla ya exige empresa_id = auth_empresa_id() y rol
// contador/admin/director en insert/update — aquí solo se arma el
// upsert; la validación de "quién puede" vive en Postgres, no aquí.
export async function guardarConfigContable(accessToken, empresaId, valores, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const payload = { empresa_id: empresaId, updated_at: new Date().toISOString() };
  for (const campo of CAMPOS) {
    if (campo in valores) payload[campo] = valores[campo] || null;
  }
  const { data, error } = await supabase
    .from('configuracion_contable')
    .upsert(payload, { onConflict: 'empresa_id' })
    .select(CAMPOS.join(', ') + ', updated_at')
    .single();
  if (error) {
    log.warn('[postgres] guardarConfigContable:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, config: data };
}
