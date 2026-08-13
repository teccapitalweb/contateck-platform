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

// Extrae el "sub" (user id) del JWT sin llamada de red extra.
function idDeToken(accessToken) {
  try {
    const json = Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch (e) {
    return null;
  }
}

const TABLAS = {
  clientes: { campos: ['nombre', 'rfc', 'email', 'uso_cfdi', 'cp', 'regimen'], permiteEliminar: true },
  productos: { campos: ['descripcion', 'clave_prod_serv', 'clave_unidad', 'precio_unitario'], permiteEliminar: true },
  // Nómina · Parte A (OT-0017): campos ampliados. rfc/curp/nss/
  // cuenta_bancaria son sensibles — el rol auditor nunca los ve
  // (columnas ocultas en supabaseEmpleados.js, no aquí).
  empleados: {
    campos: ['nombre', 'puesto', 'departamento', 'fecha_ingreso', 'sueldo', 'rfc', 'curp', 'nss', 'cuenta_bancaria', 'estado'],
    permiteEliminar: false,
  }, // soft-delete
  polizas: { campos: ['folio', 'tipo', 'fecha', 'concepto', 'monto', 'estado'], permiteEliminar: false }, // nunca se borra
  // Migración del catálogo de cuentas (antes vivía solo en localStorage,
  // cada quien con su propia copia). "activo" en vez de borrado real:
  // una cuenta ya usada en pólizas no se puede eliminar sin romper el
  // historial contable — se desactiva, igual que empleados con 'baja'.
  cuentas_contables: { campos: ['codigo', 'nombre', 'naturaleza', 'nivel'], permiteEliminar: false },
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

async function obtenerEmpresaId(supabase, accessToken) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (error || !data) return null;
  return data.empresa_id;
}

export async function crear(tabla, accessToken, body, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const empresaId = await obtenerEmpresaId(supabase, accessToken);
  if (!empresaId) return { ok: false, error: 'No se encontró tu perfil/empresa en Postgres.' };

  const datos = { ...limpiarCampos(tabla, body), empresa_id: empresaId };
  if (tabla === 'empleados') datos.created_by = idDeToken(accessToken);
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
    // empleados: soft-delete (baja). cuentas_contables: soft-delete (activo=false).
    if (tabla === 'empleados') {
      const { data, error } = await supabase.from(tabla).update({ estado: 'baja' }).eq('id', id).select().single();
      if (error) {
        log.warn(`[postgres] baja empleado:`, error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true, registro: data, softDelete: true };
    }
    if (tabla === 'cuentas_contables') {
      const { data, error } = await supabase.from(tabla).update({ activo: false }).eq('id', id).select().single();
      if (error) {
        log.warn(`[postgres] desactivar cuenta:`, error.message);
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

// Simétrica de eliminar() para las tablas con baja suave — regresa una
// cuenta desactivada a servicio. Mismos roles que pueden desactivar.
export async function reactivar(tabla, accessToken, id, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (tabla === 'cuentas_contables') {
    const { data, error } = await supabase.from(tabla).update({ activo: true }).eq('id', id).select().single();
    if (error) { log.warn(`[postgres] reactivar cuenta:`, error.message); return { ok: false, error: error.message }; }
    return { ok: true, registro: data };
  }
  return { ok: false, error: `Reactivar no está soportado para "${tabla}".` };
}
