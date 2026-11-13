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
- Solo detecta pólizas **ligadas por UUID**. Las pólizas de Ventas y Pagos (`origen = ventas`) no guardan el UUID del CFDI, así que si una factura se contabilizó por ahí la alerta puede seguir apareciendo. Si el equipo de Ventas y Pagos decide guardar el UUID en esas pólizas, el aviso queda exacto.
- No cubre facturas de proveedor ni la situación inversa (CFDI cancelado con póliza vigente): es un caso aparte.
