# OT-0077 · Exportar a CSV: Facturación, Balanza y Nómina

**Rama:** `feature/OT-0077-exportar-mas-listas` (sale de `integracion-local`). Solo local. Continúa a `OT-0074` (Ventas y Pólizas) con la misma herramienta (`frontend/exportar-csv.js`).

## Qué había
Ventas y Pólizas ya se exportaban a Excel, pero las listas de **Facturación**, la **Balanza de comprobación** y **Nómina** no; la contadora no podía llevarlas a su hoja de cálculo.

## Qué se hizo
Un botón "Exportar CSV" en cada una, que baja **exactamente lo que se ve** y solo lee (no cambia nada, así que tampoco se oculta al rol de solo lectura):
- **Facturación (CFDI emitidos):** respeta la búsqueda puesta (comparte el mismo filtro que la tabla). Columnas: folio, UUID completo, cliente, RFC del receptor, fecha, tipo (ingreso, nota de crédito, pago), método de pago, total y estado. Como el panel carga los CFDI por páginas de 200, si en la base hay más de los cargados el aviso lo dice ("Solo van los N cargados de M; pulsa Cargar más…").
- **Contabilidad → Balanza:** la balanza del periodo elegido: código, cuenta, naturaleza, saldo inicial (solo cuando hay un mes seleccionado), cargos, abonos, saldo deudor, saldo acreedor y la fila de **Totales**. El nombre del archivo lleva el periodo (`Balanza_2026-12_…csv`) y, si la balanza no cuadra, el aviso lo dice.
- **Nómina:** el **historial** (periodo, periodicidad, empleados pagados, neto pagado, procesada) y el **detalle** de una nómina (empleado, puesto, sueldo base, otras percepciones, deducciones, neto, UUID del CFDI de nómina y notas), con el periodo en el nombre del archivo. Es la información que ya ve esa persona según su rol; no se agrega nada nuevo.
- Importes como **números** (un negativo sigue siendo número en Excel); textos con `= + - @` neutralizados.

## Pruebas
- `node test-exportar-csv.js` (14, ya en `npm run test:ci`; 3 nuevas de cableado y 1 que ahora revisa los seis botones): Facturación comparte el filtro de la tabla y avisa de lo no cargado; Balanza maneja con o sin saldo inicial y trae totales; Nómina exporta historial y detalle con montos numéricos y el mismo detalle que muestra la ventana; ningún botón de exportación se oculta al solo lectura.
- **Probado en el panel real** (sesión de director, DEV, 26-nov-2026): Facturación exportó **10** facturas (las 10 de la base, las mismas de la tabla) y con la búsqueda `CT-48` exportó 1; Balanza exportó **19** cuentas con totales `1,083,424.98 / 1,083,424.98 / 796,144.21 / 796,144.21`, iguales a los de la pantalla, y con un mes elegido agregó la columna "Saldo inicial" y el periodo al nombre; Nómina exportó el historial (**8** nóminas, igual que la base) y el detalle de la nómina de 4 empleados (neto total 9,360.77 = la suma de los renglones; el UUID del CFDI de Karla Fuente Nolasco aparece en su fila).

## Sin verificar
- Los archivos abiertos en Excel (se probó el contenido y el formato, no la aplicación).
- Libro Mayor, Cuentas por Pagar y Estados financieros todavía no tienen exportación.
