# CONTATECK · OT-0006 — Fase B: Validación con datos DEMO

**Alcance confirmado:** modelo 1 usuario → 1 empresa se mantiene sin cambios. El soporte para que un mismo usuario alterne entre varias empresas queda planificado como fase arquitectónica posterior, no descartado. Esta Fase B usa **datos ficticios**, ninguna consultora real todavía.

---

## 1. Qué se va a probar y por qué

Hasta OT-0006 Fase A solo confirmamos dos cosas: "empresa A no ve empresa B" (OT-0003) y "el selector muestra el nombre real al cargar" (Fase A). **Nunca probamos la restricción por rol dentro de una misma empresa** — es decir, si un `vendedor` de verdad tiene menos acceso que un `contador`, aunque sean de la misma empresa. Fase B cierra ese hueco.

Escenario final después de esta fase:

| Empresa | Usuario | Rol |
|---|---|---|
| TEC CAPITAL Group (DEV) — `...0001` | `prueba1@contateck.mx` (ya existe) | director |
| TEC CAPITAL Group (DEV) — `...0001` | `demo.contador@contateck.mx` (nuevo) | contador |
| TEC CAPITAL Group (DEV) — `...0001` | `demo.vendedor@contateck.mx` (nuevo) | vendedor |
| Empresa de Prueba 2 (DEV) — `...0002` | `prueba2@contateck.mx` (ya existe) | director |
| Empresa Demo C — `...0003` | `demo.director.c@contateck.mx` (nuevo) | director |

---

## 2. Pasos (manual, en Supabase + tu compu)

### 2.1 Crear la tercera empresa demo
En el SQL Editor de Supabase, correr `database/seed_demo_ot0006.sql` (solo la parte del `insert into empresas`, la de "Empresa Demo C").

### 2.2 Crear los 3 usuarios nuevos
En **Authentication → Users → Add user**, crear:
- `demo.contador@contateck.mx`
- `demo.vendedor@contateck.mx`
- `demo.director.c@contateck.mx`

Copia el UUID de cada uno.

### 2.3 Vincular cada uno a su perfil
Usar la plantilla del final de `seed_demo_ot0006.sql`, una vez por usuario, con su UUID real, su `empresa_id` y su rol según la tabla de la sección 1.

---

## 3. Validaciones a correr (con resultado esperado)

Para cada prueba, usa **"Impersonate user"** en el Table Editor de Supabase (mismo método de OT-0003), o entra normal desde `login.html` con cada correo.

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Selector muestra nombre correcto por usuario | Login con cada uno de los 5 usuarios, ver el dashboard | Cada quien ve el nombre de **su propia** empresa al cargar (ver Fase A) |
| 2 | Aislamiento entre 3 empresas (no solo 2) | Impersonar `demo.director.c` → `select * from empresas` | Debe ver **solo** "Empresa Demo C", cero filas de las otras 2 |
| 3 | Restricción por rol — `empleados` | Impersonar `demo.vendedor` (empresa 0001) → `select * from empleados` | Debe dar **0 filas o error de permiso** (la política solo permite `contador`/`admin`/`director`) |
| 4 | Mismo rol, sí puede ver `cuentas_contables`/`clientes` (lectura abierta a toda la empresa) | Impersonar `demo.vendedor` → `select * from clientes` | Debe **sí** ver los registros de su empresa (lectura abierta, solo la escritura está restringida) |
| 5 | El rol viaja correctamente por `/api/perfil` | Con sesión de `demo.contador`, abrir DevTools Console y correr `window.CONTATECK_PERFIL_PG` | Debe mostrar `{"rol":"contador", ...}` — confirma que el dato de rol llega completo desde Postgres hasta el navegador |
| 6 | Escritura bloqueada por rol | Impersonar `demo.vendedor` → intentar `insert into cfdis (...)` con datos mínimos | Debe **fallar** (la política de insert exige `contador`/`admin`/`director`) |

---

## 4. Plantilla de resultados (llenar después de probar)

```
Fecha de prueba:
Probado por:

[ ] Prueba 1 — Selector por usuario: PASA / NO PASA — notas:
[ ] Prueba 2 — Aislamiento 3 empresas: PASA / NO PASA — notas:
[ ] Prueba 3 — Vendedor sin acceso a empleados: PASA / NO PASA — notas:
[ ] Prueba 4 — Vendedor sí lee clientes: PASA / NO PASA — notas:
[ ] Prueba 5 — Rol viaja por /api/perfil: PASA / NO PASA — notas:
[ ] Prueba 6 — Escritura bloqueada por rol: PASA / NO PASA — notas:

Conclusión: OT-0006 Fase B [ ] CERRADA  [ ] PENDIENTE (detallar qué falta)
```

---

## 5. Qué pasa si algo de esto NO pasa

Si cualquier prueba de rol (3, 4 o 6) falla — por ejemplo, si un vendedor sí lograra ver empleados — **no se abre OT-0007** hasta corregir la política correspondiente en `database/policies.sql`. Es el mismo criterio que ya aplicamos en OT-0003: un fallo de aislamiento se corrige antes de seguir construyendo encima.

---

*Fin de la guía. Llena la plantilla de la sección 4 y compártela para dar por cerrada oficialmente OT-0006.*
