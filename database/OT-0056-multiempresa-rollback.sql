-- ============================================================
--  CONTATECK · OT-0056 · REVERTIR multiempresa
--  Deja la base como estaba antes de OT-0056-multiempresa.sql:
--  un usuario = una empresa (perfiles). Las membresías extra se pierden.
--  ANTES de correrlo, cada persona debe estar trabajando en la empresa donde
--  quiere quedarse (perfiles.empresa_id es la que se conserva).
-- ============================================================
begin;

drop function if exists public.membresia_cambiar_estado(uuid, boolean);
drop function if exists public.cambiar_empresa(uuid);
drop function if exists public.mis_empresas();

drop trigger if exists perfiles_sincronizar_membresia on public.perfiles;
drop function if exists public.perfiles_sincronizar_membresia();

drop policy if exists perfiles_select_membresia on public.perfiles;
drop policy if exists usuario_empresas_select on public.usuario_empresas;
drop function if exists public.auth_es_miembro(uuid);

-- Función de protección de perfiles tal como estaba en OT-0038 (sin la excepción de OT-0056).
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
  if v_uid is null then
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

drop table if exists public.usuario_empresas;

commit;
