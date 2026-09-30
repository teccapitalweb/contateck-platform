# CONTATECK · Mapa de módulos — Cobranza y Cuentas por Pagar

**Propósito:** que ningún módulo se construya sin saber de antemano dónde
nace, qué toca, y dónde se puede volver a consultar. A partir de esta OT,
toda nueva funcionalidad de dinero/documentos lleva este mapa en su `.md`
**antes** de escribir código, no después.

---

## Plantilla (6 preguntas obligatorias por módulo)

1. **¿Dónde nace?** — la acción del usuario que lo origina.
2. **¿Qué afecta?** — qué tablas/registros cambian.
3. **¿Dónde se consulta?** — todas las pantallas donde ese dato vuelve a
   aparecer, no solo la pantalla donde se creó.
4. **¿Qué póliza genera?** — si aplica, cuál y cuándo (inmediato o
   diferido).
5. **¿Qué saldo modifica?** — cuál cuenta de control, y cuál auxiliar (si
   existe) debe cuadrar contra ella.
6. **¿Qué documento queda relacionado?** — CFDI, comprobante interno,
   evidencia adjunta, complemento de pago.

---

## Módulo: Cobranza de clientes (OT-0020/21/22)

1. **Nace en:** Contabilidad → Registrar movimiento → "Me pagó un
   cliente" → seleccionar factura con saldo → capturar pago → Confirmar.
2. **Afecta:** `pagos_cliente` (nuevo registro), `polizas` +
   `poliza_partidas` (nueva póliza, solo al confirmar).
3. **Se consulta en:**
   - Contabilidad → Pólizas (la póliza de cobro aparece ahí, folio I-000XX)
   - Facturación → icono de reloj en la factura → Historial de pagos
   - Facturación → dentro del historial → detalle del pago → PDF
4. **Póliza que genera:** al **confirmar** (no al registrar) — Debe
   cuenta destino (Bancos/Caja) / Haber `105 · Clientes`.
5. **Saldo que modifica:**
   - Auxiliar: `cfdis_saldo` (vista, saldo por factura — calculado, no
     guardado)
   - Cuenta de control: `105 · Clientes` en Libro Mayor — la suma de
     saldos pendientes en `cfdis_saldo` debe cuadrar contra el saldo de
     esa cuenta.
6. **Documento relacionado:**
   - CFDI original (la factura que se está cobrando)
   - Comprobante interno de pago (PDF generado por Contateck)
   - Evidencia adjunta (archivo que subió el usuario, si aplica)
   - Complemento de Pago (solo estado — "Pendiente"/"No aplica"; el
     timbrado real es OT futura)

## Módulo: Cuentas por Pagar / Facturas de proveedor (OT-0023/24)

1. **Nace en:** Contabilidad → Pólizas → "Importar XML recibido" (la
   factura se guarda) → después, "Le pagué a un proveedor" → seleccionar
   factura con saldo → capturar pago → Confirmar.
2. **Afecta:**
   - Al importar: `cfdis_proveedor` (factura persistida) + `polizas` (la
     póliza de causación, inmediata)
   - Al confirmar un pago: `pagos_proveedor` + otra `polizas` nueva
3. **Se consulta en:**
   - Contabilidad → Pólizas (la póliza de causación Y la de cada pago)
   - Contabilidad → **Cuentas por Pagar** (tab general del módulo) →
     sección "Auxiliar de facturas" (historial completo, pagadas o no)
     → icono de reloj → Historial de pagos → detalle → PDF
   - Contabilidad → Libro Mayor, cuenta `201 · Proveedores` (la cuenta de
     control)
4. **Póliza que genera:**
   - Al **importar el XML** (inmediata): Debe `601 Gastos` + `118 IVA
     acreditable` / Haber `201 Proveedores` — reconoce la obligación.
   - Al **confirmar el pago** (después, cuando corresponda): Debe
     `201 Proveedores` / Haber cuenta de origen (Bancos/Caja) — baja la
     obligación.
5. **Saldo que modifica:**
   - Auxiliar: `cfdis_proveedor_saldo` (vista, saldo por factura)
   - Cuenta de control: `201 · Proveedores` en Libro Mayor — la suma de
     saldos pendientes en el auxiliar debe cuadrar contra esa cuenta.
6. **Documento relacionado:**
   - CFDI del proveedor (persistido en `cfdis_proveedor`, con su `raw`)
   - Comprobante interno de pago (PDF)
   - Evidencia adjunta
   - (Complemento de Pago no aplica de este lado — es obligación del
     proveedor emitirlo, Contateck no lo genera)

---

## Regla hacia adelante

Cualquier OT que toque dinero, documentos, o saldos incluye este mapa
completo en su `.md` **antes** de la sección de implementación — no
después, como constancia de que el flujo completo se pensó de punta a
punta y no solo la pantalla donde se captura.
