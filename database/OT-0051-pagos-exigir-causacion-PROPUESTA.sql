-- ============================================================
--  CONTATECK · OT-0051 · Pagos sobre facturas sin póliza de causación — PROPUESTA
--
--  *** PROPUESTA. NO SE HA EJECUTADO. NO LA CORRAS SIN REVISARLA CON QUIEN LLEVE LA CONTABILIDAD. ***
--
--  Problema (hallazgo 1 del reporte de prueba completa): confirmar un cobro o un pago a proveedor genera la póliza
--  Bancos / Clientes (o Proveedores / Bancos) sin comprobar que la factura ya se contabilizó. Si la factura nunca tuvo su
--  póliza de causación, Clientes o Proveedores quedan con saldo de naturaleza inversa y el Balance se distorsiona.
--  Medido en DEV (25-nov-2026): Empresa Demo C 2 cobros y 5 pagos a proveedor sin causación; SA de CV 2 cobros.
--
--  Qué propone:
--   1. Una opción por empresa, apagada por defecto: configuracion_contable.exigir_causacion_pagos (boolean, default false).
--      Apagada = todo funciona exactamente igual que hoy (nadie se queda sin poder cobrar).
--   2. Con la opción ENCENDIDA, confirmar_pago_cliente y confirmar_pago_proveedor rechazan el pago si la factura no tiene
--      una póliza de causación activa:
--        · Cobro: póliza con estado 'ok', 'corregida' o 'correccion' cuyo cfdi_uuid sea el uuid_sat de la factura emitida
--          (sin distinguir mayúsculas). Si la factura no tiene uuid_sat no se bloquea.
--        · Pago a proveedor: cfdis_proveedor.poliza_causacion_id apunta a una póliza con uno de esos estados.
--      Una póliza 'anulada' NO cuenta: el CFDI queda "sin contabilizar" y crear_poliza_completa no deja volver a
--      registrarlo (CFDI_DUPLICADO ignora el estado), así que ese caso queda bloqueado sin salida: decidirlo con la contadora.
--      Dos revisiones hechas por la sesión de Ventas y Pagos (25-nov-2026): las copias de las funciones parten de la versión
--      ATÓMICA (bloqueo for no key update), que es la que ya está en DEV; y las pólizas que genera Ventas no llevan cfdi_uuid,
--      por eso el mensaje de error del cobro avisa de no duplicar un ingreso ya registrado por ese camino.
--
--  POR QUÉ OPCIONAL: bloquear o no es una decisión contable (base devengado o base flujo de efectivo; empresas que
--  contabilizan al cobrar). Mientras no la tome la contadora de cada empresa, el sistema solo avisa (alerta del Dashboard).
--
--  Las dos funciones son copias de las que hoy existen en DEV (leídas el 25-nov-2026 con pg_get_functiondef) con SOLO
--  estos cambios: variable v_exigir y el bloque marcado "OT-0051". Antes de aplicar, vuelve a leer las funciones reales
--  por si cambiaron (son del módulo de Ventas y Pagos).
--  Para encender la opción en una empresa (después de aplicar):
--    update configuracion_contable set exigir_causacion_pagos = true where empresa_id = '<id de la empresa>';
--  Para deshacer, EN ESTE ORDEN: 1) poner la opción en false; 2) volver a crear las dos funciones sin el bloque OT-0051;
--  3) solo entonces, si se quiere: alter table configuracion_contable drop column exigir_causacion_pagos;
--  (si se borra la columna ANTES de recrear las funciones, TODA confirmación de pagos falla: la columna ya no existe).
--  Al probar con la opción encendida, usa facturas que sí tengan causación: test-confirmacion-concurrente.js elige una
--  factura cualquiera con saldo y, sin causación, las dos confirmaciones fallarían por este motivo y no probarían la carrera.
-- ============================================================

alter table public.configuracion_contable
  add column if not exists exigir_causacion_pagos boolean not null default false;

comment on column public.configuracion_contable.exigir_causacion_pagos is
  'OT-0051: si es true, no se puede confirmar un cobro o pago a proveedor sobre una factura sin póliza de causación activa. Por defecto false.';


CREATE OR REPLACE FUNCTION public.confirmar_pago_cliente(p_pago_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_exigir          boolean;            -- OT-0051
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

  -- OT-0051: si la empresa lo exige, la factura debe tener su póliza de causación activa.
  select coalesce(exigir_causacion_pagos, false) into v_exigir
    from configuracion_contable where empresa_id = v_empresa_id;
  -- (revisión de Ventas y Pagos, 25-nov-2026): se compara sin distinguir mayúsculas; cuentan las pólizas 'ok', 'corregida'
  -- y 'correccion' (corregir una póliza deja la original como 'corregida' y la reversa y la nueva no copian el UUID);
  -- una factura sin uuid_sat no se bloquea porque no hay con qué comprobarla.
  if coalesce(v_exigir, false) and not exists (
       select 1
         from cfdis c
        where c.id = v_pago.cfdi_id and c.empresa_id = v_empresa_id
          and (c.uuid_sat is null
               or exists (select 1 from polizas pz
                           where pz.empresa_id = c.empresa_id
                             and lower(pz.cfdi_uuid) = lower(c.uuid_sat)
                             and pz.estado in ('ok', 'corregida', 'correccion')))
     ) then
    raise exception 'La factura todavía no está contabilizada (no tiene póliza de causación). Contabilízala antes de confirmar el cobro; si el ingreso ya se registró desde Ventas, no lo registres otra vez: avisa a tu contador para no duplicarlo.';
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
$function$;


CREATE OR REPLACE FUNCTION public.confirmar_pago_proveedor(p_pago_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_exigir             boolean;         -- OT-0051
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

  -- OT-0051: si la empresa lo exige, la factura de proveedor debe tener su póliza de causación activa.
  select coalesce(exigir_causacion_pagos, false) into v_exigir
    from configuracion_contable where empresa_id = v_empresa_id;
  if coalesce(v_exigir, false) and not exists (
       select 1
         from cfdis_proveedor cp
         join polizas pz on pz.id = cp.poliza_causacion_id and pz.estado in ('ok', 'corregida', 'correccion')
        where cp.id = v_pago.cfdi_proveedor_id and cp.empresa_id = v_empresa_id
     ) then
    raise exception 'La factura del proveedor todavía no está contabilizada (no tiene póliza de causación). Contabilízala primero y luego confirma el pago.';
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
$function$;
