-- ============================================================
--  CONTATECK · seed_demo_ot0007.sql
--  OT-0007 · Fase B — Datos DEMO adicionales para probar
--  aislamiento de clientes/productos entre empresas.
--  Ejecutar en Supabase DEV, con tu rol normal (postgres).
--
--  La empresa 0001 ya tiene un cliente/producto de seed.sql
--  original — aquí se agregan a las empresas 0002 y 0003 para
--  poder comparar "cada empresa ve solo lo suyo".
-- ============================================================

insert into clientes (empresa_id, nombre, rfc, email, uso_cfdi, cp, regimen) values
  ('00000000-0000-0000-0000-000000000002', 'Cliente Demo B', 'DEMB010101AB1', 'clienteb@demo.mx', 'G03', '72000', '601'),
  ('00000000-0000-0000-0000-000000000003', 'Cliente Demo C', 'DEMC020202CD2', 'clientec@demo.mx', 'G03', '72500', '601');

insert into productos (empresa_id, descripcion, clave_prod_serv, clave_unidad, precio_unitario) values
  ('00000000-0000-0000-0000-000000000002', 'Servicio Demo B', '84111506', 'E48', 1500.00),
  ('00000000-0000-0000-0000-000000000003', 'Servicio Demo C', '84111506', 'E48', 2000.00);

-- ============================================================
--  Fin de seed_demo_ot0007.sql
-- ============================================================
