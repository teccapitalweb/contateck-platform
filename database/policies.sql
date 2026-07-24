-- ============================================================
--  CONTATECK · policies.sql
--  OT-0003 · Ambiente: Supabase DEV únicamente
--  Ejecutar DESPUÉS de schema.sql
--  Basado en OT-0002 §9 (Estrategia de Row Level Security)
-- ============================================================

-- ------------------------------------------------------------
--  Funciones helper (se usan dentro de cada policy)
-- ------------------------------------------------------------

-- Devuelve la empresa del usuario autenticado actual.
create or replace function auth_empresa_id()
returns uuid
language sql
stable
as $$
  select empresa_id from perfiles where id = auth.uid()
$$;

-- Devuelve el nombre del rol del usuario autenticado actual.
create or replace function auth_rol()
returns text
language sql
stable
as $$
  select r.nombre
  from perfiles p
  join roles r on r.id = p.rol_id
  where p.id = auth.uid()
$$;

-- ------------------------------------------------------------
--  roles — catálogo de solo lectura para cualquier usuario autenticado
-- ------------------------------------------------------------
alter table roles enable row level security;

create policy "roles_select_autenticados"
  on roles for select
  using (auth.role() = 'authenticated');

-- Sin policies de insert/update/delete: solo el service role (backend) puede escribir.

-- ------------------------------------------------------------
--  empresas — cada usuario solo ve su propia empresa
-- ------------------------------------------------------------
alter table empresas enable row level security;

create policy "empresas_select_propia"
  on empresas for select
  using (id = auth_empresa_id());

-- Sin policies de insert/update/delete: alta y baja de empresas se maneja
-- desde el backend con service role, nunca desde el cliente.

-- ------------------------------------------------------------
--  perfiles — visibles dentro de la misma empresa; cada quien
--  edita solo su propio perfil (no su rol ni su empresa)
-- ------------------------------------------------------------
alter table perfiles enable row level security;

create policy "perfiles_select_empresa"
  on perfiles for select
  using (empresa_id = auth_empresa_id());

create policy "perfiles_update_propio"
  on perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Alta de perfiles (insert) se hace desde el backend con service role,
-- junto con la creación del usuario en auth.users.

-- ------------------------------------------------------------
--  cuentas_contables — lectura y escritura restringida a roles
--  con función contable
-- ------------------------------------------------------------
alter table cuentas_contables enable row level security;

create policy "cuentas_select_empresa"
  on cuentas_contables for select
  using (empresa_id = auth_empresa_id());

create policy "cuentas_write_roles_contables"
  on cuentas_contables for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "cuentas_update_roles_contables"
  on cuentas_contables for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ------------------------------------------------------------
--  clientes — lectura para toda la empresa, escritura restringida
-- ------------------------------------------------------------
alter table clientes enable row level security;

create policy "clientes_select_empresa"
  on clientes for select
  using (empresa_id = auth_empresa_id());

create policy "clientes_insert_roles_contables"
  on clientes for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "clientes_update_roles_contables"
  on clientes for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "clientes_delete_admin_director"
  on clientes for delete
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('admin', 'director')
  );

-- ------------------------------------------------------------
--  productos — mismo patrón que clientes
-- ------------------------------------------------------------
alter table productos enable row level security;

create policy "productos_select_empresa"
  on productos for select
  using (empresa_id = auth_empresa_id());

create policy "productos_insert_roles_contables"
  on productos for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "productos_update_roles_contables"
  on productos for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "productos_delete_admin_director"
  on productos for delete
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('admin', 'director')
  );

-- ------------------------------------------------------------
--  empleados — datos sensibles (nómina): fuera del alcance de
--  'vendedor', visible solo para roles contables/dirección
-- ------------------------------------------------------------
alter table empleados enable row level security;

create policy "empleados_select_roles_contables"
  on empleados for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "empleados_write_roles_contables"
  on empleados for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "empleados_update_roles_contables"
  on empleados for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ------------------------------------------------------------
--  polizas — lectura para toda la empresa (incluye vendedor,
--  según OT-0002 §9.2), escritura restringida
-- ------------------------------------------------------------
alter table polizas enable row level security;

create policy "polizas_select_empresa"
  on polizas for select
  using (empresa_id = auth_empresa_id());

create policy "polizas_insert_roles_contables"
  on polizas for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "polizas_update_roles_contables"
  on polizas for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ------------------------------------------------------------
--  cfdis — lectura para toda la empresa (incluye vendedor),
--  escritura restringida. Sin policy de delete: un CFDI nunca
--  se borra, solo se marca 'cancelado' vía update.
-- ------------------------------------------------------------
alter table cfdis enable row level security;

create policy "cfdis_select_empresa"
  on cfdis for select
  using (empresa_id = auth_empresa_id());

create policy "cfdis_insert_roles_contables"
  on cfdis for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "cfdis_update_roles_contables"
  on cfdis for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ------------------------------------------------------------
--  auditoria_log — de solo lectura para roles de dirección/
--  contabilidad; la escritura la hace siempre el backend con
--  service role (nunca el cliente), por eso no hay policy de
--  insert/update/delete.
-- ------------------------------------------------------------
alter table auditoria_log enable row level security;

create policy "auditoria_select_roles_altos"
  on auditoria_log for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ============================================================
--  Fin de policies.sql
-- ============================================================
