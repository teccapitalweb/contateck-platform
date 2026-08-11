-- ============================================================
--  CONTATECK · fix_cuentas_demo_bc.sql
--  Sembrar el catálogo de cuentas contables para "Empresa de
--  Prueba 2" (0002) y "Empresa Demo C" (0003) — solo la empresa
--  0001 lo tenía desde el seed.sql original de OT-0003.
--  Necesario para que crear_poliza_completa() pueda resolver
--  codigo -> cuenta_id en estas dos empresas.
-- ============================================================

insert into cuentas_contables (empresa_id, nivel, codigo, nombre, naturaleza) values
  -- Empresa 0002
  ('00000000-0000-0000-0000-000000000002', 1, '100',  'Activo',              'deudora'),
  ('00000000-0000-0000-0000-000000000002', 2, '101',  'Caja',                'deudora'),
  ('00000000-0000-0000-0000-000000000002', 2, '102',  'Bancos',              'deudora'),
  ('00000000-0000-0000-0000-000000000002', 2, '105',  'Clientes',            'deudora'),
  ('00000000-0000-0000-0000-000000000002', 2, '118',  'IVA acreditable',     'deudora'),
  ('00000000-0000-0000-0000-000000000002', 1, '200',  'Pasivo',              'acreedora'),
  ('00000000-0000-0000-0000-000000000002', 2, '201',  'Proveedores',         'acreedora'),
  ('00000000-0000-0000-0000-000000000002', 1, '300',  'Capital contable',    'acreedora'),
  ('00000000-0000-0000-0000-000000000002', 1, '400',  'Ingresos',            'acreedora'),
  ('00000000-0000-0000-0000-000000000002', 1, '600',  'Gastos',              'deudora'),
  ('00000000-0000-0000-0000-000000000002', 2, '601',  'Gastos de operación', 'deudora'),

  -- Empresa 0003 (Empresa Demo C)
  ('00000000-0000-0000-0000-000000000003', 1, '100',  'Activo',              'deudora'),
  ('00000000-0000-0000-0000-000000000003', 2, '101',  'Caja',                'deudora'),
  ('00000000-0000-0000-0000-000000000003', 2, '102',  'Bancos',              'deudora'),
  ('00000000-0000-0000-0000-000000000003', 2, '105',  'Clientes',            'deudora'),
  ('00000000-0000-0000-0000-000000000003', 2, '118',  'IVA acreditable',     'deudora'),
  ('00000000-0000-0000-0000-000000000003', 1, '200',  'Pasivo',              'acreedora'),
  ('00000000-0000-0000-0000-000000000003', 2, '201',  'Proveedores',         'acreedora'),
  ('00000000-0000-0000-0000-000000000003', 1, '300',  'Capital contable',    'acreedora'),
  ('00000000-0000-0000-0000-000000000003', 1, '400',  'Ingresos',            'acreedora'),
  ('00000000-0000-0000-0000-000000000003', 1, '600',  'Gastos',              'deudora'),
  ('00000000-0000-0000-0000-000000000003', 2, '601',  'Gastos de operación', 'deudora');

-- ============================================================
--  Fin de fix_cuentas_demo_bc.sql
-- ============================================================
