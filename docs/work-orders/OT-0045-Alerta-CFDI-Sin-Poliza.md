# OT-0045 · Alerta en el Dashboard: CFDI vigentes sin póliza contable

**Rama:** `feature/OT-0045-alerta-cfdi-sin-poliza` (sobre `integracion-local`). Sin cambios de SQL ni de cálculo contable.
Sale del hallazgo 1 de `Reporte-Prueba-Completa-Modulos-2026-11-13.md` (pagos y Balance con facturas sin póliza de causación).

## Qué hace
El Dashboard avisa cuando hay CFDI emitidos, **vigentes y timbrados** (con UUID del SAT) que no tienen una **póliza activa** ligada por ese UUID (`polizas.cfdi_uuid`).
La alerta es de aviso (amarilla), dice cuántos son y manda a Contabilidad con un clic; el texto indica el camino: Captura rápida → Venta → «Importar desde factura timbrada».

Reglas (en `backend/src/alertasContables.js`, funciones puras con prueba):
- No cuentan los CFDI cancelados ni los que no tienen UUID del SAT.
- Una póliza anulada (estado distinto de `ok`) no cuenta como contabilizada.
- Mayúsculas y espacios en el UUID no importan.
- Si alguna de las dos listas llega al tope de 1,000 filas de la consulta, **no se avisa** (podría estar incompleta y dar un falso aviso).
- Si alguna de las dos consultas falla, no se avisa y el Dashboard responde igual.

## Cambios
| Cambio | Dónde |
|---|---|
| Lógica de la alerta | `backend/src/alertasContables.js` (nuevo) |
| 2 consultas más en el Dashboard y la alerta | `backend/src/supabaseDashboard.js` |
| Prueba (22 en total en `npm run test:fiscal`) | `backend/test-fiscal.js` |

## Límites conocidos
- Solo cuentan las pólizas **ligadas por UUID** a la factura, y eso es lo correcto (respuesta de la sesión de Ventas y Pagos, 13-nov-2026): las ventas (`ventas`) no tienen CFDI ni UUID, son el registro de un pago recibido; y los cobros y pagos a proveedor (`confirmar_pago_cliente` / `confirmar_pago_proveedor`) son Bancos contra Clientes/Proveedores, no la contabilización de la factura, y una factura puede tener varios cobros parciales. Por eso **ni una póliza de Ventas ni un cobro deben dar por contabilizado un CFDI**, y no se descuentan. Si llevaran el UUID chocarían además con la regla `CFDI_DUPLICADO` de `crear_poliza_completa`. No hay falso aviso por ese lado.
- Riesgo relacionado, que no es de esta alerta: doble ingreso si una misma venta se contabiliza por Facturación **y** por Ventas/Cobranza. Es una decisión pendiente de la contadora, anotada en `OT-0029-Ventas-y-Pagos.md`.
- No cubre facturas de proveedor ni la situación inversa (CFDI cancelado con póliza vigente): es un caso aparte.

## Verificación (13-nov-2026, rama unida a `integracion-local`, backend reiniciado)
- Pruebas en el checkout de integración: 22 de `npm run test:fiscal` y 14 de `npm run test:lectura` pasan.
- Director, Empresa Demo C: `/api/dashboard` responde `ok` con **una** alerta nueva, "1 CFDI vigente sin póliza contable" (amarilla, lleva a Contabilidad). Corresponde al CFDI `CT-29` (vigente, sin póliza ligada); el CFDI `CT` está cancelado y no cuenta. La alerta se ve en el Dashboard y el clic abre "Contabilidad general".
- Se reinició solo el backend (puerto 8080) para cargar el cambio.

**No verificado:** la alerta con los roles contador y auditor (la consulta usa la sesión de cada quien, con RLS); el caso de más de 1,000 CFDI (cubierto solo por la prueba).
