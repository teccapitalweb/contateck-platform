// ============================================================
//  CONTATECK · Backend · Ventas y Pagos
//  OT-0014 · Épica 2: Evolución UX/UI
//  OT-0029 · Pulido de Ventas (validaciones, póliza ligada, motivo
//            de rechazo, reintento de póliza). Ver docs/work-orders/OT-0029.
//
//  Reglas de negocio finas que RLS no cubre (documentado también
//  en database/OT-0029-ventas.sql):
//    - Quien registra una venta (created_by) NO puede tomarla para
//      revisión ni confirmarla/rechazarla — separación de funciones.
//      EXCEPCIÓN (OT-mejoras-ventas): admin/director SÍ pueden
//      auto-validar su propio registro (ROLES_AUTOVALIDAN). El rol
//      "contador" a secas se queda sin esta excepción.
//    - Transición de estados es estrictamente:
//        pendiente -> revision -> (confirmado | rechazado)
//      Nunca se salta "revision"; "Tomar para revisión" es SIEMPRE
//      manual (aprobado explícitamente, nunca automático).
//    - Rechazar exige un motivo (OT-0029).
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

// OT-0029: límites de captura (la validación crítica también va en backend).
const LIMITES_TEXTO = { cliente: 150, concepto: 250, metodoPago: 60, referencia: 100, banco: 60, notas: 1000 };
const IMPORTE_MAXIMO = 999999999.99;
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;

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

// ---- Validación de captura (OT-0029) ----

function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  if (s < '2000-01-01') return false;
  // Un pago no puede haberse recibido en el futuro (1.5 días de holgura por zona horaria).
  const limite = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  return s <= limite;
}

// Devuelve { error } o { valores } ya limpios (trim, importe a 2 decimales).
export function validarDatosVenta(datos, empresaId) {
  const txt = (campo, obligatorio) => {
    const v = datos[campo] == null ? '' : String(datos[campo]).trim();
    if (obligatorio && !v) return { error: 'Falta el campo obligatorio: ' + campo + '.' };
    if (v.length > LIMITES_TEXTO[campo]) return { error: `El campo ${campo} excede ${LIMITES_TEXTO[campo]} caracteres.` };
    return { v: v || null };
  };
  const out = {};
  for (const [campo, obligatorio] of [['cliente', true], ['concepto', true], ['metodoPago', false], ['referencia', false], ['banco', false], ['notas', false]]) {
    const r = txt(campo, obligatorio);
    if (r.error) return { error: r.error };
    out[campo] = r.v;
  }

  const importe = Math.round(Number(datos.importe) * 100) / 100;
  if (!Number.isFinite(importe) || importe <= 0) return { error: 'El importe debe ser un número mayor a cero.' };
  if (importe > IMPORTE_MAXIMO) return { error: 'El importe excede el máximo permitido.' };
  out.importe = importe;

  if (!fechaValida(datos.fechaPago)) return { error: 'La fecha de pago no es válida (formato AAAA-MM-DD, sin fechas futuras).' };
  out.fechaPago = datos.fechaPago;

  // El comprobante solo puede vivir en la carpeta de ventas de la propia empresa.
  if (datos.comprobantePath) {
    const p = String(datos.comprobantePath);
    if (p.includes('..') || !p.startsWith(empresaId + '/ventas/')) {
      return { error: 'La ruta del comprobante no es válida.' };
    }
    out.comprobantePath = p;
  } else {
    out.comprobantePath = null;
  }
  out.incluyeIva = datos.incluyeIva !== false;
  return { valores: out };
}

export async function crearVenta(accessToken, userId, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_REGISTRO.includes(rol)) {
    return { ok: false, error: 'Tu rol no permite registrar ventas.' };
  }

  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se pudo determinar la empresa del usuario.' };

  const v = validarDatosVenta(datos || {}, empresaId);
  if (v.error) return { ok: false, error: v.error };
  const d = v.valores;

  const folio = await nextFolio(supabase);
  const { data, error } = await supabase
    .from('ventas')
    .insert({
      folio,
      cliente: d.cliente,
      concepto: d.concepto,
      importe: d.importe,
      fecha_pago: d.fechaPago,
      metodo_pago: d.metodoPago,
      referencia: d.referencia,
      banco: d.banco,
      vendedor_id: userId,
      comprobante_path: d.comprobantePath,
      notas: d.notas,
      incluye_iva: d.incluyeIva,
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

// OT-0029: devuelve también el folio de la póliza ligada (poliza_id → polizas.folio).
// Si el script database/OT-0029-ventas.sql aún no se corrió (no existe la
// columna/FK), cae a la lectura simple y la pantalla se comporta como antes.
export async function listarVentas(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  let { data, error } = await supabase
    .from('ventas')
    .select('*, poliza:polizas(folio)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    ({ data, error } = await supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300));
  }

  if (error) {
    log.warn('[postgres] listarVentas:', error.message);
    return { ok: false, error: error.message };
  }
  const ventas = (data || []).map((v) => {
    if (v.poliza === undefined) return v;
    const { poliza, ...resto } = v;
    return { ...resto, poliza_folio: poliza ? poliza.folio : null };
  });
  return { ok: true, ventas, limite: 300 };
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
// recibió — y desde OT-0029 la póliza se puede GENERAR DESPUÉS con
// "Generar póliza", sin duplicar nada).
//
// Devuelve { bancos, ventas, iva } (códigos o null) o null si no hay
// configuración. OT-0029: ya no exige "mínimo 2 ids"; cada cuenta se
// resuelve por separado y quien la usa decide qué le falta.
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
  const mapa = {};
  if (ids.length) {
    const { data: cuentas, error: e2 } = await supabase
      .from('cuentas_contables')
      .select('id, codigo')
      .in('id', ids);
    if (e2 || !cuentas) return null;
    cuentas.forEach(c => { mapa[c.id] = c.codigo; });
  }
  return {
    bancos: mapa[data.cuenta_bancos_id] || null,
    ventas: mapa[data.cuenta_ventas_id] || null,
    iva: mapa[data.cuenta_iva_trasladado_id] || null,
  };
}

function faltantesConfig(cuentas, requiereIva) {
  const f = [];
  if (!cuentas || !cuentas.bancos) f.push('Bancos');
  if (!cuentas || !cuentas.ventas) f.push('Ventas y servicios');
  if (requiereIva && (!cuentas || !cuentas.iva)) f.push('IVA trasladado');
  return f;
}

// OT-0029: para que la pantalla avise ANTES de confirmar si la póliza saldría.
export async function estadoConfigContable(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const empresaId = await obtenerEmpresaId(supabase, accessToken, log);
  if (!empresaId) return { ok: false, error: 'No se pudo determinar la empresa del usuario.' };
  const cuentas = await obtenerCuentasContables(supabase, empresaId, log);
  const faltantes = faltantesConfig(cuentas, true);
  return { ok: true, listo: faltantes.length === 0, faltantes };
}

async function generarPolizaVenta(supabase, venta, log) {
  const empresaId = venta.empresa_id;
  const cuentas = await obtenerCuentasContables(supabase, empresaId, log);
  const total = Number(venta.importe) || 0;
  const incluyeIva = venta.incluye_iva !== false;
  // Desglose: si incluye IVA, se separa el 16%; si no, todo va a Ventas.
  const subtotal = incluyeIva ? Math.round((total / 1.16) * 100) / 100 : total;
  const iva = incluyeIva ? Math.round((total - subtotal) * 100) / 100 : 0;

  // OT-0029: antes, con IVA y sin cuenta de IVA, la póliza salía descuadrada
  // y Postgres la rechazaba con un error críptico. Ahora se dice qué falta.
  const faltantes = faltantesConfig(cuentas, iva > 0);
  if (faltantes.length) {
    log.warn('[postgres] generarPolizaVenta: cuentas no configuradas, póliza no generada:', faltantes.join(', '));
    return { ok: false, error: 'Falta configurar en Configuración contable: ' + faltantes.join(', ') + '. La póliza no se generó.' };
  }

  const partidas = [
    { codigo: cuentas.bancos, debe: total, haber: 0, descripcion: 'Cobro ' + (venta.folio || '') + ' — ' + (venta.cliente || '') },
    { codigo: cuentas.ventas, debe: 0, haber: subtotal, descripcion: (venta.concepto || 'Venta') },
  ];
  if (iva > 0) {
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

// OT-0029: guarda en la venta el id de su póliza. Si la columna aún no
// existe (script SQL sin correr) se avisa en el log pero no se rompe nada.
async function ligarPoliza(supabase, ventaId, polizaId, log) {
  if (!polizaId) return;
  const { error } = await supabase.from('ventas').update({ poliza_id: polizaId }).eq('id', ventaId).is('poliza_id', null);
  if (error) log.warn('[postgres] ligarPoliza (¿falta correr database/OT-0029-ventas.sql?):', error.message);
}

async function resolverVenta(accessToken, userId, ventaId, nuevoEstado, motivo, log) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para validar ventas (tu rol no lo permite).' };
  }

  // OT-0029: rechazar exige un motivo (que el vendedor pueda enterarse del porqué).
  let motivoLimpio = null;
  if (nuevoEstado === 'rechazado') {
    motivoLimpio = String(motivo == null ? '' : motivo).trim();
    if (motivoLimpio.length < MOTIVO_MIN) return { ok: false, error: 'Escribe el motivo del rechazo.' };
    if (motivoLimpio.length > MOTIVO_MAX) return { ok: false, error: `El motivo excede ${MOTIVO_MAX} caracteres.` };
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

    const cambios = { estado: nuevoEstado, revisado_por: userId, revisado_en: new Date().toISOString() };
    const actualizar = (extra) => supabase
      .from('ventas')
      .update({ ...cambios, ...extra })
      .eq('id', ventaId)
      .eq('estado', 'revision')
      .select()
      .single();

    let { data, error } = await actualizar(motivoLimpio ? { motivo_rechazo: motivoLimpio } : {});
    // Si la columna motivo_rechazo aún no existe (SQL sin correr), se rechaza igual.
    if (error && motivoLimpio && /motivo_rechazo/i.test(error.message || '')) {
      log.warn('[postgres] resolverVenta: falta la columna motivo_rechazo (correr database/OT-0029-ventas.sql); se rechaza sin guardar el motivo.');
      ({ data, error } = await actualizar({}));
    }
    if (error) throw error;

    // Conexión Ventas↔Contabilidad: si se CONFIRMÓ el pago (no rechazó),
    // se genera la póliza contable automáticamente. Si la póliza falla, la
    // venta SÍ se confirmó (el dinero se recibió) pero se devuelve una
    // advertencia, y desde OT-0029 queda un botón "Generar póliza" para reintentar.
    let polizaWarning = null;
    if (nuevoEstado === 'confirmado') {
      const rPol = await generarPolizaVenta(supabase, venta, log);
      if (!rPol.ok) {
        polizaWarning = rPol.error || 'No se pudo generar la póliza contable.';
        log.warn('[postgres] resolverVenta: venta confirmada pero póliza falló:', polizaWarning);
      } else {
        await ligarPoliza(supabase, ventaId, rPol.poliza?.id, log);
        data = { ...data, poliza_id: rPol.poliza?.id || null, poliza_folio: rPol.poliza?.folio || null };
      }
    }

    return { ok: true, venta: data, polizaWarning };
  } catch (error) {
    log.warn('[postgres] resolverVenta:', error.message);
    return { ok: false, error: error.message };
  }
}

export function confirmarVenta(accessToken, userId, ventaId, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'confirmado', null, log);
}
export function rechazarVenta(accessToken, userId, ventaId, motivo, log = console) {
  return resolverVenta(accessToken, userId, ventaId, 'rechazado', motivo, log);
}

// OT-0029: reintento de póliza para una venta ya CONFIRMADA que quedó sin ella.
// Antes de crear una nueva busca si ya existe una póliza 'ventas' con el
// concepto de esa venta (ventas confirmadas antes de OT-0029 sí tienen
// póliza pero no tenían la liga): en ese caso solo la liga, sin duplicar.
export async function generarPolizaDeVenta(accessToken, ventaId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_VALIDADORES.includes(rol)) {
    return { ok: false, error: 'No tienes permiso para generar pólizas (tu rol no lo permite).' };
  }

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada.' };
    if (venta.estado !== 'confirmado') return { ok: false, error: 'Solo las ventas confirmadas tienen póliza.' };
    if (venta.poliza_id) return { ok: false, error: 'Esta venta ya tiene póliza ligada.' };

    const { data: existentes, error: eEx } = await supabase
      .from('polizas')
      .select('id, folio, estado')
      .eq('origen', 'ventas')
      .ilike('concepto', 'Venta ' + venta.folio + ' — %');
    if (eEx) throw eEx;
    const vigente = (existentes || []).find((p) => p.estado === 'ok') || (existentes || [])[0];
    if (vigente) {
      await ligarPoliza(supabase, ventaId, vigente.id, log);
      return { ok: true, poliza: { id: vigente.id, folio: vigente.folio }, yaExistia: true };
    }

    const rPol = await generarPolizaVenta(supabase, venta, log);
    if (!rPol.ok) return { ok: false, error: rPol.error };
    await ligarPoliza(supabase, ventaId, rPol.poliza?.id, log);
    return { ok: true, poliza: rPol.poliza, yaExistia: false };
  } catch (error) {
    log.warn('[postgres] generarPolizaDeVenta:', error.message);
    return { ok: false, error: error.message };
  }
}

// ---- OT-0072: corregir o cancelar un pago PENDIENTE ----
// La base (database/OT-0072-editar-cancelar-venta.sql) tiene la última palabra: las funciones
// editar_venta_pendiente / cancelar_venta_pendiente (SECURITY DEFINER, fila bloqueada) revisan de
// nuevo quién eres y que siga 'pendiente'. Aquí se valida primero para dar mensajes claros y se
// traduce el error cuando el SQL aún no se aplicó.
function mensajeRpc(error) {
  const m = String((error && error.message) || '');
  if (error && (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(m))) {
    return 'Falta aplicar el SQL OT-0072 (database/OT-0072-editar-cancelar-venta.sql) en la base de datos.';
  }
  return m || 'No se pudo completar la operación.';
}

export async function editarVentaPendiente(accessToken, userId, ventaId, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_REGISTRO.includes(rol)) return { ok: false, error: 'Tu rol no permite editar pagos.' };

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Pago no encontrado.' };
    if (venta.created_by !== userId) return { ok: false, error: 'Solo quien registró el pago puede editarlo.' };
    if (venta.estado !== 'pendiente') {
      return { ok: false, error: `Este pago ya no está pendiente (estado: ${venta.estado}), así que ya no se puede editar.` };
    }
    // El comprobante no se cambia al editar (se conserva el que ya tiene).
    const v = validarDatosVenta({ ...(datos || {}), comprobantePath: null }, venta.empresa_id);
    if (v.error) return { ok: false, error: v.error };
    const d = v.valores;

    const { data, error } = await supabase.rpc('editar_venta_pendiente', {
      p_id: ventaId,
      p_datos: {
        cliente: d.cliente, concepto: d.concepto, importe: d.importe, fechaPago: d.fechaPago,
        metodoPago: d.metodoPago, referencia: d.referencia, banco: d.banco, notas: d.notas, incluyeIva: d.incluyeIva,
      },
    });
    if (error) return { ok: false, error: mensajeRpc(error) };
    return { ok: true, venta: data };
  } catch (error) {
    log.warn('[postgres] editarVentaPendiente:', error.message);
    return { ok: false, error: mensajeRpc(error) };
  }
}

export async function cancelarVentaPendiente(accessToken, userId, ventaId, motivo, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const rol = await obtenerRolUsuario(accessToken, log);
  if (!ROLES_REGISTRO.includes(rol)) return { ok: false, error: 'Tu rol no permite cancelar pagos.' };

  const m = String(motivo == null ? '' : motivo).trim();
  if (m.length < MOTIVO_MIN) return { ok: false, error: 'Escribe el motivo de la cancelación.' };
  if (m.length > MOTIVO_MAX) return { ok: false, error: `El motivo excede ${MOTIVO_MAX} caracteres.` };

  try {
    const venta = await obtenerVenta(supabase, ventaId);
    if (!venta) return { ok: false, error: 'Pago no encontrado.' };
    if (venta.created_by !== userId && !ROLES_AUTOVALIDAN.includes(rol)) {
      return { ok: false, error: 'Solo quien registró el pago, o un Admin/Director, puede cancelarlo.' };
    }
    if (venta.estado !== 'pendiente') {
      return { ok: false, error: `Este pago ya no está pendiente (estado: ${venta.estado}), así que ya no se puede cancelar.` };
    }
    const { data, error } = await supabase.rpc('cancelar_venta_pendiente', { p_id: ventaId, p_motivo: m });
    if (error) return { ok: false, error: mensajeRpc(error) };
    return { ok: true, venta: data };
  } catch (error) {
    log.warn('[postgres] cancelarVentaPendiente:', error.message);
    return { ok: false, error: mensajeRpc(error) };
  }
}
