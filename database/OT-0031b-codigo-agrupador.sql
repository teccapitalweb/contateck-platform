-- ============================================================
--  OT-0031b · Código Agrupador SAT por cuenta contable
--
--  NO se ejecuta desde el código: hay que correrlo a mano en el SQL Editor
--  de Supabase (primero en contateck-dev). Es seguro repetirlo.
--
--  Para qué: el XML del Catálogo de cuentas (Contabilidad Electrónica 1.3)
--  exige, en cada cuenta, el código del Código Agrupador del SAT (p. ej.
--  102.01). Hoy el sistema manda el código interno de la cuenta, y el SAT
--  puede rechazarlo. La contadora llena una hoja (Contabilidad → SAT /
--  Declaraciones → "Hoja de cuentas para la contadora") y el panel la sube
--  con "Cargar códigos agrupador".
--
--  Qué hace: agrega una columna de texto, vacía por defecto. No toca datos
--  existentes ni políticas RLS (la política de UPDATE de cuentas_contables
--  que ya existe cubre la columna nueva).
-- ============================================================

alter table cuentas_contables
  add column if not exists codigo_agrupador text;

comment on column cuentas_contables.codigo_agrupador is
  'Código Agrupador del SAT (NNN o NNN.NN) para el XML de Contabilidad Electrónica; null = sin asignar.';

-- Verificación (debe devolver 1 fila):
-- select column_name from information_schema.columns
--  where table_name = 'cuentas_contables' and column_name = 'codigo_agrupador';
