# Funciones del panel y su estado

Lista de lo que el panel **ofrece como botón o acción** y estaba marcado como "siguiente fase" al 25-nov-2026, y en qué quedó. Solo se marca "hecho" lo que funciona y se probó; lo demás dice qué falta. Se actualiza al cerrar cada función.

| Función del panel | Dónde | Estado | Evidencia | Qué falta o qué matizar |
|---|---|---|---|---|
| Exportar el dashboard | Dashboard | **En curso en otra rama** (OT-0060: CSV para Excel + Imprimir/PDF) | — (pendiente de commit en esa rama) | Registrar aquí el commit y las pruebas cuando cierre |
| Timbrado masivo | Facturación | **Hecho y probado con servidor simulado; falta probarlo contra el PAC de pruebas** | `OT-0061-Timbrado-Masivo.md`; `test-facturacion-masiva.js` (16) y `test-facturacion-masiva-ruta.js` (6); prueba de la ventana en navegador | Un lote real contra Fiscalapi (pruebas) hecho por una persona |
| Timbrar nómina | Nómina | **Pendiente** | El cálculo de ISR/IMSS y el historial ya existen (OT-0027) | CFDI de nómina contra Fiscalapi: datos que faltan (registro patronal, salario diario integrado, tipo de contrato…) y verificación en pruebas |
