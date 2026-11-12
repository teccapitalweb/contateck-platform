-- ============================================================
--  CONTATECK · OT-0038 · Endurecimiento de seguridad en Supabase
--  *** MODIFICA LA BASE. Aplicar primero en DEV, solo con aprobación, y después correr
--  *** backend/test-endurecimiento-seguridad.js. Para deshacerlo: OT-0038-endurecimiento-seguridad-rollback.sql
--
--  Qué arregla (hallazgos confirmados con la introspección de DEV, 2026-11-12):
--
--  1) perfiles: cualquier usuario podía actualizar su propia fila SIN límite de columnas (rol_id, empresa_id,
--     activo...): hacerse director, pasarse a otra empresa o reactivarse tras una baja. Además RH podía cambiar
--     el rol de cualquiera. Las reglas de Equipo (OT-0034) solo vivían en el backend. Ahora un trigger las exige
--     en la base: la empresa y el correo no cambian; nadie cambia su propio rol ni su estado; solo
--     Admin/Director cambian roles; RH no toca a Admin/Director; siempre queda un director activo.
--     (Quien no es una persona con sesión, es decir la llave de servicio del backend y el SQL Editor, no se
--     restringe: el alta de perfiles sigue funcionando.)
--  2) invitaciones: RH podía invitar con rol Admin/Director por la API directa. Mismo trigger de regla.
--  3) empresas: las llaves del CSD (csd_cer_base64, csd_key_base64, csd_password) eran legibles por cualquier
--     usuario de la empresa. Se quita el permiso de lectura de esas columnas (el backend ya pide columnas
--     explícitas y no las usa con el token del usuario). Las columnas nuevas que se agreguen a empresas
--     necesitan su propio GRANT SELECT.
--  4) Funciones de folio y periodo_esta_cerrado: reciben la empresa como parámetro sin comprobar que sea la
--     del usuario (se podía adelantar el folio de otra empresa). Ahora solo se acepta la empresa del usuario
--     (o la llave de servicio). Además, `anon` y PUBLIC dejan de poder ejecutar las funciones de escritura.
--
--  Es idempotente (se puede correr más de una vez). Va en una sola transacción: si algo falla, no queda nada a medias.
--  PENDIENTE: la función siguiente_folio(uuid, text) (folio de pólizas) no se reemplaza aquí porque no se ha
--  exportado su cuerpo real de DEV; solo se le quita la ejecución a anon/PUBLIC. Falta validar su empresa (ver nota al final).
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1) perfiles: proteger rol, empresa, estado y correo
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

drop trigger if exists perfiles_proteger_campos on public.perfiles;
create trigger perfiles_proteger_campos
  before update on public.perfiles
  for each row execute function public.perfiles_proteger_campos();

-- ------------------------------------------------------------
-- 2) invitaciones: RH no invita con rol Admin/Director
-- ------------------------------------------------------------
create or replace function public.invitaciones_proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_rol     text;
  v_rol_inv text;
begin
  if v_uid is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.empresa_id is distinct from old.empresa_id then
      raise exception 'No se puede cambiar la empresa de una invitación.';
    end if;
    if new.rol_id is not distinct from old.rol_id then
      return new; -- cancelar, renovar o aceptar no cambia el rol
    end if;
  end if;

  v_rol := auth_rol();
  select nombre into v_rol_inv from roles where id = new.rol_id;
  if v_rol = 'rh' and v_rol_inv in ('admin', 'director') then
    raise exception 'RH no puede invitar con rol Admin o Director; pídeselo a un Admin/Director.';
  end if;
  return new;
end;
$$;

drop trigger if exists invitaciones_proteger_rol on public.invitaciones;
create trigger invitaciones_proteger_rol
  before insert or update on public.invitaciones
  for each row execute function public.invitaciones_proteger_rol();

-- ------------------------------------------------------------
-- 3) empresas: las llaves del CSD dejan de ser legibles con la API
--    (se quita la lectura de toda la tabla y se devuelve solo la de las columnas que no son secretas)
-- ------------------------------------------------------------
revoke select on public.empresas from anon, authenticated;
grant select (id, nombre, rfc, regimen_fiscal, cp, plan, estado, status, country, currency, timezone, created_at, created_by)
  on public.empresas to authenticated;

-- ------------------------------------------------------------
-- 4) Funciones de folio y periodo: solo la empresa del usuario (o la llave de servicio).
--    Cuerpos idénticos a los de DEV (exportados el 2026-11-12) más la comprobación.
-- ------------------------------------------------------------
create or replace function public.siguiente_folio_pago(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'P', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'P-' || lpad(v_numero::text, 5, '0');
end;
$$;

create or replace function public.siguiente_folio_pago_proveedor(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'PP', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'PP-' || lpad(v_numero::text, 5, '0');
end;
$$;

create or replace function public.periodo_esta_cerrado(p_empresa_id uuid, p_fecha date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  return coalesce(
    (select estado = 'cerrado' from periodos_contables
      where empresa_id = p_empresa_id
        and anio = extract(year from p_fecha)::int
        and mes  = extract(month from p_fecha)::int),
    false  -- sin registro = abierto
  );
end;
$$;

-- anon y PUBLIC dejan de ejecutar las funciones de escritura; las personas con sesión (authenticated) y el
-- backend (service_role) conservan el permiso de forma explícita. auth_empresa_id() y auth_rol() NO se tocan:
-- las usan las políticas de RLS.
revoke execute on function public.siguiente_folio(uuid, text)                                              from public, anon;
revoke execute on function public.siguiente_folio_pago(uuid)                                               from public, anon;
revoke execute on function public.siguiente_folio_pago_proveedor(uuid)                                     from public, anon;
revoke execute on function public.periodo_esta_cerrado(uuid, date)                                         from public, anon;
revoke execute on function public.crear_poliza_completa(text, date, text, jsonb, text, text)               from public, anon;
revoke execute on function public.actualizar_poliza_completa(uuid, text, date, text, jsonb)                from public, anon;
revoke execute on function public.anular_poliza_duplicada(uuid, text)                                      from public, anon;
revoke execute on function public.corregir_poliza_con_ajuste(uuid, text, jsonb)                            from public, anon;
revoke execute on function public.cerrar_periodo(integer, integer)                                         from public, anon;
revoke execute on function public.confirmar_pago_cliente(uuid)                                             from public, anon;
revoke execute on function public.confirmar_pago_proveedor(uuid)                                           from public, anon;
revoke execute on function public.registrar_pago_cliente(uuid, numeric, date, text, uuid, text, text, text)   from public, anon;
revoke execute on function public.registrar_pago_proveedor(uuid, numeric, date, text, uuid, text, text, text) from public, anon;
revoke execute on function public.crear_nomina(text, date, date, integer, jsonb)                           from public, anon;

grant execute on function public.siguiente_folio(uuid, text)                                              to authenticated, service_role;
grant execute on function public.siguiente_folio_pago(uuid)                                               to authenticated, service_role;
grant execute on function public.siguiente_folio_pago_proveedor(uuid)                                     to authenticated, service_role;
grant execute on function public.periodo_esta_cerrado(uuid, date)                                         to authenticated, service_role;
grant execute on function public.crear_poliza_completa(text, date, text, jsonb, text, text)               to authenticated, service_role;
grant execute on function public.actualizar_poliza_completa(uuid, text, date, text, jsonb)                to authenticated, service_role;
grant execute on function public.anular_poliza_duplicada(uuid, text)                                      to authenticated, service_role;
grant execute on function public.corregir_poliza_con_ajuste(uuid, text, jsonb)                            to authenticated, service_role;
grant execute on function public.cerrar_periodo(integer, integer)                                         to authenticated, service_role;
grant execute on function public.confirmar_pago_cliente(uuid)                                             to authenticated, service_role;
grant execute on function public.confirmar_pago_proveedor(uuid)                                           to authenticated, service_role;
grant execute on function public.registrar_pago_cliente(uuid, numeric, date, text, uuid, text, text, text)   to authenticated, service_role;
grant execute on function public.registrar_pago_proveedor(uuid, numeric, date, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.crear_nomina(text, date, date, integer, jsonb)                           to authenticated, service_role;

commit;

-- ============================================================
--  Validación después de correr esto (solo lectura):
--
--  1) Triggers presentes:
--       select tgrelid::regclass as tabla, tgname from pg_trigger
--        where tgname in ('perfiles_proteger_campos', 'invitaciones_proteger_rol') and not tgisinternal;   -- 2 filas
--  2) Las llaves del CSD ya no se leen con sesión:
--       select has_column_privilege('authenticated', 'public.empresas', 'csd_password', 'select');         -- false
--       select has_column_privilege('authenticated', 'public.empresas', 'nombre', 'select');               -- true
--  3) anon ya no ejecuta las funciones de escritura:
--       select has_function_privilege('anon', 'public.confirmar_pago_cliente(uuid)', 'execute');           -- false
--  4) Prueba con una sesión real (intentos de escalada, lectura del CSD, folio de otra empresa):
--       cd backend && node test-endurecimiento-seguridad.js
--
--  PENDIENTE (siguiente_folio de pólizas): exportar su cuerpo real con
--       select pg_get_functiondef('public.siguiente_folio(uuid, text)'::regprocedure);
--  y agregarle la misma comprobación de empresa que a siguiente_folio_pago.
-- ============================================================
