-- ============================================================
--  CONTATECK · addendum_empleados.sql
--  Nómina — Parte A (OT-0017): estructura técnica real, SIN
--  cálculo de nómina (eso se define después con el responsable
--  contable — ver comentario en supabaseEmpleados.js).
-- ============================================================

alter table empleados add column if not exists departamento text;
alter table empleados add column if not exists fecha_ingreso date;

-- Datos sensibles (visibles solo para rh/admin/director/contador,
-- NUNCA para auditor — ver addendum_empleados_policies.sql y la
-- restricción de columnas en el backend).
alter table empleados add column if not exists rfc text;
alter table empleados add column if not exists curp text;
alter table empleados add column if not exists nss text;
alter table empleados add column if not exists cuenta_bancaria text;

-- Auditoría
alter table empleados add column if not exists created_by uuid references perfiles(id);
alter table empleados add column if not exists updated_at timestamptz not null default now();

-- Reutiliza el trigger genérico si ya existe (creado en OT-0014
-- para `ventas`); si no existe todavía, lo crea aquí.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_empleados_updated_at on empleados;
create trigger trg_empleados_updated_at
  before update on empleados
  for each row execute function set_updated_at();

-- ============================================================
--  Fin de addendum_empleados.sql
-- ============================================================
