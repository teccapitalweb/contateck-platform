# OT-0056 · El asistente explica lo básico y cómo usar el sistema (base de conocimiento)

**Rama:** `feature/OT-0056-base-de-conocimiento` (sobre `integracion-local`). Amplía el asistente por reglas de la OT-0054: antes solo contestaba con **datos de la empresa**; ahora también contesta **conceptos básicos** y **guías del sistema**, siempre sin IA de pago.

## Qué agrega
- **Conceptos ("¿qué es…?", "¿para qué sirve…?", "¿cómo funciona…?")**, 27 respuestas: IVA (trasladado y acreditable), CFDI, timbrar y UUID, PUE/PPD y complemento de pago, nota de crédito, póliza, Debe y Haber y naturaleza, catálogo de cuentas, Código Agrupador, contabilidad electrónica, balanza, Balance General, Estado de Resultados, activo/pasivo/capital, ingresos/costos/gastos, Libro Mayor, causación, cuentas por cobrar y por pagar, DIOT, ISR, RFC, régimen fiscal, periodo y cierre, nómina, obligaciones fiscales, qué es CONTATECK y "¿eres una IA?".
- **Guías ("¿cómo registro…?", "¿dónde…?", "¿quién puede…?")**, 18 respuestas: registrar una venta, timbrar, cancelar o emitir nota de crédito, registrar un cobro, pagar a un proveedor, contabilizar una factura (emitida y de proveedor), crear una póliza o una cuenta, la Configuración contable, cerrar un periodo, generar el XML del SAT, cargar los Códigos Agrupador, registrar una declaración, invitar a una persona, roles y permisos, calcular la nómina, cerrar sesión y cambiar el tema, y qué muestra el Dashboard.
- Las respuestas de concepto que tienen un dato relacionado sugieren la pregunta de datos ("Para ver el dato de tu empresa pregunta: ¿Cómo va el IVA este mes?").
- Una pregunta sobre **datos** ("¿cómo va el IVA?") sigue yendo a los datos; las explicaciones solo contestan a preguntas con forma de concepto o de guía. Lo que no está en la base no se inventa: "No estoy seguro de qué me preguntas".

## Cómo está hecho
`backend/src/baseConocimiento.js` (texto de las respuestas y palabras clave) y `backend/src/textoUtil.js` (normalizar texto); `asistenteContable.js` consulta primero la base y después los datos. Frontend: dos sugerencias nuevas ("¿Qué es el IVA?" y "¿Cómo registro una venta?"), `app.js?v=14`.

## Cómo se evita que la guía mienta
Las pruebas (`test-asistente.js`, ahora **22**) revisan contra el código real que:
- los **nombres de pantallas y botones** citados siguen existiendo en el frontend (29 etiquetas); si alguien renombra "Cerrar periodo", la prueba falla y avisa que hay que actualizar la guía;
- los **roles** que dicen las guías coinciden con los del código (ventas, nómina, facturación, SAT y Fiscal, invitaciones);
- los textos no prometen lo que el sistema no hace (el ISR no se calcula, el timbrado de nómina no está disponible, el asistente no es IA);
- cada sugerencia de datos lleva a una intención real, las claves están normalizadas y los ids son únicos; unas 90 formas de preguntar se reconocen bien (45 respuestas en total).
Al probarlo salieron 15 formas de preguntar que no se reconocían ("cómo hago una factura", "cómo invito a un usuario"…) y se agregaron variantes.

## Límites (para el informe)
- Son **textos fijos escritos a mano**, generales a propósito; no son asesoría fiscal. Las fechas (día 17) y tasas (16%) son las generales y cada empresa puede tener casos distintos: la guía recomienda confirmarlo con el contador.
- Reconoce palabras clave: una pregunta muy distinta a las previstas no se contesta (lo dice). No mantiene contexto entre preguntas.
- Quien cambie una pantalla o un rol debe actualizar la guía; las pruebas ayudan pero no cubren todo el texto.
