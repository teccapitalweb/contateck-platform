# CONTATECK · Orden de Trabajo OT-0020
## Cobranza de facturas (CFDI → Pago → Póliza) + Configuración contable por empresa

**Módulo:** Contabilidad / Facturación
**Aprobación:** Responsable contable (especificación de 8 puntos) + Jorge
(alcance Opción B: los 7 roles contables completos, y tabla de
configuración por empresa en vez de cuentas "default razonables").

---

## 1. Qué resuelve

**a) "Me pagó un cliente" ahora es cobranza real, no un ingreso duplicado.**
Antes esa tarjeta generaba una póliza genérica Bancos/Clientes sin saber de
qué factura venía el dinero, sin controlar saldos, sin trazabilidad. Ahora:
factura con saldo → captura del pago → resumen Debe/Haber → confirmación
que genera la póliza real y deja rastro completo.

**b) Se eliminaron las 7 cuentas quemadas en el código.** El frontend
asumía que toda empresa tiene exactamente: 102 Bancos, 105 Clientes,
201 Proveedores, 401 Ventas, 209 IVA trasladado, 118 IVA acreditable,
601 Gastos. Ahora cada empresa mapea SUS cuentas reales una sola vez en
**Configuración contable** (botón nuevo en el header de Contabilidad).
Mientras un rol no esté configurado, las operaciones que lo necesitan se
**bloquean con mensaje claro** — nunca adivinan.

**c) `auditoria_log` se conecta por primera vez.** La tabla existía desde
OT-0002 sin que nada le escribiera. Registrar y confirmar un pago ahora
dejan constancia de quién, cuándo, qué factura, cuánto y qué póliza.

## 2. Base de datos (`database/OT-0020-cobranza-configuracion-contable.sql`)

- **`configuracion_contable`** — 1 fila por empresa, 7 columnas de rol →
  cuenta real. RLS: lectura toda la empresa, escritura solo
  contador/admin/director.
- **`pagos_cliente`** — el pago con su ciclo de vida
  (`registrado → confirmado`, o `cancelado`), `creado_por/confirmado_por`
  separados, `comprobante_url` (Storage), y estado fiscal aparte
  (`complemento_pago_estado`: `no_aplica` PUE / `pendiente` PPD /
  `timbrado` solo con UUID real del PAC). **Sin policies de
  insert/update directas** — todo pasa por las funciones, para que la
  validación de saldo y la auditoría nunca se puedan saltar.
- **Vista `cfdis_saldo`** — saldo calculado (total − pagos confirmados),
  nunca guardado, para que jamás se desincronice. Las facturas liquidadas
  desaparecen solas de la lista de cobro.
- **`registrar_pago_cliente()`** — valida saldo, marca PPD como
  complemento pendiente, escribe auditoría. NO genera póliza.
- **`confirmar_pago_cliente()`** — exige `cuenta_clientes_id`
  configurada (o falla con mensaje claro), genera la póliza con el folio
  atómico de OT-0012, liga pago↔póliza, escribe auditoría. Todo en una
  transacción: si la póliza no se puede crear, el pago NO queda
  confirmado (punto 4 de la contadora).

## 3. Backend

- `src/supabaseConfigContable.js` + `src/routes/configContable.js` —
  GET/PUT `/api/config-contable`.
- `src/supabasePagosCliente.js` + `src/routes/pagosCliente.js` —
  GET `/api/cfdis-saldo`, POST `/api/pagos-cliente`,
  POST `/api/pagos-cliente/:id/confirmar` (roles contables).
- `index.js` — registra los 2 routers.

## 4. Frontend

- **`auth-guard.js`** — carga `CONTATECK_CONFIG_CONTABLE_PG` y
  `CONTATECK_CFDIS_SALDO_PG` en el mismo Promise.all de sesión.
- **`postgres-crud.js`** — `guardarConfigContable`,
  `registrarPagoCliente`, `confirmarPagoCliente`.
- **`dashboard.html`** — botón "Configuración contable" en el header de
  Contabilidad.
- **`contabilidad.js`**:
  - Helpers `cuentaRol()`, `configContable()`, `getCuentaPorId()`.
  - Modal de Configuración contable: 7 campos con el buscador unificado
    de OT-0018.
  - Flujo de cobro completo (`renderCobroForm` → `renderCobroCaptura` →
    `renderCobroResumen` → `confirmarCobro`): lista con badges PUE/PPD y
    búsqueda, monto validado contra saldo, forma de pago SAT, cuenta
    destino, referencia/notas, comprobante a Storage (bucket
    `documentos`, carpeta `empresa/cobranza/`, mismo patrón que ventas),
    resumen "Así se registrará contablemente" con Debe/Haber visible pero
    no editable, aviso de Complemento de Pago pendiente para PPD.
  - Sin cuentas quemadas en: `cfdiAPoliza`, `plantillaAPoliza`
    (venta/gasto/pagoprov), `xmlAPolizaGasto` (importar XML de
    proveedor), `determinacionIVA`, `bancoDefault`, y el IVA acreditable
    de `diot()`.
  - La rama vieja de "cobro" en `plantillaAPoliza` se **eliminó** a
    propósito — la reemplaza el flujo nuevo.

## 5. Qué NO se implementó (a propósito)

- **Timbrado del Complemento de Pago (REP).** Solo el estado
  (`Pendiente`/`No aplica`) y el aviso en el resumen. La integración con
  el PAC es OT aparte cuando la contadora defina el flujo.
- **Reglas de IVA/ISR/retenciones en el cobro.** La póliza es
  estrictamente Debe cuenta destino / Haber Clientes.
- **Clasificación DIOT de cuentas de gasto** (`601/602/603/501` en
  `diot()`) — es una clasificación más amplia que un solo rol; pendiente
  de conversación con la contadora.
- Pregunta abierta: ¿registrar y confirmar puede ser la misma persona?
  Hoy sí (cualquier contador/admin/director hace ambos pasos). Si se
  quiere control "cuatro ojos", es un cambio chico en
  `confirmar_pago_cliente()`.

## 6. Orden de despliegue

**SQL primero → backend → frontend**, como siempre:

1. Correr `OT-0020-cobranza-configuracion-contable.sql` en Supabase (DEV).
2. Copiar archivos de backend y reiniciar (`npm start` local / redeploy
   Railway).
3. Copiar archivos de frontend.
4. **Primer paso funcional obligatorio:** entrar a Contabilidad →
   Configuración contable y mapear los 7 roles. Hasta entonces, Captura
   Rápida e importaciones se bloquean con mensaje (comportamiento
   esperado, no bug).

## 7. Cómo probar

1. Sin configurar nada: intenta "Vendí/cobré de contado" → debe bloquear
   con "Falta configurar: Bancos…". Correcto.
2. Configura los 7 roles (Configuración contable) → guarda → repite la
   venta → debe funcionar igual que antes.
3. "Me pagó un cliente": elige una factura con saldo, registra un pago
   parcial (ej. la mitad), confirma → toast con folio de póliza; la
   factura debe seguir en la lista con el saldo reducido.
4. Registra el resto → confirma → la factura desaparece de la lista.
5. Intenta capturar un monto mayor al saldo → debe rechazarlo en la UI y
   también en Postgres (doble validación).
6. `select * from auditoria_log order by created_at desc limit 5;` →
   debe mostrar el insert y el update de cada pago.
7. `select estado, poliza_id, creado_por, confirmado_por from
   pagos_cliente;` → trazabilidad completa.
