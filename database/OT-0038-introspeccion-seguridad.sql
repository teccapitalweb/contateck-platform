-- ============================================================
--  CONTATECK · OT-0038 · Fase 2 · Comprobación de los hallazgos 1 a 3 (SOLO LECTURA)
--
--  Una consulta, una celda de JSON. No cambia nada.
--  Responde:
--    1) ¿Hay triggers en perfiles / empresas / invitaciones que impidan cambiar rol_id, empresa_id o activo?
--    2) ¿Qué columnas de perfiles puede actualizar un usuario con sesión (permiso por columna)?
--    3) ¿Qué columnas de empresas puede leer un usuario con sesión (¿se ven las csd_*?)?
--    4) ¿Las funciones de folio y periodo comprueban la empresa del usuario? (se pasa el cuerpo de cada una)
--  Solo se devuelven NOMBRES de columnas y true/false: ningún valor de la base (ni llaves ni contraseñas).
-- ============================================================
select jsonb_pretty(jsonb_build_object(
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'trigger', t.tgname, 'definicion', pg_get_triggerdef(t.oid))
                             order by c.relname, t.tgname), '[]'::jsonb)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('perfiles', 'empresas', 'invitaciones') and not t.tgisinternal
  ),
  'authenticated_actualiza_perfiles', (
    select jsonb_object_agg(a.attname, has_column_privilege('authenticated', 'public.perfiles', a.attname, 'update'))
      from pg_attribute a
     where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
  ),
  'authenticated_lee_empresas', (
    select jsonb_object_agg(a.attname, has_column_privilege('authenticated', 'public.empresas', a.attname, 'select'))
      from pg_attribute a
     where a.attrelid = 'public.empresas'::regclass and a.attnum > 0 and not a.attisdropped
  ),
  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object('nombre', p.proname, 'definicion', pg_get_functiondef(p.oid)) order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('siguiente_folio_pago', 'siguiente_folio_pago_proveedor', 'periodo_esta_cerrado', 'auth_empresa_id', 'auth_rol')
  )
)) as introspeccion_seguridad;
