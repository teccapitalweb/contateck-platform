-- ============================================================
--  CONTATECK · OT-0047 · Políticas RLS de DEV que no tenían DDL en el repo (16)
--
--  *** DOCUMENTACIÓN. NO SE APLICA. NO ES UNA MIGRACIÓN. ***
--
--  Qué es: reescritura legible de las políticas que existen en la base de DEV (contateck-dev) y que solo
--  estaban nombradas en la introspección de la OT-0038. Salen de `pg_policies` (columnas qual / with_check),
--  leído por el MCP `supabase-dev` (solo lectura) el 2026-11-13. Ver docs/work-orders/OT-0047-Comparacion-Esquema-DEV.md.
--
--  Notas de fidelidad:
--   · Todas son PERMISSIVE y para el rol `public` (sin cláusula TO), igual que en DEV.
--   · Si una política de UPDATE no lleva WITH CHECK, Postgres usa la expresión USING también como WITH CHECK.
--   · Las expresiones son las que devuelve pg_policies; Postgres las normaliza (por ejemplo `= ANY (ARRAY[...])`
--     en lugar de `IN (...)`). Son equivalentes a las originales, pero no el texto original.
--   · Se usa `drop policy if exists` + `create policy` solo para que el archivo sea legible y repetible
--     en una base nueva; no se ha ejecutado en ninguna.
--   · RLS activo en estas tablas está confirmado en DEV (`alter table ... enable row level security` no se repite aquí).
--   · Otras políticas de estas tablas que ya estaban en el repo: `declaraciones_delete_admin_director` (OT-0031c).
-- ============================================================


-- ---- cfdis_proveedor (1) ----
drop policy if exists "cfdis_proveedor_update_empresa" on public.cfdis_proveedor;
create policy "cfdis_proveedor_update_empresa"
  on public.cfdis_proveedor for update
  using (empresa_id = auth_empresa_id())
  with check (empresa_id = auth_empresa_id());


-- ---- declaraciones (3) ----
drop policy if exists "declaraciones_select_roles_fiscales" on public.declaraciones;
create policy "declaraciones_select_roles_fiscales"
  on public.declaraciones for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director', 'auditor'])
  );

drop policy if exists "declaraciones_write_roles_fiscales" on public.declaraciones;
create policy "declaraciones_write_roles_fiscales"        -- (nombre "write", pero es solo INSERT)
  on public.declaraciones for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director'])
  );

drop policy if exists "declaraciones_update_roles_fiscales" on public.declaraciones;
create policy "declaraciones_update_roles_fiscales"
  on public.declaraciones for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director'])
  );


-- ---- documentos_fiscales (2) ----
drop policy if exists "documentos_fiscales_select_roles_fiscales" on public.documentos_fiscales;
create policy "documentos_fiscales_select_roles_fiscales"
  on public.documentos_fiscales for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director', 'auditor'])
  );

drop policy if exists "documentos_fiscales_write_roles_fiscales" on public.documentos_fiscales;
create policy "documentos_fiscales_write_roles_fiscales"  -- (solo INSERT; no hay UPDATE ni DELETE)
  on public.documentos_fiscales for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director'])
  );


-- ---- invitaciones (2) ----
drop policy if exists "invitaciones_select_gestion_equipo" on public.invitaciones;
create policy "invitaciones_select_gestion_equipo"
  on public.invitaciones for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director'])
  );

drop policy if exists "invitaciones_update_gestion_equipo" on public.invitaciones;
create policy "invitaciones_update_gestion_equipo"
  on public.invitaciones for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director'])
  );


-- ---- nominas (2) ----
drop policy if exists "nominas_select_empresa" on public.nominas;
create policy "nominas_select_empresa"
  on public.nominas for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director', 'contador', 'auditor'])
  );

drop policy if exists "nominas_insert_gestion" on public.nominas;
create policy "nominas_insert_gestion"
  on public.nominas for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director'])
  );


-- ---- nomina_detalle (2) ----
drop policy if exists "nomina_detalle_select_empresa" on public.nomina_detalle;
create policy "nomina_detalle_select_empresa"
  on public.nomina_detalle for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director', 'contador', 'auditor'])
  );

drop policy if exists "nomina_detalle_insert_gestion" on public.nomina_detalle;
create policy "nomina_detalle_insert_gestion"
  on public.nomina_detalle for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['rh', 'admin', 'director'])
  );


-- ---- obligaciones_fiscales (3) ----
drop policy if exists "obligaciones_select_roles_fiscales" on public.obligaciones_fiscales;
create policy "obligaciones_select_roles_fiscales"
  on public.obligaciones_fiscales for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['contador', 'admin', 'director', 'auditor'])
  );

drop policy if exists "obligaciones_write_admin_director" on public.obligaciones_fiscales;
create policy "obligaciones_write_admin_director"         -- (solo INSERT)
  on public.obligaciones_fiscales for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['admin', 'director'])
  );

drop policy if exists "obligaciones_update_admin_director" on public.obligaciones_fiscales;
create policy "obligaciones_update_admin_director"
  on public.obligaciones_fiscales for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() = any (array['admin', 'director'])
  );


-- ---- periodos_contables (1) ----
-- Única política de la tabla: no hay INSERT/UPDATE/DELETE; los periodos se escriben con `cerrar_periodo` (SECURITY DEFINER).
-- Usa subconsulta a perfiles en vez de auth_empresa_id() (equivalente; patrón distinto al resto).
drop policy if exists "periodos_contables_select" on public.periodos_contables;
create policy "periodos_contables_select"
  on public.periodos_contables for select
  using (
    empresa_id = (select perfiles.empresa_id from perfiles where perfiles.id = auth.uid())
  );
