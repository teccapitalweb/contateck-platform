-- ============================================================
--  CONTATECK · OT-0038 · Endurecimiento 2: folio de pólizas (siguiente_folio)
--  *** MODIFICA LA BASE. Aplicar en DEV solo con aprobación, después de OT-0038-endurecimiento-seguridad.sql.
--
--  siguiente_folio(p_empresa_id, p_tipo_poliza) es SECURITY DEFINER y recibía la empresa como parámetro sin
--  comprobar que fuera la del usuario: cualquier persona con sesión podía adelantar el folio de pólizas de otra
--  empresa (en la primera ronda, además, anon podía ejecutarla; eso ya se quitó).
--  El cuerpo es EXACTAMENTE el de DEV (exportado el 2026-11-12) más la comprobación de empresa, igual que
--  siguiente_folio_pago. crear_poliza_completa la llama con la empresa del propio usuario, así que no cambia nada
--  para la aplicación.
-- ============================================================
begin;

create or replace function public.siguiente_folio(p_empresa_id uuid, p_tipo_poliza text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_letra  text;
  v_numero integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;

  v_letra := case p_tipo_poliza
    when 'Ingreso' then 'I'
    when 'Egreso'  then 'E'
    else 'D'
  end;

  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, v_letra, 1)
  on conflict (empresa_id, tipo)
    do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_letra || '-' || lpad(v_numero::text, 5, '0');
end;
$$;

commit;

-- ============================================================
--  Validación: backend/test-endurecimiento-seguridad.js (comprobación 3e) y, en la app, crear una póliza
--  (debe seguir recibiendo su folio I-/E-/D- normal).
--
--  Para deshacer (vuelve a la versión sin la comprobación):
--    begin;
--    create or replace function public.siguiente_folio(p_empresa_id uuid, p_tipo_poliza text)
--    returns text language plpgsql security definer set search_path = public
--    as $f$
--    declare v_letra text; v_numero integer;
--    begin
--      v_letra := case p_tipo_poliza when 'Ingreso' then 'I' when 'Egreso' then 'E' else 'D' end;
--      insert into folios_contador (empresa_id, tipo, ultimo_numero) values (p_empresa_id, v_letra, 1)
--      on conflict (empresa_id, tipo) do update set ultimo_numero = folios_contador.ultimo_numero + 1
--      returning ultimo_numero into v_numero;
--      return v_letra || '-' || lpad(v_numero::text, 5, '0');
--    end; $f$;
--    commit;
-- ============================================================
