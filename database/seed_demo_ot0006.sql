-- ============================================================
--  CONTATECK · seed_demo_ot0006.sql
--  OT-0006 · Fase B — Datos DEMO (NO reales) para validar
--  empresas/perfiles de punta a punta.
--  Ejecutar en Supabase DEV, después de schema.sql/policies.sql/seed.sql.
--
--  Nombres genéricos a propósito ("Empresa Demo B/C") — no se usan
--  nombres de consultoras reales de IPCI, para no crear ninguna
--  confusión futura entre esto y la carga de datos reales (esa
--  será una OT aparte, como quedó acordado).
-- ============================================================

-- ------------------------------------------------------------
--  Empresa demo adicional (la "Empresa de Prueba 2" de OT-0003
--  ya cumple el papel de "Empresa Demo B" — no se duplica).
-- ------------------------------------------------------------
insert into empresas (id, nombre, rfc, regimen_fiscal, cp, plan, status, timezone, currency, country)
values (
  '00000000-0000-0000-0000-000000000003',
  'Empresa Demo C',
  'DEMO030303C03',
  '601',
  '72500',
  'basico',
  'activo',
  'America/Mexico_City',
  'MXN',
  'MX'
);

-- ============================================================
--  A partir de aquí, PENDIENTE MANUAL (no se puede hacer por SQL):
--  crear los usuarios de Auth en el dashboard de Supabase, uno por
--  fila de la tabla de abajo, y luego insertar su perfil con el
--  UUID real que Supabase les asigna.
-- ============================================================

-- Usuarios a crear en Authentication > Users:
--
--   correo                       empresa_id (usar el de la fila)          rol
--   -----------------------      ----------------------------------------  -----------
--   demo.contador@contateck.mx   00000000-0000-0000-0000-000000000001      contador
--   demo.vendedor@contateck.mx   00000000-0000-0000-0000-000000000001      vendedor
--   demo.director.c@contateck.mx 00000000-0000-0000-0000-000000000003      director
--
-- (prueba1@contateck.mx / empresa 0001 / director y
--  prueba2@contateck.mx / empresa 0002 / director ya existen de OT-0003
--  — no hace falta recrearlos.)

-- Plantilla para vincular cada uno (repetir 3 veces, con su UUID real):
--
-- insert into perfiles (id, empresa_id, rol_id, nombre, email)
-- values (
--   '<uuid-real-del-usuario>',
--   '00000000-0000-0000-0000-000000000001',  -- ajustar según la tabla de arriba
--   (select id from roles where nombre = 'contador'),  -- ajustar el rol
--   'Demo Contador',
--   'demo.contador@contateck.mx'
-- );

-- ============================================================
--  Fin de seed_demo_ot0006.sql
-- ============================================================
