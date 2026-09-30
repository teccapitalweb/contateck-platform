-- ============================================================
--  CONTATECK · OT-0023 · FIX 1 · Índice único de cfdis_proveedor
--
--  El índice tenía "where uuid_sat is not null" (parcial). Postgres
--  exige que ON CONFLICT coincida EXACTO con un índice, incluyendo
--  su condición — y supabase-js no puede mandar esa condición desde
--  el cliente. Resultado: el guardado de la factura tronaba en
--  silencio cada vez (la póliza de causación sí se creaba bien,
--  por eso no se notó de inmediato).
--
--  La condición parcial ni siquiera era necesaria: en Postgres, a
--  diferencia de MySQL, un NULL nunca choca contra otro NULL en un
--  índice único — varias filas con uuid_sat NULL ya conviven sin
--  problema en un índice único normal.
--
--  Ejecutar en el SQL Editor de Supabase.
-- ============================================================

drop index if exists idx_cfdis_proveedor_uuid_empresa;

create unique index idx_cfdis_proveedor_uuid_empresa
  on cfdis_proveedor (empresa_id, uuid_sat);

-- Validación: select folio, emisor_nombre, total from cfdis_proveedor;
-- (debe seguir vacía si la factura de prueba nunca se guardó — normal,
-- solo hace falta volver a importar el XML una vez aplicado el fix.)
