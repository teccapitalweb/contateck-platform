# CONTATECK · Orden de Trabajo OT-0021
## Historial de pagos por factura

**Módulo:** Facturación (consulta) — con datos del flujo de cobranza de OT-0020.
**Objetivo:** darle ventana a la trazabilidad que OT-0020 ya guarda en la
base: quién registró y confirmó cada pago, cuándo, cuánto, con qué
comprobante, qué póliza generó y en qué estado va el Complemento de Pago.

---

## 1. Qué se agregó

**Botón nuevo por factura** (icono de reloj, junto a Ver PDF) en la tabla
de Facturación — solo en facturas de ingreso reales. Abre un modal con:

- **Resumen arriba:** folio, cliente, PUE/PPD, total, pagado (solo pagos
  confirmados), y saldo actual.
- **Tabla de pagos** (del más reciente al más viejo): fecha, monto, forma
  de pago (nombre legible del catálogo SAT), estado
  (Registrado/Confirmado/Cancelado), folio de la póliza ligada, estado del
  Complemento de Pago (No aplica / REP pendiente / REP timbrado),
  trazabilidad (quién registró · quién confirmó, referencia), y botón para
  **abrir el comprobante** cuando existe.
- El comprobante se abre con **URL firmada de Supabase Storage** (expira
  en 1 hora) — mismo patrón que Ventas; el archivo nunca es público.
- Si la factura no tiene pagos, lo dice y explica dónde se registran
  (Contabilidad → Registrar movimiento → "Me pagó un cliente").

## 2. Piezas

- **Backend** `supabasePagosCliente.js` → `listarPagosCfdi()`: pagos del
  CFDI con join a `perfiles` (nombres de quien registró/confirmó, vía los
  FK `creado_por`/`confirmado_por`) y a `polizas` (folio).
- **Ruta** `pagosCliente.js` → `GET /api/pagos-cliente?cfdiId=...`
  (lectura; el RLS de la tabla ya limita a la empresa del usuario).
- **Helper** `postgres-crud.js` → `listarPagosCfdi(cfdiId)`.
- **Tabla** `app.js` → icono ICO_HIST por fila (`data-hist-cfdi` con el id
  Postgres del CFDI).
- **Modal** `facturacion.js` → `openHistorialPagos()` + `firmarComprobante()`.

Sin cambios de base de datos — todo lee lo que OT-0020 ya guarda.

## 3. Cómo probar

1. Facturación → en la fila de CT-32 (la que ya cobraste) → icono de
   reloj → debe mostrar el pago de $1,160 Confirmado, con tu usuario en
   "Registró/Confirmó", el folio I-00004 en Póliza, y "No aplica" en
   Complemento (era PUE).
2. Una factura sin pagos → mensaje de "todavía no tiene pagos".
3. Registra un pago con comprobante adjunto → el historial debe mostrar
   el ojito; al tocarlo abre el archivo en otra pestaña.

## 4. Pendientes que este historial deja visibles (futuras OTs)

- Cancelar un pago registrado que aún no se confirma (hoy no hay botón).
- Timbrado real del REP para PPD (el estado ya se ve; falta el flujo con
  el PAC — esperando reglas de la contadora).
- Cuentas por pagar (proveedores) — el espejo completo de este flujo.

---

## Addendum OT-0022 · Navegación de dos niveles + auditoría de datos

**Revisión solicitada:** convertir las vistas del historial en una sola
experiencia: Facturación → CFDI → Historial → Detalle del pago, sin salir
de Facturación.

### Cambios

- **Nivel 2 nuevo — Detalle del pago:** el ojito de cada pago ya no abre
  nada externo; el mismo modal cambia a la vista de detalle con
  "← Volver al historial" (regresa sin re-consultar el backend). Muestra:
  monto, fecha, forma de pago, **cuenta destino** (nueva en el API),
  referencia, notas, estado, comprobante, información contable, parte
  fiscal y trazabilidad con fecha/hora de cada acción.
- **Separación explícita de conceptos** en el detalle: sección "Parte
  fiscal" distingue Factura (CFDI) / Comprobante de pago (archivo interno)
  / Complemento de Pago (documento SAT) — tres cosas distintas.
- **Póliza:** solo se muestra el folio si existe en Postgres; si el pago
  está registrado sin confirmar, dice "Póliza contable pendiente". Nunca
  se inventa un número.
- **Comprobante:** Ver y Descargar con URL firmada (1h). Si no hay
  archivo: "Sin comprobante adjunto" — y adjuntar a un pago ya registrado
  queda marcado como **pendiente de habilitar** (no hay backend para eso
  todavía; no se simula).
- Las acciones de nivel página (Configuración, Timbrar, Timbrado masivo)
  nunca aparecen dentro del modal — viven solo en la vista principal.

### Auditoría de datos estáticos (solicitada)

- **`comprobante.png` NO era ficticio** — es el archivo real subido, pero
  el uploader lo renombraba genéricamente a `comprobante.<ext>` (patrón
  heredado de Ventas). Corregido: ahora se conserva el nombre original
  sanitizado (`recibo-bbva-enero.pdf`), y el historial lo muestra tal
  cual. Los comprobantes subidos ANTES de este cambio conservan el nombre
  genérico — son archivos reales, solo con nombre viejo.
- **Folios de póliza:** siempre vienen del join real a `polizas` — cero
  valores inventados.
- **Nombres de usuario:** join real a `perfiles` vía los FK
  `creado_por`/`confirmado_por`.
- Ninguna funcionalidad depende de folios, montos o nombres específicos;
  los datos de prueba usan las mismas tablas, RLS y flujos que producción.

### Pendientes explícitos (no simulados)

- Adjuntar comprobante a un pago ya registrado (requiere endpoint de
  actualización + regla de permisos).
- Cancelar un pago registrado sin confirmar.
- Timbrado real del Complemento de Pago (regla de la contadora).
