-- ============================================================
--  OT-0031c · Permiso de borrado en declaraciones (solo admin y director)
--
--  NO se ejecuta desde el código: hay que correrlo a mano en el SQL Editor
--  de Supabase (primero en contateck-dev). Es seguro repetirlo.
--
--  Para qué: el panel (SAT y Fiscal) ahora permite a admin y director ELIMINAR
--  una declaración capturada por error. Hoy la tabla `declaraciones` no tiene
--  política de DELETE, así que la base lo rechaza (el panel responde "falta el
--  permiso de borrado para tu rol").
--
--  Qué hace: agrega una política de DELETE con el mismo patrón que usa el resto
--  del esquema (p. ej. clientes_delete_admin_director en policies.sql):
--    · solo filas de la propia empresa,
--    · solo roles admin y director,
--    · y NUNCA una declaración ya presentada (defensa extra: el panel tampoco
--      la ofrece, pero así tampoco se puede borrar llamando a la API directo).
--  No toca datos existentes ni las políticas de lectura, alta y edición.
--
--  Reversa:   drop policy "declaraciones_delete_admin_director" on declaraciones;
-- ============================================================

drop policy if exists "declaraciones_delete_admin_director" on declaraciones;

create policy "declaraciones_delete_admin_director"
  on declaraciones for delete
  using (
    empresa_id = auth_empresa_id()
    and auth_rol() in ('admin', 'director')
    and estado <> 'presentada'
  );

-- Verificación (debe devolver 1 fila):
-- select policyname, cmd from pg_policies
--  where tablename = 'declaraciones' and policyname = 'declaraciones_delete_admin_director';
