-- ============================================================
--  CONTATECK · OT-0023 · Cuentas por Pagar (espejo de OT-0020)
--
--  Hoy "Importar XML recibido" lee la factura del proveedor, arma
--  la póliza de causación (Gastos+IVA acreditable / Proveedores) y
--  LA OLVIDA — no queda guardada como documento consultable. Sin
--  eso no hay de dónde sacar un saldo por pagar.
--
--  Esta migración agrega:
--  1) cfdis_proveedor — la factura persistida (como cfdis, pero del
--     lado de lo que te facturan a ti).
--  2) pagos_proveedor — el pago con el mismo flujo de dos pasos
--     (registrado → confirmado) y trazabilidad completa que ya usa
--     pagos_cliente.
--  3) Vista de saldo por pagar (calculada, no guardada).
--  4) registrar_pago_proveedor() / confirmar_pago_proveedor() —
--     mismas garantías: valida saldo, usa las cuentas de
--     configuracion_contable (nunca adivinadas), auditoria_log.
--
--  Ejecutar completo en el SQL Editor de Supabase (DEV primero).
-- ============================================================

-- ------------------------------------------------------------
-- 1. cfdis_proveedor
-- ------------------------------------------------------------
create table cfdis_proveedor (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id),
  usuario_id       uuid references perfiles(id),
  uuid_sat         text,
  serie            text,
  folio            text,
  metodo_pago      text,   -- 'PUE' | 'PPD', tal cual trae el XML
  forma_pago       text,
  total            numeric(14,2),
  subtotal         numeric(14,2),
  moneda           text not null default 'MXN',
  fecha            timestamptz,
  emisor_rfc       text,   -- snapshot legal del proveedor
  emisor_nombre    text,
  estatus          text not null default 'vigente',
  poliza_causacion_id uuid references polizas(id), -- la póliza que ya se genera al importar
  raw              jsonb,  -- XML/objeto parseado completo, igual que cfdis
  created_at       timestamptz not null default now()
);

create unique index idx_cfdis_proveedor_uuid_empresa
  on cfdis_proveedor (empresa_id, uuid_sat) where uuid_sat is not null;
-- Evita importar el mismo XML dos veces por accidente.

alter table cfdis_proveedor enable row level security;

create policy "cfdis_proveedor_select_empresa"
  on cfdis_proveedor for select
  using (empresa_id = auth_empresa_id());

create policy "cfdis_proveedor_insert_empresa"
  on cfdis_proveedor for insert
  with check (empresa_id = auth_empresa_id());

-- ------------------------------------------------------------
-- 2. pagos_proveedor — mismo patrón exacto que pagos_cliente,
--    con la dirección de dinero invertida (Bancos disminuye,
--    Proveedores disminuye).
-- ------------------------------------------------------------
create table pagos_proveedor (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas(id),
  cfdi_proveedor_id     uuid not null references cfdis_proveedor(id),
  poliza_id             uuid references polizas(id),

  monto                 numeric(14,2) not null check (monto > 0),
  fecha_pago            date not null,
  forma_pago            text,
  cuenta_origen_id       uuid not null references cuentas_contables(id), -- de dónde SALIÓ el dinero
  referencia            text,
  notas                 text,
  comprobante_url       text,

  estado                text not null default 'registrado'
                        check (estado in ('registrado', 'confirmado', 'cancelado')),

  creado_por            uuid references perfiles(id),
  creado_en             timestamptz not null default now(),
  confirmado_por        uuid references perfiles(id),
  confirmado_en         timestamptz,

  folio_pago            text, -- P-PROV-00001, contador atómico propio

  created_at            timestamptz not null default now()
);

create index idx_pagos_proveedor_cfdi    on pagos_proveedor (cfdi_proveedor_id);
create index idx_pagos_proveedor_empresa on pagos_proveedor (empresa_id, estado);

alter table pagos_proveedor enable row level security;

create policy "pagos_proveedor_select_empresa"
  on pagos_proveedor for select
  using (empresa_id = auth_empresa_id());

-- Sin policies de insert/update directas — igual que pagos_cliente,
-- todo pasa por las funciones de abajo.

-- ------------------------------------------------------------
-- 3. Vista de saldo por pagar — calculada, nunca guardada.
-- ------------------------------------------------------------
create view cfdis_proveedor_saldo as
select
  c.id as cfdi_proveedor_id,
  c.empresa_id,
  c.folio,
  c.serie,
  c.emisor_nombre,
  c.emisor_rfc,
  c.fecha,
  c.metodo_pago,
  c.estatus,
  c.total,
  coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as pagado,
  c.total - coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as saldo_pendiente
from cfdis_proveedor c
left join pagos_proveedor p on p.cfdi_proveedor_id = c.id
group by c.id, c.empresa_id, c.folio, c.serie, c.emisor_nombre, c.emisor_rfc,
         c.fecha, c.metodo_pago, c.estatus, c.total;

alter view cfdis_proveedor_saldo set (security_invoker = true);
-- Mismo fix de seguridad que se aplicó a cfdis_saldo (OT-0022 fix3):
-- sin esto, la vista brincaría el RLS y expondría saldos de otras
-- empresas a cualquier usuario autenticado.

-- ------------------------------------------------------------
-- 4. Contador de folio de pago a proveedor (letra propia, mismo
--    mecanismo atómico que ya usan pólizas y pagos de cliente).
-- ------------------------------------------------------------
alter table folios_contador drop constraint if exists folios_contador_tipo_check;
alter table folios_contador add constraint folios_contador_tipo_check
  check (tipo in ('I', 'E', 'D', 'P', 'PP'));

create or replace function siguiente_folio_pago_proveedor(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'PP', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'PP-' || lpad(v_numero::text, 5, '0');
end;
$$;

-- ------------------------------------------------------------
-- 5. registrar_pago_proveedor() — Paso A. Valida saldo, crea el
--    pago en 'registrado' (SIN póliza todavía), auditoria_log.
-- ------------------------------------------------------------
create or replace function registrar_pago_proveedor(
  p_cfdi_proveedor_id uuid,
  p_monto             numeric,
  p_fecha_pago        date,
  p_forma_pago        text,
  p_cuenta_origen_id  uuid,
  p_referencia        text,
  p_notas             text,
  p_comprobante_url   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id  uuid;
  v_usuario_id  uuid;
  v_saldo       numeric(14,2);
  v_pago_id     uuid;
  v_folio_pago  text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para registrar pagos a proveedores.';
  end if;

  select saldo_pendiente into v_saldo from cfdis_proveedor_saldo
    where cfdi_proveedor_id = p_cfdi_proveedor_id and empresa_id = v_empresa_id;
  if v_saldo is null then
    raise exception 'Factura de proveedor no encontrada o no pertenece a tu empresa.';
  end if;
  if v_saldo <= 0 then
    raise exception 'Esta factura ya está totalmente pagada.';
  end if;
  if p_monto > v_saldo then
    raise exception 'El monto ($%) excede el saldo pendiente ($%).', p_monto, v_saldo;
  end if;

  v_folio_pago := siguiente_folio_pago_proveedor(v_empresa_id);

  insert into pagos_proveedor (
    empresa_id, cfdi_proveedor_id, monto, fecha_pago, forma_pago, cuenta_origen_id,
    referencia, notas, comprobante_url, estado, creado_por, folio_pago
  ) values (
    v_empresa_id, p_cfdi_proveedor_id, p_monto, p_fecha_pago, p_forma_pago, p_cuenta_origen_id,
    p_referencia, p_notas, p_comprobante_url, 'registrado', v_usuario_id, v_folio_pago
  ) returning id into v_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_proveedor', v_pago_id, 'insert',
    jsonb_build_object('cfdi_proveedor_id', p_cfdi_proveedor_id, 'monto', p_monto, 'estado', 'registrado', 'folio_pago', v_folio_pago),
    'contabilidad');

  return v_pago_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. confirmar_pago_proveedor() — Paso B. Genera la póliza real:
--    Debe Proveedores (baja el pasivo) / Haber cuenta origen (baja
--    el banco). Exige cuenta_proveedores_id configurada.
-- ------------------------------------------------------------
create or replace function confirmar_pago_proveedor(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id        uuid;
  v_usuario_id        uuid;
  v_pago              record;
  v_cuenta_proveedores uuid;
  v_folio             text;
  v_poliza_id         uuid;
  v_prov_folio        text;
  v_prov_nombre       text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para confirmar pagos a proveedores.';
  end if;

  select * into v_pago from pagos_proveedor
    where id = p_pago_id and empresa_id = v_empresa_id for update;
  if v_pago is null then
    raise exception 'Pago no encontrado o no pertenece a tu empresa.';
  end if;
  if v_pago.estado <> 'registrado' then
    raise exception 'Este pago ya fue % — no se puede confirmar de nuevo.', v_pago.estado;
  end if;

  select cuenta_proveedores_id into v_cuenta_proveedores
    from configuracion_contable where empresa_id = v_empresa_id;
  if v_cuenta_proveedores is null then
    raise exception 'La cuenta de Proveedores no está configurada. Un contador debe configurarla en Configuración contable antes de poder confirmar pagos.';
  end if;

  select folio, emisor_nombre into v_prov_folio, v_prov_nombre
    from cfdis_proveedor where id = v_pago.cfdi_proveedor_id;

  v_folio := siguiente_folio(v_empresa_id, 'Egreso');

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, v_folio, 'Egreso', v_pago.fecha_pago,
    'Pago a proveedor ' || coalesce(v_prov_folio, 's/folio') || ' · ' || coalesce(v_prov_nombre, 'Proveedor'),
    v_pago.monto, 'ok', now())
  returning id into v_poliza_id;

  insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, orden)
  values
    (v_poliza_id, v_cuenta_proveedores,   v_pago.monto, 0, 0),
    (v_poliza_id, v_pago.cuenta_origen_id, 0, v_pago.monto, 1);

  update pagos_proveedor
    set estado = 'confirmado', poliza_id = v_poliza_id,
        confirmado_por = v_usuario_id, confirmado_en = now()
    where id = p_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_proveedor', p_pago_id, 'update',
    jsonb_build_object('estado', 'confirmado', 'poliza_id', v_poliza_id, 'folio', v_folio),
    'contabilidad');

  return jsonb_build_object('id', p_pago_id, 'polizaId', v_poliza_id, 'folio', v_folio);
end;
$$;

-- ============================================================
--  Validación después de correr esto:
--  1) select * from cfdis_proveedor;      -- vacía, es esperado
--  2) select * from cfdis_proveedor_saldo;
--  3) Importa un XML de proveedor de prueba desde la app y confirma
--     que aparece aquí con saldo = total.
-- ============================================================
