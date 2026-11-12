-- ============================================================
--  CONTATECK · OT-0038 · DESHACER el endurecimiento de seguridad
--  *** MODIFICA LA BASE. Solo si OT-0038-endurecimiento-seguridad.sql causó un problema.
--  Devuelve la base al estado en que estaba el 2026-11-12 (cuerpos tomados de la introspección de DEV).
--  OJO: deshacer vuelve a abrir los huecos (escalada de privilegios en perfiles, CSD legible, folios de otras empresas).
-- ============================================================
begin;

drop trigger if exists perfiles_proteger_campos on public.perfiles;
drop function if exists public.perfiles_proteger_campos();
drop trigger if exists invitaciones_proteger_rol on public.invitaciones;
drop function if exists public.invitaciones_proteger_rol();

-- empresas: vuelve la lectura de todas las columnas (como estaba)
grant select on public.empresas to anon, authenticated;

-- funciones: cuerpos originales, sin la comprobación de empresa
create or replace function public.siguiente_folio_pago(p_empresa_id uuid)
returns text language plpgsql security definer set search_path = public
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

create or replace function public.siguiente_folio_pago_proveedor(p_empresa_id uuid)
returns text language plpgsql security definer set search_path = public
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

create or replace function public.periodo_esta_cerrado(p_empresa_id uuid, p_fecha date)
returns boolean language sql security definer set search_path = public
as $$
  select coalesce(
    (select estado = 'cerrado' from periodos_contables
      where empresa_id = p_empresa_id
        and anio = extract(year from p_fecha)::int
        and mes  = extract(month from p_fecha)::int),
    false  -- sin registro = abierto
  );
$$;

-- anon vuelve a poder ejecutar (como estaba)
grant execute on function public.siguiente_folio(uuid, text)                                              to public, anon;
grant execute on function public.siguiente_folio_pago(uuid)                                               to public, anon;
grant execute on function public.siguiente_folio_pago_proveedor(uuid)                                     to public, anon;
grant execute on function public.periodo_esta_cerrado(uuid, date)                                         to public, anon;
grant execute on function public.crear_poliza_completa(text, date, text, jsonb, text, text)               to public, anon;
grant execute on function public.actualizar_poliza_completa(uuid, text, date, text, jsonb)                to public, anon;
grant execute on function public.anular_poliza_duplicada(uuid, text)                                      to public, anon;
grant execute on function public.corregir_poliza_con_ajuste(uuid, text, jsonb)                            to public, anon;
grant execute on function public.cerrar_periodo(integer, integer)                                         to public, anon;
grant execute on function public.confirmar_pago_cliente(uuid)                                             to public, anon;
grant execute on function public.confirmar_pago_proveedor(uuid)                                           to public, anon;
grant execute on function public.registrar_pago_cliente(uuid, numeric, date, text, uuid, text, text, text)   to public, anon;
grant execute on function public.registrar_pago_proveedor(uuid, numeric, date, text, uuid, text, text, text) to public, anon;
grant execute on function public.crear_nomina(text, date, date, integer, jsonb)                           to public, anon;

commit;
