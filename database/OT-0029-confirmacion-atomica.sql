-- ============================================================
--  CONTATECK · OT-0029 · Confirmación de pagos ATÓMICA
--  (cobranza de facturas y pagos a proveedor)
--
--  Ejecutar en el SQL Editor de Supabase — DEV primero, y solo después
--  de revisar el resultado de OT-0029-confirmacion-atomica-introspeccion.sql
--  (este archivo REEMPLAZA las dos funciones completas).
--  Es idempotente: se puede correr más de una vez.
--
--  El problema (hoy)
--  -----------------
--  Confirmar un pago bloquea la fila de ESE pago (for update), pero el
--  saldo de la factura se compara en el backend (supabasePagosCliente.js /
--  supabasePagosProveedor.js, OT-0034) con una consulta aparte, ANTES de
--  llamar a la función de la base. Entre esa consulta y el commit pasa
--  tiempo: si dos personas confirman a la vez DOS pagos distintos de la
--  misma factura (cada uno cabía en el saldo), ambas lecturas ven el saldo
--  completo, las dos pasan, y la factura queda pagada de más — con sus
--  dos pólizas. Bloquear la fila de cada pago no lo evita: son filas
--  distintas.
--
--  El arreglo
--  ----------
--  Dentro de la propia función, después de bloquear el pago:
--    1. se bloquea la fila de la FACTURA (cfdis / cfdis_proveedor) con
--       `for no key update`. Todas las confirmaciones de pagos de la misma
--       factura se forman en fila; las de otras facturas no se estorban.
--    2. con el bloqueo ya en mano, se lee el saldo ACTUAL (la segunda
--       persona lo lee después del commit de la primera: en READ COMMITTED
--       cada sentencia toma su propia foto) y si el pago no cabe, se
--       aborta TODO: sin póliza, sin cambio de estado.
--  Se usa `no key update` y no `update` a propósito: `for update` choca
--  con el bloqueo de llave foránea que toma cualquier INSERT en
--  pagos_cliente / pagos_proveedor, y frenaría el registro de pagos
--  mientras alguien confirma. `no key update` solo choca con otra
--  confirmación de la misma factura.
--  Orden de bloqueos fijo (pago → factura): no hay interbloqueos.
--
--  Lo demás de las funciones es igual a OT-0020 fix2 y OT-0023.
--  Mensaje de error idéntico al que ya da el backend, así la pantalla no
--  cambia. El chequeo del backend se queda como aviso rápido y amistoso;
--  la autoridad es esta función.
--
--  Fuera de alcance (a propósito):
--    · registrar_pago_* sigue validando el saldo solo contra pagos ya
--      confirmados (la regla de OT-0034 es validar al CONFIRMAR). Dos
--      registros simultáneos pueden dejar dos pagos "registrados" que no
--      caben juntos; el primero en confirmarse gana y el otro recibe el
--      aviso. Si la contadora prefiere que "registrado" también reserve
--      saldo, es otro cambio.
--    · no se valida aquí que la factura esté cancelada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cobranza: confirmar_pago_cliente
-- ------------------------------------------------------------
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
  v_cfdi_id         uuid;
  v_saldo           numeric(14,2);
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

  -- 1) Bloquea el pago (impide confirmar el MISMO pago dos veces).
  select * into v_pago from pagos_cliente
    where id = p_pago_id and empresa_id = v_empresa_id for update;
  if v_pago is null then
    raise exception 'Pago no encontrado o no pertenece a tu empresa.';
  end if;
  if v_pago.estado <> 'registrado' then
    raise exception 'Este pago ya fue % — no se puede confirmar de nuevo.', v_pago.estado;
  end if;

  -- 2) Bloquea la FACTURA (impide que dos pagos distintos de la misma
  --    factura se confirmen a la vez). Si otra confirmación la tiene, esta
  --    espera aquí hasta que aquella termine.
  select id into v_cfdi_id from cfdis
    where id = v_pago.cfdi_id and empresa_id = v_empresa_id
    for no key update;
  if v_cfdi_id is null then
    raise exception 'Factura no encontrada o no pertenece a tu empresa.';
  end if;

  -- 3) Saldo ACTUAL, ya con el bloqueo (incluye lo que otra persona
  --    acaba de confirmar). Este pago sigue 'registrado', no cuenta aún.
  select saldo_pendiente into v_saldo from cfdis_saldo
    where cfdi_id = v_pago.cfdi_id and empresa_id = v_empresa_id;
  if v_saldo is null then
    raise exception 'Factura no encontrada o no pertenece a tu empresa.';
  end if;
  if v_pago.monto > v_saldo then
    raise exception 'Confirmar este pago ($%) dejaría la factura pagada de más: su saldo actual es $%. Revisa los demás pagos de esa factura antes de confirmar.',
      to_char(v_pago.monto, 'FM999999990.00'), to_char(v_saldo, 'FM999999990.00');
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

-- ------------------------------------------------------------
-- 2. Cuentas por pagar: confirmar_pago_proveedor (espejo)
-- ------------------------------------------------------------
create or replace function confirmar_pago_proveedor(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id         uuid;
  v_usuario_id         uuid;
  v_pago               record;
  v_cfdi_prov_id       uuid;
  v_saldo              numeric(14,2);
  v_cuenta_proveedores uuid;
  v_folio              text;
  v_poliza_id          uuid;
  v_prov_folio         text;
  v_prov_nombre        text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para confirmar pagos a proveedores.';
  end if;

  select * into v_pago from pagos_proveedor
    where id = p_pago_id and empresa_id = v_empresa_id for update;
  if v_pago is null then
    raise exception 'Pago no encontrado o no pertenece a tu empresa.';
  end if;
  if v_pago.estado <> 'registrado' then
    raise exception 'Este pago ya fue % — no se puede confirmar de nuevo.', v_pago.estado;
  end if;

  select id into v_cfdi_prov_id from cfdis_proveedor
    where id = v_pago.cfdi_proveedor_id and empresa_id = v_empresa_id
    for no key update;
  if v_cfdi_prov_id is null then
    raise exception 'Factura de proveedor no encontrada o no pertenece a tu empresa.';
  end if;

  select saldo_pendiente into v_saldo from cfdis_proveedor_saldo
    where cfdi_proveedor_id = v_pago.cfdi_proveedor_id and empresa_id = v_empresa_id;
  if v_saldo is null then
    raise exception 'Factura de proveedor no encontrada o no pertenece a tu empresa.';
  end if;
  if v_pago.monto > v_saldo then
    raise exception 'Confirmar este pago ($%) dejaría la factura pagada de más: su saldo actual es $%. Revisa los demás pagos de esa factura antes de confirmar.',
      to_char(v_pago.monto, 'FM999999990.00'), to_char(v_saldo, 'FM999999990.00');
  end if;

  select cuenta_proveedores_id into v_cuenta_proveedores
    from configuracion_contable where empresa_id = v_empresa_id;
  if v_cuenta_proveedores is null then
    raise exception 'La cuenta de Proveedores no está configurada. Un contador debe configurarla en Configuración contable antes de poder confirmar pagos.';
  end if;

  select folio, emisor_nombre into v_prov_folio, v_prov_nombre
    from cfdis_proveedor where id = v_pago.cfdi_proveedor_id;

  v_folio := siguiente_folio(v_empresa_id, 'Egreso');

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, v_folio, 'Egreso', v_pago.fecha_pago,
    'Pago a proveedor ' || coalesce(v_prov_folio, 's/folio') || ' · ' || coalesce(v_prov_nombre, 'Proveedor'),
    v_pago.monto, 'ok', now())
  returning id into v_poliza_id;

  insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, orden)
  values
    (v_poliza_id, v_cuenta_proveedores,    v_pago.monto, 0, 0),
    (v_poliza_id, v_pago.cuenta_origen_id, 0, v_pago.monto, 1);

  update pagos_proveedor
    set estado = 'confirmado', poliza_id = v_poliza_id,
        confirmado_por = v_usuario_id, confirmado_en = now()
    where id = p_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_proveedor', p_pago_id, 'update',
    jsonb_build_object('estado', 'confirmado', 'poliza_id', v_poliza_id, 'folio', v_folio),
    'contabilidad');

  return jsonb_build_object('id', p_pago_id, 'polizaId', v_poliza_id, 'folio', v_folio);
end;
$$;

-- ============================================================
--  Validación después de correr esto:
--
--  1) Que las funciones traigan el bloqueo y el chequeo de saldo
--     (debe salir true en las 4 columnas):
--       select p.proname,
--              pg_get_functiondef(p.oid) ilike '%for no key update%' as bloquea_factura,
--              pg_get_functiondef(p.oid) ilike '%pagada de más%'      as valida_saldo
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public'
--          and p.proname in ('confirmar_pago_cliente', 'confirmar_pago_proveedor');
--
--  2) Prueba de carrera (la hace una persona, con su login, en DEV):
--     backend/test-confirmacion-concurrente.js — registra dos pagos que no
--     caben juntos en una factura de prueba y los confirma al mismo tiempo.
--     Esperado: UNO se confirma, el otro recibe "dejaría la factura pagada
--     de más", y en la base hay una sola póliza nueva.
--
--  3) Después de la prueba, el saldo no debe ser negativo:
--       select cfdi_id, total, pagado, saldo_pendiente from cfdis_saldo
--        where saldo_pendiente < 0;                       -- 0 filas
--       select cfdi_proveedor_id, total, pagado, saldo_pendiente
--         from cfdis_proveedor_saldo where saldo_pendiente < 0;   -- 0 filas
-- ============================================================
