-- ============================================================
--  CONTATECK · OT-0019 · Folio real de CFDI + Método de Pago (PUE/PPD)
--
--  Corrige dos cosas encontradas al revisar Facturación:
--  1) La columna `folio` de `cfdis` quedaba siempre en null — el
--     backend leía data.folio/data.invoiceNumber, pero Fiscalapi en
--     realidad regresa el folio como series + consecutive (confirmado
--     contra datos reales: consecutive = 29,30,31... series = "CT").
--  2) El Método de Pago (PUE/PPD) del CFDI ni se guardaba — es
--     necesario para decidir si "Importar desde factura timbrada" en
--     Contabilidad puede tratarla como cobro directo (PUE) o si debe
--     bloquearse hasta definir el flujo de REP (PPD).
--
--  Ejecutar completo en el SQL Editor de Supabase — DEV primero.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas en `cfdis`
-- ------------------------------------------------------------
alter table cfdis add column if not exists metodo_pago text;
alter table cfdis add column if not exists forma_pago text;

-- ------------------------------------------------------------
-- 2. Backfill: los CFDIs que ya se timbraron con el bug tienen folio
--    null, pero el JSON completo de Fiscalapi quedó guardado en `raw`
--    — de ahí se puede reconstruir el folio real y capturar método/
--    forma de pago sin tener que volver a timbrar nada.
-- ------------------------------------------------------------
update cfdis
set
  folio = case
    when raw->>'series' is not null and raw->>'consecutive' is not null
      then (raw->>'series') || '-' || (raw->>'consecutive')
    else folio
  end,
  metodo_pago = coalesce(metodo_pago, raw->>'paymentMethodCode'),
  forma_pago  = coalesce(forma_pago, raw->>'paymentFormCode')
where raw is not null
  and (folio is null or metodo_pago is null or forma_pago is null);

-- ============================================================
--  Fin de OT-0019-folio-metodopago.sql
--
--  Validación rápida después de correr esto:
--
--  select folio, serie, metodo_pago, forma_pago from cfdis
--  order by created_at desc limit 10;
--
--  Debe verse folio = "CT-33", "CT-32", etc. (ya no null), y
--  metodo_pago = "PUE" o "PPD" en cada fila que antes lo tenía en raw.
-- ============================================================
