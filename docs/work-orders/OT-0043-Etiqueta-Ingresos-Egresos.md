# OT-0043 · La tarjeta "Utilidad operativa" del Dashboard ahora dice lo que mide

**Rama:** `feature/OT-0043-etiqueta-utilidad` (sobre `integracion-local`). Solo texto: sin cambios de cálculo, de servidor ni de SQL.
Sale del hallazgo 5 de `Reporte-Prueba-Completa-Modulos-2026-11-13.md`.

## Problema
En Empresa Demo C el Dashboard mostraba **"Utilidad operativa" −$1,104.16** y el Estado de Resultados y el Balance General mostraban **utilidad +$86.21**. Las dos cifras eran
correctas con su propia definición, pero con la misma palabra parecía un error:

- La tarjeta del Dashboard resta egresos de ingresos usando el **monto de las pólizas del mes** (movimientos de caja: cobros, pagos, gastos).
- El Estado de Resultados usa las **cuentas de ingresos y de gastos** de todo el ejercicio.

## Cambio
La tarjeta ahora se llama **"Ingresos − egresos (pólizas)"**, igual que sus dos tarjetas vecinas ("Ingresos (pólizas)" y "Egresos (pólizas)"), y deja claro que es la diferencia de esas dos.
El valor y el servidor (`utilidadMes`) no cambian.

| Cambio | Dónde |
|---|---|
| Etiqueta de la tarjeta | `frontend/app.js` |
| Versión de caché `app.js?v=11` | `frontend/dashboard.html` |
| Una prueba que falla si vuelve a llamarse "Utilidad operativa" | `backend/test-fiscal.js` (21 pruebas) |

## Pendiente (no incluido)
Si se quiere mostrar también la utilidad contable en el Dashboard, hay que decidir cuál es la que debe verse ahí (la del mes o la del ejercicio) y calcularla con las cuentas, como el Estado de Resultados.
Es una decisión de producto y de la contadora, no un arreglo de texto.

**NO verificado:** en pantalla todavía (el panel que corre no trae esta rama).
