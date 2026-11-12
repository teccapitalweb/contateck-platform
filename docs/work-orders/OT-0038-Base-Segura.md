# OT-0038 · Base segura (V1 demostrable en local)

**Rama:** `feature/OT-0038-base-segura` (desde `integracion-local`, 3edcdd7)
**Meta:** que la V1 local se pueda demostrar sin mezclar datos entre empresas, con el
esquema de DEV documentado en el repo y la autenticación endurecida. Producción queda fuera.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Datos del navegador por empresa (`localStorage`) | **Hecha** (esta entrega) |
| 2 | Prueba de aislamiento entre empresas en todas las tablas + consulta de introspección RLS (solo lectura) | **Preparada y probada con base falsa; falta ejecutarla contra DEV** (ver "Fase 2") |
| 3 | Exportar al repo lo que existe en DEV y no está en `database/` (tablas, políticas, funciones). Es documentación, no migración | Pendiente |
| 4 | Backend rechaza correos sin confirmar; "Confirm email" en Supabase; revocar `anon` en las funciones de confirmación (SQL, con aprobación) | Pendiente |

## Fase 1 · Datos del navegador por empresa

### Problema
El panel guardaba en el navegador (pólizas, folios, catálogo de cuentas, RFC, CFDI ya
contabilizados, perfiles de marca) con una clave igual para todas las empresas
(`contateck_polizas`, etc.). Dos empresas en el mismo navegador compartían esos datos: la
segunda veía las pólizas de la primera, y su logo en los PDF.

### Qué se hizo
- **`frontend/storage-empresa.js` (nuevo)** → `window.CTStorage`. Cada clave lleva el id de la
  empresa (`contateck_polizas:<empresa_id>`).
  - Mientras no se sabe la empresa (`auth-guard.js` la lee de forma asíncrona) **no se lee ni
    se escribe** en el navegador: se usa una memoria de la pestaña, que se descarta al saber la empresa.
  - Modo local puro (sin Supabase configurado): la empresa es `local`.
  - `limpiarCaches()` borra solo el respaldo del catálogo de cuentas; se llama al cerrar sesión.
    Las pólizas **no** se limpian al salir, porque podría haber pólizas locales que nunca llegaron a Postgres.
- **Datos que ya existían sin empresa:**
  - Pólizas, folios, cuentas y RFC se **apartan** en `contateck_legacy_<clave>`. Nadie los lee y no
    se borran (se pueden recuperar a mano). En modo local puro se adoptan como datos de `local`.
  - CFDI contabilizados (solo UUID) y perfiles de marca los **adopta la primera empresa** que los lea.
  - Si no hay espacio para apartar, el dato original se deja donde está (y de todos modos nadie lo lee).
- **`frontend/contabilidad.js`:** todas las lecturas y escrituras usan `CTStorage`. Si ese archivo
  no cargó, no se guarda nada en el navegador (antes que mezclar). `init()` vuelve a pintar cuando
  ya se conoce la empresa, aunque no haya cambios que sincronizar (si no, la primera pantalla vacía se quedaba así).
- **`frontend/data-firestore.js`:** perfiles de marca por empresa. La migración del prototipo
  antiguo (`contateck_empresa`) solo corre en modo local puro: con empresas reales no se sabe a
  cuál pertenecía.
- **`frontend/auth-guard.js`:** `limpiarCaches()` al cerrar sesión y al fallar la renovación del token.
- **`frontend/dashboard.html`:** carga `storage-empresa.js?v=2` **después** de `supabase-config.js`; `auth-guard.js` v6, `data-firestore.js` v14, `contabilidad.js` v20.
- **Dos fallos encontrados al probar en el navegador real, ya corregidos:**
  1. `storage-empresa.js` barría las claves viejas al cargar el archivo; en `dashboard.html` cargaba antes de
     `supabase-config.js`, creyó estar en modo local y mandó los datos viejos a `contateck_polizas:local` en vez de
     `contateck_legacy_*`. Ahora el barrido ocurre en el primer uso y el script va después de la configuración.
  2. Contabilidad dejaba de esperar las pólizas de Postgres a los 4 s. En el primer ingreso con otra empresa
     (cuenta contador de TEC CAPITAL Group) salió con 0 pólizas aunque Postgres tenía 1, y aparecía al recargar o al
     disparar el refresco. `auth-guard.js` espera a que respondan 9 llamadas y la más lenta tardó ~2.8 s en la
     recarga medida; la causa de la demora en el primer ingreso es probable pero no medida. La espera sube a 20 s
     (`esperarPolizasPostgres`), que con Postgres caído solo cuesta un temporizador más largo.

### Pruebas (sin red ni base)
`node backend/test-storage-empresa.js` → **13 pruebas, todas pasan** (unos 7 s):
- 9 del módulo solo (dos empresas, empresa desconocida, datos viejos apartados, sin espacio, configuración
  de Supabase que carga después, modo local, adopción única, `limpiarCaches`, `localStorage` bloqueado).
- 3 con **`contabilidad.js` completo** en un navegador simulado, cambiando de empresa: cada empresa
  ve solo sus pólizas, una póliza guardada en A no aparece en B, y sin empresa no se ve ninguna.
- 1 con tiempo real: pólizas que llegan a los 5 s se sincronizan (antes de subir la espera a 20 s fallaba: se
  comprobó que la prueba daba `[]` sin el arreglo).
- **Control:** la misma prueba contra el `contabilidad.js` de `integracion-local` falla
  (muestra `I-VIEJA`, la póliza sin empresa, en vez de la de A): la prueba sí detecta el problema.
- `node --check` de los archivos tocados (los módulos como `.mjs`).

### Verificado en el navegador real (visor, `localhost:5511`, 2026-11-12, backend local y Supabase DEV)
- **Empresa Demo C** (director): 13 pólizas en Contabilidad ("Pólizas registradas 13") y una sola clave
  `contateck_polizas:<id de Demo C>`. Sin errores en consola.
- **Datos sembrados a propósito:** una póliza vieja sin empresa pasó a `contateck_legacy_contateck_polizas` y no se
  ve; una póliza guardada bajo otra empresa tampoco se ve. (Se borraron al terminar.)
- **Cambio a TEC CAPITAL Group (DEV)** (contador, otra sesión): no aparece ninguna de las 13 pólizas de Demo C;
  muestra la suya (`DEMO-D-00001`) y quedan dos claves separadas, una por empresa. Con la corrección de la espera, un
  navegador sin caché de esa empresa también la recibe en la primera carga.

### NO verificado
- Que el primer ingreso lento falle exactamente por los 4 s: no se reprodujo en el navegador (la recarga medida
  tardó ~2.8 s); la prueba con tiempo real sí lo reproduce en el simulador.
- Los perfiles de marca (logo y color) con sesión real: se probaron en el simulador, no en pantalla.
- Cuentas de SA de CV y Empresa de Prueba 2 (DEV): no hubo usuario con contraseña; solo se probó Demo C y TEC CAPITAL.

### Riesgos y decisiones
- Los datos viejos sin empresa quedan en `contateck_legacy_*` ocupando espacio del navegador. Si molestan, se pueden borrar a mano.
- El primero en abrir tras la actualización hereda los perfiles de marca y los CFDI contabilizados viejos del navegador.
- `contabilidad.js` también lo edita la sesión de SAT y Fiscal: las funciones de almacenamiento (líneas ~58 a 160) no deben tocarse en paralelo.
- Pendiente de decisión: el borrado de claves `contateck_legacy_*` tras unas semanas.

## Fase 2 · Aislamiento entre empresas en todas las tablas (solo lectura)

### Qué se hizo
- **`backend/test-aislamiento-empresas.js`:** con un solo inicio de sesión (una persona de DEV), compara por tabla lo que
  EXISTE de otras empresas (leído con la llave de servicio, sin RLS) contra lo que ESE usuario ve de otras empresas (con su
  sesión, bajo RLS). Debe ser 0 en todas. Cubre 27 tablas y vistas (incluye `poliza_partidas` y `nomina_detalle` por su
  tabla padre, `administradores_plataforma` como tabla cerrada, `cfdis_saldo` y `cfdis_proveedor_saldo`) y el bucket
  `documentos` de Storage. Resultado por tabla: `OK`, `SIN PRUEBA` (no hay filas de otras empresas: no concluye),
  `FUGA` o `ERROR`. Cuenta como fuga las filas sin `empresa_id` que el usuario pueda ver. **No escribe nada.**
- **`backend/test-aislamiento-logica.js`:** prueba esa lógica con una base falsa en memoria (7 pruebas): da OK con
  aislamiento correcto, y FUGA ante un hueco en una tabla con `empresa_id`, en una tabla hija, en la tabla cerrada,
  en filas sin empresa y en Storage; un error de consulta no se esconde.
- **`database/OT-0038-introspeccion-rls.sql`:** una consulta de solo lectura que devuelve en una celda de JSON las
  tablas con su RLS y permisos de `anon`, todas las políticas (también las de Storage), las funciones con
  `SECURITY DEFINER` y quién las ejecuta, los buckets y cuántos usuarios hay por empresa. Es lo que permite auditar
  las tablas cuyo SQL no está en el repo y alimenta la Fase 3. **No se ha ejecutado**: solo se revisó a mano.

### Censo de DEV (llave de servicio, solo lectura, 2026-11-12)
4 empresas. Filas por empresa (Empresa de Prueba 2 / Demo C / SA de CV / TEC CAPITAL): `polizas` 1/13/36/1,
`cfdis` 0/2/7/3, `pagos_proveedor` 0/12/3/0, `nominas` 0/0/7/0, `obligaciones_fiscales` 0/1/0/0, `declaraciones` 0/2/0/0,
`periodos_contables` 0/0/1/0. `documentos_fiscales` tiene 0 filas en total: **no se puede probar su aislamiento con
los datos actuales**. `administradores_plataforma` tiene 2 filas. Storage `documentos` tiene 2 carpetas de empresa.
Con una cuenta de TEC CAPITAL (o de Demo C) casi todas las tablas tienen filas ajenas con qué comparar.

### Resultado en DEV (2026-11-12, sesión de un usuario de Empresa Demo C, solo lectura)
**FUGA 0.** OK en 23 de 27 revisiones: `empresas`, `perfiles`, `invitaciones`, `cuentas_contables`, `configuracion_contable`,
`clientes`, `productos`, `empleados`, `polizas`, `poliza_partidas` (96 filas ajenas, 0 visibles), `cfdis`, `cfdis_saldo`,
`cfdis_proveedor`, `cfdis_proveedor_saldo`, `pagos_cliente`, `pagos_proveedor`, `ventas`, `nominas`, `nomina_detalle`,
`periodos_contables`, `folios_contador`, `auditoria_log` y el bucket `documentos` (1 carpeta ajena, 0 visible). En todas, el
usuario vio 0 filas de otras empresas.
- **SIN PRUEBA (3):** `obligaciones_fiscales`, `declaraciones` y `documentos_fiscales`. Demo C es la única empresa con
  `obligaciones_fiscales` y `declaraciones`, así que no hay filas ajenas con qué comparar: hay que correr la prueba con
  una cuenta de otra empresa (TEC CAPITAL). `documentos_fiscales` no tiene filas en DEV.
- **Un ERROR que era un fallo de la prueba:** `administradores_plataforma` salió "ERROR · [object Object]". La tabla está
  cerrada a propósito (RLS sin políticas y `revoke`), el usuario con sesión recibe "acceso denegado" y la consulta con
  `head` trae el mensaje vacío. La prueba lo tomaba por error y no imprimía el motivo. Ahora una tabla cerrada con
  acceso denegado cuenta como OK (con nota), un error real sigue siendo ERROR y nunca se imprime "[object Object]".
  La causa exacta del error no se vio en pantalla; se dedujo del diseño de esa tabla (OT-0037) y se cubrió con pruebas.

**Segunda corrida (misma sesión, con la corrección):** OK 24 · sin prueba 3 · FUGA 0 · error 0.
`administradores_plataforma` ahora sale `OK · acceso denegado a usuarios con sesión (correcto)` con 2 filas existentes: queda
confirmado contra DEV que la tabla cerrada se comporta como se diseñó en OT-0037.

### Introspección de RLS ejecutada en DEV (2026-11-12, solo lectura)
**Lo que está bien**
- Las 28 tablas de `public` tienen RLS activo; las dos vistas de saldo son `security_invoker=true`.
- Todas las políticas por empresa comparan `empresa_id = auth_empresa_id()` (o pasan por la tabla padre:
  `poliza_partidas` por `polizas`); 0 tablas con `empresa_id` sin RLS.
- `administradores_plataforma`: RLS sin políticas y sin permisos para `anon` ni `authenticated`. `folios_contador`, `pagos_*` y
  `auditoria_log` solo se escriben a través de funciones `SECURITY DEFINER`.
- Storage: bucket `documentos` privado, políticas por carpeta de empresa y carpeta `sat` restringida por rol.
- No hay políticas de `DELETE` sobre pólizas, CFDI, cuentas ni declaraciones.

**Confirmación (segunda introspección en DEV, 2026-11-12, solo lectura):** no hay triggers en `perfiles`, `empresas` ni
`invitaciones`; `authenticated` puede actualizar TODAS las columnas de `perfiles` (`rol_id`, `empresa_id`, `activo`,
`is_active`, `email`...) y puede leer `csd_cer_base64`, `csd_key_base64` y `csd_password` de `empresas`; y los cuerpos de
`siguiente_folio_pago`, `siguiente_folio_pago_proveedor` y `periodo_esta_cerrado` no comprueban la empresa. Es una
confirmación por lectura de políticas, permisos y código: **no se hizo ningún intento real de explotarlo** (el intento lo hace
`test-endurecimiento-seguridad.js`, que restaura lo que cambie). Un hallazgo más: como `perfiles_update_propio` no depende
de `auth_empresa_id()`, una persona dada de baja (`activo = false`) podría reactivarse a sí misma.

**Hallazgos (por orden de gravedad).**
1. **Escalada de privilegios en `perfiles` (alta).** `perfiles_update_propio` permite actualizar la propia fila con
   `with check (id = auth.uid())` y sin limitar columnas: con la API directa, cualquier usuario podría cambiarse `rol_id` (a
   director) o `empresa_id` (a otra empresa, cuyo UUID es adivinable). Además `perfiles_update_gestion_equipo` deja a RH
   actualizar el `rol_id` de cualquiera de su empresa. Las reglas de Equipo (OT-0034: RH no promueve a Director, no se
   cambia el propio rol, queda un director activo) están solo en `backend/src/supabaseEquipo.js`, que usa el token del usuario
   bajo esas mismas políticas. Lo mismo para `invitaciones_insert_gestion_equipo` (RH podría invitar con rol Director).
2. **CSD legible por cualquier usuario de la empresa (alta para producción).** `empresas_select_propia` es por fila y no por columna:
   `csd_cer_base64`, `csd_key_base64` y `csd_password` serían legibles con la API directa por cualquier rol de esa empresa
   (el backend sí elige columnas, pero eso no protege la API). Queda para la OT de emisor y CSD por empresa, junto con cifrarlos.
3. **`siguiente_folio`, `siguiente_folio_pago` y `siguiente_folio_pago_proveedor` (media).** Son `SECURITY DEFINER`, reciben
   `p_empresa_id` como parámetro, no comprueban que sea la empresa del usuario (código en el repo) y `anon` puede ejecutarlas
   (permiso por defecto): cualquiera puede adelantar el contador de folios de otra empresa. No filtra datos, pero rompe la
   continuidad de folios. `periodo_esta_cerrado(p_empresa_id, p_fecha)` tiene la misma forma y revela si un periodo de otra
   empresa está cerrado.
4. **Menores.** Todas las políticas son para el rol `public` en vez de `authenticated` (no abre nada porque `auth_empresa_id()` es
   nulo sin sesión). `anon` ejecuta todas las funciones. `crear_nomina` y `periodo_esta_cerrado` existen en DEV y ya se pueden documentar.

**Arreglo PREPARADO, NO APLICADO** (SQL de escritura: requiere aprobación; va en una transacción, es idempotente y tiene rollback):
`database/OT-0038-endurecimiento-seguridad.sql` y `database/OT-0038-endurecimiento-seguridad-rollback.sql`. Contenido:
trigger en `perfiles` (la empresa y el correo no cambian; nadie cambia su propio rol ni estado; solo Admin/Director cambian roles;
RH no toca a Admin/Director; siempre queda un director activo; la llave de servicio y el SQL Editor no se restringen);
trigger en `invitaciones` (RH no invita con rol Admin/Director); `revoke select` de `empresas` a `anon`/`authenticated` y `grant`
de las 13 columnas no secretas; las funciones de folio y `periodo_esta_cerrado` solo aceptan la empresa del usuario (o la llave
de servicio); `anon` y PUBLIC pierden `execute` en las 14 funciones de escritura (`authenticated` y `service_role` lo conservan
explícito; `auth_empresa_id()` y `auth_rol()` no se tocan porque las usan las políticas). **Pendiente:** el cuerpo real de
`siguiente_folio(uuid, text)` (folio de pólizas) no se ha exportado, así que solo se le quita `execute` a `anon`.
Verificación: `backend/test-endurecimiento-seguridad.js` (11 comprobaciones con una sesión real; antes del SQL debe dar FALLA,
después TODO OK) y su prueba de lógica `backend/test-endurecimiento-logica.js` (3 pruebas con base falsa, protegida y sin proteger, que
comprueban también que el perfil se restaura si un intento se llega a aplicar).

**Prueba ANTES del SQL (2026-11-12, cuenta de Empresa Demo C, rol director, DEV): 7 FALLAS, que es lo esperado sin el arreglo.**
Se aplicaron de verdad (y la prueba los restauró en el acto; el perfil quedó igual que al empezar): cambiarse el propio rol
(`2a`) y cambiarse el propio estado `activo` (`2c`). Las llaves del CSD se leyeron con la API directa (`1a`). Sin sesión
(`anon`) se ejecutó `confirmar_pago_cliente` y respondió desde dentro de la función (`4a`). `periodo_esta_cerrado` aceptó una
empresa inventada (`3c`). `siguiente_folio_pago` y `siguiente_folio_pago_proveedor` fallaron solo por la llave foránea de
`folios_contador` porque el id de empresa era inventado (`3a`, `3b`); con el id de una empresa real habrían avanzado su contador.
**Error de la prueba, corregido:** el intento de pasarse a otra empresa (`2b`) salió "rechazado" por la política de RLS, pero
solo porque la prueba usaba `.select()` (RETURNING), que exige que la fila nueva siga visible. Sin RETURNING, que es como
atacaría una persona, el cambio sí se aplicaría. La prueba ahora no usa `.select()`, y su prueba de lógica reproduce el caso
(con la versión anterior del script la misma prueba falla: "debía fallar 2b"). Ese intento todavía no se ha repetido contra DEV.

Esto sigue siendo la propuesta original; lo anterior es lo que quedó escrito:
**Arreglos propuestos (SQL de escritura: requieren aprobación y no se aplicaron).** Un `BEFORE UPDATE` en `perfiles` que, para
quien no sea el servicio, impida cambiar `empresa_id`, impida que alguien cambie su propio `rol_id` o `activo`, impida que RH
toque a Admin/Director y que quede una empresa sin director activo; revocar `select` de las columnas `csd_*` a `authenticated`
(o moverlas a una tabla aparte); validar `p_empresa_id = auth_empresa_id()` dentro de las funciones de folio; revocar `execute` a `anon`.

### Pruebas ejecutadas
- `node backend/test-aislamiento-logica.js` → 9 pruebas, todas pasan (incluye las dos de tabla cerrada).
- `node --check` de los dos scripts.

### NO verificado
- La prueba con una cuenta de otra empresa (TEC CAPITAL): cubriría `obligaciones_fiscales` y `declaraciones`.
- Triggers y permisos por columna de `perfiles` y `empresas`, y el cuerpo de las funciones de folio: de eso depende que los hallazgos 1 a 3 sean reales.
- Escrituras entre empresas (insertar, actualizar o borrar filas ajenas): la prueba no escribe; se audita con las políticas
  (insert y update de todas las tablas comprueban `empresa_id = auth_empresa_id()`, salvo `perfiles` y las funciones de folio).
- `documentos_fiscales`, sin filas en DEV.
