-- ============================================================
--  CONTATECK · OT-0020 · FIX 1 · Vista cfdis_saldo plana
--
--  Problema: el backend pedía los datos del CFDI anidados
--  (cfdis(folio, ...)) sobre la vista — pero las vistas no tienen
--  foreign keys, así que PostgREST no puede resolver esa relación
--  y la lista de facturas con saldo llegaba vacía al frontend.
--
--  Solución: la vista incluye directamente folio, cliente, fecha,
--  método de pago y estatus — consulta plana, sin anidación.
--
--  Ejecutar completo en el SQL Editor de Supabase (DEV primero).
--  Es seguro correrlo aunque ya exista la vista anterior.
-- ============================================================

drop view if exists cfdis_saldo;

create view cfdis_saldo as
select
  c.id as cfdi_id,
  c.empresa_id,
  c.folio,
  c.receptor_nombre,
  c.fecha,
  c.metodo_pago,
  c.estatus,
  c.total,
  coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as pagado,
  c.total - coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as saldo_pendiente
from cfdis c
left join pagos_cliente p on p.cfdi_id = c.id
group by c.id, c.empresa_id, c.folio, c.receptor_nombre, c.fecha,
         c.metodo_pago, c.estatus, c.total;

-- registrar_pago_cliente() lee saldo_pendiente de esta vista con el
-- mismo nombre de columna — no necesita cambios.

-- ============================================================
--  Validación después de correr esto:
--
--  select folio, receptor_nombre, metodo_pago, total, pagado,
--         saldo_pendiente
--  from cfdis_saldo where saldo_pendiente > 0
--  order by fecha desc limit 10;
--
--  Debe listar tus facturas CT vigentes con saldo = total
--  (todavía no tienen pagos confirmados).
-- ============================================================
