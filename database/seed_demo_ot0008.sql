-- ============================================================
--  CONTATECK · seed_demo_ot0008.sql
--  OT-0008 · Fase B — Datos DEMO para probar empleados/pólizas
--  Ejecutar en Supabase DEV, con tu rol normal (postgres).
-- ============================================================

-- Recordatorio: ya existe 1 empleado de prueba en la empresa 0001
-- (insertado durante OT-0006 Fase B, "Empleado de Prueba").
-- Aquí se agregan pólizas + un empleado a las empresas 0002 y 0003.

insert into empleados (empresa_id, nombre, puesto, sueldo, estado) values
  ('00000000-0000-0000-0000-000000000002', 'Empleado Demo B', 'Asistente', 9000.00, 'ok'),
  ('00000000-0000-0000-0000-000000000003', 'Empleado Demo C', 'Coordinador', 15000.00, 'ok');

insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado) values
  ('00000000-0000-0000-0000-000000000001', 'DEMO-D-00001', 'Diario', current_date, 'Póliza demo empresa 1', 5000.00, 'ok'),
  ('00000000-0000-0000-0000-000000000002', 'DEMO-D-00002', 'Ingreso', current_date, 'Póliza demo empresa 2', 7500.00, 'ok'),
  ('00000000-0000-0000-0000-000000000003', 'DEMO-D-00003', 'Egreso', current_date, 'Póliza demo empresa 3', 3200.00, 'ok');

-- ============================================================
--  Fin de seed_demo_ot0008.sql
-- ============================================================
