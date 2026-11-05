-- ============================================================
--  CONTATECK · OT-0029 · Consultas de SOLO LECTURA
--
--  Para el pendiente B4: documentar en el repo lo que hoy solo vive
--  en la base de DEV (tabla `ventas`, sus políticas RLS, las de
--  Storage, y las versiones reales de las funciones de póliza y de
--  periodos). NO modifica nada: son todos `select`.
--
--  Cómo usarlo: SQL Editor de Supabase (proyecto contateck-dev) →
--  correr cada bloque por separado y guardar/pegar los resultados
--  (sirven para completar database/OT-0029-ventas.sql, sección 4).
-- ============================================================

-- 1. Columnas reales de la tabla ventas
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ventas'
 order by ordinal_position;

-- 2. Restricciones (llaves, checks, únicos) de ventas
select conname, contype, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.ventas'::regclass;

-- 3. Índices de ventas (¿hay único por empresa+folio?)
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename = 'ventas';

-- 4. Políticas RLS de ventas
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'ventas';

-- 5. ¿RLS activo en ventas?
select relname, relrowsecurity, relforcerowsecurity
  from pg_class where oid = 'public.ventas'::regclass;

-- 6. Triggers de ventas
select tgname, pg_get_triggerdef(oid) as definicion
  from pg_trigger
 where tgrelid = 'public.ventas'::regclass and not tgisinternal;

-- 7. Políticas de Storage que tocan el bucket `documentos`
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects';

-- 8. Versión REAL de crear_poliza_completa (el repo solo tiene la de 4 parámetros)
select pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crear_poliza_completa';

-- 9. Columnas de polizas (origen, cfdi_uuid, ajustes…)
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'polizas' order by ordinal_position;

-- 10. Funciones de periodos / ajustes que el repo no tiene en database/
select p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('cerrar_periodo', 'abrir_periodo', 'corregir_poliza_con_ajuste', 'anular_poliza_duplicada', 'actualizar_poliza_completa');
