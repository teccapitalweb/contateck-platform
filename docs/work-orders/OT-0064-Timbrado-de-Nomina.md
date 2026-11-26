# OT-0064 · Timbrado de CFDI de nómina (ambiente de pruebas del PAC)

**Rama:** `feature/OT-0064-timbrado-nomina` (sobre `integracion-local`). Sustituye la decisión de alcance de la OT-0062 ("el timbrado de nómina queda fuera"): ahora **sí se timbra**, con dos límites claros que se explican abajo.

## Qué se hizo
- **Historial de nómina → "Timbrar":** genera el CFDI 4.0 tipo **N** con el complemento de nómina 1.2 de **cada empleado** de la nómina. Los que ya tienen UUID **no se vuelven a timbrar**; los que fallan por datos no detienen a los demás; un error de sesión o de servidor del proveedor detiene el lote; si el proveedor timbró pero no se pudo anotar el UUID, el lote se detiene para no duplicar timbres y el UUID se devuelve. El resultado se muestra por empleado.
- **Detalle de la nómina:** columna "CFDI de nómina" con el UUID y descarga del **XML**. El recibo imprimible muestra el UUID si el empleado ya está timbrado.
- **Datos fiscales del empleado** (formulario de empleados, opcionales): código postal fiscal, entidad federativa (clave SAT), tipo de contrato, jornada y riesgo del puesto. RFC, CURP, NSS y cuenta ya existían. Sin ellos el empleado se paga igual, pero su nómina no se puede timbrar y el mensaje dice qué falta.
- **Desglose guardado:** al pagar la nómina ahora se guardan ISR bruto, ISR retenido, subsidio, IMSS, otras deducciones y el salario diario integrado (antes solo el total de deducciones).
- **Seguridad:** solo `rh`, `admin` y `director`; la ruta valida rol e identificador **antes** de leer datos o llamar al proveedor; candado para que dos clics no timbren dos veces la misma nómina; todo se lee y escribe con el token del usuario (RLS), nunca con llave de servicio; la base solo acepta anotar el UUID por una función con candado de rol y empresa.

## Qué se probó contra el PAC
Con el ambiente de pruebas del proveedor (`test.fiscalapi.com`, emisor de pruebas del SAT) se timbraron dos CFDI de nómina de prueba **sin tocar la base**: uno con subsidio y otro sin él. El proveedor los aceptó y el XML trae los nodos esperados (percepciones, deducciones, otro pago 002 con `SubsidioAlEmpleo`, receptor con antigüedad, periodicidad y salario diario integrado; total = neto del renglón). En el camino el proveedor rechazó tres cosas que ya están corregidas: falta del **registro patronal** (obligatorio con contratos 01 a 08), **FormaPago** en comprobantes tipo N (no debe ir) y el **otro pago 002** (el SAT lo exige siempre con régimen 02, aunque sea de 0.00).

## Criterios fiscales por validar con un contador (el sistema funciona; estas decisiones no son mías)
- Sueldo base como percepción 001; otras percepciones como 038; todo gravado.
- ISR: deducción 002 por el ISR de tarifa y otro pago 002 por el subsidio efectivamente aplicado, de modo que la diferencia sea el ISR retenido (desde mayo de 2024 el excedente del subsidio no se entrega).
- IMSS obrero como deducción 001 y otras deducciones como 004; antigüedad en semanas; cuenta bancaria solo si es CLABE.
- El registro patronal del emisor de pruebas es de ejemplo; con un emisor real se exige la variable `EMISOR_REGISTRO_PATRONAL` del servidor.

## Límites
- **Solo ambiente de pruebas.** Con el emisor real (CSD propio) sería otra decisión: requiere los criterios de arriba validados, CSD vigente, registro patronal real y datos fiscales reales de cada empleado.
- **No se cancelan** CFDI de nómina desde el panel ni se hacen nóminas extraordinarias, incapacidades, horas extra o finiquitos.
- **Requiere aplicar el SQL** `database/OT-0064-timbrado-nomina-PROPUESTA.sql` en la base (columnas nuevas, `crear_nomina` con desglose y `registrar_timbre_nomina`). **No se ha ejecutado.** Sin él, todo lo demás sigue funcionando y "Timbrar" avisa que falta aplicarlo. Las nóminas guardadas **antes** del SQL no tienen desglose: hay que volver a calcularlas para timbrarlas.

## Pruebas
`backend/test-nomina-cfdi.js` (15 pruebas, en `npm run test:ci`): datos faltantes del empleado, desglose con y sin subsidio (y subsidio mayor al ISR), el CFDI armado campo por campo, orquestación del lote (ya timbrados, errores de datos, errores del proveedor, UUID sin anotar), orden de validaciones de la ruta, SQL aditivo y frontend con todo texto escapado. Se ajustaron las pruebas del asistente y de interfaz.

## Verificado en vivo (Demo C, DEV, ambiente de pruebas del proveedor)
Con el SQL aplicado se capturó una empleada de prueba desde el formulario real (con sus datos fiscales), se procesó una nómina mensual (2026-11-01 a 2026-11-30) y se dio "Timbrar" desde el historial: **la empleada con datos quedó timbrada** (UUID en el resultado y en el detalle; el XML descargado es tipo N con total igual al neto, 9,557.09) y **el empleado sin datos fiscales se informó como error** con la lista exacta de lo que falta, sin llamar al proveedor. El desglose (ISR bruto 729.02, subsidio 535.65, ISR retenido 193.37, IMSS 249.54) quedó guardado.

**Corrección encontrada en la prueba (OT-0064b):** el historial mostraba el periodo un día corrido (31/10 a 29/11 en vez de 01/11 a 30/11) porque una fecha sin hora se leía como UTC. Ya está corregido y con prueba (zona horaria de México).

## Pulidos tras la prueba real (OT-0064c)
Una prueba real con una empresa y 4 empleados mostró dos detalles, ya corregidos con pruebas: (1) el motivo del rechazo del proveedor se veía como JSON crudo; ahora se extrae el mensaje real y el RFC que no está en el listado del SAT (NOM9) se explica en palabras ("El RFC del empleado no está inscrito en el SAT"). (2) La fecha de pago del CFDI era la de timbrado recortada al fin del periodo; ahora es el **día en que se aprobó y pagó la nómina** (hora de México), sin salirse del periodo ni pasar de hoy, porque el sistema no guarda otra fecha de pago. El proveedor aceptó el CFDI con esa fecha.

## No verificado
La impresión del recibo con UUID en el diálogo del navegador y la descarga del XML con un clic (se comprobó el contenido del archivo, no el guardado).
