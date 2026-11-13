# OT-0047 · Comparación del esquema real de DEV contra el repo

**Fecha:** 2026-11-13 · **Rama:** `integracion-local` · **Base:** Supabase `contateck-dev` (`ctwmrsgqczaqenxbnobd`)
**Cómo:** MCP `supabase-dev` (solo lectura). Solo se ejecutaron `SELECT` sobre `information_schema`, `pg_catalog`
y `storage`; **no se escribió nada en la base** y no se leyeron datos de negocio (solo un conteo de
`cuentas_contables`). Los resultados del MCP se trataron como datos; ninguna fila traía texto con órdenes.
**Contra qué:** `database/OT-0038-esquema-dev-exportado.sql` y `docs/work-orders/OT-0038-Base-Segura.md`
(más `OT-0031b` y `OT-0031c`, y búsqueda de los nombres de política en `database/` y `docs/`).

## Resumen

**No hay hallazgos graves.** El archivo exportado coincide con la base: columnas, tipos, nulos, defaults, restricciones,
índices y las 5 funciones cuadran en las 7 tablas que documenta. Las dos cosas aplicadas a mano (`codigo_agrupador` y la
política de DELETE de `declaraciones`) están en la base tal como las describen sus archivos SQL.
Lo más serio (gravedad **media**) es que `crear_nomina` sigue sin validar la empresa del empleado ni el cierre de periodo
(ya señalado en el archivo), y que **16 políticas RLS reales no tienen DDL en el repo** (solo existen en la base).
Nota: la tabla se llama `declaraciones` (no `declaraciones_fiscales`).

## Verificado (contra la base real)

- **28 tablas** en `public`, **todas con RLS activo**, y 2 vistas (`cfdis_saldo`, `cfdis_proveedor_saldo`) con
  `security_invoker=true`. 0 tablas sin RLS.
- Solo 2 tablas con RLS y **sin políticas** (cerradas a propósito): `administradores_plataforma` y `folios_contador`.
  `administradores_plataforma` además no da permisos a `anon` ni `authenticated`.
- **0 políticas `USING (true)`.** Todas las de empresa usan `empresa_id = auth_empresa_id()` (o pasan por la tabla padre:
  `poliza_partidas` → `polizas`). La única "abierta" es `roles_select_autenticados` (`auth.role() = 'authenticated'`):
  es el catálogo de roles, sin datos de empresa, aceptable.
- Storage: bucket `documentos` privado; 4 políticas (select/insert/update/delete) por carpeta de empresa, carpeta `sat`
  restringida por rol, borrado solo admin/director.
- **17 funciones `SECURITY DEFINER`** (+ `set_updated_at`, que no lo es). Todas con `search_path=public`.
  - 11 funciones de negocio validan rol con `auth_rol()` (`actualizar_poliza_completa`, `anular_poliza_duplicada`,
    `cerrar_periodo`, `confirmar_pago_*`, `corregir_poliza_con_ajuste`, `crear_nomina`, `crear_poliza_completa`,
    `registrar_pago_*`) y obtienen la empresa de `perfiles` por `auth.uid()`, no de un parámetro: la empresa queda
    validada por construcción (no usan `auth_empresa_id()` literal, pero leen `perfiles where id = auth.uid()`).
  - Las 4 con `p_empresa_id` (`siguiente_folio`, `siguiente_folio_pago`, `siguiente_folio_pago_proveedor`,
    `periodo_esta_cerrado`) **comparan con `auth_empresa_id()`** (endurecimiento OT-0038 fase 4 presente).
  - Triggers de protección `perfiles_proteger_campos` e `invitaciones_proteger_rol` presentes.
  - `anon` **no** puede ejecutar ninguna función de escritura; sí `auth_empresa_id`, `auth_rol` y las dos funciones de
    trigger (esperado: las usan las políticas; las de trigger no se pueden llamar directo).
- `authenticated` ya no puede leer `empresas.csd_password` (permiso por columna presente).
- **`cuentas_contables.codigo_agrupador`**: existe, `text`, nullable, sin default, con el comentario de `OT-0031b`.
  112 cuentas, **0 con código asignado** (esperado: aún no se carga la hoja de la contadora).
- **Política DELETE de `declaraciones`**: `declaraciones_delete_admin_director`, comando DELETE, expresión
  `empresa_id = auth_empresa_id() AND auth_rol() IN ('admin','director') AND estado <> 'presentada'`. Idéntica a `OT-0031c`.
  No existe política DELETE en pólizas, CFDI ni cuentas (como dice la OT-0038).
- Las 7 tablas del archivo exportado: columnas, tipos, nulos, defaults, PK/FK/UNIQUE/CHECK e índices **iguales** al archivo
  (incluido que `nominas` no tiene FK ni CHECK y que `invitaciones_pendiente_unica` es índice parcial).

## Tabla de diferencias

| # | Gravedad | Qué | En la base | En el repo | Propuesta |
|---|---|---|---|---|---|
| 1 | Media | `crear_nomina` no llama a `periodo_esta_cerrado`, no valida que `empleado_id` sea de la empresa, ni periodicidad/días/fechas/importes | Confirmado (el cuerpo no contiene `periodo_esta_cerrado`) | Ya listado como obs. f, g, h del archivo | OT aparte; ver SQL abajo |
| 2 | Media | 16 políticas RLS existen en la base sin DDL en el repo (solo nombradas en la introspección): `cfdis_proveedor_update_empresa`; las 3 de `declaraciones` (select/write/update); las 2 de `documentos_fiscales`; `invitaciones_select/update_gestion_equipo`; `nomina_detalle_insert/select`; `nominas_insert/select`; las 3 de `obligaciones_fiscales`; `periodos_contables_select` | Presentes | Sin `CREATE POLICY`; si hubiera que rehacer DEV no se pueden reproducir | Exportarlas como documentación (nuevo archivo, sin aplicar) |
| 3 | Baja | Archivo exportado dice que no se confirmó ningún trigger de `declaraciones` y `obligaciones_fiscales` | Existen `trg_declaraciones_updated_at` y `trg_obligaciones_updated_at` (BEFORE UPDATE → `set_updated_at`); también en `empleados` y `ventas` | Encabezado: "no está confirmado" | Actualizar el comentario del archivo |
| 4 | Baja | Todas las tablas dan DML completo a `anon` y `authenticated` por GRANT (valor por defecto de Supabase); lo único que protege es RLS. `periodos_contables`, `pagos_*`, `auditoria_log` y `folios_contador` no tienen política de escritura, así que la escritura directa queda negada | Confirmado | No documentado | Opcional: `revoke` de escritura a `anon` (defensa en profundidad) |
| 5 | Baja | Todas las políticas son para el rol `public`, no `authenticated` | Confirmado | Ya listado en OT-0038 (menores) | Sin riesgo mientras `auth_empresa_id()` sea nulo sin sesión |
| 6 | Baja | `periodos_contables_select` usa subconsulta a `perfiles` en vez de `auth_empresa_id()` (equivale, pero es otro patrón) | Confirmado | Sin DDL en el repo (ver #2) | Unificar al exportar |
| 7 | Baja | Sin CHECK en `estado`/`periodicidad`/`dia_limite`/`mes_limite`; sin FK de `empresa_id` en `nominas` y `nomina_detalle`; sin único (obligación, periodo) en `declaraciones`; sin único en `invitaciones.token` | Confirmado, igual que el archivo | Obs. a–d del archivo | Ya decidido que requiere OT |
| 8 | Informativa | La OT-0038 (Fase 2c) dice "no hay políticas de DELETE sobre … declaraciones" | Ahora sí existe (OT-0031c, posterior) | Texto desactualizado | Anotar la fecha en la OT-0038 |
| 9 | Informativa | `cuentas_contables.codigo_agrupador` y la política `declaraciones_delete_admin_director` aplicadas a mano | Presentes y correctas | `OT-0031b` / `OT-0031c` | Sin diferencia |

**Diferencias en tipos, defaults o columnas entre el archivo y la base: ninguna.**
**Cosas en la base y no en el archivo:** las políticas (#2) y los triggers (#3), que el archivo declara fuera de alcance.
**Cosas en el archivo y no en la base:** ninguna.

## SQL propuesto (solo texto, NO ejecutado)

```sql
-- #1 (idea; requiere OT y aprobación). Dentro de crear_nomina, antes del INSERT en nominas:
--   if periodo_esta_cerrado(v_empresa_id, p_fecha_fin) then
--     raise exception 'El periodo de la nómina está cerrado.';
--   end if;
--   y en el ciclo del detalle, para cada empleado_id no nulo:
--   if not exists (select 1 from empleados where id = nullif(v_item->>'empleado_id','')::uuid and empresa_id = v_empresa_id) then
--     raise exception 'Empleado no válido.';
--   end if;

-- #4 (defensa en profundidad, opcional): quitar a anon la escritura en tablas
-- revoke insert, update, delete, truncate on all tables in schema public from anon;
```

## NO verificado

- Cuerpo íntegro de las 5 funciones del archivo contra la base (se confirmó firma, `SECURITY DEFINER`, `search_path`,
  y por búsqueda de texto la presencia/ausencia de `auth_rol`, `auth_empresa_id` y `periodo_esta_cerrado`; no una
  comparación línea por línea).
- Tablas que el archivo exportado no cubre (las otras 21, de `schema.sql`, `policies.sql` y addenda): solo se comprobó RLS,
  columnas y políticas en la base; **no** se compararon columna por columna contra esos archivos del repo.
- Cuerpos de las funciones `SECURITY DEFINER` de pólizas, pagos y cierre más allá del chequeo de rol (lógica de negocio).
- Comportamiento real con sesiones (esta OT es de lectura de catálogo; no se ejecutó ninguna prueba de acceso).
- "Confirm email" de Supabase Auth (no es del esquema; el MCP no lo expone).
- Grants por columna distintos de `empresas.csd_password` y `perfiles.rol_id`.
