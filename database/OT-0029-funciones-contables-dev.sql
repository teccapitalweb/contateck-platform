-- ============================================================
--  CONTATECK · OT-0029 · Funciones contables — versión REAL de DEV
--
--  REFERENCIA / DOCUMENTACIÓN. Exportado de DEV (contateck-dev) el
--  2026-11-05 con pg_get_functiondef. Hasta hoy estas funciones solo
--  vivían en la base (OT-0025/0026 y "mejoras SAT" no dejaron su SQL en
--  el repo) y el repo traía una versión VIEJA de crear_poliza_completa
--  (menos parámetros) que no coincide con la que usa el backend.
--
--  Correrlo en DEV deja las funciones idénticas (create or replace).
--  En otra base, correrlo requiere que existan antes:
--    · auth_rol(), auth_empresa_id()  → database/policies.sql
--    · siguiente_folio(uuid, text)    → database/addendum_folios_contador.sql
--    · periodo_esta_cerrado(uuid, date) y la tabla periodos_contables
--      → NO se exportaron todavía (pendiente: exportarlas igual).
--    · columnas de polizas: origen, cfdi_uuid, ajuste_de_id, tipo_ajuste,
--      motivo_ajuste, updated_at; tabla auditoria_log.
--
--  Nota: `abrir_periodo` NO existe en DEV (la consulta no la devolvió):
--  hoy se puede cerrar un periodo pero no hay función para reabrirlo.
--
--  Nota: si en una base existe todavía la versión vieja de
--  crear_poliza_completa con otra firma, quedará como sobrecarga; la
--  versión vigente es esta de 6 parámetros (la que llama el backend).
-- ============================================================


-- ------------------------------------------------------------
-- crear_poliza_completa (6 parámetros) — la usa Ventas al confirmar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_poliza_completa(p_tipo text, p_fecha date, p_concepto text, p_partidas jsonb, p_origen text DEFAULT NULL::text, p_cfdi_uuid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id  uuid;
  v_poliza_id   uuid;
  v_folio       text;
  v_total_debe  numeric(14,2) := 0;
  v_total_haber numeric(14,2) := 0;
  v_item        jsonb;
  v_cuenta_id   uuid;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;

  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para crear pólizas.';
  end if;

  -- OT-0026: candado de periodo cerrado.
  if periodo_esta_cerrado(v_empresa_id, p_fecha) then
    raise exception 'PERIODO_CERRADO: el periodo % / % está cerrado. No se pueden capturar movimientos con esa fecha.',
      extract(month from p_fecha)::int, extract(year from p_fecha)::int;
  end if;

  -- OT-mejoras-SAT: candado contra duplicados por CFDI. Se revisa ANTES
  -- de insertar nada, con mensaje claro — el índice único de abajo es
  -- solo el respaldo por si hay una condición de carrera real.
  if p_cfdi_uuid is not null and exists (
    select 1 from polizas where empresa_id = v_empresa_id and cfdi_uuid = p_cfdi_uuid
  ) then
    raise exception 'CFDI_DUPLICADO: esta factura (UUID %) ya fue contabilizada antes — revisa Pólizas.', p_cfdi_uuid;
  end if;

  for v_item in select * from jsonb_array_elements(p_partidas) loop
    v_total_debe := v_total_debe + coalesce((v_item->>'debe')::numeric, 0);
    v_total_haber := v_total_haber + coalesce((v_item->>'haber')::numeric, 0);
  end loop;

  if round(v_total_debe, 2) <> round(v_total_haber, 2) then
    raise exception 'La póliza no cuadra: Debe (%) distinto de Haber (%).', v_total_debe, v_total_haber;
  end if;
  if v_total_debe <= 0 then
    raise exception 'El importe debe ser mayor a cero.';
  end if;

  v_folio := siguiente_folio(v_empresa_id, p_tipo);

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, origen, cfdi_uuid, updated_at)
  values (v_empresa_id, v_folio, p_tipo, p_fecha, p_concepto, v_total_debe, 'ok', p_origen, p_cfdi_uuid, now())
  returning id into v_poliza_id;

  for v_item in select * from jsonb_array_elements(p_partidas) loop
    select id into v_cuenta_id from cuentas_contables
      where empresa_id = v_empresa_id and codigo = (v_item->>'codigo');
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe en el catálogo de esta empresa.', (v_item->>'codigo');
    end if;
    insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, descripcion, orden)
    values (
      v_poliza_id, v_cuenta_id,
      coalesce((v_item->>'debe')::numeric, 0),
      coalesce((v_item->>'haber')::numeric, 0),
      v_item->>'descripcion',
      coalesce((v_item->>'orden')::smallint, 0)
    );
  end loop;

  return jsonb_build_object('id', v_poliza_id, 'folio', v_folio);
end;
$function$;


-- ------------------------------------------------------------
-- actualizar_poliza_completa — solo cambios descriptivos (concepto/fecha)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_poliza_completa(p_poliza_id uuid, p_tipo text, p_fecha date, p_concepto text, p_partidas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id     uuid;
  v_poliza_empresa uuid;
  v_estado         text;
  v_concepto_ant   text;
  v_fecha_ant      date;
  v_hash_actual    text;
  v_hash_nuevo     text;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para editar pólizas.';
  end if;

  select empresa_id, estado, concepto, fecha
    into v_poliza_empresa, v_estado, v_concepto_ant, v_fecha_ant
    from polizas where id = p_poliza_id;
  if v_poliza_empresa is null or v_poliza_empresa <> v_empresa_id then
    raise exception 'Póliza no encontrada o no pertenece a tu empresa.';
  end if;

  if v_estado in ('reversa', 'correccion') then
    raise exception 'Una póliza de reversa o corrección no se edita.';
  end if;

  -- OT-0026: si el periodo (de la fecha actual guardada) está cerrado,
  -- ya no se permite ni el cambio descriptivo.
  if periodo_esta_cerrado(v_empresa_id, v_fecha_ant) then
    raise exception 'PERIODO_CERRADO: esta póliza pertenece a un periodo cerrado y ya no se puede modificar.';
  end if;

  select string_agg(codigo || ':' || debe::text || ':' || haber::text, '|' order by codigo, debe, haber)
    into v_hash_actual
  from (
    select cc.codigo, pp.debe, pp.haber
    from poliza_partidas pp
    join cuentas_contables cc on cc.id = pp.cuenta_id
    where pp.poliza_id = p_poliza_id
  ) t;

  select string_agg(codigo || ':' || debe::text || ':' || haber::text, '|' order by codigo, debe, haber)
    into v_hash_nuevo
  from (
    select (v_item->>'codigo') as codigo,
           round(coalesce((v_item->>'debe')::numeric, 0), 2) as debe,
           round(coalesce((v_item->>'haber')::numeric, 0), 2) as haber
    from jsonb_array_elements(p_partidas) as v_item
  ) t;

  if coalesce(v_hash_actual, '') <> coalesce(v_hash_nuevo, '') then
    raise exception 'CAMBIO_CONTABLE: para modificar cuentas o importes se debe generar una corrección (asiento de ajuste), no editar la póliza. La original no se sobreescribe.';
  end if;

  -- Si además cambia la fecha, el NUEVO periodo destino también debe
  -- estar abierto (no se puede "mover" una póliza hacia un mes cerrado).
  if p_fecha <> v_fecha_ant and periodo_esta_cerrado(v_empresa_id, p_fecha) then
    raise exception 'PERIODO_CERRADO: el periodo destino (%/%) está cerrado.', extract(month from p_fecha)::int, extract(year from p_fecha)::int;
  end if;

  update polizas set concepto = p_concepto, fecha = p_fecha, updated_at = now()
  where id = p_poliza_id;

  if coalesce(v_concepto_ant, '') <> coalesce(p_concepto, '') or v_fecha_ant <> p_fecha then
    insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
    values (v_empresa_id, auth.uid(), 'polizas', p_poliza_id, 'edicion_descriptiva',
      jsonb_build_object(
        'concepto_anterior', v_concepto_ant, 'concepto_nuevo', p_concepto,
        'fecha_anterior', v_fecha_ant, 'fecha_nueva', p_fecha
      ),
      'contabilidad');
  end if;
end;
$function$;


-- ------------------------------------------------------------
-- anular_poliza_duplicada — reversa + marca la original como anulada
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_poliza_duplicada(p_poliza_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id     uuid;
  v_poliza_empresa uuid;
  v_poliza_estado  text;
  v_orig_tipo      text;
  v_orig_fecha     date;
  v_orig_concepto  text;
  v_fecha_ajuste   date;
  v_folio_reversa  text;
  v_id_reversa     uuid;
  v_part_orig      record;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para anular pólizas.';
  end if;

  select empresa_id, estado, tipo, fecha, concepto
    into v_poliza_empresa, v_poliza_estado, v_orig_tipo, v_orig_fecha, v_orig_concepto
    from polizas where id = p_poliza_id;
  if v_poliza_empresa is null or v_poliza_empresa <> v_empresa_id then
    raise exception 'Póliza no encontrada o no pertenece a tu empresa.';
  end if;

  if v_poliza_estado = 'reversa' then
    raise exception 'Una póliza de reversa no se anula directamente.';
  end if;
  if v_poliza_estado in ('corregida', 'anulada') then
    raise exception 'Esta póliza ya fue % y queda bloqueada.', v_poliza_estado;
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'El motivo de la anulación es obligatorio.';
  end if;

  -- OT-0026 (mismo criterio ya usado en corregir_poliza_con_ajuste): si
  -- el periodo de la ORIGINAL ya está cerrado, la reversa se registra
  -- HOY — nunca se reabre un mes cerrado.
  if periodo_esta_cerrado(v_empresa_id, v_orig_fecha) then
    v_fecha_ajuste := current_date;
    if periodo_esta_cerrado(v_empresa_id, v_fecha_ajuste) then
      raise exception 'PERIODO_CERRADO: incluso el periodo actual está cerrado. Contacta a tu contadora.';
    end if;
  else
    v_fecha_ajuste := v_orig_fecha;
  end if;

  v_folio_reversa := siguiente_folio(v_empresa_id, v_orig_tipo);
  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado,
                       ajuste_de_id, tipo_ajuste, motivo_ajuste, updated_at)
  values (v_empresa_id, v_folio_reversa, v_orig_tipo, v_fecha_ajuste,
          'Anulación de ' || (select folio from polizas where id = p_poliza_id) || ' · ' || coalesce(v_orig_concepto, ''),
          (select coalesce(sum(debe), 0) from poliza_partidas where poliza_id = p_poliza_id),
          'reversa', p_poliza_id, 'anulacion', p_motivo, now())
  returning id into v_id_reversa;

  for v_part_orig in
    select cuenta_id, debe, haber, descripcion, orden
      from poliza_partidas where poliza_id = p_poliza_id order by orden
  loop
    insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, descripcion, orden)
    values (v_id_reversa, v_part_orig.cuenta_id, v_part_orig.haber, v_part_orig.debe,
            'Anulación: ' || coalesce(v_part_orig.descripcion, ''), v_part_orig.orden);
  end loop;

  update polizas set estado = 'anulada', motivo_ajuste = p_motivo, updated_at = now()
  where id = p_poliza_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, auth.uid(), 'polizas', p_poliza_id, 'anulacion_duplicado',
    jsonb_build_object(
      'motivo', p_motivo,
      'poliza_original', (select folio from polizas where id = p_poliza_id),
      'poliza_reversa', v_folio_reversa,
      'fecha_original_periodo_cerrado', v_fecha_ajuste <> v_orig_fecha
    ),
    'contabilidad');

  return jsonb_build_object('ok', true, 'reversa', jsonb_build_object('id', v_id_reversa, 'folio', v_folio_reversa));
end;
$function$;


-- ------------------------------------------------------------
-- cerrar_periodo — cierra un mes (no existe abrir_periodo en DEV)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_periodo(p_anio integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_descuadre  integer;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para cerrar periodos.';
  end if;
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes inválido.';
  end if;

  -- Sanity check a nivel individual (el cuadre Debe=Haber por póliza ya
  -- es imposible de violar hoy, pero se revalida aquí como capa extra).
  select count(*) into v_descuadre
  from polizas p
  where p.empresa_id = v_empresa_id
    and extract(year from p.fecha)::int = p_anio
    and extract(month from p.fecha)::int = p_mes
    and round(coalesce((select sum(debe) from poliza_partidas where poliza_id = p.id), 0), 2)
     <> round(coalesce((select sum(haber) from poliza_partidas where poliza_id = p.id), 0), 2);

  if v_descuadre > 0 then
    raise exception 'Hay % póliza(s) descuadrada(s) en ese periodo. No se puede cerrar.', v_descuadre;
  end if;

  insert into periodos_contables (empresa_id, anio, mes, estado, cerrado_por, cerrado_en)
  values (v_empresa_id, p_anio, p_mes, 'cerrado', auth.uid(), now())
  on conflict (empresa_id, anio, mes)
    do update set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now();

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, auth.uid(), 'periodos_contables', null, 'cierre_periodo',
    jsonb_build_object('anio', p_anio, 'mes', p_mes), 'contabilidad');

  return jsonb_build_object('ok', true, 'anio', p_anio, 'mes', p_mes, 'estado', 'cerrado');
end;
$function$;


-- ------------------------------------------------------------
-- corregir_poliza_con_ajuste — reversa + póliza de corrección
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corregir_poliza_con_ajuste(p_poliza_id uuid, p_motivo text, p_partidas_correctas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id     uuid;
  v_poliza_empresa uuid;
  v_poliza_estado  text;
  v_orig_tipo      text;
  v_orig_fecha     date;
  v_orig_concepto  text;
  v_fecha_ajuste   date;   -- OT-0026: fecha real que llevarán reversa+corrección
  v_folio_reversa  text;
  v_folio_correcc  text;
  v_id_reversa     uuid;
  v_id_correcc     uuid;
  v_total_debe     numeric(14,2) := 0;
  v_total_haber    numeric(14,2) := 0;
  v_item           jsonb;
  v_cuenta_id      uuid;
  v_debe           numeric(14,2);
  v_haber          numeric(14,2);
  v_part_orig      record;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para corregir pólizas.';
  end if;

  select empresa_id, estado, tipo, fecha, concepto
    into v_poliza_empresa, v_poliza_estado, v_orig_tipo, v_orig_fecha, v_orig_concepto
    from polizas where id = p_poliza_id;
  if v_poliza_empresa is null or v_poliza_empresa <> v_empresa_id then
    raise exception 'Póliza no encontrada o no pertenece a tu empresa.';
  end if;

  if v_poliza_estado = 'reversa' then
    raise exception 'Una póliza de reversa no se corrige — corrige la póliza correspondiente.';
  end if;
  if v_poliza_estado = 'corregida' then
    raise exception 'Esta póliza original ya fue corregida y queda bloqueada. Corrige la póliza de corrección más reciente en su lugar.';
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'El motivo de la corrección es obligatorio.';
  end if;

  if p_partidas_correctas is null or jsonb_array_length(p_partidas_correctas) < 2 then
    raise exception 'La póliza corregida necesita al menos 2 movimientos.';
  end if;

  for v_item in select * from jsonb_array_elements(p_partidas_correctas) loop
    v_debe  := coalesce((v_item->>'debe')::numeric, 0);
    v_haber := coalesce((v_item->>'haber')::numeric, 0);
    if v_debe < 0 or v_haber < 0 then
      raise exception 'Los importes no pueden ser negativos.';
    end if;
    if v_debe > 0 and v_haber > 0 then
      raise exception 'Una misma línea no puede tener Debe y Haber al mismo tiempo (cuenta %).', (v_item->>'codigo');
    end if;
    v_total_debe  := v_total_debe + v_debe;
    v_total_haber := v_total_haber + v_haber;
  end loop;

  if round(v_total_debe, 2) <> round(v_total_haber, 2) then
    raise exception 'La póliza corregida no cuadra: Debe (%) distinto de Haber (%).', v_total_debe, v_total_haber;
  end if;
  if v_total_debe <= 0 then
    raise exception 'El importe de la corrección debe ser mayor a cero.';
  end if;

  for v_item in select * from jsonb_array_elements(p_partidas_correctas) loop
    select id into v_cuenta_id from cuentas_contables
      where empresa_id = v_empresa_id and codigo = (v_item->>'codigo');
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe en el catálogo de esta empresa.', (v_item->>'codigo');
    end if;
  end loop;

  -- OT-0026: si el periodo de la ORIGINAL ya está cerrado, la reversa y
  -- la corrección se registran HOY (periodo actual abierto) — nunca se
  -- reabre el mes cerrado. Si sigue abierto, se usa la fecha original.
  if periodo_esta_cerrado(v_empresa_id, v_orig_fecha) then
    v_fecha_ajuste := current_date;
    if periodo_esta_cerrado(v_empresa_id, v_fecha_ajuste) then
      raise exception 'PERIODO_CERRADO: incluso el periodo actual está cerrado. Contacta a tu contadora.';
    end if;
  else
    v_fecha_ajuste := v_orig_fecha;
  end if;

  v_folio_reversa := siguiente_folio(v_empresa_id, v_orig_tipo);
  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado,
                       ajuste_de_id, tipo_ajuste, updated_at)
  values (v_empresa_id, v_folio_reversa, v_orig_tipo, v_fecha_ajuste,
          'Reversa de ' || (select folio from polizas where id = p_poliza_id) || ' · ' || coalesce(v_orig_concepto, ''),
          (select coalesce(sum(debe), 0) from poliza_partidas where poliza_id = p_poliza_id),
          'reversa', p_poliza_id, 'reversa', now())
  returning id into v_id_reversa;

  for v_part_orig in
    select cuenta_id, debe, haber, descripcion, orden
      from poliza_partidas where poliza_id = p_poliza_id order by orden
  loop
    insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, descripcion, orden)
    values (v_id_reversa, v_part_orig.cuenta_id, v_part_orig.haber, v_part_orig.debe,
            'Reversa: ' || coalesce(v_part_orig.descripcion, ''), v_part_orig.orden);
  end loop;

  v_folio_correcc := siguiente_folio(v_empresa_id, v_orig_tipo);
  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado,
                       ajuste_de_id, tipo_ajuste, motivo_ajuste, updated_at)
  values (v_empresa_id, v_folio_correcc, v_orig_tipo, v_fecha_ajuste,
          'Corrección de ' || (select folio from polizas where id = p_poliza_id) || ' · ' || coalesce(v_orig_concepto, ''),
          v_total_debe, 'correccion', p_poliza_id, 'correccion', p_motivo, now())
  returning id into v_id_correcc;

  for v_item in select * from jsonb_array_elements(p_partidas_correctas) loop
    select id into v_cuenta_id from cuentas_contables
      where empresa_id = v_empresa_id and codigo = (v_item->>'codigo');
    insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, descripcion, orden)
    values (v_id_correcc, v_cuenta_id,
            coalesce((v_item->>'debe')::numeric, 0),
            coalesce((v_item->>'haber')::numeric, 0),
            v_item->>'descripcion',
            coalesce((v_item->>'orden')::smallint, 0));
  end loop;

  update polizas set estado = 'corregida', updated_at = now()
  where id = p_poliza_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, auth.uid(), 'polizas', p_poliza_id, 'correccion_contable',
    jsonb_build_object(
      'motivo', p_motivo,
      'poliza_original', (select folio from polizas where id = p_poliza_id),
      'poliza_reversa', v_folio_reversa,
      'poliza_corregida', v_folio_correcc,
      'fecha_original_periodo_cerrado', v_fecha_ajuste <> v_orig_fecha,
      'partidas_correctas', p_partidas_correctas
    ),
    'contabilidad');

  return jsonb_build_object(
    'ok', true,
    'reversa', jsonb_build_object('id', v_id_reversa, 'folio', v_folio_reversa),
    'correccion', jsonb_build_object('id', v_id_correcc, 'folio', v_folio_correcc),
    'fechaAjustada', v_fecha_ajuste <> v_orig_fecha
  );
end;
$function$;
