# OT-0029 · Ventas y Pagos — pulido y documentación

**Rama:** `feature/OT-0029-ventas-pulido`
**Origen:** auditoría de solo lectura del módulo (Fase 1) y aprobación de los
pulidos A1–A9, B1 y B4.
**Nota:** Ventas se construyó en OT-0014 y en los commits "Conexión
Ventas-Contabilidad" sin OT escrita; este documento es esa OT.

---

## 1. Mapa del módulo (6 preguntas obligatorias)

1. **¿Dónde nace?**
   Ventas y Pagos → "Nueva venta" → cliente, concepto, importe, ¿incluye
   IVA?, fecha de pago, método, referencia, banco (no aplica en efectivo),
   comprobante → Guardar (queda `pendiente`). Después un validador
   (contador/admin/director): "Tomar para revisión" → "Confirmar" o
   "Rechazar" (con motivo).

2. **¿Qué afecta?**
   - Al registrar: `ventas` (insert) + archivo en Storage
     `documentos/{empresa}/ventas/{uuid}/comprobante.ext`.
   - Al tomar / rechazar: `ventas` (`estado`, `tomado_por/en`,
     `revisado_por/en`, `motivo_rechazo`).
   - Al confirmar: `ventas` + `polizas` + `poliza_partidas` (vía
     `crear_poliza_completa`) y `ventas.poliza_id` queda ligado a la póliza.
   - No toca `cfdis`, `cfdis_saldo`, `pagos_cliente` ni `auditoria_log`
     (ver pendientes).

3. **¿Dónde se consulta?**
   - Ventas y Pagos: bandeja, KPIs, filtros (estado, "Sin póliza", búsqueda,
     mes) y detalle (con folio de póliza o aviso de que falta).
   - Contabilidad → Pólizas: folio `I-000XX`, marcada "Generada
     automáticamente desde Ventas", sin botón Editar.
   - Contabilidad → Libro Mayor: Bancos, Ventas y servicios, IVA trasladado.
   - Dashboard: a través de las pólizas de Ingreso del mes (no lee `ventas`).
   - Facturación: **no** la ve.

4. **¿Qué póliza genera?**
   Una póliza de tipo **Ingreso**, **al confirmar** (diferida):
   Debe `Bancos` (total) / Haber `Ventas y servicios` (subtotal) /
   Haber `IVA trasladado` (si "incluye IVA", total/1.16). Cuentas tomadas de
   `configuracion_contable`. Fecha = fecha de pago capturada.
   Si no se puede generar (falta cuenta, periodo cerrado…), la venta queda
   confirmada con la marca **"Sin póliza"** y el botón **"Generar póliza"**
   reintenta sin duplicar (si ya existe una póliza de esa venta, solo la
   liga).

5. **¿Qué saldo modifica?**
   Cuentas de control: Bancos (sube), Ventas (sube), IVA trasladado (sube).
   No hay auxiliar: no afecta `cfdis_saldo` ni Clientes (105).

6. **¿Qué documento queda relacionado?**
   El comprobante subido (imagen/PDF en Storage, `ventas.comprobante_path`)
   y la póliza (`ventas.poliza_id`). No hay CFDI ni complemento de pago.

---

## 2. Cambios de esta OT

**Frontend — `frontend/ventas.js`**
- A1: todo dato de usuario se escapa antes de `innerHTML` (XSS almacenado).
- A2: "hoy" en fecha local (antes UTC: después de ~18:00 proponía mañana);
  la fecha de pago no puede ser futura.
- A4: si el comprobante no se puede subir, **no** se guarda la venta; banco
  y método ya no vienen preseleccionados (BBVA/SPEI); en efectivo se oculta
  el banco; botones bloqueados mientras la acción está en curso; avisos de
  error/póliza más largos.
- A5: se quitó la URL de respaldo hacia un dominio fijo de Railway.
- A6: tarjeta "Confirmado este mes" (la anterior repetía el monto), filtro
  por mes, buscador y aviso si se alcanza el tope de 300 ventas.
- A9: limpieza (`window.CTVentas` sin uso, variable `perfil`, comentario
  huérfano, CSS de `select`).
- B1: aviso persistente de configuración contable incompleta, marca "Sin
  póliza", filtro "Sin póliza", folio de póliza en el detalle, botón
  "Generar póliza", rechazo con motivo (se muestra en el detalle).

**Backend**
- A3 `supabaseVentas.js`: validación al registrar (importe > 0 a 2
  decimales, fecha válida no futura, longitudes, rol en `ROLES_REGISTRO`,
  ruta del comprobante dentro de `{empresa}/ventas/`).
- A9: se quitó `consultora_id` del insert (sin UI).
- B1: liga `poliza_id`; rechazo exige `motivo`; pre-chequeo de cuentas
  (con IVA y sin cuenta de IVA ya no genera una póliza descuadrada: dice qué
  falta); endpoints nuevos `GET /api/ventas/config-contable` y
  `POST /api/ventas/:id/generar-poliza`.
- A8 `supabasePagosCliente.js`: el selector de "Me pagó un cliente" ya no
  ofrece facturas canceladas.

**Contabilidad — `frontend/contabilidad.js`** (A7): se corrigió el comentario
y el texto de la póliza de Ventas, que prometían una corrección ("rechazar y
re-registrar") que no existe para ventas confirmadas.

**Base de datos**
- `database/OT-0029-ventas.sql`: definición base de `ventas` (documentación),
  columnas `poliza_id` y `motivo_rechazo`, índices y backfill.
- `database/OT-0029-ventas-introspeccion.sql`: consultas de solo lectura
  para exportar de DEV lo que faltaba documentar (B4).
- B4 (hecho, exportado de DEV el 2026-11-05): sección 4 de
  `OT-0029-ventas.sql` con las políticas RLS de `ventas` y las de Storage
  (se crean solo si no existen), y `database/OT-0029-funciones-contables-dev.sql`
  con la versión real de `crear_poliza_completa` (6 parámetros),
  `actualizar_poliza_completa`, `anular_poliza_duplicada`, `cerrar_periodo`
  y `corregir_poliza_con_ajuste`.

### Orden de despliegue
1. Correr `OT-0029-ventas.sql` en DEV (SQL Editor).
2. Reiniciar el backend con esta rama.
3. Recargar el panel (el código tolera que el SQL aún no se haya corrido,
   pero sin él no se ve la liga con la póliza ni se guarda el motivo).

---

## 3. Pendientes (no incluidos)

**Requieren decisión de la contadora**
- Cómo corregir o cancelar una venta ya **confirmada** (reversa + estado
  `cancelada`).
- Contrapartida correcta: Bancos/Ventas directo vs Clientes; Caja en
  efectivo; cuenta destino por método de pago.
- Reglas de IVA (16% fijo hoy; tasas 8%/0%/exento; retenciones).
- Riesgo de ingreso duplicado Ventas ↔ Facturación/Cobranza (una venta no
  se liga a un CFDI).
- Fecha de la póliza y periodos cerrados; moneda; pagos parciales;
  folio continuo; motivo obligatorio ya implementado, falta confirmar si un
  rechazo puede reabrirse.

**Técnicos aprobables aparte (con SQL)**
- Folio atómico `siguiente_folio_venta` (hoy `count + 1`).
- Registro de cada transición en `auditoria_log`.
- Revalidar saldo en `confirmar_pago_cliente/proveedor` (hoy se puede
  confirmar de más si hay dos pagos registrados).
- Validar que la cuenta destino/origen de un pago pertenezca a la empresa.
- Editar/cancelar una venta `pendiente` por quien la registró.
- B4, lo que aún falta exportar de DEV: `periodo_esta_cerrado(uuid, date)`,
  la tabla `periodos_contables` y sus políticas. `abrir_periodo` no existe
  en DEV (hoy se cierra un periodo pero no hay función para reabrirlo).
- Quitar el mismo respaldo de URL fija en `contabilidad.js` (3 sitios).

---

## 4. Pruebas sugeridas (DEV, hechas por una persona)

| Caso | Esperado |
|---|---|
| Registrar con importe 0 / negativo / fecha futura | Rechazado con mensaje claro (pantalla y backend) |
| Registrar en efectivo | No pide banco |
| Adjuntar comprobante y que falle la subida | No se guarda la venta |
| Escribir `<b>x</b>` en cliente/notas | Se ve como texto, no como HTML |
| Rechazar sin motivo | No deja; con motivo, el detalle lo muestra |
| Confirmar con cuentas contables configuradas | Póliza `I-000XX` y su folio aparece en el detalle |
| Confirmar con IVA y sin cuenta de IVA | Venta confirmada, "Sin póliza", aviso dice qué falta; tras configurar, "Generar póliza" la crea una sola vez |
| Doble clic en Confirmar | Una sola petición |
| "Me pagó un cliente" con factura cancelada | No aparece en el selector |

---

## 5. Pruebas realizadas (DEV, 2026-11-05)

Hechas por una persona con su propio login, con el backend de esta rama en el
puerto 8081 y el panel en 5511 (todos los datos son de prueba).

| Caso | Resultado |
|---|---|
| Importe 0 y −100 | Rechazado en pantalla: "Captura un importe mayor a cero"; no llegó nada al backend |
| Fecha futura | El calendario deshabilita los días posteriores a hoy |
| Efectivo | Se oculta el campo banco |
| Cliente `<b>prueba</b>` | Se ve literal en la bandeja (no en negritas) |
| Rechazar sin motivo / con motivo | Sin motivo no deja; con motivo queda guardado en `motivo_rechazo` (verificado en la base) |
| Confirmar con cuentas configuradas (SA de CV, P-0005 de prueba) | Póliza I-00015: Bancos 116 / Ventas 100 / IVA trasladado 16, cuadrada; folio en el detalle |
| "Generar póliza" en venta confirmada sin póliza (P-0002) | Creó I-00014 y ligó `poliza_id`; el botón desaparece (sin duplicar) |
| Ligado automático (P-0003) | Quedó ligada a I-00013 con el SQL de la OT |
| Confirmar con cuentas faltantes (Empresa Demo C, P-0003) | Quedó "Confirmado" + "Sin póliza", aviso con las cuentas que faltan, **no se creó póliza** (verificado en la base) |
| Separación de funciones | P-0004 y P-0005 las registró un usuario y las validó otro (verificado en la base) |
| Aislamiento entre empresas | Ventas: cada empresa ve solo las suyas. Pólizas: en ventana limpia no aparecen pólizas de otra empresa |

No se probó: periodo cerrado, y rechazo de una venta por quien la registró
(la regla vive en backend).

## 6. Hallazgos nuevos (no corregidos aquí)

1. **Datos de otra sesión en el navegador.** Al entrar con varias cuentas en el
   mismo navegador, la lista de pólizas de Contabilidad mostró pólizas de dos
   empresas a la vez. En una ventana limpia no pasó, y la base filtra bien: es
   caché del panel que no se limpia al cambiar de usuario. No es de Ventas.
2. **El UPDATE de `ventas` no limita columnas ni estados.** La política deja a
   un contador/admin/director modificar cualquier campo de una venta, incluso
   confirmada, si llama a la base directo con su token. Y la separación de
   funciones solo se valida en el backend. Pendiente: decidir un trigger que
   bloquee cambios tras confirmar.
3. **Periodo cerrado y "Generar póliza".** `crear_poliza_completa` rechaza
   fechas de un periodo cerrado, y Ventas usa la fecha de pago. Una venta
   confirmada con fecha en un mes cerrado no podrá generar su póliza nunca
   (`corregir_poliza_con_ajuste` sí usa la fecha de hoy en ese caso). Decisión
   de la contadora: qué fecha lleva la póliza.
4. **Tiempos.** El listado de ventas tarda ~2 s y confirmar/generar ~4 s por
   peticiones en serie a la base. Mejora posible, no urgente.
5. **`/api/firebase-token` responde 404** y por eso el panel muestra
   "Firestore no disponible" (fuera de Ventas).

---

## 7. Confirmación de pagos atómica (Cobranza y Cuentas por pagar)

**Problema.** Confirmar un pago bloquea la fila de *ese* pago, pero el saldo de la
factura se compara en el backend (OT-0034) con una consulta aparte, antes de
llamar a la función de la base. Si dos personas confirman a la vez **dos pagos
distintos de la misma factura** (cada uno cabía en el saldo), las dos lecturas
ven el saldo completo, las dos pasan y la factura queda pagada de más, con dos
pólizas. Bloquear cada pago no lo evita: son filas distintas.

**Cambio aplicado en Supabase DEV y validado el 2026-11-12** (resultado en "Validación de cierre", abajo).
**Producción: sin aplicar.**

| Archivo | Para qué |
|---|---|
| `database/OT-0029-confirmacion-atomica-introspeccion.sql` | Paso 0, solo lectura: exporta las definiciones reales de `confirmar_pago_*`, revisa las vistas de saldo y lista pagos "registrados" que ya no cabrían. |
| `database/OT-0029-confirmacion-atomica.sql` | Reemplaza `confirmar_pago_cliente` y `confirmar_pago_proveedor`: tras bloquear el pago, bloquea la **factura** (`for no key update`), lee el saldo actual con el bloqueo ya en mano y, si el pago no cabe, aborta todo (sin póliza ni cambio de estado). |
| `backend/test-confirmacion-concurrente.js` | Prueba de carrera hecha por una persona con su login: registra dos pagos que no caben juntos y los confirma en paralelo. |
| `backend/test-bloqueo-concurrente.js` | Prueba de bloqueo bajo carga (proveedor): 8 pagos de la misma factura, de los que solo caben 4, confirmados a la vez; registra 2 pagos de $1 durante la espera. Solo corre sobre una factura marcada `raw.prueba = 'OT-0029'`; no borra nada. |

Decisiones de diseño:
- `for no key update` y no `for update`: este último choca con el bloqueo de
  llave foránea que toma cualquier INSERT de pago y frenaría los registros
  mientras alguien confirma. Así solo se estorban dos confirmaciones de la misma
  factura.
- Orden de bloqueos fijo pago → factura: sin interbloqueos.
- El mensaje de error es el mismo que ya da el backend, así que la pantalla no
  cambia; el chequeo del backend queda como aviso rápido y la función es la
  autoridad. **No hay cambio de código de backend ni de frontend.**
- El archivo reemplaza las funciones completas con las versiones del repo
  (OT-0020 fix2, OT-0023): **correr primero el paso 0** y comparar con DEV.
- Fuera de alcance: `registrar_pago_*` sigue validando contra pagos confirmados
  (dos registros simultáneos pueden dejar dos "registrados" que no caben juntos;
  el primero en confirmar gana). Tampoco valida factura cancelada al confirmar.
  Decisiones de la contadora si se quiere que "registrado" reserve saldo.

Orden para aplicarlo (DEV): paso 0 → pegar el resultado de la consulta 1 para
comparar → `OT-0029-confirmacion-atomica.sql` → validación del propio archivo →
prueba de carrera. Para producción, mismo orden.

### Pruebas para repetir contra la regla de saldo al confirmar (árbol integrado)

Se prueban con el código que trae la regla (OT-0034, rama `integracion-local`),
con el login de una persona y solo datos de prueba.

| # | Caso | Esperado |
|---|---|---|
| C1 | Factura con saldo S. Registrar pago A y pago B de ~60% de S cada uno | Los dos se registran (cada uno cabe solo) |
| C2 | Confirmar A, luego B | A confirma con póliza; B: "dejaría la factura pagada de más: su saldo actual es $…"; B sigue "registrado", sin póliza nueva |
| C3 | Pago que cubre justo el saldo restante | Confirma (borde exacto) |
| C4 | Doble clic en Confirmar sobre el mismo pago | Una sola póliza |
| C5 | Nota de crédito / REP / factura cancelada | No aparecen para cobrar |
| C6 | Lo mismo en Cuentas por pagar (C1–C3 con factura de proveedor) | Mismo comportamiento |
| V1 | Ventas: registrar → tomar → confirmar | Póliza `I-…`; en el detalle, el folio es un botón que abre la póliza en Contabilidad |
| V2 | Venta con IVA | El detalle dice "con IVA incluido… no se suma aparte"; póliza desglosada |
| V3 | Confirmar una venta no mueve saldos de Cobranza | Los saldos de facturas no cambian (ver riesgo de ingreso duplicado Ventas vs Cobranza, ya anotado) |
| A1 | Con el SQL atómico aplicado: `node test-confirmacion-concurrente.js cliente` | Uno confirma, el otro rechazado, saldo ≥ 0 |

**Paso 0 ejecutado en DEV (2026-11-11, solo lectura).** Las definiciones reales
de `confirmar_pago_cliente` y `confirmar_pago_proveedor` coinciden con las del
repo (OT-0020 fix2 y OT-0023; solo difiere el espaciado), así que
`OT-0029-confirmacion-atomica.sql` no pisa ningún cambio hecho a mano. Las dos
vistas de saldo son `security_invoker=true`; `cfdis`, `cfdis_proveedor`,
`pagos_cliente` y `pagos_proveedor` tienen `empresa_id` y estado/estatus. Hay un
solo pago "registrado" que ya no cabe (cliente, $100 contra saldo $42.68: el pago
2 de la prueba de OT-0034); con la regla nueva no se podrá confirmar y no hay
función para cancelarlo, así que queda como registrado. (Después de este paso 0,
Jorge aplicó el SQL de cambio en DEV: ver la validación de cierre.)

### Validación de cierre (Supabase DEV, 2026-11-12)

Todo con el login de `demo.director.c` en Empresa Demo C y solo datos de prueba
(emisor de sandbox "ESCUELA KEMPER URGATE" y un proveedor ficticio). Nada se borró.

**Fase 1, solo lectura.**
- `confirmar_pago_cliente` y `confirmar_pago_proveedor`: `for no key update`, mensaje
  "pagada de más", `security definer` y `search_path=public`: las dos en `true`.
- `authenticated` puede ejecutarlas. `anon` también (permiso por defecto de Postgres):
  es informativo; sin sesión la función no encuentra empresa ni pago y se detiene.
  Revocarlo a `anon` sería una defensa adicional (SQL de escritura, no hecho).
- Vistas `cfdis_saldo` y `cfdis_proveedor_saldo` con `security_invoker=true`.
- Pagos "registrados" que ya no caben: 1 (el de $100 de OT-0034).

**Pruebas de concurrencia (escriben en DEV).**

| Prueba | Resultado |
|---|---|
| A, cliente (`test-confirmacion-concurrente.js`), factura de sandbox con saldo $580 | 2 pagos de $348: uno confirmado (póliza `I-00005`), otro rechazado "saldo actual $232.00"; saldo final $232.00 |
| A, proveedor, factura ficticia `OT29-001` (saldo $580) | 2 pagos de $348: uno confirmado (póliza `E-00008`), otro rechazado; saldo $232.00; veredicto `✔ CORRECTO` |
| Carga, proveedor (`test-bloqueo-concurrente.js`), `OT29-001` con saldo $232.00 | 8 pagos de $51.04 confirmados a la vez; caben 4. **Se confirmaron exactamente 4** (`E-00009` a `E-00012`) y 4 fueron rechazados con "dejaría la factura pagada de más". Saldo final $27.84 (= 232 − 4 × 51.04). Una póliza por pago. |

Tiempos de la prueba de carga: las 4 confirmaciones terminaron escalonadas a los 0.16,
0.30, 0.33 y 0.34 s, y los 4 rechazos entre 0.43 y 0.70 s (el rechazo llega después de
que se confirmaron los que sí cabían). Dos registros de $1.00 hechos durante la
espera tardaron 441 y 454 ms y terminaron antes que la última confirmación (0.70 s):
no se quedaron esperando detrás de ellas.

**Verificación final (solo lectura, todas las empresas de DEV).** 0 facturas de cliente
con saldo negativo, 0 de proveedor, 0 pagos confirmados sin póliza, 0 pólizas de pagos
con debe distinto de haber (de 12), 0 folios de póliza duplicados (de 51). `OT29-001`:
12 pagos (5 confirmados por $552.16 y 7 registrados), pagado 552.16, saldo 27.84.

**Datos de prueba que quedan en DEV (no se borraron):** en `OT29-001`, 7 pagos
"registrados" sin póliza (uno de $348, cuatro de $51.04 y dos de $1.00) y 5
confirmados; en la factura de cliente de sandbox, el pago `P-00004` de $348
"registrado". No hay función para cancelar pagos registrados.

**No se hizo (para que no se dé por probado):**
- La prueba B original (mantener bloqueada la factura 45 s desde el SQL Editor y
  confirmar desde la app): se sustituyó por la prueba de carga de 8 pagos, que prueba
  que las confirmaciones se forman en fila pero no mide una espera deliberada.
- Prueba de carga en cliente (solo se hizo con 2 pagos), borde exacto (pago igual al
  saldo restante), doble clic sobre el mismo pago, rol sin permiso y pago de otra empresa.
- Comparar `registrar_pago_*` y `siguiente_folio` de DEV con el repo (consulta C).
- Aplicación en producción.

**Veredicto:** la confirmación atómica de pagos funciona en DEV para Cobranza y Cuentas por
pagar: con competencia real nunca se confirma más de lo que cabe, no se duplican pólizas ni
folios y los saldos cuadran. Queda pendiente solo lo anterior, de bajo riesgo.
