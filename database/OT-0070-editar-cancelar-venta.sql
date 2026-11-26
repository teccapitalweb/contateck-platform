-- ============================================================
--  CONTATECK · OT-0070 · Editar y cancelar un pago PENDIENTE (Ventas y Pagos)
--
--  *** PREPARADO. Correrlo en el SQL Editor de DEV (idempotente). Sin esto el panel muestra
--      "falta aplicar el SQL OT-0070" al editar o cancelar; todo lo demás sigue igual. ***
--
--  Por qué una función de la base y no un UPDATE desde el backend: la política de UPDATE de `ventas`
--  solo deja actualizar a contador, admin y director; un VENDEDOR (quien más registra pagos) no podría
--  corregir ni cancelar su propio registro. Estas dos funciones (SECURITY DEFINER) son la ÚNICA vía y
--  hacen ellas mismas todas las comprobaciones, con la fila bloqueada (`for update`) para que no se
--  pueda editar a la vez que otra persona lo toma para revisión.
--
--  Reglas:
--   · Editar: solo quien REGISTRÓ el pago y solo mientras esté 'pendiente'. Si ya lo tomaron para
--     revisión, ya no se edita (quien revisa lo rechaza con motivo y se vuelve a registrar).
--     No cambia el folio, el estado, el comprobante ni nada de la revisión.
--   · Cancelar: quien lo registró, o admin/director, solo mientras esté 'pendiente'. Queda con estado
--     'cancelado' y el motivo en `motivo_rechazo` (el mismo campo que usa el rechazo). Nunca se borra.
--   · Ambas dejan una fila en auditoria_log (qué cambió, antes y después; módulo 'contabilidad', como el resto de los pagos).
--  `ventas.estado` no tiene restricción CHECK en DEV, así que 'cancelado' es un valor válido sin tocar la tabla.
--
--  Reversa:  drop function public.editar_venta_pendiente(uuid, jsonb);
--            drop function public.cancelar_venta_pendiente(uuid, text);
-- ============================================================

create or replace function public.editar_venta_pendiente(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_empresa  uuid := auth_empresa_id();
  v_rol      text := auth_rol();
  v          ventas%rowtype;
  v_cliente  text;
  v_concepto text;
  v_importe  numeric;
  v_fecha    date;
  v_metodo   text;
  v_ref      text;
  v_banco    text;
  v_notas    text;
  v_iva      boolean;
  v_nueva    ventas%rowtype;
begin
  if v_uid is null or v_empresa is null then
    raise exception 'Necesitas iniciar sesión con una empresa activa.';
  end if;
  if v_rol is null or v_rol not in ('vendedor', 'contador', 'admin', 'director') then
    raise exception 'Tu rol no permite editar pagos.';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos del pago.';
  end if;

  select * into v from ventas where id = p_id and empresa_id = v_empresa for update;
  if not found then
    raise exception 'Pago no encontrado o no es de tu empresa.';
  end if;
  if v.created_by is distinct from v_uid then
    raise exception 'Solo quien registró el pago puede editarlo.';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'Este pago ya no está pendiente (estado: %), así que ya no se puede editar. Si lo están revisando, pide que lo rechacen y vuelve a registrarlo.', v.estado;
  end if;

  -- Mismas reglas que la captura (backend/src/supabaseVentas.js · validarDatosVenta).
  v_cliente  := nullif(trim(coalesce(p_datos->>'cliente', '')), '');
  v_concepto := nullif(trim(coalesce(p_datos->>'concepto', '')), '');
  v_metodo   := nullif(trim(coalesce(p_datos->>'metodoPago', '')), '');
  v_ref      := nullif(trim(coalesce(p_datos->>'referencia', '')), '');
  v_banco    := nullif(trim(coalesce(p_datos->>'banco', '')), '');
  v_notas    := nullif(trim(coalesce(p_datos->>'notas', '')), '');
  if v_cliente is null then raise exception 'Falta el campo obligatorio: cliente.'; end if;
  if v_concepto is null then raise exception 'Falta el campo obligatorio: concepto.'; end if;
  if length(v_cliente) > 150 then raise exception 'El campo cliente excede 150 caracteres.'; end if;
  if length(v_concepto) > 250 then raise exception 'El campo concepto excede 250 caracteres.'; end if;
  if length(coalesce(v_metodo, '')) > 60 then raise exception 'El campo metodoPago excede 60 caracteres.'; end if;
  if length(coalesce(v_ref, '')) > 100 then raise exception 'El campo referencia excede 100 caracteres.'; end if;
  if length(coalesce(v_banco, '')) > 60 then raise exception 'El campo banco excede 60 caracteres.'; end if;
  if length(coalesce(v_notas, '')) > 1000 then raise exception 'El campo notas excede 1000 caracteres.'; end if;

  begin
    v_importe := round((p_datos->>'importe')::numeric, 2);
  exception when others then
    raise exception 'El importe debe ser un número mayor a cero.';
  end;
  if v_importe is null or v_importe <= 0 then raise exception 'El importe debe ser un número mayor a cero.'; end if;
  if v_importe > 999999999.99 then raise exception 'El importe excede el máximo permitido.'; end if;

  begin
    v_fecha := (p_datos->>'fechaPago')::date;
  exception when others then
    raise exception 'La fecha de pago no es válida (formato AAAA-MM-DD, sin fechas futuras).';
  end;
  if v_fecha is null or v_fecha < date '2000-01-01' or v_fecha > current_date + 1 then
    raise exception 'La fecha de pago no es válida (formato AAAA-MM-DD, sin fechas futuras).';
  end if;

  begin
    v_iva := coalesce((p_datos->>'incluyeIva')::boolean, true);
  exception when others then
    v_iva := true;
  end;

  update ventas
     set cliente = v_cliente, concepto = v_concepto, importe = v_importe, fecha_pago = v_fecha,
         metodo_pago = v_metodo, referencia = v_ref, banco = v_banco, notas = v_notas, incluye_iva = v_iva
   where id = p_id
   returning * into v_nueva;

  begin
    insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
    values (v_empresa, v_uid, 'ventas', p_id, 'update',
      jsonb_build_object('operacion', 'editar_venta_pendiente', 'folio', v.folio,
        'antes', jsonb_build_object('cliente', v.cliente, 'concepto', v.concepto, 'importe', v.importe, 'fecha_pago', v.fecha_pago,
                                    'metodo_pago', v.metodo_pago, 'referencia', v.referencia, 'banco', v.banco, 'notas', v.notas, 'incluye_iva', v.incluye_iva),
        'despues', jsonb_build_object('cliente', v_cliente, 'concepto', v_concepto, 'importe', v_importe, 'fecha_pago', v_fecha,
                                      'metodo_pago', v_metodo, 'referencia', v_ref, 'banco', v_banco, 'notas', v_notas, 'incluye_iva', v_iva)),
      'contabilidad');
  exception when others then
    null; -- el rastro no debe impedir la corrección
  end;

  return to_jsonb(v_nueva);
end;
$$;

create or replace function public.cancelar_venta_pendiente(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid := auth_empresa_id();
  v_rol     text := auth_rol();
  v         ventas%rowtype;
  v_motivo  text := trim(coalesce(p_motivo, ''));
  v_nueva   ventas%rowtype;
begin
  if v_uid is null or v_empresa is null then
    raise exception 'Necesitas iniciar sesión con una empresa activa.';
  end if;
  if v_rol is null or v_rol not in ('vendedor', 'contador', 'admin', 'director') then
    raise exception 'Tu rol no permite cancelar pagos.';
  end if;
  if length(v_motivo) < 3 then raise exception 'Escribe el motivo de la cancelación.'; end if;
  if length(v_motivo) > 500 then raise exception 'El motivo excede 500 caracteres.'; end if;

  select * into v from ventas where id = p_id and empresa_id = v_empresa for update;
  if not found then
    raise exception 'Pago no encontrado o no es de tu empresa.';
  end if;
  if v.created_by is distinct from v_uid and v_rol not in ('admin', 'director') then
    raise exception 'Solo quien registró el pago, o un Admin/Director, puede cancelarlo.';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'Este pago ya no está pendiente (estado: %), así que ya no se puede cancelar. Si lo están revisando, pide que lo rechacen.', v.estado;
  end if;

  update ventas set estado = 'cancelado', motivo_rechazo = v_motivo where id = p_id returning * into v_nueva;

  begin
    insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
    values (v_empresa, v_uid, 'ventas', p_id, 'update',
      jsonb_build_object('operacion', 'cancelar_venta_pendiente', 'folio', v.folio, 'estado_antes', v.estado, 'estado_despues', 'cancelado', 'motivo', v_motivo),
      'contabilidad');
  exception when others then
    null;
  end;

  return to_jsonb(v_nueva);
end;
$$;

revoke execute on function public.editar_venta_pendiente(uuid, jsonb) from public, anon;
revoke execute on function public.cancelar_venta_pendiente(uuid, text) from public, anon;
grant  execute on function public.editar_venta_pendiente(uuid, jsonb) to authenticated;
grant  execute on function public.cancelar_venta_pendiente(uuid, text) to authenticated;

-- Validación (solo lectura):
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('editar_venta_pendiente', 'cancelar_venta_pendiente');          -- 2 filas
