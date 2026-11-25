# OT-0056 · Multiempresa por usuario (cambiar de empresa)

**Rama:** `feature/OT-0056-multiempresa` (sale de `integracion-local` en `a4e31cc`). Solo local: sin push y **sin SQL aplicado en ninguna base**.

## 1. Por qué no se podía cambiar de empresa

- `perfiles` guarda **una sola** `empresa_id` y un solo `rol_id` por usuario, y **toda** la seguridad (RLS) pregunta "¿de qué empresa es este usuario?" con `auth_empresa_id()`, que lee `perfiles`.
- La OT-0006 dejó "un usuario → una empresa" como decisión, con el soporte de varias empresas "planificado para una fase posterior".
- El selector de empresa del panel estaba apagado (decía "Aún no puedes cambiar de empresa desde aquí") porque mostraba empresas de ejemplo.

## 2. Diseño (opción A: tabla de membresías + función `cambiar_empresa`)

No se toca ninguna política de las demás tablas: `perfiles` pasa a ser el **contexto activo** (la empresa donde la persona está trabajando ahora) y una tabla nueva dice a qué empresas puede entrar.

| Pieza | Qué hace |
|---|---|
| `usuario_empresas (user_id, empresa_id, rol_id, activo)` | Las empresas de cada persona, con su rol y su estado en cada una. Nadie la escribe desde el navegador: solo funciones de la base y el backend con llave de servicio. |
| Trigger `perfiles_sincronizar_membresia` | Copia a la membresía cada cambio de empresa/rol/activo del perfil. Así lo que ya se hace en Equipo (cambiar rol, dar de baja) sigue valiendo. |
| `cambiar_empresa(p_empresa_id)` | **Única vía** para mover el contexto activo, y solo hacia una membresía propia y activa. Deja una fila en `auditoria_log` (módulo `auth`). |
| `perfiles_proteger_campos()` (OT-0038) | Se conserva igual y se le agrega **una** excepción: aceptar el cambio de empresa/rol solo si lo hace `cambiar_empresa()` (bandera de la transacción) **y** el destino es una membresía activa de esa misma persona. Cambiar la empresa por cualquier otro camino sigue prohibido. |
| `mis_empresas()` | Lista para el selector. |
| `membresia_cambiar_estado(p_user, p_activo)` | Dar de baja / reactivar a alguien de **mi** empresa aunque hoy esté trabajando en otra. Mismas reglas que Equipo: solo RH/Admin/Director, nadie a sí mismo, RH no toca Admin/Director, siempre queda un director activo. Sin esto no se le podría quitar el acceso mientras no esté aquí. |
| Política `perfiles_select_membresia` | Nombres y correos de quienes pertenecen a mi empresa aunque hoy estén en otra (Ventas "registrado por", Equipo…). |

**Pestañas desactualizadas.** La empresa activa es una por usuario: si abres dos pestañas y cambias en una, la otra seguiría mostrando la empresa vieja mientras la base ya trabaja con la nueva. Por eso el panel manda la cabecera `X-Empresa-Id` en cada llamada al backend y, si no coincide con la empresa activa, el backend responde `409 EMPRESA_CAMBIO` y el panel muestra un aviso y se recarga. La cabecera solo se manda cuando `/api/perfil` responde `multiempresa: true` (un backend anterior rechazaría la cabecera nueva en el preflight de CORS, así que el panel y el backend se pueden desplegar en cualquier orden).

**Cómo se agrega a alguien a una segunda empresa.** Con la invitación normal de Equipo → Invitaciones al correo de esa persona. Si ya tiene cuenta, la verá en su selector de empresa ("Invitaciones") y la acepta ahí; el backend verifica que la invitación sea de su correo, esté vigente y no la haya usado. Nadie se agrega solo. *(Es un supuesto mío: las preguntas de quién usará esto y cómo se agrega a alguien quedaron sin responder; si debe ser de otra forma, p. ej. desde el panel de plataforma, se ajusta.)*

## 3. Archivos

- `database/OT-0056-multiempresa-introspeccion.sql` — **paso 0, solo lectura.** Exporta las definiciones reales de `auth_empresa_id`, `auth_rol` y `perfiles_proteger_campos`, las políticas y triggers de `perfiles`, las columnas y las restricciones de `auditoria_log`.
- `database/OT-0056-multiempresa.sql` — el cambio (idempotente, en una transacción).
- `database/OT-0056-multiempresa-rollback.sql` — lo revierte y deja la protección de OT-0038 como estaba.
- `database/OT-0056-prueba-sql-pglite.mjs` — prueba del SQL en un Postgres en memoria.
- `backend/src/supabaseEmpresas.js`, `backend/src/routes/empresas.js` — `GET /api/empresas`, `POST /api/empresas/cambiar`, `POST /api/empresas/invitaciones/:id/aceptar`.
- `backend/src/supabaseAuth.js` — aviso 409 de pestaña desactualizada (caché de 3 s); `backend/index.js` — ruta y CORS; `backend/src/routes/perfil.js` — `multiempresa: true`.
- `backend/src/supabaseEquipo.js` — la lista de Equipo sale de las membresías (aparece quien está en otra empresa, con `enOtraEmpresa`); baja/reactivación por `membresia_cambiar_estado`; el cambio de **rol** de alguien que está en otra empresa se rechaza con un mensaje claro. Si la base aún no tiene el SQL, todo funciona como antes.
- `backend/test-multiempresa.js` — prueba del backend contra un Supabase falso.
- `frontend/empresas-selector.js` (nuevo), `frontend/auth-guard.js` (cabecera + aviso), `frontend/app.js`, `frontend/invitaciones.js`, `frontend/dashboard.html` (versiones).

## 4. Cómo aplicarlo (solo cuando se apruebe; DEV primero)

1. Correr el **paso 0** y comparar la definición real de `perfiles_proteger_campos` con la copia de `OT-0056-multiempresa.sql` sección 3 (la función se **reemplaza completa**; si en DEV difiere de OT-0038, ajustar la copia antes). Revisar también las restricciones de `auditoria_log` (la fila de auditoría usa `modulo = 'auth'`; si la tabla la rechazara, el cambio de empresa igual se hace y solo se omite el rastro).
2. Correr `OT-0056-multiempresa.sql`.
3. Validación (al final del propio archivo): todas las personas con su membresía, los dos triggers y la política nueva.
4. Para probar con una segunda empresa antes de tener el flujo de invitaciones: insertar la membresía a mano (instrucción al final del SQL).

## 5. Pruebas hechas (sin tocar DEV)

- **SQL** (`OT-0056-prueba-sql-pglite.mjs`, 32 comprobaciones, todas bien): idempotente; cambiar de empresa mueve `auth_empresa_id()`/`auth_rol()` y la persona deja de ver a la gente de la otra; cambiar la empresa por la vía directa, con la bandera falsificada o hacia una empresa sin membresía, **falla**; no se puede subir el rol propio ni agregarse a una empresa; la baja de alguien que está en otra empresa funciona y le impide volver; RH no toca directores; nadie se da de baja a sí mismo; `anon` no ejecuta; el rollback deja la protección de OT-0038.
- **Backend** (`node test-multiempresa.js`, 15 comprobaciones, todas bien, contra un Supabase falso en localhost): lista de empresas e invitaciones solo del propio correo; aceptar una invitación de otro correo, repetida o con id inválido se rechaza; cambiar de empresa; aviso `409` con la cabecera de una empresa vieja (y `200` sin cabecera o con la actual); CORS permite `X-Empresa-Id`; Equipo lista a quien está en otra empresa.
- **Panel** (selector probado en una página de prueba con datos simulados): se ve la lista con la activa marcada, la que tiene el acceso dado de baja atenuada, las invitaciones con su botón; los nombres con HTML se ven como texto; elegir otra empresa pide el cambio y recarga; aceptar una invitación vuelve a cargar la lista; con una sola empresa dice "Perteneces solo a esta empresa".
- **No probado:** el panel real de punta a punta con una base que tenga el SQL (hace falta aplicarlo en DEV y entrar con una cuenta que pertenezca a dos empresas).

## 6. Límites conocidos (decidir antes de producción)

1. **Rol de alguien que trabaja en otra empresa**: solo se cambia cuando vuelva a la tuya (la baja sí se puede en cualquier momento).
2. **Baja en la empresa donde estás trabajando**: si a una persona la dan de baja en la empresa que tiene activa, `auth-guard.js` (lógica de onboarding existente) la manda a `onboarding.html` y ahí no hay selector; tendría que entrar por otra vía. Falta que, si tiene otra empresa activa, el panel la lleve al selector.
3. **Crear una segunda empresa propia** (onboarding) no está soportado: `crearEmpresaYDirector` sigue rechazando a quien ya tiene perfil. Hoy se entra a otra empresa solo por invitación.
4. **Panel de plataforma** (`supabasePlataforma.js`) cuenta personas por `perfiles.empresa_id`: quien está en otra empresa no se cuenta en la suya. Pasarlo a `usuario_empresas` es un cambio chico, no incluido.
5. **Directores ausentes**: la regla de "último director" de `perfiles_proteger_campos` (OT-0038) cuenta solo a los directores que están trabajando en la empresa; `membresia_cambiar_estado` (la baja) sí cuenta membresías, incluidas las de directores que hoy están en otra empresa; el cambio de **rol** por Equipo sigue contando solo a los que están aquí. Es conservador (puede pedir asignar otro director de más), nunca deja la empresa sin director.
6. Quien trabaja en otra empresa deja visible su `empresa_id` activa (un UUID) a los compañeros de esta por la política `perfiles_select_membresia`; no se expone nombre ni datos de la otra empresa.
7. Datos que el navegador guarda por empresa (`storage-empresa.js`, OT-0038) ya vienen separados por empresa; el cambio de empresa recarga la página completa.
8. Sin push. El panel y el backend se pueden desplegar en cualquier orden, pero el selector solo se activa de verdad cuando el SQL está aplicado.

## 7. Paso 0 ejecutado en DEV (2026-11-25, solo lectura)

Cinco consultas SELECT, sin escribir nada. Resultado:

- `perfiles_proteger_campos()` real = la de OT-0038 (solo difiere el fin de línea), así que la copia con la excepción de OT-0056 no pisa ningún cambio hecho a mano.
- `auth_empresa_id()` y `auth_rol()` exigen `activo = true` (igual que en la prueba del SQL).
- `perfiles` ya tiene, además de `perfiles_select_empresa` y `perfiles_update_propio`, la política `perfiles_update_gestion_equipo` (RH/Admin/Director actualizan a gente de **su** empresa). Por eso `membresia_cambiar_estado` es necesaria: esa política no alcanza a quien está trabajando en otra empresa. La política nueva `perfiles_select_membresia` se suma sin chocar.
- `auditoria_log` solo tiene llaves (sin CHECK en `accion` ni `modulo`): la fila con `modulo = 'auth'` entra sin problema.
- Columnas de `perfiles`, `empresas`, `roles` e `invitaciones` coinciden con lo que usa el SQL. `empresas` tiene `status` y `estado` a la vez (no se usan aquí).
- Hay 4 empresas y 9 perfiles, ninguno inactivo, y `usuario_empresas` no existe todavía: el respaldo inicial crearía 9 membresías.

Conclusión: el SQL se puede aplicar tal cual. Sigue sin aplicarse: falta la revisión de Jorge.
