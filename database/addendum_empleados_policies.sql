-- ============================================================
--  CONTATECK · addendum_empleados_policies.sql
--  Nómina — Parte A (OT-0017)
--  Ejecutar DESPUÉS de addendum_empleados.sql
--
--  Ajuste de roles aprobado:
--    - Ver:              rh, admin, director, contador, auditor
--                         (auditor ve fila, pero el BACKEND le
--                         oculta columnas sensibles — ver
--                         supabaseEmpleados.js. RLS no filtra
--                         columnas, solo filas; el detalle fino
--                         de "qué columnas" vive en el backend,
--                         mismo patrón que ya usamos en Ventas).
--    - Alta/editar/baja: rh, admin, director  (contador YA NO
--                         puede escribir — antes sí podía)
-- ============================================================

drop policy if exists "empleados_select_roles_contables" on empleados;
drop policy if exists "empleados_write_roles_contables" on empleados;
drop policy if exists "empleados_update_roles_contables" on empleados;

create policy "empleados_select_rh_y_contables"
  on empleados for select
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('rh', 'admin', 'director', 'contador', 'auditor')
  );

create policy "empleados_write_rh_y_direccion"
  on empleados for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('rh', 'admin', 'director')
  );

create policy "empleados_update_rh_y_direccion"
  on empleados for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('rh', 'admin', 'director')
  );

-- ============================================================
--  Fin de addendum_empleados_policies.sql
-- ============================================================
