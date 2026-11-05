# OT-0031 · Pulido de SAT y Fiscal

**Rama:** `feature/OT-0031-sat-fiscal-pulido` (sobre OT-0030)
**Alcance:** revisión de solo lectura del módulo "SAT y Fiscal" (vista Fiscal → SAT y Fiscal y pestaña
Contabilidad → SAT / Declaraciones) y pulidos de bajo riesgo. **Sin cambios de esquema SQL** y sin decisiones
contables o fiscales: lo que depende de criterio de la contadora quedó como pregunta (sección 6).

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
| Media | Calendario: una obligación sin declaración capturada no aparece nunca; el subtítulo decía "derivado de tus obligaciones". Texto corregido; la generación automática de declaraciones depende de reglas fiscales | Parcial (preguntas 7 y 8) |
| Media | `contabilidad.js:153,340`: `getCuentasAfectables` excluye cuentas desactivadas; una cuenta desactivada con movimientos desaparece de la Balanza y el "cuadra" no lo detecta (compara solo lo que quedó). Función compartida con otros módulos | **No tocado** |
| Media | `contabilidad.js:597`: `CodAgrup` = código interno de la cuenta; solo es válido si ese código existe en el Código Agrupador del SAT | **Pendiente** (pregunta 1) |
| Media | `contabilidad.js:629-655`: DIOT con cuentas fijas (601/602/603/501), proveedores sin RFC agrupados en "—", base por fecha de póliza (devengo) | **Pendiente** (preguntas 2, 3, 4, 17) |
| Baja | `contabilidad.js:620-621`: `Math.abs` en IVA oculta un saldo contrario a su naturaleza; no considera saldo a favor anterior ni retenciones | Texto aclarado (S18); fórmula pendiente (pregunta 5) |
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
no soportados todavía (pregunta 10).

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
- El XML generado no se validó con un validador XSD (no había uno disponible); la comparación con el XSD fue manual, atributo por atributo. Además `CodAgrup` depende del Código Agrupador (pregunta 1).
- Las políticas RLS y de Storage reales de DEV (no están en el repo). Tampoco que `mes_limite`, `vigencia_hasta` y los estados permitidos coincidan con las restricciones de las tablas (se infirió del código).
- Que el navegador acepte abrir la ventana de "Ver" en todos los casos.

## 5. Pendiente / recomendaciones

- **Exportar a `database/`** el SQL real de las tres tablas fiscales y de las políticas del bucket `documentos` (hoy solo existen en Supabase). Sin eso no se puede revisar el aislamiento por empresa. No se ejecutó ni se creó SQL en esta OT; **no hay script que correr**.
- Generación automática de las próximas declaraciones según periodicidad (hoy hay que capturar cada una) y plantilla de obligaciones por régimen: requiere reglas de la contadora (preguntas 7 y 8).
- UI para editar una obligación (nombre, día, mes) y para corregir una declaración presentada por error; la API ya lo permite.
- Revisar `getCuentasAfectables`/Balanza con cuentas desactivadas (OT de Contabilidad, no de este módulo).
- Código Agrupador SAT por cuenta (campo propio) para que `CodAgrup` sea correcto; DIOT real (tipo de tercero, tipo de operación, tasas) y ISR provisional: dependen de la contadora.
- `e.firma`: Descarga masiva de XML y presentación electrónica siguen fuera de alcance; los botones quedan deshabilitados y la bitácora se llena a mano.

## 6. Preguntas para la contadora

Cada una con la propuesta por defecto que se aplicaría si no hay otra instrucción.

1. **Código Agrupador:** ¿el catálogo de cuentas ya usa los códigos del agrupador del SAT (p. ej. 102.01, 105.01)? *Por defecto:* agregar un campo "Código agrupador SAT" a cada cuenta y usarlo en `CodAgrup`; mientras tanto el XML usa el código interno (puede ser rechazado).
2. **DIOT, qué cuentas:** hoy se toman 601/602/603/501 como base. ¿Qué cuentas de gasto, costo y activo con IVA acreditable entran? *Por defecto:* todas las cuentas de gasto/costo y las de activo fijo ligadas a CFDI recibido.
3. **DIOT, criterio:** ¿por pago efectivo (flujo) o por fecha de factura? *Por defecto:* flujo de efectivo, usando los pagos a proveedor de Cuentas por Pagar.
4. **DIOT, formato:** tipo de tercero (04/05/15), tipo de operación (03/06/85), desglose por tasa 16/8/0/exento y proveedores sin RFC. *Por defecto:* capturar tipo de tercero y operación por proveedor, excluir sin RFC con aviso.
5. **IVA:** ¿cobrado/pagado o devengado?, ¿saldo a favor de meses anteriores?, ¿retenciones?, ¿acreditamiento proporcional? *Por defecto:* flujo de efectivo, con saldo a favor anterior capturado a mano.
6. **ISR provisional:** fórmula (coeficiente de utilidad, ingresos acumulados, deducciones autorizadas, pérdidas, pagos anteriores, retenciones) y qué cuentas son deducción autorizada. *Por defecto:* no mostrar nada hasta definirlo (como ahora).
7. **Fechas límite:** regla del día 17 del mes siguiente, bimestrales y anuales; ajuste por días inhábiles (fines de semana y feriados oficiales). *Por defecto:* sugerir la fecha al capturar la declaración (sin recorrerla por feriados) y que tú la confirmes; necesito la lista anual de días inhábiles.
8. **Obligaciones por régimen:** ¿qué obligaciones debe traer cada régimen (IVA, ISR provisional, DIOT, retenciones de sueldos, IMSS/INFONAVIT, contabilidad electrónica, anual)? *Por defecto:* una plantilla por régimen que tú apruebes, creada con un botón.
9. **Contabilidad Electrónica, alcance:** ¿el catálogo lleva también cuentas inactivas?, ¿la balanza solo cuentas con movimiento o todas?, ¿qué nivel (mayor y subcuentas)? *Por defecto:* catálogo completo; balanza con todas las cuentas afectables activas.
10. **Balanza, casos especiales:** saldos contrarios a su naturaleza con signo negativo (supuesto actual), mes 13 de ajustes de cierre y envío complementario (`TipoEnvio="C"` con `FechaModBal`). *Por defecto:* negativo; mes 13 y complementaria no soportados.
11. **Declaraciones complementarias/extemporáneas:** ¿puede haber más de una por obligación y periodo? *Por defecto:* sí, y se distingue en las notas (el sistema no lo impide hoy).
12. **Deshacer "presentada":** ¿se permite regresarla a pendiente? *Por defecto:* sí (la API lo permite y limpia fecha y responsable), pero no hay botón.
13. **Vigencia de documentos:** opinión de cumplimiento (30 días), constancia de situación fiscal. ¿Alertar al vencer? *Por defecto:* alerta 5 días antes, igual que las declaraciones.
14. **Conservación de documentos:** ¿cuántos años y quién puede borrar? *Por defecto:* nadie borra; no hay botón de eliminar.
15. **Pagos de impuestos:** ¿registrar en la declaración monto a pagar, línea de captura y fecha de pago, y ligarlo a una póliza? *Por defecto:* no; solo bitácora, el pago se contabiliza aparte.
16. **Periodo:** hoy es texto libre ("Julio 2026"). ¿Se quiere estructurado (mes/año/bimestre)? *Por defecto:* texto libre.
17. **Proveedores sin RFC en la DIOT:** ¿bloquear la póliza o solo avisar? *Por defecto:* avisar y excluir de la DIOT.
