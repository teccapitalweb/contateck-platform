# CONTATECK · Orden de Trabajo OT-0018
## Buscador de cuenta unificado — convención permanente para selectores de catálogo

**Nota de numeración:** el equipo ya usó `ot0012` a `ot0017` como nombres de
rama en GitHub (`feature/ot0012-cierre-facturacion`, `ot0017-nomina-parte-a`,
etc.). El fix del folio de hoy se llamó `OT-0012-folio-atomico` por error de
numeración de mi parte — no colisiona en contenido, pero para no repetirlo
esta OT arranca en `0018`, siguiente número libre después de esa serie.

---

## 1. El problema que resuelve

Contabilidad tenía **3 formas distintas** de elegir una cuenta del catálogo:

1. Captura Rápida (Banco/Caja) — buscador tipo autocomplete, función propia.
2. Libro Mayor — buscador tipo autocomplete, función **casi idéntica** a la
   de arriba, copiada en vez de compartida.
3. Modo Avanzado (Nueva/Editar póliza) — `<select>` nativo del navegador,
   sin buscar, solo scroll por la lista completa.

Esto generaba dos problemas: (a) inconsistencia visual — dos pantallas del
mismo módulo se sentían de sistemas distintos — y (b) cualquier bug o mejora
al buscador había que aplicarla dos veces por separado.

## 2. Qué se hizo

- **Unificado:** las 3 pantallas ahora usan el mismo campo — un input de
  texto con clase `cuenta-busca` dentro de un `<div class="field fac-sat-field">`,
  con un `<input type="hidden">` hermano que guarda el código real
  seleccionado, y un `<div class="fac-sat-results">` para el dropdown.
- **Una sola función de búsqueda** (`buscarCuenta`) reemplaza las 2 copias
  que existían (`buscarRapCuenta` y `buscarMayorCuenta` desaparecen).
- **Un solo juego de event listeners** (`input`, `focusin`, `click`) maneja
  cualquier campo `cuenta-busca` sin importar en qué pantalla esté. El único
  caso especial que se conserva es el Libro Mayor, que además de seleccionar
  la cuenta recarga el detalle de movimientos — eso se resolvió con una
  clase marcadora extra (`mayor-cuenta-busca`) que dispara ese efecto
  adicional, sin duplicar la lógica de búsqueda en sí.
- **Modo Avanzado** (`asientoRow`, en Nueva/Editar póliza) dejó de usar
  `<select>` y ahora usa el mismo campo buscador que las otras dos
  pantallas. El elemento que guarda el código de la cuenta sigue teniendo
  la clase `cont-as-cta` (ahora como `<input type="hidden">` en vez de
  `<select>`), así que el código que lee ese valor al guardar la póliza no
  tuvo que tocarse.

**Archivo modificado:** `frontend/contabilidad.js` (mismo archivo del fix
de folio de hoy — 1,627 líneas, cero cambios fuera de lo descrito aquí).

## 3. Regla permanente hacia adelante

**Cualquier campo nuevo, en cualquier módulo, que necesite elegir un valor
de una lista de catálogo (cuentas, y por extensión cualquier lista similar
— productos, empleados, etc.) usa este patrón, nunca un `<select>` plano:**

```html
<div class="field fac-sat-field">
  <label>Etiqueta del campo</label>
  <input class="input cuenta-busca" placeholder="Escribe para buscar…" autocomplete="off">
  <input type="hidden" value="">
  <div class="fac-sat-results"></div>
</div>
```

Con la función `buscarCuenta` y los 3 listeners ya genéricos, un campo nuevo
de este tipo funciona automáticamente sin escribir código adicional — solo
hay que poner el HTML con esa estructura. Si el campo necesita un efecto
extra al seleccionar (como el Libro Mayor), se agrega una clase marcadora
adicional y un `if` corto dentro del handler de `click`, sin duplicar la
función de búsqueda.

Esto aplica de aquí en adelante **sin que haga falta pedirlo cada vez** —
cuando entremos a cualquier pantalla (Facturación, Ventas, Empleados,
Dashboard, lo que sea) que tenga un selector de catálogo con `<select>`
plano, se convierte a este patrón como parte natural del trabajo en esa
pantalla, salvo que Jorge indique explícitamente lo contrario para un caso
puntual.

## 4. Pendientes conocidos (no se tocaron en esta OT)

Estos ya existían con su propio patrón de búsqueda funcional (Uso CFDI,
Régimen Fiscal en Facturación) — no son `<select>` planos, así que no
entran en el mismo problema, pero valdría la pena revisar si conviene que
compartan la misma función `buscarCuenta` genérica o si por tener una
fuente de datos distinta (catálogos SAT fijos, no `cuentas_contables`)
deben quedar separados. Se evalúa cuando toque trabajar en Facturación de
nuevo, no antes.
