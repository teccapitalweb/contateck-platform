# CONTATECK · Orden de Trabajo OT-0019
## Folio real de CFDI + captura de Método de Pago (PUE/PPD)

**Módulo:** Facturación / Contabilidad
**Origen:** Jorge reportó que la columna Folio en Facturación mostraba
solo "CT" sin número. Al investigar, salió a la luz un tema más de fondo:
el sistema tampoco distinguía facturas PUE de PPD, lo cual importa para
"Importar desde factura timbrada" en Contabilidad.

---

## 1. Bug del folio — causa raíz confirmada con datos reales

`resumenCfdi()` en el backend leía `data.folio ?? data.invoiceNumber`,
ninguno de los dos existe en la respuesta real de Fiscalapi — por eso
siempre guardaba `null`, y el frontend caía al respaldo (`serie`, "CT" a
secas).

Se confirmó contra la tabla `cfdis` real (columna `raw`, que por suerte sí
guarda el JSON completo de Fiscalapi) que el folio verdadero se arma con
`series + "-" + consecutive` — ej. `CT-33`, `CT-32`.

**Corregido en:** `backend/src/routes/invoices.js` (`resumenCfdi`).

## 2. Método de Pago (PUE/PPD) — por qué importa

Un CFDI puede ser:

- **PUE** (Pago en Una sola Exhibición) — el cobro ya ocurrió o ocurre al
  facturar. Una póliza de "cobro directo" es correcta tal cual.
- **PPD** (Pago en Parcialidades o Diferido) — la factura representa la
  venta, pero el cliente **todavía no paga**. Cuando el pago real llega,
  el SAT exige generar un **REP** (Recibo Electrónico de Pago) aparte, y
  la contabilización es distinta (dos momentos, no uno).

Este dato (`paymentMethodCode` en Fiscalapi) **no se estaba guardando en
absoluto**. Se confirmó contra datos reales que hoy todas las facturas de
prueba son PUE — pero el sistema debe poder distinguir ambas, porque en
producción real es normal que existan las dos.

**Corregido en:** `backend/src/routes/invoices.js` (captura
`metodoPago`/`formaPago`), `backend/src/supabaseCfdis.js` (nuevas columnas
`metodo_pago`/`forma_pago`), `frontend/data-firestore.js` (expone
`metodoPago` al resto del frontend).

## 3. Qué se hizo YA (no requiere validación de la contadora)

Esto es captura y despliegue de un dato que el propio CFDI ya trae — no es
una decisión de regla contable nueva:

- Folio real visible en Facturación.
- Etiqueta **PUE** (verde) / **PPD** (ámbar) en cada factura dentro del
  modal de "Importar desde factura timbrada" en Contabilidad.
- **Las PPD se bloquean para importar** — aparecen en la lista (para que
  quede claro que existen, no se ocultan) pero no se pueden seleccionar;
  al hacer clic muestran un aviso explicando por qué, en vez de dejar
  pasar una póliza que podría estar mal.

## 4. Qué falta y necesita el visto bueno de la contadora

- Qué póliza exacta generar cuando llega el REP de una PPD.
- Si "Vendí/cobré de contado" debe comportarse distinto al facturar una
  venta PPD (¿solo Clientes/Ventas, sin tocar Bancos, hasta que llegue el
  pago real?).

Mensaje ya redactado para mandarle (ver conversación) — en cuanto
responda, se diseña el flujo de REP como su propia OT.

## 5. Archivos modificados

- `backend/src/routes/invoices.js`
- `backend/src/supabaseCfdis.js`
- `frontend/data-firestore.js`
- `frontend/contabilidad.js`
- `database/OT-0019-folio-metodopago.sql` (nuevo — correr en Supabase
  ANTES de subir el backend, incluye backfill de las facturas ya
  timbradas con folio null)

## 6. Orden de despliegue

Mismo criterio de siempre: **SQL primero → backend → frontend.**

1. Correr `OT-0019-folio-metodopago.sql` en Supabase (DEV, validar, PROD).
2. Subir `invoices.js` y `supabaseCfdis.js` al backend.
3. Subir `data-firestore.js` y `contabilidad.js` al frontend.

## 7. Cómo probar

1. Recarga Facturación — los folios existentes deben mostrar `CT-29`,
   `CT-30`, etc. en vez de solo "CT" (gracias al backfill).
2. Timbra una factura de prueba nueva — el folio nuevo debe aparecer
   completo desde el primer render, sin necesitar backfill.
3. En Contabilidad → Captura Rápida → "Me pagó un cliente" → Importar
   desde factura timbrada: las facturas deben mostrar su etiqueta PUE.
   Si en algún momento hay una PPD de prueba, confirmar que aparece
   marcada y que no se puede seleccionar.
