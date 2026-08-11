// ============================================================
//  CONTATECK · Backend · Empleados (Nómina — Parte A)
//  OT-0017 · Épica 2: Evolución UX/UI
//
//  IMPORTANTE — alcance aprobado: esto es SOLO estructura técnica
//  (CRUD real + permisos por rol). NO incluye cálculo de nómina
//  (percepciones, deducciones, ISR, IMSS, CFDI de nómina) — eso
//  requiere reglas laborales/fiscales que debe definir el
//  responsable contable del proyecto. Punto de integración
//  documentado, sin implementar (ver Parte B en el roadmap).
//
//  Restricción de columnas por rol: RLS (policies.sql) solo
//  filtra FILAS (aislamiento por empresa + qué roles pueden ver
//  la tabla en general). La restricción de qué COLUMNAS ve cada
//  rol vive aquí, en el backend — mismo patrón ya usado en Ventas
//  para las reglas finas que RLS no cubre.
//
//  EVENTOS FUTUROS DEL MÓDULO (documentados, NO implementados —
//  se retoman hasta terminar el núcleo completo del ERP):
//    - "empleado.alta"        -> podría disparar checklist de
//                                 onboarding (contrato, accesos).
//    - "empleado.baja"        -> podría disparar checklist de
//                                 offboarding; el registro NUNCA
//                                 se borra, así que un rehire futuro
//                                 ya tiene su historial completo.
//    - "nomina.calculada"     -> (cuando exista Parte B) candidato a
//                                 disparar generación de pólizas
//                                 contables automáticas.
//    - "nomina.timbrada"      -> candidato a notificar a cada empleado
//                                 con su recibo (CFDI de nómina).
//  Ninguno de estos ganchos existe todavía en el código.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

const ROLES_CON_ACCESO = ['rh', 'admin', 'director', 'contador', 'auditor'];

// Columnas administrativas, seguras para auditoría de cumplimiento.
const COLUMNAS_AUDITOR = 'id, nombre, puesto, departamento, estado, fecha_ingreso, created_at';
// Todo, incluyendo datos sensibles (sueldo, rfc, curp, nss, cuenta bancaria).
const COLUMNAS_COMPLETAS = 'id, nombre, puesto, departamento, fecha_ingreso, sueldo, rfc, curp, nss, cuenta_bancaria, estado, created_by, created_at, updated_at';

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function listarEmpleados(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_CON_ACCESO.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para ver la lista de empleados (tu rol no lo permite).' };
  }

  const columnas = rol === 'auditor' ? COLUMNAS_AUDITOR : COLUMNAS_COMPLETAS;
  const { data, error } = await supabase
    .from('empleados')
    .select(columnas)
    .order('nombre', { ascending: true });

  if (error) {
    log.warn('[postgres] listarEmpleados:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, empleados: data || [], columnasRestringidas: rol === 'auditor' };
}
