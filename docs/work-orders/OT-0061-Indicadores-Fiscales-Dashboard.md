# OT-0061 · Indicadores fiscales del Dashboard (IVA del mes e ISR estimado)

**Rama:** `feature/OT-0060-sin-proximamente` (junto con la OT-0060). Sustituye la tarjeta "Indicadores fiscales · Próximamente".

## Qué muestra
- **IVA del mes en curso:** IVA trasladado (cobrado a clientes), IVA acreditable (pagado a proveedores) y la diferencia, a cargo o a favor. Misma regla que SAT y Fiscal y el asistente: cuentas de IVA de la Configuración contable, valor absoluto de cada saldo, diferencia trasladado − acreditable.
- **ISR estimado del ejercicio**, **solo para el régimen general de personas morales (601)**: 30% de la utilidad contable acumulada del año (ingresos − costos − gastos); con pérdida o sin movimientos es $0.00. El texto de la tarjeta dice que es un **estimado**: el pago provisional real usa el coeficiente de utilidad, las pérdidas fiscales y las deducciones autorizadas.
- **Si el régimen no es el 601 o falta, no se inventa un número**: se explica el motivo y se remite al contador.
- Siempre con la nota "cifras de referencia; no sustituyen la revisión de tu contador".

## Cómo está hecho
`backend/src/indicadoresFiscales.js` (función pura `calcularIndicadores` + `obtenerIndicadoresFiscales`, con las herramientas de solo lectura del asistente y el token del propio usuario, RLS) y la ruta `GET /api/indicadores-fiscales`, solo para roles de contabilidad (director, admin, contador, auditor); rh y vendedor reciben "restringido" y la tarjeta lo dice en vez de mostrar ceros engañosos. El frontend la pide aparte, después del resto del Dashboard, para no retrasarlo; los textos se escapan.

## Pruebas
`backend/test-indicadores.js` (`npm run test:indicadores`, en `test:ci`): 6 pruebas: ISR con ganancia, pérdida, redondeo y espacios; otros regímenes, régimen vacío y datos faltantes sin número inventado; IVA con periodo en palabras y errores que no se filtran; consulta del mes actual y del año con la herramienta del usuario; ruta por rol; y el pintor real de la tarjeta con textos maliciosos escapados.

## Límites
- El ISR es una **referencia**: no es el pago provisional ni la declaración. Para el régimen general de personas morales usa la tasa del 30%; otros regímenes (RESICO, personas físicas…) no se calculan.
- Depende de que la empresa tenga capturado su régimen fiscal y la Configuración contable (para el IVA).
