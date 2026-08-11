-- ============================================================
--  CONTATECK · addendum_poliza_partidas.sql
--  OT-0010 · Detalle de pólizas (líneas Debe/Haber) en Postgres.
--  Ejecutar en Supabase DEV, con tu rol normal (postgres),
--  DESPUÉS de schema.sql/policies.sql/seed.sql ya aplicados.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Trazabilidad: updated_at en polizas (aprobado por Jorge)
-- ------------------------------------------------------------
alter table polizas add column if not exists updated_at timestamptz;

-- ------------------------------------------------------------
-- 2. Tabla nueva: poliza_partidas
-- ------------------------------------------------------------
create table poliza_partidas (
  id          uuid primary key default gen_random_uuid(),
  poliza_id   uuid not null references polizas(id),
  cuenta_id   uuid not null references cuentas_contables(id),
  debe        numeric(14,2) not null default 0,
  haber       numeric(14,2) not null default 0,
  descripcion text,                          -- aprobado por Jorge: observación opcional por línea
  orden       smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_poliza_partidas_poliza on poliza_partidas (poliza_id);
create index idx_poliza_partidas_cuenta on poliza_partidas (cuenta_id);

-- ------------------------------------------------------------
-- 3. RLS de poliza_partidas — mismo criterio ya aprobado para polizas:
--    lectura para toda la empresa, escritura solo contador/admin/director,
--    SIN política de delete (una línea nunca se borra suelta).
-- ------------------------------------------------------------
alter table poliza_partidas enable row level security;

create policy "poliza_partidas_select_empresa"
  on poliza_partidas for select
  using (
    poliza_id in (select id from polizas where empresa_id = auth_empresa_id())
  );

create policy "poliza_partidas_insert_roles_contables"
  on poliza_partidas for insert
  with check (
    auth_rol() in ('contador', 'admin', 'director')
    and poliza_id in (select id from polizas where empresa_id = auth_empresa_id())
  );

-- No hay policy de update ni delete para poliza_partidas: una edición de
-- póliza reemplaza TODAS sus líneas (borra+inserta) dentro de la función
-- guardar_poliza_completa/actualizar_poliza_completa, con permisos de
-- SECURITY DEFINER controlados — nunca se editan líneas sueltas desde
-- el cliente directamente.

-- ------------------------------------------------------------
-- 4. Función RPC: crear póliza completa (encabezado + partidas)
--    Valida Debe = Haber ANTES de guardar nada — si no cuadra, se
--    aborta toda la transacción (nada queda a medias).
-- ------------------------------------------------------------
create or replace function crear_poliza_completa(
  p_folio     text,
  p_tipo      text,
  p_fecha     date,
  p_concepto  text,
  p_partidas  jsonb   -- [{codigo, debe, haber, descripcion}, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_poliza_id  uuid;
  v_total_debe numeric(14,2) := 0;
  v_total_haber numeric(14,2) := 0;
  v_item jsonb;
  v_cuenta_id uuid;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;

  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para crear pólizas.';
  end if;

  -- Validar cuadre ANTES de tocar la base.
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

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, p_folio, p_tipo, p_fecha, p_concepto, v_total_debe, 'ok', now())
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

  return v_poliza_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Función RPC: actualizar póliza completa (reemplaza sus líneas)
-- ------------------------------------------------------------
create or replace function actualizar_poliza_completa(
  p_poliza_id uuid,
  p_tipo      text,
  p_fecha     date,
  p_concepto  text,
  p_partidas  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_poliza_empresa uuid;
  v_total_debe numeric(14,2) := 0;
  v_total_haber numeric(14,2) := 0;
  v_item jsonb;
  v_cuenta_id uuid;
begin
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para editar pólizas.';
  end if;

  select empresa_id into v_poliza_empresa from polizas where id = p_poliza_id;
  if v_poliza_empresa is null or v_poliza_empresa <> v_empresa_id then
    raise exception 'Póliza no encontrada o no pertenece a tu empresa.';
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

  update polizas set tipo = p_tipo, fecha = p_fecha, concepto = p_concepto, monto = v_total_debe, updated_at = now()
  where id = p_poliza_id;

  delete from poliza_partidas where poliza_id = p_poliza_id;

  for v_item in select * from jsonb_array_elements(p_partidas) loop
    select id into v_cuenta_id from cuentas_contables
      where empresa_id = v_empresa_id and codigo = (v_item->>'codigo');
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe en el catálogo de esta empresa.', (v_item->>'codigo');
    end if;
    insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, descripcion, orden)
    values (
      p_poliza_id, v_cuenta_id,
      coalesce((v_item->>'debe')::numeric, 0),
      coalesce((v_item->>'haber')::numeric, 0),
      v_item->>'descripcion',
      coalesce((v_item->>'orden')::smallint, 0)
    );
  end loop;
end;
$$;

-- ============================================================
--  Fin de addendum_poliza_partidas.sql
--
--  Nota: crear_poliza_completa/actualizar_poliza_completa son
--  SECURITY DEFINER (igual que auth_empresa_id/auth_rol de OT-0003)
--  porque necesitan leer/escribir varias tablas en una sola
--  transacción. La validación de rol y de empresa queda DENTRO de
--  la función — no se está saltando RLS de forma insegura, se está
--  reemplazando por una verificación equivalente hecha a mano.
-- ============================================================
