# CONTATECK · Informe Técnico
## Orden de Trabajo OT-0008 — Migración de Empleados y Pólizas

**Responsable:** Ingeniero de Desarrollo (Claude)
**Fecha:** 28 julio 2026
**Rama:** `feature/OT-0008-empleados-polizas`
**Patrón:** el mismo de OT-0006/OT-0007 (Fase A aditiva, Fase B con datos DEMO).

---

## 0. Diferencia importante frente a OT-0007

`empleados`/`polizas` viven dentro de un módulo más grande y con más lógica que `clientes`/`productos`: `data-firestore.js` no solo lee, también tiene el CRUD completo (crear, editar, borrar pólizas y empleados) contra Firestore. Por disciplina de "cambio quirúrgico, no reescritura completa" (regla del proyecto), **esta OT solo toca la carga inicial (lectura), no el CRUD** — crear/editar/borrar sigue yendo 100% a Firestore, sin cambios. Es una limitación intencional de alcance, no un descuido.

---

## 1. Fase A — Qué se construyó

1. **`backend/src/supabaseOperacion.js`** (nuevo): `obtenerEmpleadosYPolizas(accessToken)`, mismo patrón que los servicios anteriores (RLS real, nunca service role). Nota: si el usuario es `vendedor`, la consulta a `empleados` puede regresar error de permiso (esperado, RLS lo bloquea) — se maneja devolviendo lista vacía para esa tabla en particular, sin tumbar el resto de la respuesta.
2. **`backend/src/routes/operacion.js`** (nuevo): `GET /api/operacion`.
3. **`backend/index.js`**: monta `operacionRouter`.
4. **`frontend/auth-guard.js`**: agrega el fetch a `/api/operacion`, guarda en `window.CONTATECK_EMPLEADOS_PG` / `window.CONTATECK_POLIZAS_PG`.
5. **`frontend/data-firestore.js`**: al final del archivo (fuera del bloque de Firestore, corre siempre), espera brevemente (hasta 1.5s) a que `auth-guard.js` termine de traer los datos de Postgres, y si hay algo, lo mezcla en `state.empleados`/`state.polizas` sin duplicar (por `nombre` en empleados, por `folio` en pólizas) y vuelve a pintar esas tablas. **El CRUD (crear/editar/borrar) no se tocó.**

---

## 2. Por qué la espera de 1.5 segundos (detalle técnico relevante)

`auth-guard.js` y `data-firestore.js` son dos módulos que arrancan casi al mismo tiempo al cargar la página. Sin la espera, existía el riesgo de que `data-firestore.js` intentara mezclar los datos de Postgres **antes** de que la petición a `/api/operacion` hubiera terminado — una condición de carrera clásica. La espera corta y con límite evita ese problema sin bloquear el panel si Postgres nunca responde (en ese caso, simplemente sigue con lo de Firestore después de esos 1.5s como máximo).

---

## 3. Archivos modificados/nuevos

| Archivo | Cambio |
|---|---|
| `backend/src/supabaseOperacion.js` | **Nuevo.** |
| `backend/src/routes/operacion.js` | **Nuevo.** |
| `backend/index.js` | Monta `operacionRouter`. |
| `frontend/auth-guard.js` | Agrega fetch a `/api/operacion`. |
| `frontend/data-firestore.js` | Merge aditivo al final del archivo, con espera anti-condición-de-carrera. CRUD sin cambios. |

---

## 4. Fase B — Validación con datos DEMO

### 4.1 Datos demo
Correr `database/seed_demo_ot0008.sql` (empleados y pólizas en las 3 empresas demo).

### 4.2 Pruebas

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Empleados/pólizas por empresa vía API | Login `demo.director.c`, backend local, ir a Contabilidad/Nómina | Debe verse "Empleado Demo C" y la póliza "DEMO-D-00003", no las de otras empresas |
| 2 | Vendedor sin acceso a empleados (repite el patrón de OT-0006, ahora también end-to-end en frontend) | Login `demo.vendedor`, ir a Nómina | La lista de empleados debe quedar vacía o mostrar solo lo que ya hubiera en Firestore local — nunca los de Postgres |
| 3 | Respaldo sin Postgres | `app-config.js` apuntando a producción | Contabilidad/Nómina siguen funcionando igual que siempre |
| 4 | CRUD intacto | Crear una póliza nueva desde el panel (con cualquier usuario) | Debe seguir guardándose en Firestore exactamente igual que antes de esta OT — confirma que no se rompió nada existente |

### 4.3 Plantilla de resultados

```
Fecha de prueba: 28 julio 2026
Probado por: Jorge (TEC CAPITAL Group)

[x] Prueba 1 — Datos por empresa vía API: PASA — con demo.director.c@contateck.mx, "Empleado Demo C" y la póliza "DEMO-D-00003" aparecieron en Nómina/Contabilidad tras un margen de espera ampliado a 5s + reintento de respaldo a los 3s (necesario por arranque en frío del backend local).
[x] Prueba 2 — Vendedor sin acceso a empleados (frontend): PASA — con demo.vendedor@contateck.mx, Nómina mostró solo los 5 empleados locales, sin "Empleado Demo C" (RLS lo bloquea también end-to-end en el navegador, no solo en Supabase).
[x] Prueba 3 — Respaldo local sin Postgres: PASA — con app-config.js apuntando a producción, las llamadas a /api/perfil, /api/catalogo y /api/operacion fallaron con 404 (esperado, esas rutas aún no están desplegadas en Railway) y el panel siguió funcionando sin errores visibles para el usuario.
[x] Prueba 4 — CRUD de Firestore intacto: PASA — se creó una póliza nueva ("E-00001, Egreso, pago de colegiatura, $1,000.00") y se guardó normal, confirmando que el flujo de crear/editar/borrar de Firestore no se vio afectado por esta OT.

Conclusión: OT-0008 [x] CERRADA  [ ] PENDIENTE

Hallazgo aparte (no bloquea el cierre, se documenta para OT-0009): Firestore está respondiendo "permission-denied" en la cuenta de producción de TEC CAPITAL Group — probablemente porque sus reglas de seguridad exigen sesión de Firebase Auth, y desde OT-0004 el login real es con Supabase Auth. Esto es anterior a OT-0008 y no afecta el resultado de esta OT, pero es importante resolverlo antes de tocar `cfdis` en OT-0009, ya que ese módulo todavía depende de Firestore para el guardado de facturas timbradas.
```

---

## 5. Qué sigue después de esta OT

Con `empresas`/`perfiles` (OT-0006), `clientes`/`productos` (OT-0007) y `empleados`/`polizas` (OT-0008) completos, solo queda **`cfdis`** — el módulo con valor fiscal real, dejado a propósito para el final por ser el más delicado. Esa sería OT-0009.

---

*Fin del informe.*
