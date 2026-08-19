// ============================================================
//  CONTATECK · Backend · Pagos a proveedor (pagos_proveedor)
//  OT-0023 · Espejo exacto de supabasePagosCliente.js, con la
//  dirección del dinero invertida.
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

export async function registrarPagoProveedor(accessToken, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('registrar_pago_proveedor', {
    p_cfdi_proveedor_id: datos.cfdiProveedorId,
    p_monto: datos.monto,
    p_fecha_pago: datos.fechaPago,
    p_forma_pago: datos.formaPago || null,
    p_cuenta_origen_id: datos.cuentaOrigenId,
    p_referencia: datos.referencia || null,
    p_notas: datos.notas || null,
    p_comprobante_url: datos.comprobanteUrl || null,
  });
  if (error) {
    log.warn('[postgres] registrar_pago_proveedor:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, pagoId: data };
}

export async function confirmarPagoProveedor(accessToken, pagoId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('confirmar_pago_proveedor', { p_pago_id: pagoId });
  if (error) {
    log.warn('[postgres] confirmar_pago_proveedor:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, ...data };
}

// Historial de pagos de una factura de proveedor (mismo patrón que
// listarPagosCfdi para clientes).
export async function listarPagosProveedor(accessToken, cfdiProveedorId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('pagos_proveedor')
    .select(`id, folio_pago, monto, fecha_pago, forma_pago, referencia, notas, comprobante_url,
      estado, creado_en, confirmado_en,
      cuenta_origen:cuentas_contables(codigo, nombre),
      creador:perfiles!pagos_proveedor_creado_por_fkey(nombre, email),
      confirmador:perfiles!pagos_proveedor_confirmado_por_fkey(nombre, email),
      polizas(folio)`)
    .eq('cfdi_proveedor_id', cfdiProveedorId)
    .order('creado_en', { ascending: false });
  if (error) {
    log.warn('[postgres] listarPagosProveedor:', error.message);
    return { ok: false, error: error.message };
  }
  const pagos = (data || []).map((r) => ({
    id: r.id, folioPago: r.folio_pago, monto: r.monto, fechaPago: r.fecha_pago, formaPago: r.forma_pago,
    referencia: r.referencia, notas: r.notas, comprobantePath: r.comprobante_url,
    estado: r.estado, creadoEn: r.creado_en, confirmadoEn: r.confirmado_en,
    cuentaOrigen: r.cuenta_origen ? (r.cuenta_origen.codigo + ' · ' + r.cuenta_origen.nombre) : null,
    registradoPor: r.creador ? (r.creador.nombre || r.creador.email) : null,
    confirmadoPor: r.confirmador ? (r.confirmador.nombre || r.confirmador.email) : null,
    polizaFolio: r.polizas ? r.polizas.folio : null,
  }));
  return { ok: true, pagos };
}

// OT-0024: datos completos de UN pago a proveedor para el comprobante
// interno en PDF — espejo de obtenerPagoParaComprobante (cliente).
export async function obtenerPagoParaComprobante(accessToken, pagoId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data: r, error } = await supabase
    .from('pagos_proveedor')
    .select(`id, folio_pago, cfdi_proveedor_id, monto, fecha_pago, forma_pago, referencia, notas, comprobante_url,
      estado, creado_en, confirmado_en,
      cuenta_origen:cuentas_contables(codigo, nombre),
      creador:perfiles!pagos_proveedor_creado_por_fkey(nombre, email),
      confirmador:perfiles!pagos_proveedor_confirmado_por_fkey(nombre, email),
      polizas(folio)`)
    .eq('id', pagoId)
    .maybeSingle();
  if (error) { log.warn('[postgres] obtenerPagoParaComprobante (proveedor):', error.message); return { ok: false, error: error.message }; }
  if (!r) return { ok: false, error: 'Pago no encontrado o no pertenece a tu empresa.' };

  const [{ data: cfdiProveedor }, { data: saldoRow }, { data: empresa }] = await Promise.all([
    supabase.from('cfdis_proveedor').select('folio, uuid_sat, emisor_nombre, emisor_rfc, total, metodo_pago').eq('id', r.cfdi_proveedor_id).maybeSingle(),
    supabase.from('cfdis_proveedor_saldo').select('saldo_pendiente').eq('cfdi_proveedor_id', r.cfdi_proveedor_id).maybeSingle(),
    supabase.from('empresas').select('nombre').limit(1).maybeSingle(),
  ]);

  const pago = {
    id: r.id, folio_pago: r.folio_pago, monto: r.monto, fecha_pago: r.fecha_pago, forma_pago: r.forma_pago,
    referencia: r.referencia, notas: r.notas, comprobante_url: r.comprobante_url,
    estado: r.estado, creado_en: r.creado_en, confirmado_en: r.confirmado_en,
    cuenta_origen_txt: r.cuenta_origen ? (r.cuenta_origen.codigo + ' · ' + r.cuenta_origen.nombre) : null,
    registrado_por_txt: r.creador ? (r.creador.nombre || r.creador.email) : null,
    confirmado_por_txt: r.confirmador ? (r.confirmador.nombre || r.confirmador.email) : null,
    poliza_folio: r.polizas ? r.polizas.folio : null,
  };
  return {
    ok: true, pago, cfdiProveedor: cfdiProveedor || {},
    empresaNombre: empresa ? empresa.nombre : null,
    saldoPosterior: (r.estado === 'confirmado' && saldoRow) ? saldoRow.saldo_pendiente : null,
  };
}
