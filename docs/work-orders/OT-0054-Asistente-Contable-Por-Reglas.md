# OT-0054 · Asistente contable por reglas (chatbot sin IA de pago)

**Rama:** `feature/OT-0054-asistente-por-reglas` (sobre `integracion-local`). Cubre la actividad 7 del cronograma de forma realista: **sin comprar IA**. La IA de la OT-0053 queda construida pero **apagada** por defecto, para activarla más adelante si se decide.

## Decisión
No se contratará un servicio de IA por ahora. El módulo se entrega como un **chatbot basado en reglas**: reconoce el tema de la pregunta por palabras clave y contesta con los datos reales de la empresa. No necesita llave, no cuesta por consulta, no manda datos a terceros y siempre da la misma respuesta para la misma pregunta y los mismos datos.
En la pantalla **no se presenta como inteligencia artificial**: el saludo dice expresamente que no lo es.

## Qué contesta (11 temas)
Balance General · caja y bancos · cuentas por cobrar · cuentas por pagar · IVA (trasladado, acreditable y diferencia, de un mes) · obligaciones fiscales próximas y vencidas · utilidad o pérdida de un mes · ingresos, egresos y facturación del mes · alertas pendientes · nómina estimada · ayuda. Entiende acentos y mayúsculas, "este mes", "el mes pasado", meses por nombre ("octubre") y años. Si no entiende, lo dice y ofrece ejemplos; **no inventa**.

## Cómo está hecho
- `backend/src/asistenteContable.js`: detecta la intención (puntaje de palabras clave; los saludos nunca le ganan a una pregunta real) y arma la respuesta con **las mismas herramientas de solo lectura** de la OT-0053 (con el permiso del propio usuario, RLS, solo agregados, sin RFC ni nombres).
- Herramienta nueva `iva_del_periodo`: usa las cuentas de IVA de la Configuración contable (misma regla que la pantalla SAT y Fiscal: valor absoluto de cada saldo, diferencia = trasladado − acreditable).
- La ruta `/api/ia/*` elige el modo con `ASISTENTE_MODO` en el `.env`: **`reglas` (por defecto)** o `ia` (necesita `ANTHROPIC_API_KEY`). Mismos roles (director, admin, contador, auditor), sesión obligatoria y límite de uso (120 consultas por usuario y hora en modo reglas).
- Frontend: vista y menú renombrados "Asistente contable" (Beta · solo lectura); sugerencias en pantalla; el texto de la respuesta se escapa antes de darle formato.

## Pruebas
`backend/test-asistente.js` (`npm run test:asistente`, dentro de `test:ci`): **13 pruebas** con herramientas simuladas (reconocimiento de ~45 formas de preguntar, periodos, cada respuesta, errores, determinismo y que el módulo no escribe ni usa la red). Se añadió una prueba de `iva_del_periodo` a `test-ia.js` (19). Las pruebas encontraron dos fallos de diseño que se corrigieron: un saludo ("buenas tardes, ¿cómo va el IVA?") ganaba a la pregunta, y "qué debo revisar" se confundía con "debo" (cuentas por pagar).

## Límites (para el informe)
- Entiende **solo estos temas** y palabras clave: no es una conversación libre, no mantiene contexto entre preguntas ni corrige faltas de ortografía.
- "Ingresos y egresos" solo cubre el mes en curso (usa el Dashboard); para otro mes se responde con utilidad o saldos.
- La utilidad y el IVA son **cifras de referencia** con las pólizas activas (estado `ok`); no sustituyen la revisión del contador. Heredan los límites ya documentados (OT-0043, OT-0051).
- Si más adelante se activa el modo IA, hay que probarlo con la llave real (no se ha probado con el proveedor).
