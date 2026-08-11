-- ============================================================
--  CONTATECK · addendum_cfdis_fiscalapi_id.sql
--  OT-0011 · Se necesita guardar también el "id" interno que
--  regresa Fiscalapi (distinto del UUID del SAT) porque la
--  cancelación puede buscarse por cualquiera de los dos.
-- ============================================================

alter table cfdis add column if not exists fiscalapi_id text;
create index if not exists idx_cfdis_fiscalapi_id on cfdis (fiscalapi_id);

-- ============================================================
--  Fin de addendum_cfdis_fiscalapi_id.sql
-- ============================================================
