# CONTATECK · Orden de Trabajo OT-0012
## Folio atómico de pólizas — de localStorage a Postgres

**Módulo:** Contabilidad / Pólizas
**Motivo:** el folio se generaba en el navegador de cada usuario (contador en
`localStorage`), sin consultar la base. Dos capturas simultáneas desde
distintos dispositivos, o un usuario limpiando caché, podían producir el
mismo folio dos veces.

---

## 1. Qué cambia

| Antes | Ahora |
|---|---|
| `siguienteFolio()` en `contabilidad.js` leía/incrementaba un contador en `localStorage` del navegador. | `siguiente_folio()` en Postgres, `SECURITY DEFINER`, con tabla `folios_contador` (`empresa_id`, `tipo`, `ultimo_numero`). |
| El folio se generaba ANTES de llamar al backend y se mandaba como `p_folio`. | El folio se genera DENTRO de `crear_poliza_completa`, en la misma transacción que valida Debe=Haber e inserta la póliza. |
| Si dos pestañas/dispositivos capturaban a la vez, podían repetir folio. | El `UPSERT ... ON CONFLICT ... RETURNING` bloquea la fila del contador — la segunda transacción espera y recibe el siguiente número, nunca el mismo. |

## 2. Archivos

- **`OT-0012-folio-atomico.sql`** — migración: tabla `folios_contador`,
  backfill desde los folios ya existentes, función `siguiente_folio()`, y
  `crear_poliza_completa()` actualizada (firma cambia: ya no recibe
  `p_folio`, regresa `{id, folio}` en vez de solo `id`).
- **`polizasCompletas.js`** — reemplaza
  `backend/src/routes/polizasCompletas.js`. La ruta POST ya no exige
  `folio` en el body.
- **`supabasePolizasCompletas.js`** — reemplaza
  `backend/src/supabasePolizasCompletas.js`. Ya no manda `p_folio` al RPC;
  lee `data.id` y `data.folio` de la respuesta.
- **`contabilidad.js`** — reemplaza `frontend/contabilidad.js`.
  `siguienteFolio()` se renombra a `siguienteFolioLocal()` y queda SOLO
  como respaldo si no hay sesión de Postgres, con prefijo `LOCAL-` para
  que sea imposible confundirlo con un folio oficial. `savePoliza()` ya
  no manda folio al crear — lo recibe de la respuesta del backend.

## 3. Orden de despliegue (importante, en este orden)

1. Correr `OT-0012-folio-atomico.sql` completo en Supabase — primero DEV,
   validar, luego PROD.
2. Subir `polizasCompletas.js` y `supabasePolizasCompletas.js` al backend
   (Railway) y confirmar que reinicia sin errores.
3. Subir `contabilidad.js` al frontend (GitHub Pages).

Si se sube el frontend antes que el SQL, las creaciones de póliza van a
fallar porque `crear_poliza_completa` todavía pediría `p_folio` y el
cliente ya no lo manda. Si se sube el SQL antes que el backend, el
backend viejo sigue mandando `folio` en el body pero la ruta lo ignora sin
problema — es seguro dejarlo un rato en ese estado intermedio si hace
falta.

## 4. Cómo probar

1. **Secuencia continúa, no reinicia:** crear una póliza de Ingreso y
   confirmar que el folio sigue después del último que ya tenías (por
   ejemplo si el último era I-00002, el nuevo debe ser I-00003) — el
   backfill del paso 1 se encarga de esto.
2. **Concurrencia real:** pedirle a alguien del equipo (Ricardo o algún
   Miguel) que capture una póliza de Ingreso al mismo tiempo que tú, desde
   otro dispositivo/navegador. Los dos folios deben salir consecutivos y
   distintos — nunca repetidos.
3. **Verificar en Supabase:**
   ```sql
   select * from folios_contador order by empresa_id, tipo;
   select proname, pronargs from pg_proc where proname = 'crear_poliza_completa';
   ```
   La segunda consulta debe regresar una sola fila con `pronargs = 4`
   (antes eran 5). Si salen dos filas, quedó la versión vieja de la
   función coexistiendo — hay que borrarla a mano con
   `drop function crear_poliza_completa(text, text, date, text, jsonb);`

## 5. Nota sobre pólizas ya creadas

Esta OT no toca pólizas existentes ni sus folios. El backfill solo lee el
folio más alto por empresa+tipo para arrancar el contador ahí — no
renumera nada.
