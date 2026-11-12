# OT-0038 · Base segura (V1 demostrable en local)

**Rama:** `feature/OT-0038-base-segura` (desde `integracion-local`, 3edcdd7)
**Meta:** que la V1 local se pueda demostrar sin mezclar datos entre empresas, con el
esquema de DEV documentado en el repo y la autenticación endurecida. Producción queda fuera.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Datos del navegador por empresa (`localStorage`) | **Hecha** (esta entrega) |
| 2 | Prueba de aislamiento entre empresas en todas las tablas + consulta de introspección RLS (solo lectura) | Pendiente |
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
