# OT-0058 · El asistente recuerda la pregunta anterior, da el saldo de una cuenta, lista facturas sin póliza y tolera faltas

**Rama:** `feature/OT-0058-chat-contexto-y-detalle` (sobre `integracion-local`). Mejoras del asistente por reglas (sin IA de pago) que salieron de la lista de "qué le falta al chat".

## Qué agrega
- **Memoria de la pregunta anterior:** "¿Cómo va el IVA este mes?" y después "¿y el mes pasado?" repite la pregunta de datos con el periodo nuevo (también "¿y octubre?", "¿y el año pasado?"). Sigue con la última pregunta **de datos**: ignora las explicaciones. Sin historial, no inventa. El frontend ya mandaba los últimos mensajes; la ruta ahora los pasa al asistente.
- **Saldo de una cuenta:** "¿Cuánto hay en la cuenta 102?", "saldo de la 105", con o sin mes. Muestra cargos, abonos y saldo, y explica el saldo negativo.
- **Facturas sin póliza:** "¿Qué facturas no tienen póliza?" lista folio, fecha e importe (sin nombres de clientes), máximo 10, y dice cómo contabilizarlas. Usa la misma regla de la alerta del Dashboard (cuentan las pólizas ok, corregida y correccion; no las canceladas). Es una herramienta de solo lectura nueva, `cfdis_sin_poliza`, disponible también para el modo IA.
- **Faltas de ortografía:** una palabra con una letra de más, de menos, cambiada o intercambiada ("balnce", "obligacions", "polza", "deban") se corrige **solo si la pregunta tal cual no se entendía**, y solo con palabras de 5 letras o más. Lo que ya se entiende no se toca, y lo que no se parece a nada no se inventa.
- **"Año pasado"** como periodo.

## Pruebas
`test-asistente.js` pasa de 22 a **27** y `test-ia.js` de 19 a **20**. Las pruebas encontraron un caso real: el mensaje de error de la nueva herramienta se mostraba tal cual al usuario; ahora siempre es un mensaje genérico.

## Límites (para el informe)
- La memoria solo repite una pregunta de **datos** con otro periodo; no entiende referencias como "¿y los proveedores?" ni "¿y eso por qué?".
- La corrección de ortografía es por distancia de una letra: no corrige frases mal armadas ni palabras de menos de 5 letras.
- El saldo de una cuenta usa las pólizas con estado `ok`, igual que el Dashboard y el Balance.
