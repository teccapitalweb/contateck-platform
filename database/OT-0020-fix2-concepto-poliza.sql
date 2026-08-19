-- ============================================================
--  CONTATECK · OT-0020 · FIX 2 · Concepto legible en la póliza
--
--  Antes: "Cobro CFDI CT-32 — pago 6d7ab94f-c782-486c-bb55-..."
--  (el UUID interno del pago no le dice nada a nadie en la tabla).
--  Ahora: "Cobro CFDI CT-32 · ESCUELA KEMPER URGATE"
--  La relación pago↔póliza NO se pierde — sigue viva en
--  pagos_cliente.poliza_id, que es el lugar correcto para eso.
--
--  Ejecutar en el SQL Editor de Supabase (reemplaza la función).
-- ============================================================

create or replace function confirmar_pago_cliente(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id      uuid;
  v_usuario_id      uuid;
  v_pago            record;
  v_cuenta_clientes uuid;
  v_folio           text;
  v_poliza_id       uuid;
  v_cfdi_folio      text;
  v_cfdi_cliente    text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para confirmar pagos.';
  end if;

  select * into v_pago from pagos_cliente
    where id = p_pago_id and empresa_id = v_empresa_id for update;
  if v_pago is null then
    raise exception 'Pago no encontrado o no pertenece a tu empresa.';
  end if;
  if v_pago.estado <> 'registrado' then
    raise exception 'Este pago ya fue % — no se puede confirmar de nuevo.', v_pago.estado;
  end if;

  select cuenta_clientes_id into v_cuenta_clientes
    from configuracion_contable where empresa_id = v_empresa_id;
  if v_cuenta_clientes is null then
    raise exception 'La cuenta de Clientes no está configurada. Un contador debe configurarla en Configuración contable antes de poder confirmar pagos.';
  end if;

  select folio, receptor_nombre into v_cfdi_folio, v_cfdi_cliente
    from cfdis where id = v_pago.cfdi_id;

  v_folio := siguiente_folio(v_empresa_id, 'Ingreso');

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, v_folio, 'Ingreso', v_pago.fecha_pago,
    'Cobro CFDI ' || coalesce(v_cfdi_folio, 's/folio') || ' · ' || coalesce(v_cfdi_cliente, 'Cliente'),
    v_pago.monto, 'ok', now())
  returning id into v_poliza_id;

  insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, orden)
  values
    (v_poliza_id, v_pago.cuenta_destino_id, v_pago.monto, 0, 0),
    (v_poliza_id, v_cuenta_clientes,        0, v_pago.monto, 1);

  update pagos_cliente
    set estado = 'confirmado', poliza_id = v_poliza_id,
        confirmado_por = v_usuario_id, confirmado_en = now()
    where id = p_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_cliente', p_pago_id, 'update',
    jsonb_build_object('estado', 'confirmado', 'poliza_id', v_poliza_id, 'folio', v_folio),
    'contabilidad');

  return jsonb_build_object('id', p_pago_id, 'polizaId', v_poliza_id, 'folio', v_folio);
end;
$$;
