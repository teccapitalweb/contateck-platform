-- ============================================================
--  CONTATECK · OT-0029 · Ventas y Pagos (pulido)
--
--  Ejecutar completo en el SQL Editor de Supabase — DEV primero.
--  Es IDEMPOTENTE: se puede correr más de una vez sin dañar nada.
--
--  Qué hace:
--    1. (Documentación) Deja en el repo la definición base de la tabla
--       `ventas`, que hasta hoy solo existía en la base de DEV. Con
--       `create table if not exists`, en DEV es un NO-OP.
--       ⚠ Las POLÍTICAS RLS y las de Storage NO se reconstruyen aquí:
--       hay que exportarlas de DEV con
--       database/OT-0029-ventas-introspeccion.sql y pegarlas en la
--       sección 4 de este archivo (ver OT-0029, pendiente B4).
--    2. Agrega a `ventas` la liga con su póliza contable (`poliza_id`)
--       y el motivo de rechazo (`motivo_rechazo`).
--    3. Liga las ventas YA confirmadas con la póliza que generaron
--       (por concepto 'Venta P-xxxx — …', solo si hay exactamente una).
--
--  Debe correrse ANTES de usar el código de la rama OT-0029 en una
--  base: sin las columnas el sistema sigue funcionando (el backend y
--  la pantalla lo toleran) pero no muestra liga con póliza ni guarda
--  motivos de rechazo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Definición base de `ventas` (reconstruida del código de
--    backend/src/supabaseVentas.js — contrastar con la de DEV).
-- ------------------------------------------------------------
create table if not exists ventas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id),
  folio           text not null,                 -- 'P-0001'
  cliente         text not null,
  concepto        text not null,
  consultora_id   uuid,                          -- sin uso en pantalla (reservado)
  importe         numeric(14,2) not null check (importe > 0),
  fecha_pago      date not null,
  metodo_pago     text,
  referencia      text,
  banco           text,
  vendedor_id     uuid references perfiles(id),  -- quien registró
  comprobante_path text,                         -- ruta en Storage (bucket documentos)
  notas           text,
  incluye_iva     boolean not null default true,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'revision', 'confirmado', 'rechazado')),
  created_by      uuid references perfiles(id),
  tomado_por      uuid references perfiles(id),
  tomado_en       timestamptz,
  revisado_por    uuid references perfiles(id),
  revisado_en     timestamptz,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. OT-0029 / B1 — póliza ligada y motivo de rechazo
-- ------------------------------------------------------------
alter table ventas add column if not exists poliza_id uuid references polizas(id);
alter table ventas add column if not exists motivo_rechazo text;

create index if not exists idx_ventas_poliza on ventas (poliza_id);
create index if not exists idx_ventas_empresa_estado on ventas (empresa_id, estado);

comment on column ventas.poliza_id is 'Póliza de Ingreso generada al confirmar. NULL en una venta confirmada = su póliza no se ha generado (la pantalla ofrece "Generar póliza").';
comment on column ventas.motivo_rechazo is 'Motivo capturado por quien rechazó el pago (obligatorio desde OT-0029).';

-- ------------------------------------------------------------
-- 3. Backfill: ventas confirmadas antes de OT-0029 ya tienen póliza
--    pero no la liga. Se liga solo si hay UNA póliza vigente de
--    origen 'ventas' con el concepto de esa venta (si hay 0 o 2+, no
--    se toca: la pantalla las mostrará "Sin póliza" para revisarlas).
-- ------------------------------------------------------------
update ventas v
   set poliza_id = (
         select p.id from polizas p
          where p.empresa_id = v.empresa_id
            and p.origen = 'ventas'
            and p.estado = 'ok'
            and p.concepto like 'Venta ' || v.folio || ' — %'
       )
 where v.estado = 'confirmado'
   and v.poliza_id is null
   and (
         select count(*) from polizas p
          where p.empresa_id = v.empresa_id
            and p.origen = 'ventas'
            and p.estado = 'ok'
            and p.concepto like 'Venta ' || v.folio || ' — %'
       ) = 1;

-- ------------------------------------------------------------
-- 4. PENDIENTE (B4): pegar aquí, tal cual salen de DEV, las políticas
--    RLS de `ventas` y las de Storage del bucket `documentos`
--    (resultado de database/OT-0029-ventas-introspeccion.sql).
-- ------------------------------------------------------------

-- ============================================================
--  Validación después de correr esto:
--
--  1) select column_name from information_schema.columns
--      where table_name = 'ventas' and column_name in ('poliza_id','motivo_rechazo');
--     → deben salir las 2.
--  2) Ventas confirmadas SIN póliza (las que la pantalla marca "Sin póliza"):
--       select folio, cliente, importe, fecha_pago from ventas
--        where estado = 'confirmado' and poliza_id is null;
--  3) Ventas confirmadas CON póliza y su folio:
--       select v.folio, p.folio as poliza from ventas v
--         join polizas p on p.id = v.poliza_id;
-- ============================================================
