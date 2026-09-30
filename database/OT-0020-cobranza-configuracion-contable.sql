-- ============================================================
--  CONTATECK · OT-0020 · Cobranza de facturas + Configuración
--  contable de la empresa (elimina las 7 cuentas quemadas en
--  el código: 102 Bancos, 105 Clientes, 201 Proveedores,
--  401 Ventas, 209 IVA trasladado, 118 IVA acreditable,
--  601 Gastos de operación).
--
--  Ejecutar completo en el SQL Editor de Supabase — DEV primero.
-- ============================================================

-- ------------------------------------------------------------
-- 1. configuracion_contable — una fila por empresa. Cada columna
--    apunta a la cuenta REAL de esa empresa para ese rol. Si está
--    en null, significa "todavía no configurado" — el sistema debe
--    bloquear la operación correspondiente, nunca adivinar.
-- ------------------------------------------------------------
create table configuracion_contable (
  empresa_id                uuid primary key references empresas(id),
  cuenta_bancos_id          uuid references cuentas_contables(id),
  cuenta_clientes_id        uuid references cuentas_contables(id),
  cuenta_proveedores_id     uuid references cuentas_contables(id),
  cuenta_ventas_id          uuid references cuentas_contables(id),
  cuenta_iva_trasladado_id  uuid references cuentas_contables(id),
  cuenta_iva_acreditable_id uuid references cuentas_contables(id),
  cuenta_gastos_id          uuid references cuentas_contables(id),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references perfiles(id)
);

alter table configuracion_contable enable row level security;

create policy "config_contable_select_empresa"
  on configuracion_contable for select
  using (empresa_id = auth_empresa_id());

create policy "config_contable_insert_roles_contables"
  on configuracion_contable for insert
  with check (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

create policy "config_contable_update_roles_contables"
  on configuracion_contable for update
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('contador', 'admin', 'director')
  );

-- ------------------------------------------------------------
-- 2. pagos_cliente — cobranza de una factura, con flujo de dos
--    pasos (registrado -> confirmado) y trazabilidad completa.
-- ------------------------------------------------------------
create table pagos_cliente (
  id                      uuid primary key default gen_random_uuid(),
  empresa_id              uuid not null references empresas(id),
  cfdi_id                 uuid not null references cfdis(id),
  poliza_id               uuid references polizas(id),

  monto                   numeric(14,2) not null check (monto > 0),
  fecha_pago              date not null,
  forma_pago              text,
  cuenta_destino_id       uuid not null references cuentas_contables(id),
  referencia              text,
  notas                   text,
  comprobante_url         text,

  estado                  text not null default 'registrado'
                          check (estado in ('registrado', 'confirmado', 'cancelado')),

  creado_por              uuid references perfiles(id),
  creado_en               timestamptz not null default now(),
  confirmado_por          uuid references perfiles(id),
  confirmado_en           timestamptz,

  complemento_pago_estado text not null default 'no_aplica'
                          check (complemento_pago_estado in ('no_aplica', 'pendiente', 'timbrado')),
  complemento_pago_uuid   text,

  created_at              timestamptz not null default now()
);

create index idx_pagos_cliente_cfdi     on pagos_cliente (cfdi_id);
create index idx_pagos_cliente_empresa  on pagos_cliente (empresa_id, estado);

alter table pagos_cliente enable row level security;

create policy "pagos_cliente_select_empresa"
  on pagos_cliente for select
  using (empresa_id = auth_empresa_id());

-- Sin policy de insert/update directa: TODO pasa por las funciones
-- SECURITY DEFINER de abajo, para garantizar el flujo de dos pasos,
-- la validación de saldo, y el registro en auditoria_log siempre
-- juntos — nunca una escritura suelta que se salte algo de eso.

-- ------------------------------------------------------------
-- 3. Vista: saldo pendiente por CFDI. Calculado, no guardado —
--    mismo principio que ya usan para el saldo de cuentas_contables.
-- ------------------------------------------------------------
create view cfdis_saldo as
select
  c.id as cfdi_id,
  c.empresa_id,
  c.total,
  coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as pagado,
  c.total - coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as saldo_pendiente
from cfdis c
left join pagos_cliente p on p.cfdi_id = c.id
group by c.id, c.empresa_id, c.total;

-- Las vistas heredan RLS de las tablas base en Postgres/Supabase
-- (security_invoker por default en versiones recientes) — igual se
-- confirma con una prueba cruzada entre 2 empresas antes de cerrar
-- la OT, mismo criterio que se usó para el resto del esquema.

-- ------------------------------------------------------------
-- 4. registrar_pago_cliente — Paso A. Valida saldo, crea el pago
--    en estado 'registrado' (SIN póliza todavía), escribe auditoria.
-- ------------------------------------------------------------
create or replace function registrar_pago_cliente(
  p_cfdi_id           uuid,
  p_monto             numeric,
  p_fecha_pago        date,
  p_forma_pago        text,
  p_cuenta_destino_id uuid,
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
  v_empresa_id     uuid;
  v_usuario_id     uuid;
  v_saldo          numeric(14,2);
  v_metodo_pago    text;
  v_pago_id        uuid;
  v_complemento    text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para registrar pagos.';
  end if;

  -- El CFDI debe ser de la misma empresa.
  select saldo_pendiente into v_saldo from cfdis_saldo
    where cfdi_id = p_cfdi_id and empresa_id = v_empresa_id;
  if v_saldo is null then
    raise exception 'Factura no encontrada o no pertenece a tu empresa.';
  end if;
  if v_saldo <= 0 then
    raise exception 'Esta factura ya está totalmente liquidada.';
  end if;
  if p_monto > v_saldo then
    raise exception 'El monto ($%) excede el saldo pendiente ($%).', p_monto, v_saldo;
  end if;

  select metodo_pago into v_metodo_pago from cfdis where id = p_cfdi_id;
  v_complemento := case when v_metodo_pago = 'PPD' then 'pendiente' else 'no_aplica' end;

  insert into pagos_cliente (
    empresa_id, cfdi_id, monto, fecha_pago, forma_pago, cuenta_destino_id,
    referencia, notas, comprobante_url, estado, creado_por, complemento_pago_estado
  ) values (
    v_empresa_id, p_cfdi_id, p_monto, p_fecha_pago, p_forma_pago, p_cuenta_destino_id,
    p_referencia, p_notas, p_comprobante_url, 'registrado', v_usuario_id, v_complemento
  ) returning id into v_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_cliente', v_pago_id, 'insert',
    jsonb_build_object('cfdi_id', p_cfdi_id, 'monto', p_monto, 'estado', 'registrado'),
    'contabilidad');

  return v_pago_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. confirmar_pago_cliente — Paso B. Genera la póliza real
--    (Debe: cuenta destino / Haber: Clientes, según configuración
--    de la empresa — NUNCA una cuenta adivinada), liga todo, y
--    deja registro en auditoria_log. Si algo falla, NADA se
--    marca como confirmado (transacción completa o ninguna).
-- ------------------------------------------------------------
create or replace function confirmar_pago_cliente(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id      uuid;
  v_usuario_id      uuid;
  v_pago            record;
  v_cuenta_clientes uuid;
  v_folio           text;
  v_poliza_id       uuid;
  v_cfdi_folio      text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para confirmar pagos.';
  end if;

  select * into v_pago from pagos_cliente
    where id = p_pago_id and empresa_id = v_empresa_id for update;
  if v_pago is null then
    raise exception 'Pago no encontrado o no pertenece a tu empresa.';
  end if;
  if v_pago.estado <> 'registrado' then
    raise exception 'Este pago ya fue % — no se puede confirmar de nuevo.', v_pago.estado;
  end if;

  -- La cuenta de Clientes SIEMPRE sale de configuracion_contable — si la
  -- empresa no la ha configurado, se detiene aquí en vez de adivinar.
  select cuenta_clientes_id into v_cuenta_clientes
    from configuracion_contable where empresa_id = v_empresa_id;
  if v_cuenta_clientes is null then
    raise exception 'La cuenta de Clientes no está configurada. Un contador debe configurarla en Configuración contable antes de poder confirmar pagos.';
  end if;

  select folio into v_cfdi_folio from cfdis where id = v_pago.cfdi_id;

  -- Folio de póliza: mismo generador atómico de OT-0012, sin duplicar
  -- la lógica de numeración aquí.
  v_folio := siguiente_folio(v_empresa_id, 'Ingreso');

  insert into polizas (empresa_id, folio, tipo, fecha, concepto, monto, estado, updated_at)
  values (v_empresa_id, v_folio, 'Ingreso', v_pago.fecha_pago,
    'Cobro CFDI ' || coalesce(v_cfdi_folio, '') || ' — pago ' || v_pago.id,
    v_pago.monto, 'ok', now())
  returning id into v_poliza_id;

  insert into poliza_partidas (poliza_id, cuenta_id, debe, haber, orden)
  values
    (v_poliza_id, v_pago.cuenta_destino_id, v_pago.monto, 0, 0),
    (v_poliza_id, v_cuenta_clientes,        0, v_pago.monto, 1);

  update pagos_cliente
    set estado = 'confirmado', poliza_id = v_poliza_id,
        confirmado_por = v_usuario_id, confirmado_en = now()
    where id = p_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_cliente', p_pago_id, 'update',
    jsonb_build_object('estado', 'confirmado', 'poliza_id', v_poliza_id, 'folio', v_folio),
    'contabilidad');

  return jsonb_build_object('id', p_pago_id, 'polizaId', v_poliza_id, 'folio', v_folio);
end;
$$;

-- ============================================================
--  Fin de OT-0020-cobranza-configuracion-contable.sql
--
--  Validación rápida después de correr esto:
--
--  1) select * from configuracion_contable;  → vacía, es esperado
--     (nadie la ha llenado todavía, ver paso de UI).
--  2) select * from cfdis_saldo order by saldo_pendiente desc limit 5;
--     → debe mostrar saldo_pendiente = total para CFDIs sin pagos.
--  3) Intentar confirmar un pago SIN haber configurado cuenta_clientes
--     debe fallar con el mensaje claro, no con un error genérico.
-- ============================================================
