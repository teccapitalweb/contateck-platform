// ============================================================
//  CONTATECK · Backend · Ventas y Pagos
//  OT-0014 · Épica 2: Evolución UX/UI
//
//  Reglas de negocio finas que RLS no cubre (documentado también
//  en addendum_ventas_policies.sql):
//    - Quien registra una venta (created_by) NO puede tomarla para
//      revisión ni confirmarla/rechazarla — separación de funciones.
//      EXCEPCIÓN (OT-mejoras-ventas): admin/director SÍ pueden
//      auto-validar su propio registro (ROLES_AUTOVALIDAN). El rol
//      "contador" a secas se queda sin esta excepción.
//    - Transición de estados es estrictamente:
//        pendiente -> revision -> (confirmado | rechazado)
//      Nunca se salta "revision"; "Tomar para revisión" es SIEMPRE
//      manual (aprobado explícitamente, nunca automático).
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { obtenerRolUsuario } from './supabaseCfdis.js';

const ROLES_VALIDADORES = ['contador', 'admin', 'director'];
const ROLES_REGISTRO = ['vendedor', 'contador', 'admin', 'director'];
// OT-mejoras-ventas: excepción a la separación de funciones — admin y
// director SÍ pueden tomar/validar un pago que ellos mismos registraron
// (caso real: la contadora, con rol director, a veces registra y valida
// el mismo pago). El rol "contador" a secas se queda sin esta excepción,
// para conservar el control si algún día se usa para alguien más junior.
const ROLES_AUTOVALIDAN = ['admin', 'director'];

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Extrae el "sub" (user id) del JWT sin llamada de red extra.
function idDeToken(accessToken) {
  try {
    const json = Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch (e) {
    return null;
  }
}

async function nextFolio(supabase) {
  const { count } = await supabase.from('ventas').select('id', { count: 'exact', head: true });
  return 'P-' + String((count || 0) + 1).padStart(4, '0');
}

// BUG encontrado en OT-0014: la RLS de `perfiles` permite ver a
// cualquiera de tu misma empresa, no solo tu propia fila. Sin filtrar
// explícitamente por id, .single() truena en cuanto la empresa tiene
// 2+ usuarios reales.
async function obtenerEmpresaId(supabase, accessToken, log = console) {
  const { data, error } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(accessToken)).single();
  if (error || !data) {
    log.warn('[postgres] obtenerEmpresaId:', error?.message);
    return null;
  }
  return data.empresa_id;
}

export async function crearVenta(accessToken, userId, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  if (!datos.cliente || !datos.concepto || !datos.importe || !datos.fechaPago) {
    return { ok: false, error: 'Faltan datos obligatorios (cliente, concepto, importe, fecha de pago).' };
  }

  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se pudo determinar la empresa del usuario.' };

  const folio = await nextFolio(supabase);
  const { data, error } = await supabase
    .from('ventas')
    .insert({
      folio,
      cliente: datos.cliente,
      concepto: datos.concepto,
      consultora_id: datos.consultoraId || null,
      importe: datos.importe,
      fecha_pago: datos.fechaPago,
      metodo_pago: datos.metodoPago || null,
      referencia: datos.referencia || null,
      banco: datos.banco || null,
      vendedor_id: userId,
      comprobante_path: datos.comprobantePath || null,
      notas: datos.notas || null,
      incluye_iva: datos.incluyeIva !== false,
      created_by: userId,
      empresa_id: empresaId,
    })
    .select()
    .single();

  if (error) {
    log.warn('[postgres] crearVenta:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, venta: data };
}

export async function listarVentas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const { data, error } = await supabase
    .from('ventas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    log.warn('[postgres] listarVentas:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, ventas: data || [] };
}

// ---- Transiciones de estado (con reglas finas de negocio) ----

async function obtenerVenta(supabase, ventaId) {
  const { data, error } = await supabase.from('ventas').select('*').eq('id', ventaId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function tomarParaRevision(accessToken, userId, ventaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para tomar ventas a revisión (tu rol no lo permite).' };
  }

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada.' };
    if (venta.created_by === userId && !ROLES_AUTOVALIDAN.includes(rol)) {
      return { ok: false, error: 'No puedes tomar para revisión una venta que tú mismo registraste.' };
    }
    if (venta.estado !== 'pendiente') {
      return { ok: false, error: `Esta venta ya no está en 'pendiente' (estado actual: ${venta.estado}).` };
    }

    const { data, error } = await supabase
      .from('ventas')
      .update({ estado: 'revision', tomado_por: userId, tomado_en: new Date().toISOString() })
      .eq('id', ventaId)
      .eq('estado', 'pendiente') // doble seguro contra condición de carrera (dos clics casi simultáneos)
      .select()
      .single();

    if (error) throw error;
    return { ok: true, venta: data };
  } catch (error) {
    log.warn('[postgres] tomarParaRevision:', error.message);
    return { ok: false, error: error.message };
  }
}

// ---- Conexión Ventas↔Contabilidad: póliza automática al confirmar ----
// Lee los códigos de cuenta desde configuracion_contable (no hardcodeados,
// así cada empresa usa sus propias cuentas). Si alguna no está configurada,
// la póliza no se genera (pero la venta sí se confirma — el dinero se
// recibió, y la contadora puede crear la póliza manualmente después).
async function obtenerCuentasContables(supabase, empresaId, log) {
  const { data, error } = await supabase
    .from('configuracion_contable')
    .select('cuenta_bancos_id, cuenta_ventas_id, cuenta_iva_trasladado_id')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error || !data) {
    log.warn('[postgres] obtenerCuentasContables:', error?.message || 'sin config');
    return null;
  }
  // Necesitamos los CÓDIGOS (no los IDs) porque crear_poliza_completa
  // busca cuentas por código + empresa_id.
  const ids = [data.cuenta_bancos_id, data.cuenta_ventas_id, data.cuenta_iva_trasladado_id].filter(Boolean);
  if (ids.length < 2) return null; // mínimo Bancos + Ventas
  const { data: cuentas, error: e2 } = await supabase
    .from('cuentas_contables')
    .select('id, codigo')
    .in('id', ids);
  if (e2 || !cuentas) return null;
  const mapa = {};
  cuentas.forEach(c => { mapa[c.id] = c.codigo; });
  return {
    bancos: mapa[data.cuenta_bancos_id] || null,
    ventas: mapa[data.cuenta_ventas_id] || null,
    iva: mapa[data.cuenta_iva_trasladado_id] || null,
  };
}

async function generarPolizaVenta(supabase, venta, log) {
  const empresaId = venta.empresa_id;
  const cuentas = await obtenerCuentasContables(supabase, empresaId, log);
  if (!cuentas || !cuentas.bancos || !cuentas.ventas) {
    log.warn('[postgres] generarPolizaVenta: cuentas no configuradas, póliza no generada');
    return { ok: false, error: 'Cuentas contables no configuradas — la póliza no se generó.' };
  }

  const total = Number(venta.importe) || 0;
  const incluyeIva = venta.incluye_iva !== false;
  // Desglose: si incluye IVA, se separa el 16%; si no, todo va a Ventas.
  const subtotal = incluyeIva ? Math.round((total / 1.16) * 100) / 100 : total;
  const iva = incluyeIva ? Math.round((total - subtotal) * 100) / 100 : 0;

  const partidas = [
    { codigo: cuentas.bancos, debe: total, haber: 0, descripcion: 'Cobro ' + (venta.folio || '') + ' — ' + (venta.cliente || '') },
    { codigo: cuentas.ventas, debe: 0, haber: subtotal, descripcion: (venta.concepto || 'Venta') },
  ];
  if (iva > 0 && cuentas.iva) {
    partidas.push({ codigo: cuentas.iva, debe: 0, haber: iva, descripcion: 'IVA trasladado' });
  }

  const concepto = 'Venta ' + (venta.folio || '') + ' — ' + (venta.cliente || '') + ' — ' + (venta.concepto || '');

  const { data, error } = await supabase.rpc('crear_poliza_completa', {
    p_tipo: 'Ingreso',
    p_fecha: venta.fecha_pago,
    p_concepto: concepto,
    p_partidas: partidas,
    p_origen: 'ventas',
    p_cfdi_uuid: null,
  });
  if (error) {
    log.warn('[postgres] generarPolizaVenta:', error.message);
    return { ok: false, error: 'Póliza no generada: ' + error.message };
  }
  return { ok: true, poliza: data };
}

async function resolverVenta(accessToken, userId, ventaId, nuevoEstado, log) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para validar ventas (tu rol no lo permite).' };
  }

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada.' };
    if (venta.created_by === userId && !ROLES_AUTOVALIDAN.includes(rol)) {
      return { ok: false, error: 'No puedes validar una venta que tú mismo registraste.' };
    }
    if (venta.estado !== 'revision') {
      return { ok: false, error: `Esta venta debe estar en 'revision' antes de confirmar/rechazar (estado actual: ${venta.estado}). Tómala primero con "Tomar para revisión".` };
    }

    const { data, error } = await supabase
      .from('ventas')
      .update({ estado: nuevoEstado, revisado_por: userId, revisado_en: new Date().toISOString() })
      .eq('id', ventaId)
      .eq('estado', 'revision')
      .select()
      .single();

    if (error) throw error;

    // Conexión Ventas↔Contabilidad: si se CONFIRMÓ el pago (no rechazó),
    // se genera la póliza contable automáticamente. Si la póliza falla, la
    // venta SÍ se confirmó (el dinero se recibió) pero se devuelve una
    // advertencia para que la contadora la revise.
    let polizaWarning = null;
    if (nuevoEstado === 'confirmado') {
      const rPol = await generarPolizaVenta(supabase, venta, log);
      if (!rPol.ok) {
        polizaWarning = rPol.error || 'No se pudo generar la póliza contable.';
        log.warn('[postgres] resolverVenta: venta confirmada pero póliza falló:', polizaWarning);
      }
    }

    return { ok: true, venta: data, polizaWarning };
  } catch (error) {
    log.warn('[postgres] resolverVenta:', error.message);
    return { ok: false, error: error.message };
  }
}

export function confirmarVenta(accessToken, userId, ventaId, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'confirmado', log);
}
export function rechazarVenta(accessToken, userId, ventaId, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'rechazado', log);
}
