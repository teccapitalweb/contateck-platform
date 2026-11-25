# OT-0059 · El Dashboard distingue "sin obligaciones configuradas" de "nada pendiente"; guion de demo y capturas

**Rama:** `feature/OT-0059-obligaciones-dashboard` (sobre `integracion-local`).

## Qué se revisó
Al revisar los textos "Próximamente" del Dashboard (a petición del usuario) se decidió **conservar** los que representan alcance futuro real (por ejemplo los **indicadores de IVA/ISR** y el **timbrado de nómina**), porque se van a mostrar en el informe. Solo se revisó que cada texto fuera veraz.
Uno no lo era: en la tarjeta **Próximas obligaciones SAT** decía "Sin obligaciones fiscales configuradas todavía" en Empresa Demo C, que **sí tiene una obligación activa** (IVA mensual; su declaración de julio de 2026 ya está presentada y no hay otra pendiente).

## Cambio
- `obtenerCalendario` devuelve también `configuradas` (obligaciones activas) y el Dashboard lo expone como `obligacionesConfiguradas`.
- Si hay obligaciones activas y ninguna pendiente, la tarjeta dice **"No tienes obligaciones pendientes por presentar."**; si no hay ninguna activa, dice "Sin obligaciones fiscales configuradas todavía (SAT y Fiscal → + Obligación)." (`app.js?v=16`).
- Prueba nueva en `test-fiscal.js` (25): con una obligación activa y su declaración presentada, hay 0 pendientes y 1 configurada; sin obligaciones, 0; con una pendiente, 1.

## Material para el informe
`docs/informe/Guion-de-Demo-y-Lista-de-Capturas.md`: guion de la demostración (14 pasos), lista de 47 capturas con nombre de archivo sugerido (por módulo y por rol, incluidas las de "Próximamente"), preguntas que pueden hacer y respuestas honestas, y los pasos para crear las cuentas rh y vendedor.

## Pendiente
Las tarjetas "Indicadores fiscales" siguen en "Próximamente" aunque ya existe una cifra de referencia de IVA (se puede mostrar si se decide; el ISR sigue pendiente de definición fiscal).

## Verificación (25-nov-2026, rama unida a `integracion-local`, backend reiniciado, director de Demo C)
- Tarjeta "Próximas obligaciones SAT": ahora dice **"No tienes obligaciones pendientes por presentar."** y, al verla, se vio que el rótulo "Próximamente" no cuadraba con ese mensaje; se añadió `sinPendientes()` (OT-0059b, `app.js?v=17`) para que ese caso no lleve el rótulo. "Próximamente" se conserva solo cuando de verdad no hay obligaciones configuradas.
- La tarjeta "Indicadores fiscales" sigue en "Próximamente" a propósito (alcance futuro que se va a mostrar en el informe).
- `npm run test:ci`: 9 suites, **123 pruebas**.
