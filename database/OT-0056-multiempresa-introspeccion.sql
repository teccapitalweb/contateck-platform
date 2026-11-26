-- ============================================================
--  CONTATECK · OT-0056 · Multiempresa por usuario
--  PASO 0 — SOLO LECTURA. No cambia nada. Correr en DEV ANTES de
--  OT-0056-multiempresa.sql y pegar los resultados.
--
--  Por qué: OT-0056-multiempresa.sql reemplaza la función
--  perfiles_proteger_campos() (agrega una excepción para el cambio de
--  empresa) y se apoya en auth_empresa_id()/auth_rol(), en las políticas de
--  `perfiles` y en las columnas de `empresas`, `roles` y `auditoria_log`.
--  Está armado con lo que hay en el repo; si en DEV algo es distinto, hay
--  que verlo antes de pisarlo.
--  Supabase muestra solo el último resultado: corre las consultas UNA POR UNA
--  (y usa Export → Copy as JSON para ver el texto completo de las funciones).
-- ============================================================

-- 1) Definición REAL de las funciones que se tocan o de las que se depende.
select p.proname as funcion, pg_get_functiondef(p.oid) as definicion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('auth_empresa_id', 'auth_rol', 'perfiles_proteger_campos');

-- 2) Políticas y triggers de `perfiles`.
select 'politica' as tipo, policyname as nombre, cmd, qual as using_expr, with_check
  from pg_policies where schemaname = 'public' and tablename = 'perfiles'
union all
select 'trigger', tgname, null, pg_get_triggerdef(oid), null
  from pg_trigger where tgrelid = 'public.perfiles'::regclass and not tgisinternal;

-- 3) Columnas de perfiles, empresas, roles e invitaciones.
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name in ('perfiles', 'empresas', 'roles', 'invitaciones')
 order by table_name, ordinal_position;

-- 4) Restricciones de auditoria_log (la función de cambio de empresa deja una fila ahí).
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint where conrelid = 'public.auditoria_log'::regclass;

-- 5) ¿Cuántas empresas y personas hay? (para saber qué cubre el respaldo inicial)
select (select count(*) from empresas) as empresas,
       (select count(*) from perfiles) as perfiles,
       (select count(*) from perfiles where activo is not true) as perfiles_inactivos;
