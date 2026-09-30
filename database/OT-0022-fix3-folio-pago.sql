-- ============================================================
--  CONTATECK · OT-0022 · FIX 3 · Folio corto de pago (P-00001)
--
--  Los pagos se identificaban solo por UUID — ilegible en un
--  comprobante impreso. Se agrega folio secuencial por empresa
--  (P-00001, P-00002...) reusando la MISMA tabla de contadores
--  atómicos de OT-0012 (folios_contador), con tipo 'Pago' — sin
--  tocar la función siguiente_folio() de pólizas.
--
--  Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

alter table pagos_cliente add column if not exists folio_pago text;

-- folios_contador guarda LETRAS ('I','E','D') y su check solo permitía
-- esas tres — se amplía para incluir 'P' (pagos), misma convención.
alter table folios_contador drop constraint if exists folios_contador_tipo_check;
alter table folios_contador add constraint folios_contador_tipo_check
  check (tipo in ('I', 'E', 'D', 'P'));

-- Contador atómico propio para pagos (misma mecánica que OT-0012).
create or replace function siguiente_folio_pago(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'P', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'P-' || lpad(v_numero::text, 5, '0');
end;
$$;

-- registrar_pago_cliente ahora asigna el folio al crear el pago.
-- (Se reemplaza la función completa; única diferencia: folio_pago.)
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
  v_folio_pago     text;
begin
  v_usuario_id := auth.uid();
  select empresa_id into v_empresa_id from perfiles where id = v_usuario_id;
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;
  if auth_rol() not in ('contador', 'admin', 'director') then
    raise exception 'No tienes permiso para registrar pagos.';
  end if;

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
  v_folio_pago := siguiente_folio_pago(v_empresa_id);

  insert into pagos_cliente (
    empresa_id, cfdi_id, monto, fecha_pago, forma_pago, cuenta_destino_id,
    referencia, notas, comprobante_url, estado, creado_por, complemento_pago_estado, folio_pago
  ) values (
    v_empresa_id, p_cfdi_id, p_monto, p_fecha_pago, p_forma_pago, p_cuenta_destino_id,
    p_referencia, p_notas, p_comprobante_url, 'registrado', v_usuario_id, v_complemento, v_folio_pago
  ) returning id into v_pago_id;

  insert into auditoria_log (empresa_id, usuario_id, tabla_afectada, registro_id, accion, detalle, modulo)
  values (v_empresa_id, v_usuario_id, 'pagos_cliente', v_pago_id, 'insert',
    jsonb_build_object('cfdi_id', p_cfdi_id, 'monto', p_monto, 'estado', 'registrado', 'folio_pago', v_folio_pago),
    'contabilidad');

  return v_pago_id;
end;
$$;

-- Backfill: folio para los pagos de prueba que ya existen (por orden
-- de creación, para que la numeración respete la cronología real).
do $$
declare r record;
begin
  for r in (select id, empresa_id from pagos_cliente where folio_pago is null order by creado_en asc) loop
    update pagos_cliente set folio_pago = siguiente_folio_pago(r.empresa_id) where id = r.id;
  end loop;
end $$;

-- ------------------------------------------------------------
--  FIX DE SEGURIDAD (aviso del linter de Supabase): la vista
--  cfdis_saldo corría con permisos de su creador (SECURITY
--  DEFINER implícito), lo que BRINCABA el RLS — un usuario
--  autenticado podía consultar saldos de otras empresas a través
--  de la vista. security_invoker = true hace que la vista aplique
--  el RLS del usuario que consulta, como debe ser.
-- ------------------------------------------------------------
alter view cfdis_saldo set (security_invoker = true);

-- Validación 1: select folio_pago, monto, estado from pagos_cliente order by creado_en;
-- Validación 2 (seguridad): con un usuario de OTRA empresa,
--   select * from cfdis_saldo;  → debe regresar SOLO sus facturas.
