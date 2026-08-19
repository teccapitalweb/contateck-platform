# CONTATECK · Orden de Trabajo OT-0024
## Historial de pagos a proveedor + comprobante PDF (espejo de OT-0021/22)

**Módulo:** Contabilidad — tab nuevo "Cuentas por Pagar".
**Objetivo:** cerrar el hueco que quedó tras OT-0023 — se podía registrar
y confirmar un pago a proveedor, pero no había dónde consultarlo después
(especialmente una vez que la factura quedaba liquidada y desaparecía de
"Le pagué a un proveedor").

---

## 1. Tab nuevo: "Cuentas por Pagar"

A diferencia de "Le pagué a un proveedor" (que solo muestra facturas con
saldo pendiente, porque es para *pagar*), este tab muestra **todas** las
facturas de proveedor, pagadas o no — porque es para *consultar*. Cada
fila trae folio, proveedor, fecha, total, saldo, estado
(Pendiente/Liquidada), y un ícono de reloj para su historial.

## 2. Historial de pagos (modal, 2 niveles)

Mismo patrón exacto que ya existe en Facturación para clientes:

- **Nivel 1 — lista:** resumen de la factura (total/pagado/saldo) + tabla
  de todos sus pagos (fecha, monto, forma de pago, estado, póliza,
  trazabilidad).
- **Nivel 2 — detalle:** clic en el ojito de un pago → mismo modal cambia
  a vista de detalle con "← Volver al historial". Muestra monto, fecha,
  forma de pago, cuenta de origen, referencia, notas, estado, y la tabla
  de "Documentos de la operación" con evidencia adjunta (vista previa
  incrustada) y el comprobante Contateck.

## 3. Comprobante de pago a proveedor (PDF)

`pdf-comprobante-pago-proveedor.js` — espejo exacto de
`pdf-comprobante-pago.js` (OT-0022), mismo criterio: documento
administrativo limpio con folio de pago, proveedor, RFC, importe, forma
de pago, cuenta de origen, factura relacionada, saldo posterior, y
trazabilidad. Deja explícito que **no sustituye al CFDI ni al
Complemento de Pago que el proveedor debe emitir** — la obligación de
generar el REP es del proveedor, no de Contateck, en este lado de la
operación.

Se ve **incrustado en el propio detalle** (sin popups ni pestañas
nuevas), igual que el de clientes.

## 4. Backend

- `supabaseCfdisProveedor.js` — nueva función `listarCfdisProveedorTodas`
  (sin filtro de saldo>0, para el tab de consulta).
- `supabasePagosProveedor.js` — nueva función
  `obtenerPagoParaComprobante` (junta pago + factura + saldo posterior +
  nombre de empresa, para armar el PDF).
- `pagosProveedor.js` — 2 rutas nuevas:
  `GET /api/cfdis-proveedor` (todas) y
  `GET /api/pagos-proveedor/:id/comprobante-pdf`.

## 5. Frontend

- `dashboard.html` — tab y tabpane "Cuentas por Pagar" en Contabilidad.
- `contabilidad.js` — `renderProveedores()` (tabla), y todo el flujo del
  historial (`abrirHistorialProveedor`, `renderProvHistLista`,
  `renderProvHistDetalle`, `abrirComprobanteInternoProv`), conectado a
  `renderTodo()`.
- `postgres-crud.js` — `listarCfdisProveedorTodas`.

## 6. Cómo probar

1. Contabilidad → tab **"Cuentas por Pagar"** → deben aparecer todas las
   facturas de proveedor importadas hasta ahora (PRV-1042 liquidada,
   PRV-1043 con su saldo actual).
2. Reloj en PRV-1042 (la que ya se pagó completa) → debe mostrar su
   historial aunque ya no tenga saldo — esto antes era imposible de ver.
3. Ojito de un pago → detalle completo → "Ver" en "Comprobante de pago"
   → debe verse el PDF incrustado.
4. "← Volver al historial" → regresa sin recargar nada del backend.

## 7. Pendiente anotado (OT-0025, siguiente)

Reemplazar la edición libre de pólizas por un flujo de **asientos de
ajuste** (la póliza original nunca se sobreescribe; una corrección
genera una póliza nueva ligada a la original). Decisión de Jorge: se
construye con este criterio por default; si la contadora responde algo
distinto, se ajusta encima sin rehacer la base.
