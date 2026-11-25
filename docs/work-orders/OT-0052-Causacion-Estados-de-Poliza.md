# OT-0052 · Revisión de Ventas y Pagos a la OT-0051: qué cuenta como "factura contabilizada"

**Rama:** `feature/OT-0052-causacion-estados-y-sql` (sobre `integracion-local`). Sin cambios en la base.
La sesión de Ventas y Pagos revisó `database/OT-0051-pagos-exigir-causacion-PROPUESTA.sql` (25-nov-2026) y marcó casos que dan **falsos avisos o falsos bloqueos**. Se comprobaron en DEV (solo lectura) y se corrigió lo que aplicaba.

## Lo que se comprobó en DEV
- `corregir_poliza_con_ajuste`, `anular_poliza_duplicada` y `actualizar_poliza_completa` **no copian `cfdi_uuid`**; solo `crear_poliza_completa` lo guarda. Al corregir una póliza, la original pasa a `corregida` (conserva su UUID) y la reversa y la póliza nueva (`correccion`) no lo llevan.
- Estados de póliza en DEV: 45 `ok`, 4 `reversa`, 3 `anulada`, 1 `correccion`, 1 `corregida`. Hay UUID con mayúsculas en una póliza `ok` y una `anulada`: comparar sin distinguir mayúsculas es necesario.
- Ninguna función toca `poliza_causacion_id` de `cfdis_proveedor`.
- Hoy en DEV no hay un falso aviso por esto (la póliza corregida no tenía UUID), pero lo habría tras corregir una póliza de causación de un CFDI.

## Cambios
1. **Alertas del Dashboard** (`backend/src/alertasContables.js`): una factura cuenta como contabilizada si tiene una póliza con UUID en estado `ok`, `corregida` o `correccion`; `anulada` no. Aplica a las dos alertas (CFDI sin póliza y pagos sin causación). Antes solo contaba `ok`. Prueba nueva con mutación comprobada.
2. **SQL propuesto** (`OT-0051-pagos-exigir-causacion-PROPUESTA.sql`, sigue **sin ejecutar**): mismos estados; comparación `lower(...) = lower(...)`; una factura **sin `uuid_sat` no se bloquea**; el mensaje del cobro avisa de no duplicar un ingreso ya registrado por Ventas; y el orden para deshacer queda explícito (primero recrear las funciones, **después** borrar la columna, o toda confirmación de pagos fallaría).

## Lo que no se resuelve aquí (decisión contable)
- **Póliza `anulada`:** `crear_poliza_completa` no deja volver a contabilizar el mismo CFDI (la regla `CFDI_DUPLICADO` ignora el estado), así que con la opción encendida un cobro sobre una factura cuya causación se anuló quedaría bloqueado sin salida. Hay que decidirlo con la contadora (permitir recontabilizar si la anterior está anulada, o no).
- **Doble ingreso:** un ingreso registrado por Ventas no lleva `cfdi_uuid`, así que no cuenta como causación del CFDI. Pendiente en `OT-0029-Ventas-y-Pagos.md`.
- Las pruebas de Ventas y Pagos (`test-confirmacion-concurrente.js`, casos C1-C6) deben usar facturas con causación si la opción se enciende.

## Pendiente de verificar
Que las copias de las dos funciones coincidan con las reales de DEV el día que se aplique: se leyeron con `pg_get_functiondef` el 25-nov-2026 (versión atómica con `for no key update`), y Ventas y Pagos confirma que coinciden con su `OT-0029-confirmacion-atomica.sql`.

## Verificación (25-nov-2026, rama unida a `integracion-local`, backend reiniciado)
- `npm run test:ci`: pasan las 6 suites (24 + 14 + 10 + 3 + 13 + 7).
- Director, Empresa Demo C: las dos alertas siguen igual con la regla nueva ("1 CFDI vigente sin póliza contable" y "6 pagos confirmados sobre facturas sin póliza de causación"); en estos datos no hay pólizas corregidas con UUID, así que no cambian las cifras.
**No verificado:** el caso de una póliza corregida con datos reales (solo por prueba automática); el SQL propuesto sigue sin ejecutarse ni probarse.
