-- ============================================================
--  CONTATECK · OT-0070 · `cfdis_proveedor`: solo contador, admin y director pueden crear o modificar facturas de proveedor
--
--  *** PREPARADO, NO APLICADO. Correrlo a mano en el SQL Editor de contateck-dev (primero DEV). ***
--  (El MCP `supabase-dev` es de solo lectura; este archivo no se ha ejecutado en ninguna base.)
--
--  Hallazgo (revisión de roles rh/vendedor, 26-nov-2026): las políticas de INSERT y UPDATE de `cfdis_proveedor` solo
--  piden que la fila sea de la empresa del usuario (`empresa_id = auth_empresa_id()`), SIN revisar el rol. Quien tenga
--  sesión (rh, vendedor o auditor) y hable directo con la API de la base podría crear o editar una factura de proveedor,
--  aunque la pantalla no se lo ofrezca. Las demás tablas contables ya limitan la escritura a contador, admin y director.
--
--  Qué cambia: las dos políticas de escritura exigen además `auth_rol() in ('contador','admin','director')`.
--  Qué NO cambia: la lectura (SELECT), el aislamiento por empresa ni las funciones SECURITY DEFINER
--  (`registrar_pago_proveedor`, `confirmar_pago_proveedor`), que ya validan el rol por dentro y siguen funcionando.
--  La app hoy solo LEE `cfdis_proveedor` (no hay ruta del backend que la escriba), así que no se espera ningún efecto visible.
--
--  Verificación posterior (solo lectura):
--    select policyname, cmd, coalesce(with_check, qual) from pg_policies
--     where schemaname = 'public' and tablename = 'cfdis_proveedor' order by cmd;
--    -- INSERT y UPDATE deben mostrar auth_rol() = ANY (ARRAY['contador','admin','director'])
--  Prueba sugerida con sesión real de rh en Demo C: un insert directo a /rest/v1/cfdis_proveedor debe responder 403/42501.
--
--  Reversa: volver a crear las dos políticas con solo `(empresa_id = auth_empresa_id())` (ver abajo, bloque "Reversa").
-- ============================================================

drop policy if exists cfdis_proveedor_insert_empresa on public.cfdis_proveedor;
create policy cfdis_proveedor_insert_empresa on public.cfdis_proveedor
  for insert
  with check (empresa_id = auth_empresa_id() and auth_rol() = any (array['contador', 'admin', 'director']));

drop policy if exists cfdis_proveedor_update_empresa on public.cfdis_proveedor;
create policy cfdis_proveedor_update_empresa on public.cfdis_proveedor
  for update
  using (empresa_id = auth_empresa_id() and auth_rol() = any (array['contador', 'admin', 'director']))
  with check (empresa_id = auth_empresa_id() and auth_rol() = any (array['contador', 'admin', 'director']));

-- Reversa (no ejecutar salvo que haga falta volver atrás):
--   drop policy cfdis_proveedor_insert_empresa on public.cfdis_proveedor;
--   create policy cfdis_proveedor_insert_empresa on public.cfdis_proveedor for insert with check (empresa_id = auth_empresa_id());
--   drop policy cfdis_proveedor_update_empresa on public.cfdis_proveedor;
--   create policy cfdis_proveedor_update_empresa on public.cfdis_proveedor for update
--     using (empresa_id = auth_empresa_id()) with check (empresa_id = auth_empresa_id());
