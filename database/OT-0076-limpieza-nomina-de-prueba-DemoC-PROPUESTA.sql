-- ============================================================
--  CONTATECK · OT-0076 · Limpieza de la nómina de prueba de Empresa Demo C (DEV)
--
--  *** PREPARADO, NO EJECUTADO. Correrlo a mano en el SQL Editor de contateck-dev. ***
--  (El MCP `supabase-dev` es de solo lectura; este archivo no se ha ejecutado en ninguna base.)
--
--  Qué limpia: lo que dejó la nómina de PRUEBA de noviembre de 2026 que se pagó y timbró para verificar el timbrado de nómina
--  (OT-0064). Se identificó en solo lectura el 26-nov-2026:
--    · póliza  E-00016  (Egreso, 2026-11-30, $22,759.73, origen 'nominas', 2 partidas)   id 29a21546-efb7-41ca-96a3-53471b111db0
--    · nómina  2026-11-01 a 2026-11-30, 2 renglones (1 con CFDI de prueba)                id 06317031-7b6f-4e1f-b635-ded8eb9654b4
--    · empleada de prueba "Karla Fuente Nolasco" (sin otros registros)                    id c60c1e1a-4b45-4f6d-b5e2-cb5a91b8ea20
--  Nada más referencia esa póliza (ni ventas, ni pagos, ni ajustes) y no hay disparadores que lo impidan.
--
--  Por qué existe: esa póliza deja el Balance de Demo C en negativo (Activo ≈ -23,184.30, resultado ≈ -22,673.52) y cambia las
--  cifras del Dashboard que se van a capturar para el informe. Antes de la nómina de prueba: Activo ≈ -424.57 y resultado ≈ 86.21.
--
--  DOS BLOQUES, en este orden. Cada uno es una sola transacción con candados: si algo no coincide con lo descrito arriba, se
--  detiene con un mensaje y NO borra nada.
--    BLOQUE 1 · quita solo la PÓLIZA y devuelve el Balance y el Dashboard a su estado anterior. Conserva la nómina y su timbre, por si
--               aún faltan capturas de Nómina (historial, recibos, UUID y XML).
--    BLOQUE 2 · (después de las capturas de Nómina) quita la nómina, sus renglones y a la empleada de prueba.
--
--  Qué NO toca: la bitácora de auditoría (se conserva a propósito), las cuentas y los datos de otras empresas, las cuentas de
--  acceso de prueba (rh, vendedor) y el CFDI de prueba que quedó en el proveedor de timbrado (no se cancela: es ambiente de pruebas).
--  Efecto en los folios: si E-00016 es el último folio de Egreso, el contador vuelve a 15 para no dejar un hueco.
--
--  Verificación posterior (solo lectura): al final de cada bloque.
-- ============================================================


-- ============================================================
--  BLOQUE 1 · Quitar la póliza E-00016
-- ============================================================
begin;

do $$
declare
  v_pol  constant uuid := '29a21546-efb7-41ca-96a3-53471b111db0';
  v_emp  uuid;
  v_nom  text;
  n      integer;
begin
  select p.empresa_id into v_emp from polizas p where p.id = v_pol;
  if v_emp is null then raise exception 'No existe la póliza %: ya se limpió o el id es otro.', v_pol; end if;
  select nombre into v_nom from empresas where id = v_emp;
  if v_nom is distinct from 'Empresa Demo C' then raise exception 'La póliza es de la empresa "%", no de Empresa Demo C. No se borra nada.', v_nom; end if;

  select count(*) into n from polizas where id = v_pol and folio = 'E-00016' and tipo = 'Egreso' and origen = 'nominas' and monto = 22759.73 and estado = 'ok';
  if n <> 1 then raise exception 'La póliza no coincide con lo esperado (folio, tipo, origen, monto o estado). No se borra nada.'; end if;

  select count(*) into n from poliza_partidas where poliza_id = v_pol;
  if n <> 2 then raise exception 'La póliza tiene % partidas y se esperaban 2. No se borra nada.', n; end if;

  if exists (select 1 from pagos_cliente   where poliza_id = v_pol)
  or exists (select 1 from pagos_proveedor where poliza_id = v_pol)
  or exists (select 1 from ventas          where poliza_id = v_pol)
  or exists (select 1 from polizas         where ajuste_de_id = v_pol) then
    raise exception 'Algo más referencia esta póliza (pago, venta o ajuste). No se borra nada.';
  end if;

  if periodo_esta_cerrado(v_emp, date '2026-11-30') then raise exception 'El periodo de noviembre de 2026 está cerrado. No se borra nada.'; end if;
end $$;

delete from poliza_partidas where poliza_id = '29a21546-efb7-41ca-96a3-53471b111db0';
delete from polizas         where id        = '29a21546-efb7-41ca-96a3-53471b111db0';

-- El folio de Egreso vuelve a 15 solo si E-00016 era el último y no quedó ningún E-00016 o mayor.
update folios_contador f
   set ultimo_numero = 15
 where f.tipo = 'E' and f.ultimo_numero = 16
   and f.empresa_id = (select id from empresas where nombre = 'Empresa Demo C')
   and not exists (select 1 from polizas p where p.empresa_id = f.empresa_id and p.folio ~ '^E-0*(1[6-9]|[2-9][0-9]|[1-9][0-9]{2,})$');

commit;

-- Verificación del bloque 1 (solo lectura):
--   select count(*) from polizas where origen = 'nominas' and concepto like 'Nómina mensual 2026-11-01%';   -- 0
--   select ultimo_numero from folios_contador where tipo = 'E' and empresa_id = (select id from empresas where nombre = 'Empresa Demo C');   -- 15
--   Y en el panel: Contabilidad → Balance de Demo C, Activo ≈ -424.57 y resultado ≈ 86.21.


-- ============================================================
--  BLOQUE 2 · (OPCIONAL, después de las capturas de Nómina) Quitar la nómina de prueba y a la empleada de prueba
-- ============================================================
begin;

do $$
declare
  v_nom  constant uuid := '06317031-7b6f-4e1f-b635-ded8eb9654b4';
  v_emp  uuid;
  v_nomb text;
  n      integer;
begin
  select empresa_id into v_emp from nominas where id = v_nom;
  if v_emp is null then raise exception 'No existe la nómina %: ya se limpió o el id es otro.', v_nom; end if;
  select nombre into v_nomb from empresas where id = v_emp;
  if v_nomb is distinct from 'Empresa Demo C' then raise exception 'La nómina es de la empresa "%", no de Empresa Demo C. No se borra nada.', v_nomb; end if;

  select count(*) into n from nominas where id = v_nom and fecha_inicio = date '2026-11-01' and fecha_fin = date '2026-11-30' and empleados_pagados = 2 and total_neto = 22759.73;
  if n <> 1 then raise exception 'La nómina no coincide con lo esperado (periodo, empleados o neto). No se borra nada.'; end if;

  select count(*) into n from nomina_detalle where nomina_id = v_nom;
  if n <> 2 then raise exception 'La nómina tiene % renglones y se esperaban 2. No se borra nada.', n; end if;

  -- La póliza debe haberse quitado antes (bloque 1): así el Balance no queda con un gasto sin su nómina.
  if exists (select 1 from polizas where id = '29a21546-efb7-41ca-96a3-53471b111db0') then
    raise exception 'La póliza E-00016 todavía existe: corre primero el BLOQUE 1.';
  end if;

  select count(*) into n from empleados where id = 'c60c1e1a-4b45-4f6d-b5e2-cb5a91b8ea20' and nombre = 'Karla Fuente Nolasco' and empresa_id = v_emp;
  if n <> 1 then raise exception 'No se encontró a la empleada de prueba como se esperaba. No se borra nada.'; end if;
end $$;

delete from nomina_detalle where nomina_id = '06317031-7b6f-4e1f-b635-ded8eb9654b4';
delete from nominas        where id        = '06317031-7b6f-4e1f-b635-ded8eb9654b4';

-- La empleada de prueba solo se borra si ya no la usa ningún renglón de nómina.
delete from empleados e
 where e.id = 'c60c1e1a-4b45-4f6d-b5e2-cb5a91b8ea20' and e.nombre = 'Karla Fuente Nolasco'
   and not exists (select 1 from nomina_detalle d where d.empleado_id = e.id);

commit;

-- Verificación del bloque 2 (solo lectura):
--   select count(*) from nominas where id = '06317031-7b6f-4e1f-b635-ded8eb9654b4';                  -- 0
--   select count(*) from empleados where nombre = 'Karla Fuente Nolasco';                              -- 0
--   Y en el panel: Nómina → historial vacío y "Nómina mensual estimada" de nuevo con un solo empleado activo.
