// ============================================================
//  CONTATECK · Backend · CRUD en Postgres
//  OT-0008-C — Escritura (crear/editar/borrar) para clientes,
//  productos, empleados y pólizas. A partir de esta OT, estos 4
//  módulos usan Postgres como destino EXCLUSIVO de escritura
//  (ya no Firestore) — es la decisión aprobada del equipo.
//
//  Mismo patrón de siempre: cliente autenticado como el propio
//  usuario (RLS real). "eliminar" en empleados se traduce a un
//  soft-delete (estado='baja'), y "polizas" no admite eliminar
//  en absoluto — coincide con las políticas RLS ya definidas en
//  OT-0003 (nunca se aprobó una policy de delete para esas dos).
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const TABLAS = {
  clientes: { campos: ['nombre', 'rfc', 'email', 'uso_cfdi', 'cp', 'regimen'], permiteEliminar: true },
  productos: { campos: ['descripcion', 'clave_prod_serv', 'clave_unidad', 'precio_unitario'], permiteEliminar: true },
  empleados: { campos: ['nombre', 'puesto', 'sueldo', 'estado'], permiteEliminar: false }, // soft-delete
  polizas: { campos: ['folio', 'tipo', 'fecha', 'concepto', 'monto', 'estado'], permiteEliminar: false }, // nunca se borra
};

export function tablaValida(tabla) {
  return Object.prototype.hasOwnProperty.call(TABLAS, tabla);
}

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function limpiarCampos(tabla, body) {
  const permitidos = TABLAS[tabla].campos;
  const limpio = {};
  for (const k of permitidos) if (body[k] !== undefined) limpio[k] = body[k];
  return limpio;
}

async function obtenerEmpresaId(supabase) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').single();
  if (error || !data) return null;
  return data.empresa_id;
}

export async function crear(tabla, accessToken, body, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const empresaId = await obtenerEmpresaId(supabase);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const datos = { ...limpiarCampos(tabla, body), empresa_id: empresaId };
  const { data, error } = await supabase.from(tabla).insert(datos).select().single();
  if (error) {
    log.warn(`[postgres] crear ${tabla}:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, registro: data };
}

export async function actualizar(tabla, accessToken, id, body, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const datos = limpiarCampos(tabla, body);
  const { data, error } = await supabase.from(tabla).update(datos).eq('id', id).select().single();
  if (error) {
    log.warn(`[postgres] actualizar ${tabla}:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, registro: data };
}

export async function eliminar(tabla, accessToken, id, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!TABLAS[tabla].permiteEliminar) {
    // empleados: soft-delete (baja). polizas: rechazado del todo.
    if (tabla === 'empleados') {
      const { data, error } = await supabase.from(tabla).update({ estado: 'baja' }).eq('id', id).select().single();
      if (error) {
        log.warn(`[postgres] baja empleado:`, error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true, registro: data, softDelete: true };
    }
    return { ok: false, error: 'Las pólizas no se pueden eliminar, solo revisar o cancelar contablemente.' };
  }

  const { error } = await supabase.from(tabla).delete().eq('id', id);
  if (error) {
    log.warn(`[postgres] eliminar ${tabla}:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
