# OT-0072 · Editar y cancelar un pago pendiente (Ventas y Pagos)

**Rama:** `feature/OT-0072-editar-cancelar-venta` (sale de `integracion-local` en `666c401`). Solo local.

## Qué había
Si alguien registraba un pago con un error (cliente, importe, fecha, banco), **no había forma de corregirlo ni de anularlo** antes de que lo revisaran: la única salida era dejar que otra persona lo rechazara. Además, la política de la base solo deja actualizar `ventas` a contador, admin y director, así que un **vendedor** (quien más registra pagos) no podía tocar ni lo suyo.

## Qué se hizo
- **Editar** (solo quien registró el pago y solo mientras esté *Pendiente*): botón "Editar" en la fila y en el detalle. Abre el mismo formulario de captura **precargado** (incluye el método y el banco, con su "Otro", el pago en efectivo sin banco y el IVA). El folio, el estado y el comprobante no cambian; el comprobante se conserva y el formulario avisa cómo cambiarlo (cancelar y volver a capturar).
- **Cancelar** (quien lo registró, o Admin/Director, solo mientras esté *Pendiente*): pide un motivo (3 a 500 caracteres). El registro **no se borra**: queda con estado *Cancelado*, el motivo visible en el detalle, un chip "Cancelados" y fuera de los totales de las tarjetas (que avisan "N cancelados aparte").
- Un pago **en revisión, confirmado o rechazado ya no se edita ni se cancela**: quien revisa lo rechaza con motivo; uno confirmado tiene póliza.
- **Base de datos** (`database/OT-0072-editar-cancelar-venta.sql`): dos funciones `SECURITY DEFINER`, `editar_venta_pendiente` y `cancelar_venta_pendiente`. Son la única vía: revisan quién eres, tu empresa y el estado con la fila bloqueada (`for update`), así no se puede editar mientras otra persona la toma para revisión. Repiten las reglas de captura (obligatorios, longitudes, importe, fecha). Dejan rastro en `auditoria_log` (antes y después al editar; estado y motivo al cancelar). Solo las ejecuta quien tiene sesión (no `anon`). Reversa en `OT-0072-editar-cancelar-venta-rollback.sql`.
- **Backend:** `PUT /api/ventas/:id` y `POST /api/ventas/:id/cancelar`. Validan antes para dar mensajes claros y, si el SQL aún no se aplicó, dicen "Falta aplicar el SQL OT-0072".
- Los botones nuevos quedan **ocultos para el rol de solo lectura** (auditor).

## Pruebas
- `node test-ventas-editar-cancelar.js` (38, ya en `npm run test:ci`): sin sesión, creador vs. ajeno, director, contador a secas, RH, pagos en revisión/confirmados/inexistentes, campos inválidos que no llegan a la base, datos limpios, que no se pueda cambiar comprobante/folio/estado, motivo obligatorio, SQL no aplicado, y que la pantalla tenga los botones y el SQL sus protecciones.
- `database/OT-0072-prueba-sql-pglite.mjs` (Postgres en memoria, fuera del `test:ci`): confirma la premisa (un vendedor **no** puede actualizar `ventas` directo), las reglas por rol y por estado, el rastro en auditoría, los límites que repite la base, que nada se borra, que el SQL se aplica dos veces sin error y la reversa.
- **Probado en el panel real** (sesión de director, DEV, 26-nov-2026): se registró el pago P-0007; "Editar" lo abrió precargado; se cambiaron cliente, importe ($1,160.00 → $2,320.50), IVA (sin IVA) y banco ("Otro" → Bancoppel); la base y el detalle mostraron lo nuevo y `auditoria_log` guardó el antes y el después. "Cancelar" sin motivo avisó y no hizo nada; con motivo dejó P-0007 como *Cancelado* con su motivo, apareció en el chip "Cancelados", salió de los totales ("Total registros 6 · 1 cancelado aparte") y ya no ofrece Editar, Cancelar ni Tomar para revisión.

## Sin verificar
- Con una sesión de **vendedor** de verdad en el panel (no hay una con acceso en el visor). Lo que sí se comprobó en la pantalla, cambiando el rol y el usuario en memoria: el vendedor ve Editar y Cancelar solo en lo que registró y sin "Tomar para revisión"; en el pago de otra persona solo ve "Ver"; el contador solo ve "Tomar para revisión"; el director ve "Cancelar" en el ajeno pero no "Editar"; RH solo ve "Ver". La parte del servidor (que un vendedor no pueda editar lo ajeno) está cubierta por las pruebas del backend y del SQL.
- Cambiar el comprobante al editar: no se ofrece a propósito (se cancela y se vuelve a capturar).
- Definir con la contadora si una corrección de un pago **ya confirmado** debe tener un camino propio (hoy tiene póliza y no se toca aquí).
- Producción: el SQL se aplicó solo en DEV.
