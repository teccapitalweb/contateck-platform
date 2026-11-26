# OT-0078 · Exportar a CSV: Libro Mayor, Cuentas por Pagar y Estados financieros

**Rama:** `feature/OT-0078-exportar-mayor-proveedores-estados` (sale de `integracion-local`). Solo local. Cierra la serie de exportaciones (`OT-0074`, `OT-0077`) con la misma herramienta (`frontend/exportar-csv.js`).

## Qué había
Las pestañas de Contabilidad **Libro Mayor**, **Cuentas por Pagar** y **Estados financieros** solo se podían leer en pantalla.

## Qué se hizo
Un botón "Exportar CSV" en cada una, que baja **lo que se ve** y solo lee (no es acción de escritura, así que tampoco se oculta al rol de solo lectura):
- **Libro Mayor:** los movimientos de la cuenta elegida (fecha, folio, concepto, debe, haber) con su **saldo acumulado** calculado con la misma fórmula que la tabla (según la naturaleza de la cuenta). El archivo lleva el código de la cuenta (`Libro_mayor_102_….csv`).
- **Cuentas por Pagar:** las facturas de proveedor que se ven, con la búsqueda puesta: folio, proveedor, fecha, método de pago, total, saldo pendiente y si está liquidada o pendiente.
- **Estados financieros:** el **Estado de Resultados** y el **Balance General** en un solo archivo (columnas: estado, sección, código, cuenta, importe), con los totales de cada sección y "Pasivo + Capital", del **periodo elegido** (el nombre del archivo lo lleva). Si el balance no cuadra, el aviso lo dice.
- Si no hay nada que exportar (cuenta sin movimientos, búsqueda sin resultados), avisa y no descarga un archivo vacío.

## Pruebas
- `node test-exportar-csv.js` (17, ya en `npm run test:ci`; 3 nuevas): el Mayor usa la misma cuenta y la misma fórmula de saldo que la tabla; Cuentas por Pagar actualiza la lista exportable al cargar y al buscar; Estados trae ambos estados, sus totales y el periodo; y ninguno de los tres botones se oculta al solo lectura.
- **Probado en el panel real** (sesión de director, DEV, 26-nov-2026): Libro Mayor de la cuenta **101** (4 movimientos, saldo −$223,064.00) y de **102 · Bancos** (20 movimientos; el último saldo acumulado, 438,759.44, es el saldo que muestra la pantalla); Cuentas por Pagar exportó las **2** facturas de proveedor que muestra la tabla y con una búsqueda sin resultados avisó y no descargó nada; Estados exportó 18 filas cuyos totales son los de la pantalla (ingresos $216,005.17, gastos $295,646.97, pérdida $79,641.80, activo $277,333.24, pasivo $80,960.83, capital $196,372.41, pasivo + capital $277,333.24).

## Sin verificar
- Los archivos abiertos en Excel (se probó el contenido y el formato, no la aplicación).
- Las demás pestañas de Contabilidad (Catálogo, SAT/Declaraciones y Periodos) no tienen exportación propia; el Catálogo y la Balanza ya salen en el XML del SAT.
