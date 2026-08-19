// ============================================================
//  CONTATECK · Backend · Cobranza de facturas (pagos_cliente)
//  OT-0020 · Llama a las funciones RPC de Postgres que validan
//  saldo, generan la póliza real (Debe/Haber) usando la cuenta de
//  Clientes CONFIGURADA por la empresa (nunca adivinada), y dejan
//  rastro completo en auditoria_log. Mismo patrón de siempre:
//  cliente autenticado como el propio usuario (RLS real).
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

// Facturas con saldo pendiente > 0 — para el selector de "Me pagó un
// cliente". La vista ya trae folio/cliente/fecha/método de pago planos
// (FIX 1: la anidación cfdis(...) fallaba porque las vistas no tienen
// foreign keys que PostgREST pueda resolver).
export async function listarCfdisSaldo(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('cfdis_saldo')
    .select('cfdi_id, folio, receptor_nombre, fecha, metodo_pago, estatus, total, pagado, saldo_pendiente')
    .gt('saldo_pendiente', 0)
    .order('fecha', { ascending: false })
    .limit(200);
  if (error) {
    log.warn('[postgres] listarCfdisSaldo:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, facturas: data || [] };
}

export async function registrarPagoCliente(accessToken, datos, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('registrar_pago_cliente', {
    p_cfdi_id: datos.cfdiId,
    p_monto: datos.monto,
    p_fecha_pago: datos.fechaPago,
    p_forma_pago: datos.formaPago || null,
    p_cuenta_destino_id: datos.cuentaDestinoId,
    p_referencia: datos.referencia || null,
    p_notas: datos.notas || null,
    p_comprobante_url: datos.comprobanteUrl || null,
  });
  if (error) {
    log.warn('[postgres] registrar_pago_cliente:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, pagoId: data };
}

export async function confirmarPagoCliente(accessToken, pagoId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase.rpc('confirmar_pago_cliente', { p_pago_id: pagoId });
  if (error) {
    log.warn('[postgres] confirmar_pago_cliente:', error.message);
    return { ok: false, error: error.message };
  }
  // data = {"id": "...", "polizaId": "...", "folio": "I-00034"}
  return { ok: true, ...data };
}

// OT-0021: historial de pagos de una factura — con nombre de quién
// registró y quién confirmó (perfiles) y el folio de la póliza ligada.
export async function listarPagosCfdi(accessToken, cfdiId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data, error } = await supabase
    .from('pagos_cliente')
    .select(`id, folio_pago, monto, fecha_pago, forma_pago, referencia, notas, comprobante_url,
      estado, creado_en, confirmado_en, complemento_pago_estado,
      cuenta_destino:cuentas_contables(codigo, nombre),
      creador:perfiles!pagos_cliente_creado_por_fkey(nombre, email),
      confirmador:perfiles!pagos_cliente_confirmado_por_fkey(nombre, email),
      polizas(folio)`)
    .eq('cfdi_id', cfdiId)
    .order('creado_en', { ascending: false });
  if (error) {
    log.warn('[postgres] listarPagosCfdi:', error.message);
    return { ok: false, error: error.message };
  }
  const pagos = (data || []).map((r) => ({
    id: r.id, folioPago: r.folio_pago || null, monto: r.monto, fechaPago: r.fecha_pago, formaPago: r.forma_pago,
    referencia: r.referencia, notas: r.notas, comprobantePath: r.comprobante_url,
    estado: r.estado, creadoEn: r.creado_en, confirmadoEn: r.confirmado_en,
    cuentaDestino: r.cuenta_destino ? (r.cuenta_destino.codigo + " · " + r.cuenta_destino.nombre) : null,
    complementoPago: r.complemento_pago_estado,
    registradoPor: r.creador ? (r.creador.nombre || r.creador.email) : null,
    confirmadoPor: r.confirmador ? (r.confirmador.nombre || r.confirmador.email) : null,
    polizaFolio: r.polizas ? r.polizas.folio : null,
  }));
  return { ok: true, pagos };
}

// OT-0022: datos completos de UN pago para el comprobante interno en PDF.
// Todo real desde Postgres — pago, CFDI, cuenta destino, quién registró/
// confirmó, póliza y saldo posterior (calculado con la vista cfdis_saldo).
export async function obtenerPagoParaComprobante(accessToken, pagoId, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };
  const { data: r, error } = await supabase
    .from('pagos_cliente')
    .select(`id, folio_pago, cfdi_id, monto, fecha_pago, forma_pago, referencia, notas, comprobante_url,
      estado, creado_en, confirmado_en, complemento_pago_estado,
      cuenta_destino:cuentas_contables(codigo, nombre),
      creador:perfiles!pagos_cliente_creado_por_fkey(nombre, email),
      confirmador:perfiles!pagos_cliente_confirmado_por_fkey(nombre, email),
      polizas(folio)`)
    .eq('id', pagoId)
    .maybeSingle();
  if (error) { log.warn('[postgres] obtenerPagoParaComprobante:', error.message); return { ok: false, error: error.message }; }
  if (!r) return { ok: false, error: 'Pago no encontrado o no pertenece a tu empresa.' };

  const [{ data: cfdi }, { data: saldoRow }, { data: empresa }] = await Promise.all([
    supabase.from('cfdis').select('folio, uuid_sat, receptor_nombre, receptor_rfc, total, metodo_pago').eq('id', r.cfdi_id).maybeSingle(),
    supabase.from('cfdis_saldo').select('saldo_pendiente').eq('cfdi_id', r.cfdi_id).maybeSingle(),
    supabase.from('empresas').select('nombre').limit(1).maybeSingle(),
  ]);

  const pago = {
    id: r.id, folio_pago: r.folio_pago, monto: r.monto, fecha_pago: r.fecha_pago, forma_pago: r.forma_pago,
    referencia: r.referencia, notas: r.notas, comprobante_url: r.comprobante_url,
    estado: r.estado, creado_en: r.creado_en, confirmado_en: r.confirmado_en,
    complemento_pago_estado: r.complemento_pago_estado,
    cuenta_destino_txt: r.cuenta_destino ? (r.cuenta_destino.codigo + ' · ' + r.cuenta_destino.nombre) : null,
    registrado_por_txt: r.creador ? (r.creador.nombre || r.creador.email) : null,
    confirmado_por_txt: r.confirmador ? (r.confirmador.nombre || r.confirmador.email) : null,
    poliza_folio: r.polizas ? r.polizas.folio : null,
  };
  return {
    ok: true, pago, cfdi: cfdi || {},
    empresaNombre: empresa ? empresa.nombre : null,
    // El saldo de la vista ya descuenta este pago si está confirmado.
    saldoPosterior: (r.estado === 'confirmado' && saldoRow) ? saldoRow.saldo_pendiente : null,
  };
}
