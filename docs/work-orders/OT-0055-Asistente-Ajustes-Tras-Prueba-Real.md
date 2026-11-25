# OT-0055 · Ajustes del asistente tras probarlo con los datos reales de Empresa Demo C

**Rama:** `feature/OT-0055-asistente-ajustes` (sobre `integracion-local`). Sale de hacerle al asistente las 8 preguntas sugeridas con datos reales y comparar cada cifra contra la base (solo lectura).

## Lo que se comprobó bien
Balance General (Activo −$424.57, Pasivo −$510.78, Resultado $86.21, cuadra), caja y bancos (−$1,000.00 y $995.84, total −$4.16, igual que la Balanza de noviembre), alertas (las dos del Dashboard), pregunta sin sentido (no inventa) y saludo.

## Defectos encontrados y corregidos
1. **Cuentas por cobrar sumaba una factura cancelada.** Decía que los clientes debían **$274.68** en 2 facturas; lo correcto es **$42.68** en 1. Las vistas `cfdis_saldo` y `cfdis_proveedor_saldo` incluyen las facturas **canceladas** con su saldo (una cancelada de $580 con $232 "pendientes"). La herramienta ahora pide también el `estatus` y excluye las canceladas, en cobrar y en pagar. (El mismo defecto afecta a cualquier pantalla que sume esas vistas sin filtrar: queda anotado.)
2. **La pregunta sugerida "¿Cuánto me deben mis clientes y cuánto debo a proveedores?" solo contestaba la primera mitad.** Ahora, si la pregunta menciona las dos cosas, contesta las dos, en ese orden.
3. **Respuestas que podían confundir:** el IVA de un mes es el movimiento de ese mes (en noviembre da $0.00 aunque haya saldo acumulado); ahora lo aclara y sugiere preguntar "por este año". Igual con la utilidad cuando el mes no tiene movimientos.

## Pruebas
`test-asistente.js` 15 pruebas (+2) y `test-ia.js` 19 (la prueba de cuentas por cobrar y pagar ahora incluye facturas canceladas con saldo). Suma total: 105 pruebas en 8 suites.

## Pendiente que no es del asistente
- ~~Las pantallas de Cobranza y de cuentas por pagar deberían ocultar las facturas canceladas con saldo.~~ **Corregido en la revisión (OT-0057):** el selector de cobros ya excluía las canceladas (OT-0029) y los cobros nuevos sobre una factura cancelada ya se rechazaban (OT-0034); lo que faltaba era lo mismo del lado de proveedores, que se agregó en la OT-0057. El defecto de las vistas de saldos afectaba solo al asistente, que ya lo filtra.
- "¿Cuánto gané este mes?" depende de que las pólizas del mes toquen cuentas de ingresos, costos o gastos: en Demo C, noviembre solo movió bancos, clientes y proveedores, por eso no hay utilidad del mes.

## Verificación con datos reales (25-nov-2026, backend reiniciado, director de Demo C)
- "¿Cuánto me deben mis clientes y cuánto debo a proveedores?" → **$42.68** en 1 factura y **$27.84** en 1 factura (coincide con el reporte del 13-nov; antes sumaba la cancelada y decía $274.68).
- "¿Cuánto gané este año?" → Ingresos $258.62, Gastos $172.41, **Utilidad $86.21** (igual que el Estado de Resultados y el Balance).
- "¿Cómo va el IVA este año?" → trasladado $41.38, acreditable $27.59, **$13.79 a cargo** (igual que los saldos de la Balanza de noviembre).
- Corrección menor de redacción: "del año 2026" en vez de "de el año 2026", y la nota de "pregunta por el año" solo aparece cuando se pidió un mes.
**No verificado:** el chat en pantalla con los roles contador y auditor; la apariencia en celular.
