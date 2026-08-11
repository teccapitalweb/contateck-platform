// ============================================================
//  CONTATECK · Backend · Empleados/Pólizas en Postgres
//  OT-0008 — Fase A. Mismo patrón que supabaseData.js/supabaseCatalogo.js:
//  consulta con el cliente autenticado como el propio usuario (RLS real).
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

// Devuelve { empleados: [...], polizas: [...] } para la empresa del usuario
// (RLS ya filtra). null si Postgres no está listo, no hay permiso (ej. un
// vendedor no puede leer empleados) o algo falla.
export async function obtenerEmpleadosYPolizas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase || !accessToken) return null;

  try {
    const [{ data: empleados, error: errEmp }, { data: polizas, error: errPol }] = await Promise.all([
      supabase.from('empleados').select('id, nombre, puesto, sueldo, estado'),
      supabase.from('polizas').select('id, folio, tipo, fecha, concepto, monto, estado'),
    ]);

    // errEmp puede ser normal si el rol del usuario no tiene permiso de
    // lectura sobre empleados (ej. vendedor) — no se trata como fallo grave,
    // simplemente esa lista queda vacía.
    return {
      empleados: errEmp ? [] : (empleados || []),
      polizas: errPol ? [] : (polizas || []),
    };
  } catch (err) {
    log.error('[postgres] Error al consultar empleados/polizas:', err.message);
    return null;
  }
}
