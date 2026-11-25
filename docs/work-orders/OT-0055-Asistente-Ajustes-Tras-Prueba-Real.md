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
- Las pantallas de Cobranza y de cuentas por pagar deberían ocultar o marcar las facturas canceladas con saldo (hoy aparecen con saldo pendiente). Es del módulo de Ventas y Pagos.
- "¿Cuánto gané este mes?" depende de que las pólizas del mes toquen cuentas de ingresos, costos o gastos: en Demo C, noviembre solo movió bancos, clientes y proveedores, por eso no hay utilidad del mes.
