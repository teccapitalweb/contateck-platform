# Funciones del panel y su estado

Lista de lo que el panel **ofrecía como botón o acción** y estaba marcado como "siguiente fase" al 25-nov-2026, y en qué quedó. Solo se marca "hecho" lo que funciona y se probó; lo demás dice qué falta o qué se acotó. Hoy el panel ya no tiene ningún aviso "siguiente fase" (lo comprueba `backend/test-interfaz.js`).

| Función del panel | Dónde | Estado | Evidencia | Qué falta o qué matizar |
|---|---|---|---|---|
| Exportar el dashboard (Excel/CSV) | Dashboard | **Hecho** | `OT-0060-Sin-Botones-Muertos.md`; `test-interfaz.js`; CSV real de Empresa Demo C abierto en el visor | La impresión real del navegador no se verificó (se probó el HTML generado) |
| Imprimir / PDF del dashboard | Dashboard | **Hecho** | Mismo | Igual: sale por el diálogo de impresión del navegador |
| Timbrado masivo de facturas | Facturación | **Hecho y probado: con servidor simulado y con un lote real contra el PAC de pruebas (26-nov-2026)** | `OT-0063-Timbrado-Masivo.md`; `test-facturacion-masiva.js` (16) y `test-facturacion-masiva-ruta.js` (6); lote real: plantilla de 3 filas → 2 facturas **timbradas** (CT-46, UUID `a3ac7af2-b40c-4dd2-8416-38071d027d1a`, $2,668.00; CT-47, UUID `80f9d6c3-0497-4560-931e-507db343d189`, $2,204.00), visibles en la lista de Facturación y en la base | Falta probar desde el panel un lote con errores o con un posible duplicado (se probó con el servidor simulado) y abrir el CSV de resultado en Excel |
| Timbrar nómina (CFDI de nómina) | Nómina | **Hecho y probado en el ambiente de pruebas del proveedor, desde el panel con sesión real (25-nov-2026):** botón "Timbrar" en el historial, un CFDI por empleado, UUID y XML en el detalle, y recibos con UUID. Además: cálculo de ISR/IMSS, historial y recibos imprimibles | `OT-0064-Timbrado-de-Nomina.md`; sección "Prueba real desde el panel" de este documento (CFDI de prueba con UUID `d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0` y su XML revisado; rechazo del proveedor a un RFC inexistente; empleados sin datos fiscales no llegan al proveedor) | Los criterios fiscales (partidas, tratamiento del subsidio) están **por validar con un contador**; con un emisor real habría que validarlos antes. No cancela CFDI de nómina ni cubre nóminas extraordinarias, incapacidades u horas extra. Volver a pulsar "Timbrar" se comprobó (no repite al ya timbrado); el **PDF del recibo timbrado** se descarga desde el detalle (OT-0069, probado en el panel real; no se revisó su aspecto visual) |
| Buscador global (🔍, `Ctrl+K`) | Barra superior | **Hecho y probado en el panel real (26-nov-2026).** Antes el icono no hacía nada | `OT-0068-Buscador-y-Notificaciones.md`; `test-busqueda-notificaciones.js` (16); en el panel: encontró una factura por folio y dejó Facturación filtrada, empleados por nombre, clientes, y abrió el detalle de una póliza; el RFC de un empleado no produce resultados | Busca en lo cargado (las 200 facturas más recientes); aspecto en teléfono sin revisar |
| Notificaciones (🔔) | Barra superior | **Hecho y probado en el panel real (26-nov-2026).** Antes mostraba siempre un punto rojo y no hacía nada | Mismo documento; la campana mostró las 3 alertas reales del Dashboard y llevó al módulo; el punto rojo solo aparece si hay avisos; incluye invitaciones a otras empresas | Las invitaciones en la campana solo se probaron con datos simulados |
| Editar o cancelar un pago pendiente | Ventas y Pagos | **Hecho y probado en el panel real (26-nov-2026).** Antes un pago registrado con error solo podía rechazarlo otra persona | `OT-0072-Editar-y-Cancelar-Venta.md`; `test-ventas-editar-cancelar.js` (38) y prueba del SQL en un Postgres en memoria; en el panel: se registró P-0007, se editó (cliente, importe, IVA y banco; la base y la auditoría guardaron el antes y el después) y se canceló con motivo (quedó como Cancelado, fuera de los totales y sin más botones) | Solo funciona con el SQL OT-0072 aplicado (hecho en DEV, falta en producción). No se probó con una sesión de vendedor en el panel (cubierto por las pruebas). El comprobante no se cambia al editar; corregir un pago **ya confirmado** sigue pendiente de definir con la contadora |

Pruebas automáticas de toda la rama: `npm run test:ci` = 19 suites, 259 pruebas, en verde (incluye 22 del timbrado masivo, 18 del timbrado de nómina y 38 de editar/cancelar pagos).

## Prueba real desde el panel: timbrado de nómina (25-nov-2026, ambiente de pruebas)

Hecha por una persona con su sesión (director de SA de CV), con una nómina **mensual** de 4 empleados (periodo 2026-11-25 al 2026-12-24).

| Empleado | Datos fiscales | Resultado | Qué demuestra |
|---|---|---|---|
| Karla Fuente Nolasco | Completos, con un RFC de la lista de prueba del SAT | **Timbrado.** UUID `d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0` | El flujo completo funciona: desglose guardado al aprobar la nómina → CFDI de nómina 1.2 → proveedor → UUID anotado en la base → XML descargable |
| diego | Completos, pero con un RFC **inventado** | **Rechazado por el proveedor:** "NOM9: el RFC del receptor no está en la lista de RFC inscritos no cancelados en el SAT" | El ambiente de pruebas **sí valida el RFC contra el listado del SAT**: el formulario solo revisa el formato, y la existencia real del RFC la comprueba el timbrado |
| Juan Luis López, Verónica López | Sin RFC, CURP, CP fiscal, contrato ni entidad | **No se llamó al proveedor**; el sistema dijo exactamente qué dato falta | La revisión previa evita gastar timbres y explica la corrección |

**Revisión del XML timbrado (Karla):** percepciones $1,600.00 (001 Sueldos); deducciones $104.44 = seguridad social $39.87 (001) + ISR $64.57 (002); otros pagos $64.57 (002 Subsidio para el empleo, con SubsidioCausado $535.65); SubTotal $1,664.57 − Descuento $104.44 = **Total $1,560.13, igual al neto que paga la nómina**. NumDiasPagados 30, antigüedad P4W, periodicidad 05 (mensual), SDI $55.96, registro patronal de ejemplo del emisor de pruebas (variable de entorno).

**Observaciones que salieron de esta prueba (la primera y la segunda ya se corrigieron en OT-0064c; la tercera sigue):**
- ~~El mensaje de rechazo se mostraba con el JSON crudo del proveedor~~ **Corregido:** ahora se extrae el motivo y el RFC inexistente (NOM9) se explica.
- ~~`FechaPago` salió igual al inicio del periodo~~ **Ajustado:** ahora es el día en que se aprobó la nómina (hora de México), sin salirse del periodo ni pasar de hoy; el sistema no guarda otra fecha de pago real, y en esta prueba coincide con el 25-nov.
- El `NumEmpleado` se derivó del identificador interno porque el empleado no tiene número capturado.

### Segunda revisión desde el visor del panel (26-nov-2026)

Con la sesión de la persona abierta en el visor (cuenta de Google de la empresa SA de CV) y el backend ya con las correcciones de OT-0064c:

| Comprobación | Resultado |
|---|---|
| Volver a pulsar **Timbrar** en la nómina del 25/11 al 24/12/2026 | "Timbrados: 0 · Ya timbrados: 1 · Con error: 3". **Karla sale "Ya estaba timbrado" con el mismo UUID**: no se repite el timbre |
| Mensaje de rechazo de diego (RFC inexistente) | Ya no sale el JSON crudo: "El RFC del empleado no está inscrito en el SAT (el proveedor lo valida contra el listado de RFC vigentes). Revisa el RFC y el nombre del empleado. (NOM9)" |
| Empleados sin datos fiscales | Mismo aviso con los datos que faltan; no se llama al proveedor |
| Detalle de la nómina ("Ver") | Karla muestra su UUID y el botón **XML**; los demás "Sin timbrar" |
| **Timbrado masivo**: abrir la ventana y revisar la plantilla | La ventana abre; la revisión previa (sin gastar timbres) leyó la plantilla: 2 facturas listas por $4,872.00 (con IVA) y el botón "Timbrar 2 facturas…" |
| **Timbrado masivo: lote real** (con la autorización de la persona) | Se confirmó el importe y se timbraron **2 de 2**: CT-46 (UUID `a3ac7af2-b40c-4dd2-8416-38071d027d1a`) y CT-47 (UUID `80f9d6c3-0497-4560-931e-507db343d189`); en la base quedaron como CFDI tipo I, vigentes, de SA de CV, con subtotal 2,300.00 y 1,900.00 y total con IVA 2,668.00 y 2,204.00; aparecen primeros en la lista de Facturación |

**Sin verificar:** el aspecto visual del PDF de nómina (la descarga sí se probó, OT-0069); un lote con filas con error o con posible duplicado desde el panel real. **Efecto en los datos de prueba:** las dos facturas del lote son CFDI de prueba y ahora figuran como por cobrar en Cobranza de SA de CV; se pueden cancelar desde Facturación.
