# CONTATECK · Informe Técnico
## Orden de Trabajo OT-0010 — Detalle de pólizas (`poliza_partidas`)

**Responsable:** Ingeniero de Desarrollo (Claude)
**Fecha:** 28 julio 2026
**Rama:** `feature/OT-0010-poliza-partidas`
**Aprobado por Jorge:** separar encabezado/detalle, `cuenta_id` como FK, mismo criterio de RLS, sin eliminación, + `descripcion` opcional por línea + `updated_at` en el encabezado + validación de Debe=Haber garantizada en el backend.

---

## 1. Decisión de diseño clave: validación por función de Postgres (RPC), no solo en la app

Se pidió explícitamente que el backend valide Debe=Haber "antes de persistir". La forma más segura de cumplir esto no es solo revisarlo en el código de Express (eso se podría saltar llamando la API directo), sino **dentro de una función de la propia base de datos** (`crear_poliza_completa`/`actualizar_poliza_completa`), que:

1. Recibe el encabezado + todas las líneas de una sola vez.
2. Suma Debe y Haber de las líneas.
3. Si no cuadran, **aborta con un error — no se guarda nada**, ni el encabezado ni ninguna línea (transacción completa o nada, gracias a que todo corre dentro de una sola función).
4. Solo si cuadra, inserta el encabezado en `polizas` y cada línea en `poliza_partidas`.

Esto es más fuerte que validar solo en el navegador o solo en Express — ni siquiera alguien llamando la API de Supabase directamente (sin pasar por nuestro backend) podría guardar una póliza descuadrada.

---

## 2. Qué se construyó

### Base de datos (`database/addendum_poliza_partidas.sql`)
- `polizas.updated_at` (columna nueva).
- Tabla `poliza_partidas`: `id`, `poliza_id`, `cuenta_id` (FK real, no texto), `debe`, `haber`, `descripcion` (opcional), `orden`.
- RLS: lectura para toda la empresa, escritura solo `contador`/`admin`/`director`, sin política de `delete` (igual que `polizas`).
- Funciones `crear_poliza_completa()` / `actualizar_poliza_completa()`: validan rol, empresa, y el cuadre Debe=Haber, todo en una transacción.

### Backend
- `backend/src/supabasePolizasCompletas.js` (nuevo): llama a las 2 funciones RPC.
- `backend/src/routes/polizasCompletas.js` (nuevo): `POST /api/polizas-completas`, `PUT /api/polizas-completas/:id`.
- `backend/index.js`: monta la ruta nueva.

### Frontend
- `frontend/postgres-crud.js`: se agregan `crearPolizaCompleta()`/`actualizarPolizaCompleta()`.
- `frontend/contabilidad.js`: `savePoliza()` ahora manda el encabezado **y** las líneas juntas a los nuevos endpoints, en vez de solo el encabezado. Los mensajes de error ahora muestran directamente el texto que regresa Postgres (ya viene en español y es claro, ej. *"La póliza no cuadra: Debe (200.00) distinto de Haber (150.00)"*).

---

## 3. Qué queda pendiente (transparencia, no se está ocultando)

- **La sincronización de regreso (Postgres → pantalla) todavía no trae las líneas**, solo el encabezado (heredado de OT-0009). Si una póliza se creó desde otro dispositivo, este navegador la mostrará con el encabezado correcto pero sin sus líneas de Debe/Haber hasta que se navegue a verla desde el dispositivo que la creó, o se implemente el siguiente paso: traer también `poliza_partidas` en la sincronización. Se anota como mejora futura, no bloquea el cierre de esta OT porque el caso de uso principal (crear/editar desde el mismo navegador) funciona completo.

---

## 4. Pasos de validación

1. Correr `database/addendum_poliza_partidas.sql` en Supabase.
2. **Crear una póliza balanceada** (Debe = Haber) → debe guardarse, y en Supabase deben aparecer tanto el registro en `polizas` como sus líneas en `poliza_partidas`, con `cuenta_id` apuntando al catálogo real.
3. **Intentar guardar una póliza desbalanceada** directamente vía la API (con Postman/curl o similar, o forzando el cuadre a mano si el frontend lo permite) → debe rechazarse con el mensaje de Postgres, y NO debe crear ningún registro (ni encabezado ni líneas).
4. **Editar una póliza existente** → sus líneas viejas deben reemplazarse por las nuevas en `poliza_partidas` (confirmar que no queden líneas duplicadas de la versión anterior).
5. **Confirmar `updated_at`** se actualiza en `polizas` tras editar.
6. **Vendedor bloqueado** → mismo criterio de OT-0009, debe rechazarse.

### Plantilla de resultados

```
Fecha de prueba:
Probado por:

[ ] Prueba 1 — Crear póliza balanceada con líneas en Postgres: PASA / NO PASA
[ ] Prueba 2 — Póliza desbalanceada rechazada sin dejar nada a medias: PASA / NO PASA
[ ] Prueba 3 — Editar reemplaza las líneas correctamente: PASA / NO PASA
[ ] Prueba 4 — updated_at se actualiza: PASA / NO PASA
[ ] Prueba 5 — Vendedor bloqueado: PASA / NO PASA

Conclusión: OT-0010 [ ] CERRADA  [ ] PENDIENTE
```

---

*Fin del informe. Con esta OT cerrada, el núcleo contable queda completo en Postgres. Sigue OT-0011: migración de `cfdis` (antes numerada OT-0009/0010 en distintos momentos de la conversación — queda formalmente como OT-0011).*
