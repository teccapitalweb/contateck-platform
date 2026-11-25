# OT-0062 · Recibos de nómina imprimibles y alcance del timbrado de nómina

**Rama:** `feature/OT-0062-recibos-de-nomina` (sobre `integracion-local`). Cierra el último botón "siguiente fase" del sistema.

## Qué se hizo
- **Recibos de nómina:** en **Nómina → Historial**, cada nómina tiene un botón **Recibos** que imprime (o guarda como PDF) **un recibo por empleado**: empresa, empleado y puesto, periodo y periodicidad, sueldo base, otras percepciones, deducciones (ISR, IMSS y otras), **neto pagado**, notas, líneas de firma y un pie que dice que es un **recibo informativo, no un CFDI de nómina**. Se imprime desde un iframe oculto (no depende de ventanas emergentes).
- Se quitó el botón **"Timbrar nómina"** (decía "siguiente fase") y el encabezado pasó de "Cálculo y timbrado" a **"Cálculo, historial y recibos"**.
- **Seguridad:** el detalle de la nómina pintaba nombres, puestos y notas sin escapar; ahora se escapan (igual que los recibos).
- El asistente explica el alcance: el timbrado del CFDI de nómina no forma parte de la plataforma.

## Por qué el timbrado de CFDI de nómina queda fuera del alcance (decisión de alcance, no "pendiente")
Se revisó el proveedor de timbrado (el SDK de Fiscalapi 4.0.417 sí admite facturas de nómina "por valores"). Hacerlo bien exige datos y validaciones que hoy no existen en el sistema ni se pueden comprobar sin un contador:
- **Datos del empleado que no se capturan:** código postal fiscal, régimen fiscal del trabajador, tipo de contrato, tipo de jornada, riesgo de puesto, periodicidad de pago por catálogo del SAT, entidad federativa, antigüedad y salario diario integrado. La tabla `empleados` tiene RFC, CURP, NSS, fecha de ingreso, cuenta bancaria y sueldo.
- **Datos del patrón:** registro patronal, y que el RFC emisor tenga CSD vigente.
- **Complemento de nómina 1.2:** el desglose de percepciones, deducciones (ISR, IMSS) y otros pagos (subsidio) con claves del catálogo del SAT; el cálculo del sistema guarda las **deducciones como un solo total** por empleado, no por clave.
- **Riesgo:** un CFDI de nómina mal timbrado tiene efectos fiscales para la empresa y el trabajador; no hay forma de validar el resultado contra el SAT desde el ambiente de pruebas.
Para una versión futura, el camino técnico está identificado: ampliar la captura de datos del empleado, guardar el desglose por clave de ISR e IMSS y usar la facturación de nómina del proveedor.

## Pruebas
`backend/test-interfaz.js` pasa a **8** pruebas: una nueva ejecuta el generador real de recibos (un recibo por empleado, periodo, importes y neto con formato, nombres y notas maliciosos escapados, aviso de que no es un CFDI, nómina sin empleados) y comprueba que el detalle ya no pinta nombres sin escapar; la de "botones siguiente fase" ahora exige **cero**. Se ajustaron las pruebas dependientes (OT-0042 y el asistente).

## No verificado
La impresión real (diálogo del navegador y su vista previa): se probó el HTML generado, no la salida de la impresora.

## Verificación (25-nov-2026, rama unida a `integracion-local`, backend reiniciado, director de Demo C)
- `npm run test:ci`: **11 suites, 137 pruebas**, todas pasan.
- En pantalla: el encabezado de Nómina dice "Cálculo, historial y recibos" y los botones son **Simulador fiscal** y **Calcular**; ya no hay "Timbrar nómina".
- **No verificado en pantalla:** el botón **Recibos** y la impresión, porque Empresa Demo C **todavía no tiene ninguna nómina pagada** (el historial está vacío). Para verlo hay que procesar una nómina en Demo C (Nómina → Calcular → aprobar), que sirve también para las capturas 22 a 24 del informe. El generador de recibos sí se probó con su código real.
