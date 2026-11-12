-- ============================================================
--  CONTATECK · OT-0038 · Fase 3 · Esquema de DEV que no está en el repo (SOLO LECTURA)
--
--  Una consulta, una celda de JSON. No cambia nada ni devuelve datos de filas: solo la estructura.
--  Sirve para escribir database/OT-0038-esquema-dev-exportado.sql (documentación, no migración) con lo que
--  existe en DEV y el repo no trae: columnas, restricciones e índices de invitaciones, nominas, nomina_detalle,
--  obligaciones_fiscales, declaraciones, documentos_fiscales y periodos_contables, y el cuerpo de crear_nomina,
--  periodo_esta_cerrado y las funciones de folio.
-- ============================================================
select jsonb_pretty(jsonb_build_object(
  'columnas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabla', table_name, 'columna', column_name, 'tipo', data_type, 'udt', udt_name,
             'nulo', is_nullable, 'default', column_default) order by table_name, ordinal_position), '[]'::jsonb)
      from information_schema.columns
     where table_schema = 'public'
       and table_name in ('invitaciones', 'nominas', 'nomina_detalle', 'obligaciones_fiscales', 'declaraciones',
                          'documentos_fiscales', 'periodos_contables')
  ),
  'restricciones', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabla', c.relname, 'nombre', k.conname, 'tipo', k.contype, 'definicion', pg_get_constraintdef(k.oid))
             order by c.relname, k.conname), '[]'::jsonb)
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('invitaciones', 'nominas', 'nomina_detalle', 'obligaciones_fiscales', 'declaraciones',
                         'documentos_fiscales', 'periodos_contables')
  ),
  'indices', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', tablename, 'definicion', indexdef) order by tablename, indexname), '[]'::jsonb)
      from pg_indexes
     where schemaname = 'public'
       and tablename in ('invitaciones', 'nominas', 'nomina_detalle', 'obligaciones_fiscales', 'declaraciones',
                         'documentos_fiscales', 'periodos_contables')
  ),
  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object('nombre', p.proname, 'definicion', pg_get_functiondef(p.oid)) order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('crear_nomina', 'periodo_esta_cerrado', 'siguiente_folio_pago', 'siguiente_folio_pago_proveedor', 'set_updated_at')
  )
)) as esquema_dev;
