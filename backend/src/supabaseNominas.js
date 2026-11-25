// ============================================================
//  CONTATECK · Backend · Nóminas internas (Pieza 4)
//  Llama a la RPC crear_nomina de Postgres, que valida rol y
//  guarda encabezado + detalle en una sola transacción atómica.
//  Mismo patrón que supabasePolizasCompletas: cliente autenticado
//  como el propio usuario (RLS real vía las verificaciones dentro
//  de la función RPC).
//
//  El ISR/IMSS lo calcula el frontend (Motor Fiscal); llega sumado en `deducciones` y, desde OT-0064,
//  también desglosado (ISR bruto/retenido, subsidio, IMSS, otras) para poder timbrar el CFDI de nómina
//  (ambiente de pruebas del PAC; ver nominaCfdi.js y timbradoNomina.js).
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

// detalle: [{ empleado_id, nombre, puesto, salario_diario, sueldo_base,
//             otras_percepciones, deducciones, notas }, ...]
// Los totales NO se mandan desde aquí — la RPC los recalcula en el
// servidor a partir del detalle (fuente única de verdad).
export async function crearNomina(accessToken, { periodicidad, fechaInicio, fechaFin, dias, detalle }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase.rpc('crear_nomina', {
    p_periodicidad: periodicidad,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_dias: dias,
    p_detalle: detalle,
  });
  if (error) {
    log.warn('[postgres] crear_nomina:', error.message);
    return { ok: false, error: error.message };
  }
  // Conexión Nómina↔Contabilidad: la nómina guardada genera su póliza
  // de Egreso automáticamente (Cargo Gastos / Abono Bancos por el neto
  // pagado). Si la póliza falla, la nómina SÍ queda guardada (el pago
  // ya ocurrió) y se devuelve una advertencia para que contabilidad la
  // registre a mano — mismo criterio que la conexión de Ventas.
  let polizaWarning = null;
  const rPol = await generarPolizaNomina(supabase, {
    periodicidad, fechaInicio, fechaFin,
    empleados: data && data.empleados_pagados,
    totalNeto: data && Number(data.total_neto),
  }, log);
  if (!rPol.ok) {
    polizaWarning = rPol.error || 'No se pudo generar la póliza contable.';
    log.warn('[postgres] crearNomina: nómina guardada pero póliza falló:', polizaWarning);
  }

  return { ok: true, nomina: data, polizaWarning };
}

// Lee los códigos de las cuentas Bancos y Gastos desde la configuración
// contable (RLS limita a la empresa del usuario — no hace falta filtrar).
async function cuentasParaNomina(supabase, log) {
  const { data, error } = await supabase
    .from('configuracion_contable')
    .select('cuenta_bancos_id, cuenta_gastos_id')
    .maybeSingle();
  if (error || !data || !data.cuenta_bancos_id || !data.cuenta_gastos_id) {
    log.warn('[postgres] cuentasParaNomina:', error?.message || 'config incompleta');
    return null;
  }
  const { data: cuentas, error: e2 } = await supabase
    .from('cuentas_contables')
    .select('id, codigo')
    .in('id', [data.cuenta_bancos_id, data.cuenta_gastos_id]);
  if (e2 || !cuentas || cuentas.length < 2) return null;
  const mapa = {};
  cuentas.forEach((c) => { mapa[c.id] = c.codigo; });
  return { bancos: mapa[data.cuenta_bancos_id], gastos: mapa[data.cuenta_gastos_id] };
}

const ETIQUETA_PERIODO = { semanal: 'semanal', catorcenal: 'catorcenal', quincenal: 'quincenal', mensual: 'mensual' };

async function generarPolizaNomina(supabase, n, log) {
  if (!n.totalNeto || n.totalNeto <= 0) {
    return { ok: false, error: 'Neto de la nómina inválido para la póliza.' };
  }
  const cuentas = await cuentasParaNomina(supabase, log);
  if (!cuentas || !cuentas.bancos || !cuentas.gastos) {
    return { ok: false, error: 'Cuentas contables (Bancos/Gastos) no configuradas — la póliza no se generó.' };
  }
  const concepto = 'Nómina ' + (ETIQUETA_PERIODO[n.periodicidad] || n.periodicidad) +
    ' ' + n.fechaInicio + ' a ' + n.fechaFin + ' · ' + (n.empleados || '?') + ' empleado(s)';
  const partidas = [
    { codigo: cuentas.gastos, debe: n.totalNeto, haber: 0, descripcion: 'Sueldos del periodo' },
    { codigo: cuentas.bancos, debe: 0, haber: n.totalNeto, descripcion: 'Pago de nómina' },
  ];
  // Fecha de la póliza: el fin del periodo (día de pago típico).
  const { data, error } = await supabase.rpc('crear_poliza_completa', {
    p_tipo: 'Egreso',
    p_fecha: n.fechaFin,
    p_concepto: concepto,
    p_partidas: partidas,
    p_origen: 'nominas',
    p_cfdi_uuid: null,
  });
  if (error) {
    log.warn('[postgres] generarPolizaNomina:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, poliza: data };
}

// Lista de nóminas pagadas (encabezados), más reciente primero. La RLS
// de `nominas` ya limita a rh/admin/director/contador/auditor de la
// misma empresa — aquí no hace falta revalidar rol.
export async function listarNominas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('nominas')
    .select('id, periodicidad, fecha_inicio, fecha_fin, dias, total_percepciones, total_deducciones, total_neto, empleados_pagados, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    log.warn('[postgres] listarNominas:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, nominas: data || [] };
}

// Detalle (empleados) de una nómina específica. La RLS de nomina_detalle
// ya filtra por empresa/rol, así que solo devuelve filas si el usuario
// tiene permiso — un id de otra empresa simplemente regresa vacío.
export async function detalleNomina(accessToken, nominaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const BASE = 'nombre, puesto, salario_diario, sueldo_base, otras_percepciones, deducciones, neto, notas';
  // OT-0064: con el SQL aplicado también viene el UUID del timbre; sin él se usan las columnas de siempre.
  let { data, error } = await supabase
    .from('nomina_detalle').select('id, ' + BASE + ', cfdi_uuid, cfdi_fiscalapi_id').eq('nomina_id', nominaId).order('nombre', { ascending: true });
  if (error && columnaFaltante(error)) {
    ({ data, error } = await supabase.from('nomina_detalle').select(BASE).eq('nomina_id', nominaId).order('nombre', { ascending: true }));
  }
  if (error) {
    log.warn('[postgres] detalleNomina:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, detalle: data || [] };
}

// OT-0064: la base puede no tener todavía las columnas/funciones del SQL de timbrado de nómina.
export function columnaFaltante(error) {
  const m = String((error && (error.message || '')) + ' ' + String((error && error.code) || ''));
  return /42703|42883|PGRST202|PGRST204|does not exist|schema cache|Could not find/i.test(m);
}
const MENSAJE_SIN_SQL = 'Falta aplicar en la base el SQL de timbrado de nómina (database/OT-0064-timbrado-nomina-PROPUESTA.sql).';

// Lee lo necesario para timbrar: la nómina, su detalle completo y los datos fiscales de los empleados.
// Todo con el token del usuario (RLS limita a su empresa).
export async function leerParaTimbrar(accessToken, nominaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data: nomina, error: e1 } = await supabase
    .from('nominas').select('id, periodicidad, fecha_inicio, fecha_fin, dias, estado').eq('id', nominaId).maybeSingle();
  if (e1) { log.warn('[postgres] leerParaTimbrar nomina:', e1.message); return { ok: false, error: 'No se pudo leer la nómina.' }; }
  if (!nomina) return { ok: true, nomina: null, detalle: [], empleados: [] };
  const { data: detalle, error: e2 } = await supabase
    .from('nomina_detalle')
    .select('id, empleado_id, nombre, puesto, sueldo_base, otras_percepciones, deducciones, neto, sdi, isr_bruto, isr_retenido, subsidio, imss, otras_deducciones, cfdi_uuid')
    .eq('nomina_id', nominaId).order('nombre', { ascending: true });
  if (e2) {
    log.warn('[postgres] leerParaTimbrar detalle:', e2.message);
    return { ok: false, error: columnaFaltante(e2) ? MENSAJE_SIN_SQL : 'No se pudo leer el detalle de la nómina.' };
  }
  const ids = [...new Set((detalle || []).map((d) => d.empleado_id).filter(Boolean))];
  let empleados = [];
  if (ids.length) {
    const { data: emps, error: e3 } = await supabase
      .from('empleados')
      .select('id, nombre, puesto, departamento, fecha_ingreso, rfc, curp, nss, cuenta_bancaria, cp_fiscal, tipo_contrato, tipo_jornada, riesgo_puesto, clave_entidad')
      .in('id', ids);
    if (e3) {
      log.warn('[postgres] leerParaTimbrar empleados:', e3.message);
      return { ok: false, error: columnaFaltante(e3) ? MENSAJE_SIN_SQL : 'No se pudieron leer los datos de los empleados.' };
    }
    empleados = emps || [];
  }
  return { ok: true, nomina, detalle: detalle || [], empleados };
}

// Id del CFDI en el PAC de un renglón ya timbrado (para bajar su XML). RLS: solo de la empresa del usuario.
export async function idPacDeRenglon(accessToken, detalleId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.from('nomina_detalle').select('cfdi_uuid, cfdi_fiscalapi_id, nombre').eq('id', detalleId).maybeSingle();
  if (error) { log.warn('[postgres] idPacDeRenglon:', error.message); return { ok: false, error: columnaFaltante(error) ? MENSAJE_SIN_SQL : 'No se pudo leer el renglón.' }; }
  return { ok: true, renglon: data || null };
}

// Anota el UUID de un renglón ya timbrado (función SECURITY DEFINER de la base).
export async function registrarTimbre(accessToken, detalleId, { uuid, fiscalapiId }, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { error } = await supabase.rpc('registrar_timbre_nomina', { p_detalle_id: detalleId, p_uuid: uuid, p_fiscalapi_id: fiscalapiId });
  if (error) { log.warn('[postgres] registrar_timbre_nomina:', error.message); return { ok: false, error: columnaFaltante(error) ? MENSAJE_SIN_SQL : error.message }; }
  return { ok: true };
}
