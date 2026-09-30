-- ============================================================
--  CONTATECK · OT-0012 · Folio atómico desde Postgres
--  Reemplaza el generador de folios en localStorage
--  (frontend/contabilidad.js → siguienteFolio) por un contador
--  real en Postgres, incrementado dentro de la misma transacción
--  que crea la póliza. Elimina el riesgo de folios duplicados
--  entre dispositivos/usuarios de la misma empresa.
--
--  Ejecutar completo en el SQL Editor de Supabase (DEV primero,
--  validar, luego PROD).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla contador. Una fila por empresa + tipo de póliza.
--    Nunca se toca directamente desde el cliente: solo la
--    tocan las funciones SECURITY DEFINER de abajo.
-- ------------------------------------------------------------
create table if not exists folios_contador (
  empresa_id     uuid not null references empresas(id),
  tipo           text not null check (tipo in ('I', 'E', 'D')),
  ultimo_numero  integer not null default 0,
  primary key (empresa_id, tipo)
);

alter table folios_contador enable row level security;
-- Sin policies de select/insert/update para el cliente: esta tabla
-- solo se lee/escribe desde dentro de siguiente_folio(), que corre
-- con SECURITY DEFINER. Así nadie puede "adelantar" el contador
-- ni leer cuántas pólizas lleva otra empresa.

-- ------------------------------------------------------------
-- 2. Backfill: sembrar el contador con el folio más alto que ya
--    existe hoy en `polizas`, para no reiniciar en 0 y chocar
--    con folios ya usados. Corre una sola vez, es idempotente
--    (on conflict toma el máximo entre lo que ya había y lo nuevo).
-- ------------------------------------------------------------
insert into folios_contador (empresa_id, tipo, ultimo_numero)
select
  empresa_id,
  substring(folio from '^([IED])-') as tipo,
  max(coalesce(nullif(regexp_replace(folio, '^[IED]-0*', ''), '')::integer, 0)) as ultimo_numero
from polizas
where folio ~ '^[IED]-[0-9]+$'
group by empresa_id, substring(folio from '^([IED])-')
on conflict (empresa_id, tipo)
  do update set ultimo_numero = greatest(folios_contador.ultimo_numero, excluded.ultimo_numero);

-- ------------------------------------------------------------
-- 3. Función: siguiente_folio(empresa, tipo) → texto "I-00007"
--    El UPSERT con ON CONFLICT ... RETURNING es atómico: si dos
--    transacciones piden folio al mismo tiempo, Postgres serializa
--    el acceso a la fila (row lock) — la segunda espera a que la
--    primera termine y recibe el número siguiente, nunca el mismo.
-- ------------------------------------------------------------
create or replace function siguiente_folio(p_empresa_id uuid, p_tipo_poliza text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_letra  text;
  v_numero integer;
begin
  v_letra := case p_tipo_poliza
    when 'Ingreso' then 'I'
    when 'Egreso'  then 'E'
    else 'D'
  end;

  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, v_letra, 1)
  on conflict (empresa_id, tipo)
    do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_letra || '-' || lpad(v_numero::text, 5, '0');
end;
$$;

-- ------------------------------------------------------------
-- 4. crear_poliza_completa: ya NO recibe p_folio del cliente.
--    Lo genera internamente con siguiente_folio(), dentro de la
--    misma transacción que valida Debe=Haber e inserta la póliza
--    y sus partidas. Si algo falla después, todo se revierte
--    junto (incluido el número que se había tomado).
--
--    IMPORTANTE: cambia la firma (se quita p_folio), así que hay
--    que borrar la versión vieja explícitamente — si no, Postgres
--    deja las dos funciones coexistiendo como sobrecargas distintas.
-- ------------------------------------------------------------
drop function if exists crear_poliza_completa(text, text, date, text, jsonb);

create or replace function crear_poliza_completa(
  p_tipo      text,
  p_fecha     date,
  p_concepto  text,
  p_partidas  jsonb   -- [{codigo, debe, haber, descripcion}, ...]
)
returns jsonb   -- {"id": uuid, "folio": "I-00007"}
language plpgsql
security definer
set search_path = public
as $$
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

  -- Validar cuadre ANTES de tocar la base (y antes de gastar un folio).
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

  -- OT-0012: folio atómico, generado aquí — no llega del cliente.
  v_folio := siguiente_folio(v_empresa_id, p_tipo);

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, v_folio, p_tipo, p_fecha, p_concepto, v_total_debe, 'ok', now())
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
$$;

-- ============================================================
--  Fin de OT-0012-folio-atomico.sql
--
--  Validación rápida después de correr esto:
--
--  1) select * from folios_contador order by empresa_id, tipo;
--     → debe traer una fila por empresa+tipo, con ultimo_numero
--       igual o mayor al folio más alto que ya tenías en `polizas`.
--
--  2) Crear una póliza de Ingreso desde la app y confirmar que el
--     folio nuevo continúa la secuencia (no reinicia en 00001).
--
--  3) select proname, pronargs from pg_proc where proname =
--     'crear_poliza_completa';
--     → debe regresar UNA sola fila con pronargs = 4 (ya no 5).
--       Si aparecen dos filas, el DROP FUNCTION de arriba no corrió
--       bien — hay que borrar la versión vieja a mano.
-- ============================================================
