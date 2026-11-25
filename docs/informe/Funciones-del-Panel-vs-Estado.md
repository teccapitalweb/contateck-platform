# Funciones del panel y su estado

Lista de lo que el panel **ofrecía como botón o acción** y estaba marcado como "siguiente fase" al 25-nov-2026, y en qué quedó. Solo se marca "hecho" lo que funciona y se probó; lo demás dice qué falta o qué se acotó. Hoy el panel ya no tiene ningún aviso "siguiente fase" (lo comprueba `backend/test-interfaz.js`).

| Función del panel | Dónde | Estado | Evidencia | Qué falta o qué matizar |
|---|---|---|---|---|
| Exportar el dashboard (Excel/CSV) | Dashboard | **Hecho** | `OT-0060-Sin-Botones-Muertos.md`; `test-interfaz.js`; CSV real de Empresa Demo C abierto en el visor | La impresión real del navegador no se verificó (se probó el HTML generado) |
| Imprimir / PDF del dashboard | Dashboard | **Hecho** | Mismo | Igual: sale por el diálogo de impresión del navegador |
| Timbrado masivo de facturas | Facturación | **Hecho; probado con servidor simulado; falta un lote real contra el PAC de pruebas** | `OT-0063-Timbrado-Masivo.md`; `test-facturacion-masiva.js` (16) y `test-facturacion-masiva-ruta.js` (6); prueba de la ventana en navegador (lote con timbrada, duplicado, rechazo y corte de red) | Un lote real contra Fiscalapi (pruebas), hecho por una persona con su sesión |
| Timbrar nómina (CFDI de nómina) | Nómina | **Implementado en el ambiente de pruebas del proveedor:** botón "Timbrar" en el historial, un CFDI por empleado, UUID y XML en el detalle, y recibos con UUID. Además: cálculo de ISR/IMSS, historial y recibos imprimibles | `OT-0064-Timbrado-de-Nomina.md` | Probado contra el proveedor (dos CFDI de prueba aceptados, con y sin subsidio). **Requiere aplicar el SQL OT-0064 (no ejecutado)** y los criterios fiscales (partidas, tratamiento del subsidio) están **por validar con un contador**; con un emisor real habría que validarlos antes. No cancela ni cubre nóminas extraordinarias |

Pruebas automáticas de toda la rama: `npm run test:ci` = 13 suites en verde (incluye 22 pruebas del timbrado masivo).
