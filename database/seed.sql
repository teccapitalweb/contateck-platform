-- ============================================================
--  CONTATECK · seed.sql
--  OT-0003 · Ambiente: Supabase DEV únicamente
--  Ejecutar DESPUÉS de schema.sql y policies.sql
--
--  Nota importante: `perfiles.id` está encadenado a `auth.users.id`.
--  Este seed NO puede crear usuarios de Auth (eso se hace desde el
--  dashboard de Supabase o vía API de Auth, nunca por SQL directo).
--  Por eso aquí solo se siembra el catálogo de roles y una empresa
--  de prueba con su catálogo contable. Los perfiles de prueba se
--  crean a mano siguiendo las instrucciones de deployment.md.
-- ============================================================

-- ------------------------------------------------------------
--  Catálogo de roles (fijo, igual para todas las empresas)
-- ------------------------------------------------------------
insert into roles (nombre, descripcion) values
  ('director', 'Dirección general, acceso completo dentro de su empresa'),
  ('admin',    'Administración de la empresa, acceso completo dentro de su empresa'),
  ('contador', 'Operación contable y fiscal: CFDIs, pólizas, catálogo contable'),
  ('vendedor', 'Solo lectura de facturación y pólizas, sin acceso a nómina'),
  ('auditor',  'Solo lectura, incluida la bitácora de auditoría');

-- ------------------------------------------------------------
--  Empresa de prueba (para desarrollo, NO usar en producción)
-- ------------------------------------------------------------
insert into empresas (id, nombre, rfc, regimen_fiscal, cp, plan, status, timezone, currency, country)
values (
  '00000000-0000-0000-0000-000000000001',
  'TEC CAPITAL Group (DEV)',
  'TCG230118AB9',
  '601',
  '42501',
  'basico',
  'activo',
  'America/Mexico_City',
  'MXN',
  'MX'
);

-- ------------------------------------------------------------
--  Catálogo contable de prueba (mismo catálogo real visto en
--  data.js del frontend, para que las pantallas de prueba
--  tengan datos reconocibles)
-- ------------------------------------------------------------
insert into cuentas_contables (empresa_id, nivel, codigo, nombre, naturaleza) values
  ('00000000-0000-0000-0000-000000000001', 1, '100',  'Activo',                   'deudora'),
  ('00000000-0000-0000-0000-000000000001', 2, '1010', 'Caja',                     'deudora'),
  ('00000000-0000-0000-0000-000000000001', 2, '1020', 'Bancos',                   'deudora'),
  ('00000000-0000-0000-0000-000000000001', 2, '1050', 'Clientes',                 'deudora'),
  ('00000000-0000-0000-0000-000000000001', 2, '1080', 'IVA acreditable',          'deudora'),
  ('00000000-0000-0000-0000-000000000001', 1, '200',  'Pasivo',                   'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 2, '2010', 'Proveedores',              'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 2, '2030', 'IVA trasladado',           'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 2, '2040', 'Impuestos por pagar',      'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 1, '300',  'Capital contable',         'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 1, '400',  'Ingresos',                 'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 2, '4010', 'Ventas y servicios',       'acreedora'),
  ('00000000-0000-0000-0000-000000000001', 1, '600',  'Gastos',                   'deudora');

-- ------------------------------------------------------------
--  Cliente y producto de prueba (para probar un CFDI de punta a punta)
-- ------------------------------------------------------------
insert into clientes (id, empresa_id, nombre, rfc, email, uso_cfdi, cp, regimen) values
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-000000000001',
   'Cliente de Prueba SA de CV', 'EKU9003173C9', 'prueba@contateck.mx', 'G03', '42501', '601');

insert into productos (empresa_id, descripcion, clave_prod_serv, clave_unidad, precio_unitario) values
  ('00000000-0000-0000-0000-000000000001', 'Servicio de consultoría', '84111506', 'E48', 1000.00);

-- ============================================================
--  Fin de seed.sql
--
--  Pendiente manual (ver deployment.md):
--  1. Crear un usuario de prueba en Supabase Auth (dashboard o API).
--  2. Insertar su perfil:
--       insert into perfiles (id, empresa_id, rol_id, nombre, email)
--       values ('<uuid-del-usuario-de-auth>',
--               '00000000-0000-0000-0000-000000000001',
--               (select id from roles where nombre = 'director'),
--               'Usuario de prueba', 'prueba@contateck.mx');
--  3. Repetir con un segundo usuario en una SEGUNDA empresa de
--     prueba para validar que RLS aísla correctamente entre empresas.
-- ============================================================
