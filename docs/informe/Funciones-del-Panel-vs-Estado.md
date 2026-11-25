# Funciones del panel y su estado

Lista de lo que el panel **ofrecía como botón o acción** y estaba marcado como "siguiente fase" al 25-nov-2026, y en qué quedó. Solo se marca "hecho" lo que funciona y se probó; lo demás dice qué falta o qué se acotó. Hoy el panel ya no tiene ningún aviso "siguiente fase" (lo comprueba `backend/test-interfaz.js`).

| Función del panel | Dónde | Estado | Evidencia | Qué falta o qué matizar |
|---|---|---|---|---|
| Exportar el dashboard (Excel/CSV) | Dashboard | **Hecho** | `OT-0060-Sin-Botones-Muertos.md`; `test-interfaz.js`; CSV real de Empresa Demo C abierto en el visor | La impresión real del navegador no se verificó (se probó el HTML generado) |
| Imprimir / PDF del dashboard | Dashboard | **Hecho** | Mismo | Igual: sale por el diálogo de impresión del navegador |
| Timbrado masivo de facturas | Facturación | **Hecho; probado con servidor simulado; falta un lote real contra el PAC de pruebas** | `OT-0063-Timbrado-Masivo.md`; `test-facturacion-masiva.js` (16) y `test-facturacion-masiva-ruta.js` (6); prueba de la ventana en navegador (lote con timbrada, duplicado, rechazo y corte de red) | Un lote real contra Fiscalapi (pruebas), hecho por una persona con su sesión |
| Timbrar nómina (CFDI de nómina) | Nómina | **Hecho y probado en el ambiente de pruebas del proveedor, desde el panel con sesión real (25-nov-2026):** botón "Timbrar" en el historial, un CFDI por empleado, UUID y XML en el detalle, y recibos con UUID. Además: cálculo de ISR/IMSS, historial y recibos imprimibles | `OT-0064-Timbrado-de-Nomina.md`; sección "Prueba real desde el panel" de este documento (CFDI de prueba con UUID `d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0` y su XML revisado; rechazo del proveedor a un RFC inexistente; empleados sin datos fiscales no llegan al proveedor) | Los criterios fiscales (partidas, tratamiento del subsidio) están **por validar con un contador**; con un emisor real habría que validarlos antes. No cancela CFDI de nómina ni cubre nóminas extraordinarias, incapacidades u horas extra. No se verificó todavía volver a pulsar "Timbrar" (que no repita al ya timbrado) ni el PDF |

Pruebas automáticas de toda la rama: `npm run test:ci` = 13 suites en verde (incluye 22 pruebas del timbrado masivo).

## Prueba real desde el panel: timbrado de nómina (25-nov-2026, ambiente de pruebas)

Hecha por una persona con su sesión (director de SA de CV), con una nómina **mensual** de 4 empleados (periodo 2026-11-25 al 2026-12-24).

| Empleado | Datos fiscales | Resultado | Qué demuestra |
|---|---|---|---|
| Karla Fuente Nolasco | Completos, con un RFC de la lista de prueba del SAT | **Timbrado.** UUID `d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0` | El flujo completo funciona: desglose guardado al aprobar la nómina → CFDI de nómina 1.2 → proveedor → UUID anotado en la base → XML descargable |
| diego | Completos, pero con un RFC **inventado** | **Rechazado por el proveedor:** "NOM9: el RFC del receptor no está en la lista de RFC inscritos no cancelados en el SAT" | El ambiente de pruebas **sí valida el RFC contra el listado del SAT**: el formulario solo revisa el formato, y la existencia real del RFC la comprueba el timbrado |
| Juan Luis López, Verónica López | Sin RFC, CURP, CP fiscal, contrato ni entidad | **No se llamó al proveedor**; el sistema dijo exactamente qué dato falta | La revisión previa evita gastar timbres y explica la corrección |

**Revisión del XML timbrado (Karla):** percepciones $1,600.00 (001 Sueldos); deducciones $104.44 = seguridad social $39.87 (001) + ISR $64.57 (002); otros pagos $64.57 (002 Subsidio para el empleo, con SubsidioCausado $535.65); SubTotal $1,664.57 − Descuento $104.44 = **Total $1,560.13, igual al neto que paga la nómina**. NumDiasPagados 30, antigüedad P4W, periodicidad 05 (mensual), SDI $55.96, registro patronal de ejemplo del emisor de pruebas (variable de entorno).

**Observaciones para pulir (no impidieron el timbrado):**
- El mensaje de rechazo se muestra tal cual lo devuelve el proveedor, con el JSON crudo; conviene traducirlo (por ejemplo, "El RFC no está inscrito en el SAT").
- `FechaPago` del recibo salió igual a la fecha de inicio del periodo (2026-11-25) y no a la fecha real de pago.
- El `NumEmpleado` se derivó del identificador interno porque el empleado no tiene número capturado.
