# CONTATECK · Informe Técnico
## Orden de Trabajo OT-0007 — Migración de Clientes y Productos

**Responsable:** Ingeniero de Desarrollo (Claude)
**Fecha:** 27 julio 2026
**Rama:** `feature/OT-0007-clientes-productos`
**Patrón:** el mismo de OT-0006 (Fase A: acceso a Postgres aditivo, sin tocar Firestore ni borrar código; Fase B: validar con datos DEMO).

---

## 0. Contexto — mismo patrón que OT-0006

`clientes` y `productos` sí existen hoy en Firestore (a diferencia de `empresas`/`perfiles`, que nunca estuvieron ahí). El catálogo que usa `facturacion.js` viene de `window.CTData.getClientes()/getProductos()`, alimentado por `data-firestore.js`. Esta OT **no reemplaza esa fuente** — la complementa: si Postgres tiene datos para la empresa del usuario, se agregan al catálogo (sin duplicar por RFC/descripción); si no, todo sigue exactamente igual que antes.

---

## 1. Fase A — Qué se construyó

1. **`backend/src/supabaseCatalogo.js`** (nuevo): función `obtenerCatalogo(accessToken)`, misma filosofía que `supabaseData.js` de OT-0006 — consulta con el cliente autenticado como el propio usuario (RLS real, nunca service role). Trae `clientes` y `productos` en un solo `Promise.all`.
2. **`backend/src/routes/catalogo.js`** (nuevo): endpoint `GET /api/catalogo`, protegido por el mismo `verifyAuth`. Responde `fuente:"postgres"` con los datos, o `fuente:"local"` si no hay nada (mismo contrato que `/api/perfil`).
3. **`backend/index.js`**: se monta `catalogoRouter`.
4. **`frontend/auth-guard.js`**: después de traer el perfil, también consulta `/api/catalogo` y guarda el resultado en `window.CONTATECK_CLIENTES_PG` / `window.CONTATECK_PRODUCTOS_PG`.
5. **`frontend/facturacion.js`**: `getClientesList()`/`getProductosList()` ahora concatenan el catálogo local (Firestore) con el de Postgres, **sin duplicar** (por `rfc` en clientes, por `descripcion` en productos). Si Postgres no tiene nada, el resultado es idéntico al de antes de esta OT.

**Nada se borró.** `data-firestore.js`, `window.CTData`, y todo el flujo de guardado de CFDIs siguen exactamente igual.

---

## 2. Archivos modificados/nuevos

| Archivo | Cambio |
|---|---|
| `backend/src/supabaseCatalogo.js` | **Nuevo.** |
| `backend/src/routes/catalogo.js` | **Nuevo.** |
| `backend/index.js` | Monta `catalogoRouter`. |
| `frontend/auth-guard.js` | Agrega el fetch a `/api/catalogo` junto al de `/api/perfil`. |
| `frontend/facturacion.js` | `getClientesList()`/`getProductosList()` mezclan Postgres + local. |

**RLS:** no requiere cambios — las políticas de `clientes`/`productos` ya existen desde OT-0003 (lectura abierta a la empresa, escritura restringida a `contador`/`admin`/`director`).

---

## 3. Fase B — Validación con datos DEMO

### 3.1 Datos demo
Correr `database/seed_demo_ot0007.sql` (agrega un cliente y un producto a las empresas Demo B y Demo C, para poder comparar aislamiento entre 3 empresas con catálogos distintos).

### 3.2 Pruebas

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Catálogo por empresa vía API | Login con `demo.director.c@contateck.mx`, backend local + `app-config.js` en localhost, abrir Facturación → "Timbrar CFDI" | El selector de cliente/producto debe incluir **"Cliente Demo C"** / **"Servicio Demo C"**, no los de otras empresas |
| 2 | Aislamiento — RLS en `clientes`/`productos` | Supabase → Impersonate `demo.vendedor` (empresa 0001) → `select * from clientes` | Debe ver **solo** el cliente de la empresa 0001 (el original de `seed.sql`), no "Cliente Demo B" ni "Cliente Demo C" |
| 3 | Catálogo no rompe si Postgres no responde | Con `app-config.js` apuntando a producción (sin backend local) | La sección de Facturación debe seguir funcionando igual que siempre, con el catálogo local/Firestore, sin errores visibles |
| 4 | Sin duplicados | Revisar en el navegador que el cliente sembrado en `seed.sql` original (RFC `EKU9003173C9`) no aparezca dos veces en el selector si por alguna razón también existiera en Firestore con el mismo RFC | No debe haber duplicados en la lista desplegable |

### 3.3 Plantilla de resultados

```
Fecha de prueba:
Probado por:

[ ] Prueba 1 — Catálogo por empresa vía API: PASA / NO PASA
[ ] Prueba 2 — Aislamiento RLS clientes/productos: PASA / NO PASA
[ ] Prueba 3 — Respaldo local sin Postgres: PASA / NO PASA
[ ] Prueba 4 — Sin duplicados: PASA / NO PASA

Conclusión: OT-0007 [ ] CERRADA  [ ] PENDIENTE
```

---

## 4. Qué NO se hizo (a propósito)

- No se migran datos reales de clientes/productos de las consultoras — sigue pendiente para la OT de carga real, después de terminar el ERP.
- No se toca la escritura de CFDIs ni cómo se guardan clientes/productos nuevos capturados en el momento de facturar (eso sigue yendo a Firestore, sin cambios).
- No se retira Firestore para estos módulos — Fase A es aditiva, el retiro sería una fase posterior una vez cargados datos reales.

---

*Fin del informe. Corre las 4 pruebas de la sección 3.2, llena la plantilla, y con eso cerramos OT-0007.*
