# OT-0031 · Pulido de SAT y Fiscal

**Rama:** `feature/OT-0031-sat-fiscal-pulido` (sobre OT-0030)
**Alcance:** revisión de solo lectura del módulo "SAT y Fiscal" (vista Fiscal → SAT y Fiscal y pestaña
Contabilidad → SAT / Declaraciones) y pulidos de bajo riesgo. **Sin cambios de esquema SQL** y sin decisiones
contables o fiscales: lo que depende de criterio de la contadora quedó como pregunta (sección 7; lo de proceso se decidió por defecto, sección 6).

## 1. Qué se cambió

| # | Pulido | Dónde |
|---|---|---|
| S1 | Texto de la base (obligación, periodo, folio, documento, ruta) escapado antes de `innerHTML`; también en el Dashboard (alertas y tabla "Próximas obligaciones SAT") | `frontend/fiscal.js`, `frontend/app.js` |
| S2 | Validaciones en el backend: periodicidad, día 1-31, mes 1-12, estado, fechas reales, longitudes, UUID de ids, obligación existente/activa al crear declaración | `backend/src/validacionesFiscal.js` (nuevo), `backend/src/supabaseFiscal.js` |
| S3 | Errores de Postgres ya no llegan al navegador (se loguean y se devuelve un mensaje entendible) | `backend/src/supabaseFiscal.js` (`errorAmigable`) |
| S4 | La ruta del archivo en Storage debe ser `<empresa>/sat/<uuid>/documento.(pdf\|jpg\|png\|webp)` de la propia empresa | `validacionesFiscal.js` (`rutaDocumentoValida`), `supabaseFiscal.js` |
| S5 | Archivos: solo PDF/JPG/PNG/WEBP, 5 MB, no vacíos; la extensión sale del tipo MIME (antes del nombre del archivo); error de Storage sin texto crudo | `frontend/fiscal.js` |
| S6 | Vencimientos en hora de México. Antes el día límite aparecía "vencida" desde las 18:00 locales (backend) y el día anterior a las 18:00 (tabla de declaraciones) | `supabaseFiscal.js` (`obtenerCalendario`), `fiscal.js` |
| S7 | "Marcar presentada": fecha de presentación editable (default hoy en México, no futura); ya no se pisa la fecha si ya estaba presentada; al regresar a pendiente se limpian fecha y responsable | `fiscal.js`, `supabaseFiscal.js` |
| S8 | Si faltaba la empresa, el acuse se omitía en silencio y la declaración quedaba presentada sin él; ahora se detiene con aviso | `fiscal.js` |
| S9 | Botones "Descargar XML" y "Presentar declaración": eran avisos `data-soon` que **ni siquiera respondían** (el listener se registra una sola vez al cargar y estos botones se pintan después). Ahora están deshabilitados, dicen "no disponible" y un aviso explica que la bitácora no presenta ante el SAT | `fiscal.js` |
| S10 | Los botones de alta (+ Obligación/Documento/Declaración) se decidían antes de tener el perfil y podían no aparecer; ahora se espera el perfil antes de pintar. Carga con secuencia para que dos cargas seguidas no se pisen | `fiscal.js` |
| S11 | Un error de carga ya no se ve como "Sin datos": cada sección muestra su error | `fiscal.js` |
| S12 | Calendario: omite declaraciones de obligaciones desactivadas (antes salían como "—"); botón Activar/Desactivar obligación (la API ya existía, la tabla mostraba "Inactiva" pero no había forma de cambiarla); mes límite para obligaciones anuales; "Vigente hasta" en documentos (campo `vigencia_hasta` que el backend ya aceptaba) | `supabaseFiscal.js`, `fiscal.js` |
| S13 | Doble clic en Guardar ya no duplica registros; "Ver" abre la ventana dentro del clic (no la bloquea el navegador) | `fiscal.js` |
| S14 | **XML Balanza**: `SaldoIni` iba fijo en `0.00` aunque `SaldoFin` incluía el saldo inicial, así que desde el segundo mes `SaldoFin ≠ SaldoIni ± movimientos`. Ahora usa el saldo inicial real y `SaldoFin` con signo según naturaleza (negativo si quedó del lado contrario) | `frontend/contabilidad.js` (`xmlBalanzaSAT`) |
| S15 | **XML Balanza** solo se genera del periodo (mes) elegido y su mes/año deben coincidir con el periodo seleccionado; antes el mes/año del XML salía de campos libres y con "Todo el ejercicio" mezclaba todos los años | `contabilidad.js` (`descargarXmlSAT`, `renderSAT`) |
| S16 | Se acabaron los valores silenciosos: RFC genérico `XAXX010101000`, mes 1 y año actual. RFC válido (12/13 caracteres, no genérico), mes 1-12, año 2015-2099; el RFC se precarga con el de la empresa | `contabilidad.js` |
| S17 | XML: `xsi:schemaLocation`, `Desc` ≤ 400, `NumCta` ≤ 100, sin caracteres de control, importes sin "-0.00" | `contabilidad.js` |
| S18 | Textos honestos en IVA y DIOT: son cifras de referencia a partir de pólizas, no la declaración ni el archivo de la DIOT (las etiquetas "cobrado/pagado" no eran ciertas: se calcula con el saldo de la cuenta de IVA) | `contabilidad.js` |

Versiones de caché subidas en `dashboard.html`: `app.js` v8, `contabilidad.js` v11, `fiscal.js` v2. Si la rama de Ventas
(OT-0029) también sube `contabilidad.js`, el conflicto al unir es solo ese número.
Los cambios en `contabilidad.js` se limitan al bloque "Contabilidad Electrónica SAT · IVA · DIOT", `renderSAT()` y
`descargarXmlSAT()`.

### 1b. Segunda tanda (decisiones por defecto, ver sección 6)

| # | Pulido | Dónde |
|---|---|---|
| S19 | Tipo de declaración (Normal / Complementaria / Extemporánea) al crearla; se muestra como etiqueta junto al periodo | `frontend/fiscal.js` |
| S20 | Botón "Regresar a pendiente" en declaraciones presentadas (con confirmación) | `frontend/fiscal.js` |
| S21 | Alerta en el Dashboard de documentos con vigencia a ≤ 5 días o vencidos; solo cuenta el documento más reciente de cada tipo (si ya subiste la opinión nueva, la vieja no avisa) | `backend/src/validacionesFiscal.js` (`alertasVigencia`), `supabaseFiscal.js`, `supabaseDashboard.js` |
| S22 | Nueva declaración: se elige mes o bimestre y año; el periodo y la fecha límite sugerida se arman solos (editables). Por defecto propone el último periodo concluido | `frontend/fiscal.js` (`sugerirFechaLimite`) |
| S23 | DIOT: las operaciones con proveedores sin RFC válido salen de la tabla y de los totales, con un aviso que dice cuántas son y cuánto suman | `frontend/contabilidad.js` (`renderSAT`) |
| S24 | **Editar obligación** (nombre, periodicidad, día, mes) para admin/director, y botón "Cargar comunes" con la plantilla de 6 obligaciones (se eligen cuáles; las que ya existen salen deshabilitadas) | `frontend/fiscal.js` |
| S25 | Botón "Hoja de cuentas para la contadora (CSV)": cuentas con una columna vacía de código agrupador SAT; se abre bien en Excel y no ejecuta fórmulas | `frontend/contabilidad.js` |

Versiones de caché: `contabilidad.js` v12, `fiscal.js` v3.


Pruebas de esta tanda (sin servidor ni pantalla): `sugerirFechaLimite` con fin de semana, cambio de mes y de año,
bimestral, anual, día 31 en mes corto y entradas inválidas; periodo por defecto; `alertasVigencia` (5 días, hoy,
vencida, documento reemplazado, fechas inválidas); el CSV (comillas, saltos de línea, intento de fórmula).
No verificado: la interfaz nueva de `fiscal.js` (modales de editar, plantilla, tipo y regresar a pendiente) ni la alerta
en el Dashboard real.

### 1c. Declaraciones duplicadas (hallazgo del usuario probando la rama unida)

Caso: dos registros de "IVA Mensual · Julio 2026", uno Presentada (vence 31 jul) y otro pendiente (vence 17 ago); el Dashboard
alertaba "vencida" aunque el periodo ya estaba presentado.

| # | Cambio | Dónde |
|---|---|---|
| S26 | Calendario y alertas del Dashboard: una declaración no presentada se omite si existe OTRA **presentada** de la misma obligación y el mismo periodo (el periodo se compara sin importar mayúsculas, acentos ni espacios repetidos). Excepción: si sus notas empiezan con `[Complementaria]`, sigue contando. La "Extemporánea" NO es excepción (es una original tardía, no una corrección) | `backend/src/validacionesFiscal.js` (`esDuplicadaDePresentada`), `supabaseFiscal.js` (`obtenerCalendario`) |
| S27 | Alta de declaración: si ya existe una de esa obligación y periodo (en cualquier estado) el backend NO guarda y responde `codigo: "DUPLICADA"` con el detalle; el panel muestra cuál es y pide "Registrar de todos modos" (o cancelar y usar el tipo Complementaria). Una complementaria no pide confirmación | `supabaseFiscal.js` (`crearDeclaracion`), `frontend/fiscal.js` |
| S28 | En la tabla, esa pendiente sobrante se rotula **Duplicada** (no "Vencida") | `frontend/fiscal.js` |
| S29 | Al cambiar a mano la fecha límite, un aviso indica que difiere de la sugerida | `frontend/fiscal.js` |

Por qué la presentada vence el 31 jul: **no es un error del código**. El backend guarda tal cual la fecha que se captura
(`crearDeclaracion` no calcula nada) y antes de S22 la fecha se escribía a mano; con el día 17 de la obligación, julio 2026 debe vencer
el 17 ago 2026 (lunes), que es justo la fecha del otro registro. Además se marcó presentada el 31 jul, antes de que terminara
el periodo, lo que apunta a un dato de prueba capturado a mano. No hay SQL en el repo (ni semillas) que lo cree. Limpieza: borrar o
corregir ese registro directamente en Supabase DEV (el panel no tiene botón de eliminar declaraciones, por decisión de la sección 6).
Si fuera un dato real habría que decidir con la contadora cuál de los dos vale.

Versiones de caché: `fiscal.js` v4.

### 1d. OT-0031b · Prueba de DIOT e IVA con partidas y carga del Código Agrupador

Rama `feature/OT-0031b-sat-diot-agrupador`, creada sobre `integracion-local` (7d81a6b, ya con OT-0036: Contabilidad trae las partidas).

**Hallazgo al probar DIOT e IVA con datos tipo Empresa Demo C.** Con las partidas ya cargadas el **IVA sí calcula** (cuentas de
IVA y partidas llegan bien). La **DIOT no**: las pólizas que vienen de Postgres traen el UUID del CFDI (`cfdiUuid`) pero no el RFC ni
el nombre del proveedor (solo la póliza importada en ese mismo navegador los guardaba), así que en un navegador limpio todos los
proveedores caían en "—" y, con el aviso de proveedores sin RFC (S23), la DIOT habría salido vacía.

| # | Cambio | Dónde |
|---|---|---|
| S30 | La DIOT identifica al proveedor por el UUID del CFDI contra `cfdis_proveedor` (RFC en mayúsculas y nombre). Endpoint nuevo de solo lectura `GET /api/fiscal/proveedores-diot` (mismos roles de lectura del módulo). Se pide una vez al abrir la pestaña SAT; si falla no se reintenta en bucle y el aviso de "sin RFC" se muestra | `backend/src/supabaseFiscal.js`, `routes/fiscal.js`, `frontend/contabilidad.js` |
| S31 | Código Agrupador SAT por cuenta, **listo para cargar**: `desdePostgres` lee `codigo_agrupador`; el XML del catálogo usa ese código en `CodAgrup` (si falta, el interno y un aviso con cuántas cuentas faltan); la hoja CSV sale con lo ya asignado | `frontend/contabilidad.js` |
| S32 | Botón "Cargar códigos agrupador (CSV)" (contador, admin, director): lee la hoja (comas o punto y coma, BOM, comillas), corrige el cero final que Excel quita (101.1 → 101.10), muestra un resumen (por actualizar, sin cambio, sin llenar, formato inválido, códigos que no existen) y **no guarda nada hasta confirmar**. Las celdas vacías no borran | `frontend/contabilidad.js` (`planCargaAgrupador`) |
| S33 | `PUT /api/fiscal/codigos-agrupador`: valida formato (NNN o NNN.NN) y máximo 500 por carga; actualiza con el cliente del usuario, así que la RLS decide qué cuentas son de su empresa (las demás se reportan como "no encontradas"). Si la columna aún no existe, responde un mensaje claro que apunta al script | `backend/src/supabaseFiscal.js`, `routes/fiscal.js`, `validacionesFiscal.js` |
| S34 | `database/OT-0031b-codigo-agrupador.sql` (**no ejecutado**): `alter table cuentas_contables add column if not exists codigo_agrupador text`. Es repetible y no toca datos ni políticas | `database/` |

**Qué falta para que funcione de punta a punta:** correr `database/OT-0031b-codigo-agrupador.sql` en Supabase DEV. Sin eso, el
panel funciona igual (usa el código interno) y la carga del CSV responde "falta correr el SQL".

Versión de caché: `contabilidad.js` v18 (el resto de scripts no cambió).

**Pruebas (sin servidor ni pantalla):** `contabilidad.js` completo cargado en un navegador simulado con datos tipo Empresa Demo C
(1 venta con IVA trasladado, 3 gastos de CFDI recibido con y sin RFC, 1 póliza anulada, pólizas sin RFC de proveedor como llegan de
Postgres): IVA trasladado 160 y acreditable por cuenta configurada; DIOT con el proveedor A identificado por UUID (2 operaciones, base
1,500, IVA 240), proveedor B sin RFC avisado y fuera de los totales, anulada ignorada; pantalla SAT con el aviso y el total; botón de
carga visible para contador y oculto para auditor; la carga de proveedores se intenta una sola vez aunque falle; XML del catálogo con y
sin código agrupador; lectura del CSV (comillas, `;`, LF, cero final de Excel, formato inválido, código inexistente, archivo
equivocado). Backend con cliente falso: validación del lote, actualización con una cuenta "de otra empresa", columna inexistente,
proveedores de la DIOT, y que todo lo que importa el router exista en `supabaseFiscal.js`.

**NO verificado:** ninguna pantalla real ni la base real (los datos de Empresa Demo C son simulados con su misma forma, no los
reales); el formato NNN / NNN.NN del Código Agrupador es el que conozco del anexo del SAT, no lo validé contra el catálogo
oficial; que la política de UPDATE de `cuentas_contables` permita escribir la columna nueva (se asume por la política vigente).

**Dato a tener presente:** en la prueba el IVA acreditable sumó también la póliza anulada porque en los datos simulados no había
su reversa; en el sistema real una anulación genera la reversa y el saldo queda neto (la DIOT sí excluye las anuladas).

### 1e. Verificación en pantalla (13-nov-2026, Empresa Demo C, rol Director, rama integracion-local)

Hecha en el visor de la app con la sesión real del usuario, contra DEV. Lo que dice "No verificado" más arriba en las secciones 1b a 1d
quedó así:

| Qué | Resultado |
|---|---|
| SAT y Fiscal: botones de e.firma, aviso, Editar/Desactivar, Cargar comunes | Se ven y funcionan como se diseñaron (pantalla ancha y angosta) |
| Dos declaraciones de Julio 2026 (caso de Auditoría) | La presentada muestra "Ver acuse" y "Regresar a pendiente"; la otra sale **Duplicada**; el calendario y el Dashboard ya no alertan |
| Nueva declaración | Por defecto propone el último periodo concluido (Octubre 2026) con fecha límite 17 nov 2026; al cambiar la fecha a mano avisa que difiere de la sugerida; Julio 2026 sugiere 17 ago 2026 |
| Aviso de duplicado al crear | El backend responde `DUPLICADA` con el detalle y **no guarda**; el panel muestra las dos existentes con "Cancelar" y "Registrar de todos modos". Se canceló: la base quedó con las mismas 2 declaraciones |
| Editar obligación y plantilla | Abren con los datos de la obligación; al elegir Anual aparece el mes límite; la plantilla marca "ya existe" en IVA mensual y deja 5 casillas marcadas. Se cancelaron sin guardar |
| Contabilidad → SAT / Declaraciones | Indicador "0 de 29 cuentas con código", botón de carga (solo contador, admin y director), RFC precargado de la empresa |
| Descarga real de los botones | Catálogo XML (29 cuentas), Balanza XML (21 filas, `TipoEnvio=N`) y hoja CSV (29 filas): bien formados, con el nombre de archivo esperado; la balanza de julio (900 = 900) y la de noviembre (2,000.16 = 2,000.16) cuadran y cada fila cumple saldo final = inicial ± movimientos. Aviso "29 cuentas sin Código Agrupador" al bajar el catálogo |
| Carga del CSV del Código Agrupador | Probada de punta a punta con una hoja de una fila (`102 → 102.01`): resumen previo, guardado, indicador "1 de 29", `CodAgrup="102.01"` en el XML, persistencia tras recargar y **reversión** (código vacío por el mismo endpoint). La base de Demo C quedó sin códigos |
| DIOT con datos reales | Se importó una factura ficticia (base 100, IVA 16) por el botón de Importar XML: la DIOT mostró al proveedor con su RFC. Con las pólizas leídas **sin RFC ni nombre de proveedor** (como en un navegador limpio) la DIOT lo recuperó por el UUID. Se anuló la póliza (`E-00014` anulada, reversa `E-00015`); IVA, balanza y DIOT volvieron a sus cifras. La factura de proveedor de prueba se borró en Supabase (el panel no tiene botón) |

**Segunda tanda (13-nov, con escritura en DEV, todo rotulado "PRUEBA OT-0031b"):**

| Qué | Resultado |
|---|---|
| Documento fiscal con archivo | Un `.exe` se rechaza con aviso ("Solo se aceptan archivos PDF, JPG, PNG o WEBP"); un PDF se sube a `<empresa>/sat/<uuid>/documento.pdf` (carpeta de la propia empresa, extensión por tipo MIME), queda en la lista con "Vigente hasta" y su **URL firmada responde 200 con `application/pdf`** |
| Alerta de vigencia | Con vigencia a 3 días, el Dashboard muestra "PRUEBA OT-0031b (borrar) vence en 3 días" (por la API y en pantalla) |
| Nueva declaración Octubre 2026 | Se guarda sin aviso de duplicado y el calendario la muestra "Vence en 4 día(s)" |
| Marcar presentada con acuse | Rechaza una fecha futura; con fecha, folio y PDF de acuse queda Presentada, con `presentado_por`, el acuse en Storage (URL firmada 200, PDF) y el calendario sin pendientes |
| Regresar a pendiente | Pide confirmación; borra fecha y responsable y **conserva folio y acuse**; el calendario vuelve a mostrarla. Se volvió a marcar presentada para no dejar alertas |

**Tercera tanda (13-nov): otro rol y otra empresa.** Sesión `demo.contador@contateck.mx`, rol **contador**, empresa TEC CAPITAL Group (DEV). Solo lectura
más llamadas con datos inválidos a propósito (no escriben nada):

| Qué | Resultado |
|---|---|
| Botones en SAT y Fiscal | Ve "+ Documento" y "+ Declaración"; **no** ve "+ Obligación", "Cargar comunes" ni "Editar/Desactivar" |
| Contabilidad → SAT / Declaraciones | Ve "Cargar códigos agrupador (CSV)" (contador, admin y director); indicador "0 de 33 cuentas" |
| Backend: crear o editar obligación | Rechaza con "No tienes permiso… (tu rol no lo permite)" |
| Backend: lo que sí puede | Lee obligaciones; crear declaración o cargar códigos con datos inválidos responde el error de validación (el permiso pasa) |
| Aislamiento entre empresas | Esta empresa no ve ninguna obligación, declaración ni documento de Empresa Demo C (0 en cada lista) |

Observación menor, sin cambio: las respuestas de "sin permiso" en escritura salen con HTTP 400 y no 403 (las lecturas sí usan 403); el mensaje es correcto.

**Todavía sin probar:** el rol auditor (solo lectura) y abrir la hoja CSV en Excel. Las pruebas de borrado de datos del navegador se bloquearon por
seguridad y se sustituyeron por una simulación en memoria.

**Datos de prueba que quedaron en Demo C:** pólizas `E-00014` (anulada) y `E-00015` (reversa), que se cancelan entre sí; un documento fiscal y una declaración (Octubre 2026) rotulados PRUEBA, cada uno con su PDF en Storage, que hay que borrar en Supabase (el panel no tiene botón de eliminar, por decisión de la sección 6).

## 2. Hallazgos de la revisión (archivo:línea del código ANTES de esta OT)

| Sev. | Hallazgo | Estado |
|---|---|---|
| Alta | `fiscal.js:163-208,283` y `app.js:244,421`: texto capturado por un usuario sin escapar en `innerHTML` (XSS almacenado hacia toda la empresa, incluida la ruta de archivo en un atributo) | Corregido (S1) |
| Alta | `contabilidad.js:609`: `SaldoIni="0.00"` fijo con `SaldoFin` que sí arrastra saldo inicial | Corregido (S14) |
| Alta | `contabilidad.js:2760-2767`: mes/año del XML de Balanza independientes del periodo con que se arma; RFC genérico/mes 1 por defecto | Corregido (S15, S16) |
| Media | `supabaseFiscal.js:258-263`, `fiscal.js:198`: vencimientos con `Date` UTC; día límite "vencida" desde las 18:00 | Corregido (S6) |
| Media | `supabaseFiscal.js:89,151,181-184,216`: sin validación de periodicidad, día, fechas, estado, longitudes | Corregido (S2) |
| Media | `supabaseFiscal.js:79,106,125,…`: `error.message` de Postgres al navegador | Corregido (S3) |
| Media | `supabaseFiscal.js:183,228`: `documentoPath` sin restricción (otra empresa u otro módulo) | Corregido (S4) |
| Media | `supabaseFiscal.js:186`: fecha de presentación en UTC, no editable y se pisaba al repetir | Corregido (S7) |
| Media | `fiscal.js:70-77`: extensión del nombre de archivo, `Content-Type` libre, `accept` solo orientativo, error crudo de Storage | Corregido (S5) |
| Media | `fiscal.js:317-321`: acuse omitido en silencio | Corregido (S8) |
| Media | `fiscal.js:126-127` + `data-firestore.js:350`: botones `data-soon` pintados después del listener: no hacen nada | Corregido (S9) |
| Media | `fiscal.js:119-157`: botones de alta evaluados antes del perfil | Corregido (S10) |
| Media | **No hay SQL en el repo** de `obligaciones_fiscales`, `declaraciones`, `documentos_fiscales` ni de las políticas del bucket `documentos`. Con la RLS depende todo el aislamiento por empresa (el backend no filtra `empresa_id` en select/update) y no se puede auditar | **Pendiente** (ver 4) |
| Media | Calendario: una obligación sin declaración capturada no aparece nunca; el subtítulo decía "derivado de tus obligaciones". Texto corregido; la generación automática de declaraciones depende de reglas fiscales | Parcial: se sugiere la fecha al capturar (S22); la generación automática queda pendiente |
| Media | `contabilidad.js:153,340`: `getCuentasAfectables` excluye cuentas desactivadas; una cuenta desactivada con movimientos desaparece de la Balanza y el "cuadra" no lo detecta (compara solo lo que quedó). Función compartida con otros módulos | **No tocado** |
| Media | `contabilidad.js:597`: `CodAgrup` = código interno de la cuenta; solo es válido si ese código existe en el Código Agrupador del SAT | **Pendiente** (sección 7, pregunta 1) |
| Media | `contabilidad.js:629-655`: DIOT con cuentas fijas (601/602/603/501), proveedores sin RFC agrupados en "—", base por fecha de póliza (devengo) | **Pendiente** (pregunta 3; el aviso de proveedores sin RFC ya está, S23) |
| Baja | `contabilidad.js:620-621`: `Math.abs` en IVA oculta un saldo contrario a su naturaleza; no considera saldo a favor anterior ni retenciones | Texto aclarado (S18); fórmula pendiente (pregunta 3 de la sección 7) |
| Baja | `contabilidad.js:1166-1175`: `descargarTexto` se traga cualquier error | No tocado (función compartida) |
| Baja | `routes/fiscal.js`: los GET responden 403 ante cualquier error (también fallas de base) | No tocado |
| Info | Roles coinciden en front y back: ver = contador/admin/director/auditor; escribir declaraciones y documentos = contador/admin/director; configurar obligaciones = admin/director. El Dashboard llama `obtenerCalendario` con su propio cliente (sin chequeo de rol del módulo fiscal) | Sin cambio |
| Info | El ISR provisional (comentario en `renderSAT`) no es código muerto: es un pendiente documentado que sigue oculto | Sin cambio |

### Contabilidad Electrónica contra el XSD oficial (SAT, versión 1.3)

Se descargaron `CatalogoCuentas_1_3.xsd` y `BalanzaComprobacion_1_3.xsd` del sitio del SAT y se compararon uno a uno.
Coincidían: espacios de nombres, nodos raíz (`Catalogo`, `Balanza`), `Version="1.3"`, atributos requeridos de la raíz
(`RFC`, `Mes`, `Anio`, `TipoEnvio`) y de `Ctas` (`CodAgrup`, `NumCta`, `Desc`, `SubCtaDe`, `Nivel`, `Natur`;
`NumCta`, `SaldoIni`, `Debe`, `Haber`, `SaldoFin`), `Natur` D/A, importes con 2 decimales. `Sello`,
`noCertificado` y `Certificado` son opcionales y no se generan. Lo que fallaba está en S14-S17.
Balanza: `Mes` admite 01-13 (el 13 es de ajustes de cierre) y `TipoEnvio` N/C con `FechaModBal` en complementarias:
no soportados todavía (se dejó fuera).

## 3. Mapa del módulo (6 preguntas)

1. **Nace en:** Fiscal → SAT y Fiscal: alta de obligación (admin/director), de declaración y de documento (contador/admin/director); "Marcar presentada" sobre una declaración. Los XML nacen en Contabilidad → SAT / Declaraciones (descarga local, no se guarda nada).
2. **Afecta:** `obligaciones_fiscales`, `declaraciones`, `documentos_fiscales` y archivos en Storage (`documentos`, carpeta `<empresa>/sat/`). No toca pólizas, CFDIs ni saldos.
3. **Se consulta en:** la propia vista SAT y Fiscal; Dashboard (tabla "Próximas obligaciones SAT" y alertas de vencidas o a ≤ 5 días); Contabilidad → SAT / Declaraciones (lee cuentas y pólizas para XML, IVA y DIOT).
4. **Póliza:** ninguna. La declaración no genera póliza; el pago del impuesto se registra por separado en Contabilidad.
5. **Saldo:** el módulo no maneja saldos. "IVA a cargo/a favor" es una referencia calculada de las cuentas de IVA configuradas.
6. **Documento relacionado:** acuse y documentos fiscales en Storage (ruta en `declaraciones.documento_path` / `documentos_fiscales.documento_path`, URL firmada de 1 h). XML de Contabilidad Electrónica: archivo local.

## 4. Pruebas hechas (sin servidor, sin base real, sin pantalla)

- `node --check` en `fiscal.js`, `app.js`, `contabilidad.js`, `supabaseFiscal.js`, `validacionesFiscal.js`.
- 12 grupos de pruebas unitarias de `validacionesFiscal.js` (fechas, bisiesto, cambio de mes y año, día límite a las 20:00 locales, rangos, rutas de Storage de otra empresa, `..`, extensiones).
- `obtenerCalendario` con un cliente falso: orden, día de vencimiento = 0 días y "pendiente", vencida, obligación inactiva fuera, obligación desconocida "—", error de base sin detalles internos.
- Altas/actualizaciones con un cliente falso: obligación inexistente o inactiva, fecha explícita, no pisar fecha, limpiar al regresar a pendiente, ruta de otra empresa, documento con vigencia.
- Los dos generadores de XML ejecutados con cuentas de ejemplo: estructura, escapes (`&`, `"`, `<`, salto de línea), `SaldoFin = SaldoIni ± Debe/Haber` según naturaleza para cada fila, saldo contrario con signo negativo, `-0.00`, validación de RFC/mes/año.

**NO verificado:**
- Nada en pantalla ni con el backend real: la interfaz de `fiscal.js` (modales, botones, aviso, Activar/Desactivar, selector de mes anual) solo se revisó leyendo y con `node --check`.
- El XML generado no se validó con un validador XSD (no había uno disponible); la comparación con el XSD fue manual, atributo por atributo. Además `CodAgrup` depende del Código Agrupador (pregunta 1 de la sección 7).
- Las políticas RLS y de Storage reales de DEV (no están en el repo). Tampoco que `mes_limite`, `vigencia_hasta` y los estados permitidos coincidan con las restricciones de las tablas (se infirió del código).
- Que el navegador acepte abrir la ventana de "Ver" en todos los casos.

## 5. Pendiente / recomendaciones

- **Exportar a `database/`** el SQL real de las tres tablas fiscales y de las políticas del bucket `documentos` (hoy solo existen en Supabase). Sin eso no se puede revisar el aislamiento por empresa. No se ejecutó ni se creó SQL en esta OT; **no hay script que correr**.
- Generación automática de las próximas declaraciones según periodicidad (hoy hay que capturar cada una) y plantilla de obligaciones por régimen: requiere reglas de la contadora (sección 7, preguntas 2 y 3).
- Revisar `getCuentasAfectables`/Balanza con cuentas desactivadas (OT de Contabilidad, no de este módulo).
- Código Agrupador SAT por cuenta (campo propio) para que `CodAgrup` sea correcto; DIOT real (tipo de tercero, tipo de operación, tasas) y ISR provisional: dependen de la contadora.
- `e.firma`: Descarga masiva de XML y presentación electrónica siguen fuera de alcance; los botones quedan deshabilitados y la bitácora se llena a mano.

## 6. Decisiones tomadas por defecto (sin esperar a la contadora)

Se decidió con el usuario resolver por defecto lo que es de proceso, no cambia lo que se declara y se puede revertir.
Si la contadora indica otra cosa, es un cambio pequeño.

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Complementarias y extemporáneas | Se permiten varias declaraciones por obligación y periodo; el tipo se guarda como prefijo de las notas | S19 |
| Deshacer "presentada" | Se permite; borra fecha y responsable, conserva folio y acuse | S20 |
| Vigencia de documentos | Alerta en el Dashboard a 5 días o menos, igual que las declaraciones | S21 |
| Conservación de documentos | Nadie borra (no existe botón de eliminar) | sin cambio |
| Pagos de impuestos | La declaración no registra pagos ni línea de captura; solo bitácora | sin cambio |
| Periodo | Sigue como texto libre (ahora se arma solo a partir de mes/año) | S22 |
| Proveedores sin RFC en la DIOT | Se avisan y se excluyen de la tabla y de los totales | S23 |
| Contabilidad Electrónica | Catálogo completo; balanza con todas las cuentas afectables activas | sin cambio |
| Fecha límite | Se sugiere (editable), recorrida al lunes si cae en fin de semana; no considera feriados | S22 |
| Obligaciones habituales | Plantilla editable "Cargar comunes" (6 obligaciones, día 17 del mes siguiente) | S24 |
| Saldos contrarios a su naturaleza | Con signo negativo. Se puede comprobar sin la contadora subiendo los dos XML al validador gratuito de Contabilidad Electrónica del SAT | sin cambio |

## 7. Preguntas para la contadora (solo lo que de verdad depende de ella)

1. **Código Agrupador SAT por cuenta (bloquea el XML del catálogo).** Hoy `CodAgrup` lleva el código interno de la cuenta y el SAT puede rechazarlo. Se descarga desde Contabilidad → SAT / Declaraciones el botón **"Hoja de cuentas para la contadora (CSV)"**: ella solo escribe el código del SAT en la última columna. Cargarlo al sistema ya está listo (botón "Cargar códigos agrupador (CSV)", sección 1d); solo falta correr `database/OT-0031b-codigo-agrupador.sql` en Supabase. *Por defecto:* mientras no esté, el XML usa el código interno.
2. **Revisar la plantilla y las fechas (sí/no).** Las 6 obligaciones de "Cargar comunes" (IVA, ISR provisional, DIOT, retenciones de ISR por sueldos, cuotas IMSS: mensuales día 17; RCV e INFONAVIT: bimestral día 17) y la regla "día límite del mes siguiente, al lunes si cae en fin de semana". Faltan, por depender del régimen: Contabilidad Electrónica y la declaración anual. *Por defecto:* se queda como está, editable en el panel.
3. **Cálculo de IVA, DIOT e ISR provisional.** Qué cuentas entran a la DIOT (hoy 601/602/603/501 fijas), si va por flujo de efectivo o por factura, tipo de tercero/operación y desglose por tasa; IVA cobrado/pagado, saldo a favor anterior, retenciones, acreditamiento proporcional; fórmula del ISR provisional y deducciones autorizadas. *Por defecto:* todo sigue rotulado "cifra de referencia, no es la declaración" y el ISR provisional sigue oculto. Puede esperar: nadie presenta con estas cifras.
