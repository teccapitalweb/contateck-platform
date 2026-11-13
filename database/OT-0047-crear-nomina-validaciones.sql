-- ============================================================
--  CONTATECK · OT-0047 · crear_nomina: periodo cerrado y empleado de otra empresa
--
--  *** PREPARADO, NO APLICADO. Hay que correrlo a mano en el SQL Editor de contateck-dev (primero DEV). ***
--  (El MCP `supabase-dev` es de solo lectura; este archivo no se ha ejecutado en ninguna base.)
--
--  Qué arregla (observaciones f y g de OT-0038-esquema-dev-exportado.sql):
--   1. Una nómina cuya fecha cae en un periodo CERRADO se rechaza (igual que las pólizas). Se revisan fecha_inicio
--      y fecha_fin, porque una nómina puede cruzar de mes.
--   2. Cada `empleado_id` del detalle debe pertenecer a la empresa del usuario. Hoy solo lo comprueba la llave
--      foránea a empleados(id), y con el UUID de un empleado ajeno se podía ligar un renglón a otra empresa.
--
--  Qué NO cambia: la firma, el tipo de retorno, SECURITY DEFINER, search_path, los permisos (CREATE OR REPLACE los
--  conserva), el cálculo de totales ni la validación de rol. Todo se valida ANTES de insertar, y la función corre
--  en una sola transacción, así que un rechazo no deja nada a medias.
--
--  Sigue SIN validarse (queda para otra OT, observación h): periodicidad, días, fecha_fin >= fecha_inicio e importes
--  negativos.
--
--  Efecto para la app: dos mensajes de error nuevos ("El periodo ... está cerrado", "Hay empleados que no
--  pertenecen a tu empresa"). Conviene confirmar que el frontend/backend de Nómina muestra el mensaje de la
--  excepción tal cual (no probado).
--
--  Verificación posterior (solo lectura):
--    select prosrc ~ 'periodo_esta_cerrado' as revisa_periodo, prosrc ~ 'Empleado no válido' as revisa_empleado
--      from pg_proc where proname = 'crear_nomina' and pronamespace = 'public'::regnamespace;   -- true, true
--  Prueba sugerida con sesión real (Demo C, director): nómina normal → OK; nómina con fecha en un mes cerrado →
--  rechazo; detalle con empleado_id de otra empresa → rechazo.
--
--  Reversa: volver a correr el cuerpo original de `crear_nomina` que está en
--  database/OT-0038-esquema-dev-exportado.sql (sección 2).
-- ============================================================

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
  -- Empresa del usuario (mismo patrón que crear_poliza_completa).
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;

  -- Solo quien gestiona nómina (mismos roles que dan de alta empleados
  -- y que la política INSERT de la tabla ya exige).
  if auth_rol() not in ('rh', 'admin', 'director') then
    raise exception 'No tienes permiso para procesar nómina.';
  end if;

  if p_detalle is null or jsonb_array_length(p_detalle) = 0 then
    raise exception 'La nómina no tiene empleados que pagar.';
  end if;

  -- NUEVO (OT-0047): no se paga nómina en un periodo cerrado (inicio o fin).
  if periodo_esta_cerrado(v_empresa_id, p_fecha_inicio)
     or periodo_esta_cerrado(v_empresa_id, p_fecha_fin) then
    raise exception 'El periodo de la nómina está cerrado.';
  end if;

  -- Totales calculados EN EL SERVIDOR a partir del detalle — no se
  -- confía en totales mandados por el cliente (se recalculan aquí).
  for v_item in select * from jsonb_array_elements(p_detalle) loop
    -- NUEVO (OT-0047): el empleado, si viene, debe ser de la empresa del usuario.
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

  -- Encabezado.
  insert into nominas (
    empresa_id, periodicidad, fecha_inicio, fecha_fin, dias,
    total_percepciones, total_deducciones, total_neto,
    empleados_pagados, estado, created_by
  ) values (
    v_empresa_id, p_periodicidad, p_fecha_inicio, p_fecha_fin, p_dias,
    v_tot_perc, v_tot_ded, v_tot_neto,
    v_conteo, 'pagada', auth.uid()
  ) returning id into v_nomina_id;

  -- Detalle (snapshot por empleado).
  for v_item in select * from jsonb_array_elements(p_detalle) loop
    v_base  := round(coalesce((v_item->>'sueldo_base')::numeric, 0), 2);
    v_extras := round(coalesce((v_item->>'otras_percepciones')::numeric, 0), 2);
    v_ded   := round(coalesce((v_item->>'deducciones')::numeric, 0), 2);
    v_neto  := round(v_base + v_extras - v_ded, 2);
    insert into nomina_detalle (
      nomina_id, empresa_id, empleado_id, nombre, puesto, salario_diario,
      sueldo_base, otras_percepciones, deducciones, neto, notas
    ) values (
      v_nomina_id, v_empresa_id,
      nullif(v_item->>'empleado_id', '')::uuid,
      v_item->>'nombre',
      v_item->>'puesto',
      round(coalesce((v_item->>'salario_diario')::numeric, 0), 2),
      v_base, v_extras, v_ded, v_neto,
      nullif(v_item->>'notas', '')
    );
  end loop;

  return jsonb_build_object(
    'id', v_nomina_id,
    'empleados_pagados', v_conteo,
    'total_neto', v_tot_neto
  );
end;
$function$;
