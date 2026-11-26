# OT-0074 · Exportar Ventas y Pólizas a CSV (Excel)

**Rama:** `feature/OT-0074-exportar-listas` (sale de `integracion-local`). Solo local.

## Qué había
El panel mostraba la bandeja de pagos de Ventas y la lista de pólizas de Contabilidad, pero **no había forma de llevarlas a Excel** (la contadora trabaja ahí). Solo existía la exportación del Dashboard y el resultado del timbrado masivo.

## Qué se hizo
- `frontend/exportar-csv.js` (`CTExportar`): da formato y descarga. UTF-8 con BOM (Excel muestra bien los acentos), saltos CRLF, comillas escapadas, y los **textos que Excel leería como fórmula** (`= + - @`) se neutralizan; los **números** se escriben tal cual, así un importe negativo sigue siendo número.
- **Ventas y Pagos:** botón "Exportar CSV" junto al buscador. Exporta **exactamente lo que se ve** (estado, búsqueda y mes puestos): folio, cliente, concepto, importe, IVA, fecha, método, referencia, banco, quién lo registró, estado, folio de póliza, motivo (rechazo o cancelación) y notas. Archivo `Ventas_AAAA-MM-DD.csv`.
- **Contabilidad → Pólizas:** botón "Exportar CSV". Exporta las pólizas del filtro de búsqueda puesto (la tabla y la exportación comparten la misma lista): folio, tipo, fecha, concepto, monto, origen y estado. Archivo `Polizas_AAAA-MM-DD.csv`.
- Si no hay nada con esos filtros, avisa y no descarga un archivo vacío.
- Solo **lee**: no es una acción de escritura, así que también la puede usar el rol de solo lectura.

## Pruebas
- `node test-exportar-csv.js` (11, ya en `npm run test:ci`): BOM y CRLF, acentos, comillas/comas/punto y coma/saltos de línea, fórmulas neutralizadas, números negativos intactos, valores nulos o raros, nombre del archivo, y el cableado (herramienta cargada antes que los módulos, Ventas y Pólizas usan la misma lista filtrada que su tabla, el botón no se oculta al auditor).
- **Probado en el panel real** (sesión de director, DEV, 26-nov-2026): Ventas exportó 7 pagos (los 7 de la base) con sus 14 columnas; con el chip "Cancelados" exportó solo P-0007 con su motivo; con una búsqueda sin resultados avisó "No hay pagos con esos filtros para exportar" y no descargó nada. Pólizas exportó 37 (las 37 de la base, las mismas que la tabla) y con el filtro `I-0001` exportó 6, igual que la tabla.

## Sin verificar
- El archivo abierto en Excel (se probó el contenido y el formato, no la aplicación).
- Facturación (CFDI emitidos), Nómina y Cobranza todavía no tienen exportación propia.
