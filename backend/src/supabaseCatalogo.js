// ============================================================
//  CONTATECK · Backend · Catálogo (clientes/productos) en Postgres
//  OT-0007 — Fase A
//
//  Mismo patrón que supabaseData.js de OT-0006: se consulta con
//  un cliente autenticado como el propio usuario (su access_token
//  + anon key), nunca con la service role — así RLS filtra de
//  verdad por empresa. Solo lectura por ahora.
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

// Devuelve { clientes: [...], productos: [...] } de Postgres para la
// empresa del usuario dueño del token (RLS ya filtra, no hace falta
// pasar empresa_id explícito). null si Postgres no está listo o algo falla.
export async function obtenerCatalogo(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase || !accessToken) return null;

  try {
    const [{ data: clientes, error: errClientes }, { data: productos, error: errProductos }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, rfc, email, uso_cfdi, cp, regimen'),
      supabase.from('productos').select('id, descripcion, clave_prod_serv, clave_unidad, precio_unitario'),
    ]);

    if (errClientes || errProductos) {
      log.warn('[postgres] Error leyendo catálogo (usará respaldo local):', errClientes?.message || errProductos?.message);
      return null;
    }

    return {
      clientes: (clientes || []).map((c) => ({
        rfc: c.rfc, nombre: c.nombre, email: c.email, usoCfdi: c.uso_cfdi, cp: c.cp, regimen: c.regimen,
      })),
      productos: (productos || []).map((p) => ({
        descripcion: p.descripcion, claveProdServ: p.clave_prod_serv, claveUnidad: p.clave_unidad, precioUnitario: p.precio_unitario,
      })),
    };
  } catch (err) {
    log.error('[postgres] Error al consultar catálogo:', err.message);
    return null;
  }
}
