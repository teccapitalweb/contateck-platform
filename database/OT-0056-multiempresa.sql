-- ============================================================
--  CONTATECK · OT-0056 · Multiempresa por usuario (cambiar de empresa)
--
--  *** NO SE HA EJECUTADO EN NINGUNA BASE. Revisar con Jorge antes de DEV. ***
--  Antes de correrlo: OT-0056-multiempresa-introspeccion.sql (solo lectura)
--  y comparar con lo que reemplaza (sección 3). Es idempotente.
--
--  Hoy: un usuario = una empresa (`perfiles` tiene una sola empresa_id/rol_id) y
--  TODA la seguridad (RLS) pregunta "¿de qué empresa es este usuario?" con
--  auth_empresa_id(), que lee `perfiles`. Por eso no se podía cambiar de empresa.
--
--  Diseño (opción A): no se toca ninguna política de las demás tablas.
--   · `usuario_empresas`: las empresas a las que pertenece cada persona, con su
--     rol y su estado en cada una. Solo se escribe desde funciones de la base o
--     desde el backend con service role: ningún usuario se agrega a sí mismo.
--   · `perfiles` sigue siendo el "contexto activo": su empresa_id/rol_id/activo son
--     los de la empresa donde la persona está trabajando AHORA. Un trigger lo
--     mantiene copiado en `usuario_empresas`, así la membresía siempre refleja
--     los cambios de rol y de baja que ya se hacen desde Equipo.
--   · cambiar_empresa(p_empresa_id): única vía para mover el contexto activo, y
--     solo hacia una membresía propia y activa. perfiles_proteger_campos() (OT-0038)
--     sigue prohibiendo cambiar empresa_id/rol_id por cualquier otro camino.
--   · mis_empresas(): lista de empresas de la persona para el selector.
--   · membresia_cambiar_estado(): baja/reactivación de alguien de MI empresa aunque
--     esté trabajando en otra en este momento (si no, no se le podría quitar el
--     acceso mientras no esté aquí).
--   · Política extra en `perfiles`: nombres y correos de quienes pertenecen a mi
--     empresa, aunque ahora estén en otra (Ventas "registrado por", Equipo…).
--
--  Revertir: OT-0056-multiempresa-rollback.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Membresías
-- ------------------------------------------------------------
create table if not exists public.usuario_empresas (
  user_id    uuid not null references public.perfiles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  rol_id     uuid not null references public.roles(id),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint usuario_empresas_pkey primary key (user_id, empresa_id)
);
create index if not exists idx_usuario_empresas_empresa on public.usuario_empresas (empresa_id);

alter table public.usuario_empresas enable row level security;
-- Sin políticas de insert/update/delete: solo funciones SECURITY DEFINER y service role.
revoke all on public.usuario_empresas from anon, authenticated;
grant select on public.usuario_empresas to authenticated;

-- ¿Pertenece p_user a MI empresa activa? (SECURITY DEFINER: se usa dentro de políticas.)
create or replace function public.auth_es_miembro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuario_empresas ue
     where ue.user_id = p_user and ue.empresa_id = auth_empresa_id()
  )
$$;

drop policy if exists usuario_empresas_select on public.usuario_empresas;
create policy usuario_empresas_select on public.usuario_empresas for select
  using (user_id = auth.uid() or empresa_id = auth_empresa_id());

-- Nombres/correos de quienes pertenecen a mi empresa aunque hoy trabajen en otra.
drop policy if exists perfiles_select_membresia on public.perfiles;
create policy perfiles_select_membresia on public.perfiles for select
  using (auth_es_miembro(id));

-- Respaldo inicial: cada persona ya existente queda como miembro de su empresa actual.
insert into public.usuario_empresas (user_id, empresa_id, rol_id, activo)
select p.id, p.empresa_id, p.rol_id, coalesce(p.activo, true)
  from public.perfiles p
on conflict (user_id, empresa_id) do nothing;

-- ------------------------------------------------------------
-- 2) perfiles → usuario_empresas (la membresía siempre refleja el perfil activo)
-- ------------------------------------------------------------
create or replace function public.perfiles_sincronizar_membresia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usuario_empresas (user_id, empresa_id, rol_id, activo)
  values (new.id, new.empresa_id, new.rol_id, coalesce(new.activo, true))
  on conflict (user_id, empresa_id)
  do update set rol_id = excluded.rol_id, activo = excluded.activo;
  return new;
end;
$$;

drop trigger if exists perfiles_sincronizar_membresia on public.perfiles;
create trigger perfiles_sincronizar_membresia
  after insert or update of empresa_id, rol_id, activo on public.perfiles
  for each row execute function public.perfiles_sincronizar_membresia();

-- ------------------------------------------------------------
-- 3) perfiles_proteger_campos() — copia de OT-0038 + UNA excepción (bloque OT-0056):
--    el cambio de empresa_id/rol_id solo se acepta cuando lo hace cambiar_empresa()
--    (bandera de la transacción) Y el destino es una membresía activa de esa misma persona.
--    Todo lo demás queda igual. Comparar con la definición real de DEV antes de correr.
-- ------------------------------------------------------------
create or replace function public.perfiles_proteger_campos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_rol         text;
  v_rol_actual  text;
  v_rol_nuevo   text;
begin
  -- Sin persona con sesión (llave de servicio del backend, SQL Editor): sin restricciones.
  if v_uid is null then
    return new;
  end if;

  -- OT-0056: cambio de empresa activa hecho por cambiar_empresa() hacia una membresía propia activa.
  if old.id = v_uid
     and current_setting('contateck.cambiando_empresa', true) = old.id::text
     and (new.empresa_id is distinct from old.empresa_id or new.rol_id is distinct from old.rol_id)
     and new.id = old.id
     and new.email is not distinct from old.email
     and new.is_active is not distinct from old.is_active
     and new.activo is true
     and exists (
       select 1 from usuario_empresas ue
        where ue.user_id = old.id and ue.empresa_id = new.empresa_id
          and ue.rol_id = new.rol_id and ue.activo
     ) then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'No se puede cambiar el id de un perfil.';
  end if;
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'No se puede cambiar la empresa de un perfil.';
  end if;
  if new.email is distinct from old.email then
    raise exception 'No se puede cambiar el correo de un perfil.';
  end if;

  if new.rol_id is distinct from old.rol_id
     or new.activo is distinct from old.activo
     or new.is_active is distinct from old.is_active then

    if old.id = v_uid then
      raise exception 'No puedes cambiar tu propio rol ni tu estado; pídeselo a otro Admin/Director.';
    end if;

    v_rol := auth_rol();
    if v_rol is null or v_rol not in ('rh', 'admin', 'director') then
      raise exception 'No tienes permiso para cambiar el rol o el estado de otras personas.';
    end if;

    select nombre into v_rol_actual from roles where id = old.rol_id;
    select nombre into v_rol_nuevo  from roles where id = new.rol_id;

    if new.rol_id is distinct from old.rol_id and v_rol not in ('admin', 'director') then
      raise exception 'Solo Admin/Director pueden cambiar el rol de alguien.';
    end if;
    if v_rol = 'rh' and v_rol_actual in ('admin', 'director') then
      raise exception 'RH no puede modificar a un Admin o Director; pídeselo a un Admin/Director.';
    end if;

    -- Siempre debe quedar al menos un director activo en la empresa.
    if v_rol_actual = 'director' and old.activo is true
       and (new.activo is not true or v_rol_nuevo is distinct from 'director') then
      if not exists (
        select 1 from perfiles p join roles r on r.id = p.rol_id
         where p.empresa_id = old.empresa_id and p.id <> old.id and p.activo is true and r.nombre = 'director'
      ) then
        raise exception 'Es el único director activo: antes asigna a otra persona como director.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- (el trigger BEFORE UPDATE ya existe desde OT-0038; se recrea por si en DEV no está)
drop trigger if exists perfiles_proteger_campos on public.perfiles;
create trigger perfiles_proteger_campos
  before update on public.perfiles
  for each row execute function public.perfiles_proteger_campos();

-- ------------------------------------------------------------
-- 4) mis_empresas() — para el selector
-- ------------------------------------------------------------
create or replace function public.mis_empresas()
returns table (empresa_id uuid, nombre text, rol text, activa boolean, activo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ue.empresa_id, e.nombre, r.nombre, (ue.empresa_id = p.empresa_id), ue.activo
    from usuario_empresas ue
    join empresas e on e.id = ue.empresa_id
    join roles r on r.id = ue.rol_id
    left join perfiles p on p.id = ue.user_id
   where ue.user_id = auth.uid()
   order by e.nombre
$$;

-- ------------------------------------------------------------
-- 5) cambiar_empresa() — única vía para mover el contexto activo
-- ------------------------------------------------------------
create or replace function public.cambiar_empresa(p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_actual  uuid;
  v_m       record;
  v_nombre  text;
  v_rol     text;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión.';
  end if;

  select empresa_id into v_actual from perfiles where id = v_uid;
  if v_actual is null then
    raise exception 'No se encontró tu perfil.';
  end if;

  select * into v_m from usuario_empresas where user_id = v_uid and empresa_id = p_empresa_id;
  if v_m is null then
    raise exception 'No perteneces a esa empresa.';
  end if;
  if not v_m.activo then
    raise exception 'Tu acceso a esa empresa está dado de baja.';
  end if;

  select nombre into v_nombre from empresas where id = p_empresa_id;
  select nombre into v_rol from roles where id = v_m.rol_id;

  if v_actual = p_empresa_id then
    return jsonb_build_object('cambio', false, 'empresaId', p_empresa_id, 'empresa', v_nombre, 'rol', v_rol);
  end if;

  -- Bandera de ESTA transacción: perfiles_proteger_campos() solo la acepta para esta persona.
  perform set_config('contateck.cambiando_empresa', v_uid::text, true);
  update perfiles set empresa_id = v_m.empresa_id, rol_id = v_m.rol_id, activo = true where id = v_uid;
  perform set_config('contateck.cambiando_empresa', '', true);

  -- Rastro del cambio. Si la tabla de auditoría rechazara la fila (restricciones propias), no se frena el cambio.
  begin
    insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
    values (p_empresa_id, v_uid, 'perfiles', v_uid, 'update',
      jsonb_build_object('cambio_empresa', true, 'desde', v_actual, 'hacia', p_empresa_id), 'auth');
  exception when others then
    null;
  end;

  return jsonb_build_object('cambio', true, 'empresaId', p_empresa_id, 'empresa', v_nombre, 'rol', v_rol);
end;
$$;

-- ------------------------------------------------------------
-- 6) membresia_cambiar_estado() — baja/reactivación de alguien de MI empresa,
--    esté o no trabajando aquí en este momento. Mismas reglas que Equipo:
--    solo RH/Admin/Director, nadie a sí mismo, RH no toca Admin/Director y
--    siempre queda al menos un director activo.
-- ------------------------------------------------------------
create or replace function public.membresia_cambiar_estado(p_user_id uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid := auth_empresa_id();
  v_rol     text := auth_rol();
  v_obj     record;
begin
  if v_uid is null or v_empresa is null then
    raise exception 'Necesitas iniciar sesión con una empresa activa.';
  end if;
  if v_rol is null or v_rol not in ('rh', 'admin', 'director') then
    raise exception 'No tienes permiso para dar de baja o reactivar personas.';
  end if;
  if p_activo is null then
    raise exception 'Indica si la persona queda activa o dada de baja.';
  end if;
  if p_user_id = v_uid then
    raise exception 'No puedes darte de baja a ti mismo.';
  end if;

  select ue.user_id, ue.activo, r.nombre as rol_nombre into v_obj
    from usuario_empresas ue join roles r on r.id = ue.rol_id
   where ue.user_id = p_user_id and ue.empresa_id = v_empresa;
  if v_obj is null then
    raise exception 'Esa persona no pertenece a tu empresa.';
  end if;

  if v_rol = 'rh' and v_obj.rol_nombre in ('admin', 'director') then
    raise exception 'RH no puede dar de baja ni reactivar a un Admin o Director; pídeselo a un Admin/Director.';
  end if;

  if not p_activo and v_obj.rol_nombre = 'director' and v_obj.activo then
    if not exists (
      select 1 from usuario_empresas ue2 join roles r2 on r2.id = ue2.rol_id
       where ue2.empresa_id = v_empresa and ue2.user_id <> p_user_id and ue2.activo and r2.nombre = 'director'
    ) then
      raise exception 'Es el único director activo: antes de darlo de baja, asigna a otra persona como director.';
    end if;
  end if;

  update usuario_empresas set activo = p_activo where user_id = p_user_id and empresa_id = v_empresa;
  -- Si esa persona está trabajando AHORA en esta empresa, su perfil activo refleja lo mismo.
  update perfiles set activo = p_activo where id = p_user_id and empresa_id = v_empresa;

  return jsonb_build_object('userId', p_user_id, 'activo', p_activo);
end;
$$;

-- ------------------------------------------------------------
-- 7) Permisos de ejecución: solo personas con sesión.
-- ------------------------------------------------------------
revoke execute on function public.cambiar_empresa(uuid)                  from public, anon;
revoke execute on function public.mis_empresas()                         from public, anon;
revoke execute on function public.membresia_cambiar_estado(uuid, boolean) from public, anon;
grant  execute on function public.cambiar_empresa(uuid)                  to authenticated;
grant  execute on function public.mis_empresas()                         to authenticated;
grant  execute on function public.membresia_cambiar_estado(uuid, boolean) to authenticated;

commit;

-- ============================================================
--  Validación después de correr esto (solo lectura):
--
--  1) Todas las personas tienen su membresía:
--       select count(*) from perfiles p
--        where not exists (select 1 from usuario_empresas ue
--                           where ue.user_id = p.id and ue.empresa_id = p.empresa_id);   -- 0
--  2) Los dos triggers de perfiles y la política nueva:
--       select tgname from pg_trigger where tgrelid = 'public.perfiles'::regclass and not tgisinternal;
--         -- perfiles_proteger_campos, perfiles_sincronizar_membresia (y los que ya hubiera)
--       select policyname from pg_policies where tablename = 'perfiles';   -- incluye perfiles_select_membresia
--  3) Un usuario NO puede cambiar su empresa por la vía directa (debe fallar con
--     "No se puede cambiar la empresa de un perfil"), y sí con cambiar_empresa().
--
--  Agregar a alguien a una SEGUNDA empresa (hoy, a mano, solo para pruebas en DEV):
--    insert into usuario_empresas (user_id, empresa_id, rol_id)
--    values ('<id del usuario>', '<id de la empresa>', '<id del rol>');
--  En la app se hace con una invitación de Equipo a ese correo; la persona la acepta
--  desde el selector de empresa.
-- ============================================================
