-- ============================================================
--  CONTATECK · OT-0064 · Timbrado de CFDI de nómina (ambiente de pruebas del PAC)
--
--  *** PREPARADO, NO APLICADO. Correrlo a mano en el SQL Editor de contateck-dev (primero DEV). ***
--  (El MCP `supabase-dev` es de solo lectura; este archivo no se ha ejecutado en ninguna base.)
--
--  Qué agrega (todo es aditivo: nada se borra y las filas actuales siguen funcionando):
--   1. `empleados`: datos fiscales que exige el CFDI de nómina (código postal fiscal, tipo de contrato,
--      jornada, riesgo de puesto y entidad federativa). RFC, CURP, NSS y cuenta bancaria ya existen.
--   2. `nomina_detalle`: el DESGLOSE de la nómina (ISR bruto, ISR retenido, subsidio, IMSS, otras deducciones,
--      salario diario integrado) y el registro del timbre (UUID del SAT, id del PAC y fecha).
--   3. `crear_nomina`: ahora también guarda ese desglose. Es el cuerpo de OT-0047 (periodo cerrado y empleado
--      de la empresa) + las columnas nuevas. Si OT-0047 no se ha aplicado, esta versión ya lo incluye.
--   4. `registrar_timbre_nomina`: función SECURITY DEFINER para anotar el UUID de un renglón ya timbrado (la
--      tabla no tiene política de UPDATE; el historial de nómina sigue siendo inmutable salvo este campo).
--
--  Qué NO cambia: la firma de `crear_nomina`, SECURITY DEFINER, search_path, validación de rol y el cálculo
--  de totales en el servidor. Los renglones de nóminas anteriores quedan con el desglose en NULL: la app
--  avisa que hay que volver a calcular esa nómina para poder timbrarla.
--
--  Verificación posterior (solo lectura):
--    select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'nomina_detalle'
--       and column_name in ('isr_bruto','isr_retenido','subsidio','imss','otras_deducciones','sdi','cfdi_uuid');   -- 7 filas
--    select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'registrar_timbre_nomina'; -- 1 fila
--
--  Reversa: las columnas son opcionales; para volver atrás basta con correr de nuevo el cuerpo de `crear_nomina`
--  de OT-0047 y, si se quiere, `drop function registrar_timbre_nomina(uuid, text, text)` y quitar las columnas.
-- ============================================================

-- ---- 1. Datos fiscales del empleado ----
alter table public.empleados add column if not exists cp_fiscal       text;   -- código postal del domicilio fiscal (5 dígitos)
alter table public.empleados add column if not exists tipo_contrato   text;   -- c_TipoContrato del SAT: 01, 02, 03…
alter table public.empleados add column if not exists tipo_jornada    text;   -- c_TipoJornada: 01 diurna, 02 nocturna, 03 mixta…
alter table public.empleados add column if not exists riesgo_puesto   text;   -- c_RiesgoPuesto: 1 a 5
alter table public.empleados add column if not exists clave_entidad   text;   -- c_Estado: JAL, CMX, NLE…

-- ---- 2. Desglose y timbre en el detalle de nómina ----
alter table public.nomina_detalle add column if not exists sdi               numeric;  -- salario diario integrado usado en el cálculo
alter table public.nomina_detalle add column if not exists isr_bruto         numeric;  -- ISR de la tarifa, antes del subsidio
alter table public.nomina_detalle add column if not exists isr_retenido      numeric;  -- ISR realmente retenido (bruto − subsidio, mínimo 0)
alter table public.nomina_detalle add column if not exists subsidio          numeric;  -- subsidio para el empleo causado
alter table public.nomina_detalle add column if not exists imss              numeric;  -- IMSS obrero
alter table public.nomina_detalle add column if not exists otras_deducciones numeric;  -- otras deducciones capturadas a mano
alter table public.nomina_detalle add column if not exists cfdi_uuid         text;     -- folio fiscal (UUID) del CFDI de nómina
alter table public.nomina_detalle add column if not exists cfdi_fiscalapi_id text;     -- id de la factura en el PAC (para bajar XML y PDF)
alter table public.nomina_detalle add column if not exists cfdi_fecha        timestamptz;

-- Un UUID del SAT no puede repetirse.
create unique index if not exists nomina_detalle_cfdi_uuid_uk on public.nomina_detalle (cfdi_uuid) where cfdi_uuid is not null;

-- ---- 3. crear_nomina (OT-0047 + desglose) ----
CREATE OR REPLACE FUNCTION public.crear_nomina(p_periodicidad text, p_fecha_inicio date, p_fecha_fin date, p_dias integer, p_detalle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id  uuid;
  v_nomina_id   uuid;
  v_item        jsonb;
  v_emp_id      uuid;
  v_tot_perc    numeric(14,2) := 0;
  v_tot_ded     numeric(14,2) := 0;
  v_tot_neto    numeric(14,2) := 0;
  v_conteo      integer := 0;
  v_base        numeric(12,2);
  v_extras      numeric(12,2);
  v_ded         numeric(12,2);
  v_neto        numeric(12,2);
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;

  if auth_rol() not in ('rh', 'admin', 'director') then
    raise exception 'No tienes permiso para procesar nómina.';
  end if;

  if p_detalle is null or jsonb_array_length(p_detalle) = 0 then
    raise exception 'La nómina no tiene empleados que pagar.';
  end if;

  if periodo_esta_cerrado(v_empresa_id, p_fecha_inicio)
     or periodo_esta_cerrado(v_empresa_id, p_fecha_fin) then
    raise exception 'El periodo de la nómina está cerrado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_detalle) loop
    v_emp_id := nullif(v_item->>'empleado_id', '')::uuid;
    if v_emp_id is not null
       and not exists (select 1 from empleados where id = v_emp_id and empresa_id = v_empresa_id) then
      raise exception 'Empleado no válido: hay empleados que no pertenecen a tu empresa.';
    end if;

    v_base  := round(coalesce((v_item->>'sueldo_base')::numeric, 0), 2);
    v_extras := round(coalesce((v_item->>'otras_percepciones')::numeric, 0), 2);
    v_ded   := round(coalesce((v_item->>'deducciones')::numeric, 0), 2);
    v_neto  := round(v_base + v_extras - v_ded, 2);
    v_tot_perc := v_tot_perc + v_base + v_extras;
    v_tot_ded  := v_tot_ded + v_ded;
    v_tot_neto := v_tot_neto + v_neto;
    v_conteo   := v_conteo + 1;
  end loop;

  insert into nominas (
    empresa_id, periodicidad, fecha_inicio, fecha_fin, dias,
    total_percepciones, total_deducciones, total_neto,
    empleados_pagados, estado, created_by
  ) values (
    v_empresa_id, p_periodicidad, p_fecha_inicio, p_fecha_fin, p_dias,
    v_tot_perc, v_tot_ded, v_tot_neto,
    v_conteo, 'pagada', auth.uid()
  ) returning id into v_nomina_id;

  for v_item in select * from jsonb_array_elements(p_detalle) loop
    v_base  := round(coalesce((v_item->>'sueldo_base')::numeric, 0), 2);
    v_extras := round(coalesce((v_item->>'otras_percepciones')::numeric, 0), 2);
    v_ded   := round(coalesce((v_item->>'deducciones')::numeric, 0), 2);
    v_neto  := round(v_base + v_extras - v_ded, 2);
    insert into nomina_detalle (
      nomina_id, empresa_id, empleado_id, nombre, puesto, salario_diario,
      sueldo_base, otras_percepciones, deducciones, neto, notas,
      sdi, isr_bruto, isr_retenido, subsidio, imss, otras_deducciones      -- NUEVO (OT-0064): desglose
    ) values (
      v_nomina_id, v_empresa_id,
      nullif(v_item->>'empleado_id', '')::uuid,
      v_item->>'nombre',
      v_item->>'puesto',
      round(coalesce((v_item->>'salario_diario')::numeric, 0), 2),
      v_base, v_extras, v_ded, v_neto,
      nullif(v_item->>'notas', ''),
      round(nullif(v_item->>'sdi', '')::numeric, 2),
      round(nullif(v_item->>'isr_bruto', '')::numeric, 2),
      round(nullif(v_item->>'isr_retenido', '')::numeric, 2),
      round(nullif(v_item->>'subsidio', '')::numeric, 2),
      round(nullif(v_item->>'imss', '')::numeric, 2),
      round(nullif(v_item->>'otras_deducciones', '')::numeric, 2)
    );
  end loop;

  return jsonb_build_object(
    'id', v_nomina_id,
    'empleados_pagados', v_conteo,
    'total_neto', v_tot_neto
  );
end;
$function$;

-- ---- 4. Anotar el timbre de un renglón ----
CREATE OR REPLACE FUNCTION public.registrar_timbre_nomina(p_detalle_id uuid, p_uuid text, p_fiscalapi_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_actual     text;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('rh', 'admin', 'director') then
    raise exception 'No tienes permiso para timbrar nómina.';
  end if;
  if p_uuid is null or length(trim(p_uuid)) < 30 then
    raise exception 'UUID del CFDI no válido.';
  end if;

  select cfdi_uuid into v_actual from nomina_detalle where id = p_detalle_id and empresa_id = v_empresa_id for update;
  if not found then
    raise exception 'Renglón de nómina no encontrado en tu empresa.';
  end if;
  if v_actual is not null then
    raise exception 'Ese renglón de nómina ya está timbrado.';
  end if;

  update nomina_detalle
     set cfdi_uuid = p_uuid, cfdi_fiscalapi_id = p_fiscalapi_id, cfdi_fecha = now()
   where id = p_detalle_id and empresa_id = v_empresa_id;
end;
$function$;

revoke all on function public.registrar_timbre_nomina(uuid, text, text) from public, anon;
grant execute on function public.registrar_timbre_nomina(uuid, text, text) to authenticated;
