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

### Pruebas ejecutadas
- `node backend/test-aislamiento-logica.js` → 7 pruebas, todas pasan. `node --check` de los dos scripts.

### NO verificado
- La prueba contra DEV con una sesión real: falta que la persona corra `node test-aislamiento-empresas.js` (pide correo y contraseña).
- La consulta de introspección: no se ha ejecutado; su sintaxis solo se revisó a mano.
- Escrituras entre empresas (insertar, actualizar o borrar filas ajenas): la prueba no escribe; eso se audita leyendo las políticas.
- `documentos_fiscales`, sin filas en DEV.
