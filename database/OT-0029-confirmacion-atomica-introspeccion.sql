-- ============================================================
--  CONTATECK · OT-0029 · Confirmación atómica de pagos
--  PASO 0 — SOLO LECTURA. No cambia nada. Correr en DEV ANTES de
--  OT-0029-confirmacion-atomica.sql.
--
--  Por qué: el archivo de cambio reemplaza por completo las funciones
--  confirmar_pago_cliente y confirmar_pago_proveedor. Está armado con las
--  versiones que hay en el repo (OT-0020 fix2 y OT-0023); si en DEV alguien
--  las modificó a mano, hay que ver las reales para no pisar ese cambio.
--  Pega aquí el resultado de la consulta 1 y se compara.
-- ============================================================

-- 1) Definición REAL de las dos funciones (una fila por función).
select p.proname as funcion, pg_get_functiondef(p.oid) as definicion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('confirmar_pago_cliente', 'confirmar_pago_proveedor');

-- 2) Las vistas de saldo: que existan y sean security_invoker.
--    (reloptions debe incluir security_invoker=true; sin eso la vista
--     brinca el RLS. Dentro de las funciones SECURITY DEFINER da igual,
--     porque ahí se filtra por empresa de forma explícita.)
select c.relname as vista, c.reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('cfdis_saldo', 'cfdis_proveedor_saldo');

-- 3) Que las tablas tengan empresa_id (el cambio filtra por ella).
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('cfdis', 'cfdis_proveedor', 'pagos_cliente', 'pagos_proveedor')
   and column_name in ('empresa_id', 'estado', 'estatus')
 order by table_name, column_name;

-- 4) Pagos ya "registrados" que hoy NO cabrían en el saldo de su factura
--    (los que la nueva regla bloqueará al confirmar). Útil para saber de
--    antemano qué pagos de prueba van a dar el aviso.
select 'cliente' as tipo, p.id as pago_id, p.monto, s.saldo_pendiente
  from pagos_cliente p
  join cfdis_saldo s on s.cfdi_id = p.cfdi_id
 where p.estado = 'registrado' and p.monto > s.saldo_pendiente
union all
select 'proveedor', p.id, p.monto, s.saldo_pendiente
  from pagos_proveedor p
  join cfdis_proveedor_saldo s on s.cfdi_proveedor_id = p.cfdi_proveedor_id
 where p.estado = 'registrado' and p.monto > s.saldo_pendiente;
