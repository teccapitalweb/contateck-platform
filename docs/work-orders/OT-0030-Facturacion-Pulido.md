# OT-0030 · Pulido de Facturación (bloque A)

**Rama:** `feature/OT-0030-facturacion-pulido` (sobre OT-0028)
**Alcance:** revisión de solo lectura de Facturación (CFDI 4.0) y los 10 pulidos de bajo riesgo
(A1 a A10) aprobados por el usuario. Sin cambios de esquema en la base de datos.

## 1. Qué se cambió

| # | Pulido | Dónde |
|---|---|---|
| A1 | KPIs reales de Facturación (antes cifras de ejemplo fijas: 38 timbradas, $1.28M, 3, $984k) | `frontend/app.js` (`renderFactStats`), `frontend/data-firestore.js`, `frontend/data.js` |
| A2 | Si un CFDI se timbra pero no se guarda, la respuesta lo avisa (`registroGuardado: false` + `aviso`) y se deja el UUID en el log del servidor | `backend/src/routes/invoices.js` (`estadoRegistro`) |
| A3 | `/api/demo/timbrar` solo existe en ambiente de pruebas y exige sesión + rol; el health ya no la anuncia | `backend/src/routes/demo.js`, `backend/index.js` |
| A4 | PDF, XML, PDF propio, estatus, correo: el CFDI debe ser de la empresa del usuario (`requireCfdiDeMiEmpresa`); correo exige rol de facturación; catálogo exige sesión | `backend/src/routes/invoices.js`, `backend/src/supabaseCfdis.js` (`buscarCfdi`) |
| A5 | Cancelar: verifica empresa y vigencia ANTES de llamar al SAT, usa el UUID guardado, ya no sobrescribe `raw` (el acuse se agrega como `raw.acuseCancelacion`) y avisa si no pudo actualizar el panel | `backend/src/routes/invoices.js`, `backend/src/supabaseCfdis.js` |
| A6 | Sin datos de prueba por defecto: el receptor llega completo o se rechaza. Nota de crédito y REP toman el receptor de la factura ORIGINAL (antes caían siempre en el RFC de pruebas porque el RFC no se mapeaba) | `backend/src/demo-data.js`, `backend/src/routes/invoices.js`, `frontend/data-firestore.js`, `frontend/facturacion.js` |
| A7 | Validaciones en el backend: RFC, CP, régimen, importes > 0, tasa de IVA, método/forma de pago, retenciones, UUID, correo, motivo de cancelación | `backend/src/validaciones.js` (nuevo) |
| A8 | Texto de la base/servidor escapado antes de usar `innerHTML` (tabla y ventanas de Facturación) | `frontend/app.js`, `frontend/facturacion.js` |
| A9 | Errores de PDF/XML/estatus ya no devuelven traza ni diagnóstico crudo (solo en pruebas) | `backend/src/routes/invoices.js` |
| A10 | Tras timbrar, cancelar, NC o REP se vuelve a leer la lista real de Postgres (`CTData.recargarCfdis`) | `frontend/data-firestore.js`, `frontend/facturacion.js` |

Además: `POST /api/timbrar` (invoice armado por el cliente, no lo usa el panel) queda solo para ambiente de pruebas.
Versiones de caché subidas en `dashboard.html`: `app.js` v7, `facturacion.js` v22, `data-firestore.js` v12.

## 2. Mapa del módulo (6 preguntas)

1. **Nace en:** Facturación → "Timbrar CFDI" (también NC, REP y cancelar desde la fila de la factura).
2. **Afecta:** `cfdis` (alta al timbrar; `estatus`/`cancelled_at`/`raw` al cancelar). No genera póliza por sí misma.
3. **Se consulta en:** Facturación (lista y KPIs); Contabilidad → "Contabilizar CFDI" y cobranza (`cfdis_saldo`); Dashboard (facturación del mes).
4. **Póliza:** no al timbrar. Se genera al contabilizar el CFDI o al confirmar un cobro (ver `Mapa-Modulos-Cobranza-CxP.md`).
5. **Saldo:** `cfdis_saldo` (auxiliar) contra la cuenta `105 · Clientes`.
6. **Documento relacionado:** XML/PDF en Fiscalapi; REP (tipo P) y nota de crédito (tipo E) ligados por UUID.

## 3. Pruebas hechas (sin timbrar nada)

- 17 pruebas unitarias de `validaciones.js`.
- 16 llamadas al backend local con sesión real que se rechazan ANTES del PAC: validaciones (400), CFDI de otra empresa o inexistente (404), sin sesión (401), motivo de cancelación inválido, correo inválido, health sin la ruta demo.
- En pantalla: KPIs en 0 con la base vacía; una fila con HTML malicioso en el nombre del cliente se muestra como texto y no se ejecuta.

### Prueba real en el sandbox de Fiscalapi (5-nov-2026)

Primer intento: 403 de Fiscalapi ("tu suscripción debe incluir: Emisión CFDI"); se resolvió activando la
suscripción de pruebas Emisión CFDI en `test.fiscalapi.com` (no era un error del código). Segundo intento,
un solo CFDI de prueba ($100 + IVA = $116, PUE, receptor de pruebas) desde el formulario del panel:

- Timbrado correcto, sin aviso de registro: quedó guardado en `cfdis` (folio `CT-37`, tipo I, vigente).
- La lista y los KPIs se actualizaron solos (1 timbrada, $116, 0 canceladas) sin recargar la página.
- PDF de Fiscalapi, PDF propio y XML responden 200 para un CFDI de la empresa; el estatus ante el SAT responde "Vigente".
- `raw.recipient` guarda `tin`, `legalName`, `zipCode`, `taxRegimeCode`, `cfdiUseCode` y `email`, así que la nota de
  crédito y el REP pueden tomar el receptor de la factura original. `raw.issuer` NO guarda el CSD ni contraseñas.
- Observación: la factura PUE aparece en "Por cobrar" ($116) hasta que se registra su cobro en Contabilidad
  (comportamiento de `cfdis_saldo`, OT-0020), no es un error de Facturación.

### Nota de crédito y cancelación en el sandbox (mismo día, autorizado por el usuario)

- **Nota de crédito** `NC-38` ($50 + IVA = $58) sobre `CT-37`, desde el botón de la fila: timbrada y guardada
  (tipo E, vigente), sin aviso de registro. El receptor se resolvió desde la factura original.
  Limitación de la prueba: el receptor de pruebas coincide con los antiguos valores por defecto (CP 42501, régimen
  601), así que esta prueba no distingue "leído de la original" de "valor por defecto"; sí confirma que la ruta
  (buscar original, validar receptor, timbrar) funciona de punta a punta.
- **Cancelación** de `NC-38` (motivo 02): cancelada ante el SAT, `estatus = cancelado`, con `cancelled_at`, y `raw`
  CONSERVA el CFDI original más `acuseCancelacion` (antes el acuse lo sobrescribía). Los KPIs pasaron a
  "Canceladas (mes): 1".
- **Fallo encontrado en la prueba (ya existía en Cobranza) y corregido aquí:** `listarCfdisSaldo`
  (`backend/src/supabasePagosCliente.js`) devolvía también notas de crédito (E) y complementos de pago (P) como
  si fueran facturas por cobrar: la NC de $58 sumó $58 a "Por cobrar" ($174) y se podía elegir para registrar un
  cobro. Ahora solo salen facturas de ingreso; "Por cobrar" volvió a $116. No requiere SQL.

**NO verificado:** el REP (necesita una factura PPD y timbrar un complemento más).

**Pendiente de decisión (contadora):** cómo debe afectar una nota de crédito vigente al saldo de la factura que
descuenta (hoy no lo afecta). Además, `registrar_pago_cliente()` (SQL) sigue aceptando el id de una NC si se le
manda directo; la protección completa pide una validación de `tipo` dentro de la función o de la vista
`cfdis_saldo` (cambio de SQL, no incluido).

## 4. Pendiente (bloque B, no incluido)

- **Emisor/CSD por empresa.** Hoy todas las empresas facturan con un único emisor global (`EMISOR_PRUEBA`). Es el bloqueo principal para producción multiempresa.
- Protección contra duplicados si se pierde la respuesta del timbrado y se reintenta.
- Paginación y filtros del listado (hoy máximo 200).
- Conectar el REP con Cobranza (que actualice el estado del complemento y el saldo en `pagos_cliente`).
- Timbrado masivo (el botón sigue como aviso).
- Sacar Firestore del flujo de CFDI.
- Claves de producto/unidad: si el usuario no elige, se usa `01010101` / `E48`; revisar con la contadora.
- El formulario de timbrado viene precargado con el receptor de pruebas (RFC, CP, régimen, nombre): útil en sandbox, hay que vaciarlo o ocultarlo al pasar a producción.

## 5. Antes de producción (checklist)

- Fiscalapi en `https://live.fiscalapi.com` con la llave de producción y CSD real.
- `REQUIRE_AUTH=true` y `ALLOWED_ORIGINS` con el dominio real en Railway.
- Confirmar las políticas RLS de la tabla `cfdis` (la comprobación de empresa depende de ellas).
- Resolver el emisor por empresa (bloque B).
