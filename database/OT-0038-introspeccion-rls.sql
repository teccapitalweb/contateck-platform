-- ============================================================
--  CONTATECK · OT-0038 · Fase 2 · Introspección de RLS (SOLO LECTURA)
--
--  Qué es: UNA consulta que no cambia nada y devuelve, en una sola celda de JSON, cómo está
--  protegida la base de DEV: qué tablas tienen RLS, qué políticas existen, qué funciones corren
--  con privilegios del dueño (SECURITY DEFINER) y quién puede ejecutarlas, y las políticas del
--  bucket de Storage.
--
--  Para qué: el repo no trae el SQL de varias tablas ni de sus políticas (invitaciones, nominas,
--  nomina_detalle, obligaciones_fiscales, declaraciones, documentos_fiscales, periodos_contables,
--  políticas de perfiles). Con este resultado se puede auditar el aislamiento entre empresas y,
--  en la Fase 3, dejarlo documentado en el repo.
--
--  Cómo usarla: pégala completa en el SQL Editor de Supabase (DEV), córrela, copia el contenido
--  de la única celda del resultado y pégalo en el chat. Es seguro correrla las veces que quieras.
--
--  Lo que revisa quien la lee (no lo hace la consulta):
--    · tablas con tiene_empresa_id = true y rls = false → cualquiera con sesión las lee (grave);
--    · políticas cuyo "using" no compare empresa_id con auth_empresa_id() ni pase por la tabla padre;
--    · tablas con rls = true y 0 políticas → nadie con sesión las ve (correcto en administradores_plataforma);
--    · funciones SECURITY DEFINER que no filtren por empresa dentro (se revisan una por una).
-- ============================================================
select jsonb_pretty(jsonb_build_object(
  -- 1) Cada tabla/vista de public: ¿tiene RLS?, ¿columna empresa_id?, ¿cuántas políticas?, permisos de anon.
  'tablas', (
    select coalesce(jsonb_agg(t order by t.tabla), '[]'::jsonb)
    from (
      select c.relname as tabla,
             case c.relkind when 'r' then 'tabla' when 'p' then 'tabla' when 'v' then 'vista' when 'm' then 'vista_materializada' end as tipo,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as rls_forzada,
             exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'empresa_id' and a.attnum > 0 and not a.attisdropped) as tiene_empresa_id,
             (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as n_politicas,
             c.reloptions as opciones,
             has_table_privilege('anon', c.oid, 'select') as anon_lee,
             has_table_privilege('anon', c.oid, 'insert,update,delete') as anon_escribe,
             has_table_privilege('authenticated', c.oid, 'insert,update,delete') as authenticated_escribe
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    ) t
  ),

  -- 2) Todas las políticas de public, con su condición.
  'politicas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabla', tablename, 'nombre', policyname, 'cmd', cmd, 'roles', roles,
             'using', qual, 'with_check', with_check) order by tablename, policyname), '[]'::jsonb)
      from pg_policies
     where schemaname = 'public'
  ),

  -- 3) Políticas de Storage (bucket "documentos" y cualquier otro).
  'politicas_storage', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nombre', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'with_check', with_check) order by policyname), '[]'::jsonb)
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  ),

  -- 4) Funciones de public: ¿corren con privilegios del dueño?, ¿quién puede ejecutarlas?
  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nombre', p.proname,
             'args', pg_get_function_identity_arguments(p.oid),
             'security_definer', p.prosecdef,
             'search_path', p.proconfig,
             'anon_ejecuta', has_function_privilege('anon', p.oid, 'execute'),
             'authenticated_ejecuta', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  ),

  -- 5) Buckets de Storage y si son públicos.
  'buckets', (
    select coalesce(jsonb_agg(jsonb_build_object('nombre', id, 'publico', public) order by id), '[]'::jsonb)
      from storage.buckets
  ),

  -- 6) Cuántas empresas y cuántos usuarios hay (para saber si la prueba de aislamiento tiene con qué comparar).
  'conteos', jsonb_build_object(
    'empresas', (select count(*) from empresas),
    'perfiles', (select count(*) from perfiles),
    'perfiles_por_empresa', (select coalesce(jsonb_object_agg(e.nombre, x.n), '{}'::jsonb)
                               from (select empresa_id, count(*) n from perfiles group by empresa_id) x
                               join empresas e on e.id = x.empresa_id)
  )
)) as introspeccion_rls;
