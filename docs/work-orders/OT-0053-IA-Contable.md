# OT-0053 · IA Contable: módulo de consulta y análisis con inteligencia artificial (de solo lectura)

**Rama:** `feature/OT-0053-ia-contable` (sobre `integracion-local`). Cubre la actividad 7 del cronograma ("módulo de consulta y análisis mediante inteligencia artificial"). Sustituye la pantalla desactivada de la OT-0035.

## Qué hace
Un chat dentro del panel (vista **IA Contable**) donde el usuario hace preguntas en lenguaje natural sobre los datos de SU empresa: Balance General, saldos por cuenta (bancos, clientes, IVA, ingresos, gastos…), obligaciones fiscales próximas, cuentas por cobrar y por pagar. La IA responde con lo que devuelven las herramientas y dice cuándo no tiene el dato.

## Cómo está construido
- **Backend** (`backend/src/iaContable.js`, `backend/src/routes/ia.js`): un orquestador que habla con la API del proveedor de IA (Messages API de Anthropic, `fetch` directo, sin librerías nuevas) y le da 4 **herramientas de solo lectura**: `resumen_general`, `saldos_de_cuentas`, `obligaciones_fiscales`, `cuentas_por_cobrar_y_pagar`. El modelo pide una herramienta, el backend la ejecuta y le devuelve el resultado, hasta 4 vueltas.
- **Rutas:** `GET /api/ia/estado` (¿está configurada? ¿puede usarla mi rol?) y `POST /api/ia/consultar`.
- **Frontend** (`app.js`, `postgres-crud.js`): chat con sugerencias; arranca desactivado y solo se inicia al abrir la vista (no suma peticiones al cargar el panel).
- **Configuración** (`backend/.env`): `ANTHROPIC_API_KEY` (secreta), `IA_MODEL` (por defecto `claude-haiku-5-5`, económico), `IA_MAX_TOKENS`, `IA_MAX_POR_HORA`. Sin llave la IA queda desactivada y el sistema funciona igual.

## Garantías de diseño (y cómo se comprueban)
| Garantía | Cómo |
|---|---|
| **Solo lectura**: ninguna herramienta escribe; el módulo no usa insert/update/delete/rpc ni la service role | prueba que revisa el código fuente y la lista de herramientas |
| **Respeta RLS**: los datos se leen con el token del propio usuario, así que solo ve lo que ese usuario ya puede ver de su empresa | las herramientas reciben el token del usuario; no hay otra credencial de datos |
| **Privacidad**: al modelo solo llegan agregados (totales, saldos por cuenta, fechas); sin RFC, nombres de clientes, proveedores ni empleados, ni conceptos de pólizas | pruebas de lo que devuelve cada herramienta (p. ej. los saldos pendientes solo piden `saldo_pendiente`) |
| **No inventa**: instrucciones que obligan a responder solo con datos de las herramientas y a decir cuando falta el dato; no llama "utilidad" a ingresos menos egresos de pólizas | prueba de las instrucciones y del resumen |
| **Datos ≠ órdenes**: lo que traigan las herramientas se trata como dato (defensa contra instrucciones escondidas en nombres de cuentas) | instrucción 6 + prueba |
| **La llave es secreta**: solo en el backend; no sale en respuestas, errores ni registros | prueba con una llave falsa en 3 escenarios de error |
| **Roles**: director, admin, contador y auditor; rh y vendedor no | ruta con 403 antes de consultar |
| **Límite de uso**: 20 consultas por usuario y hora (configurable); pregunta máx. 600 caracteres, historial máx. 6 turnos | pruebas del limitador y la validación |
| **Seguridad del navegador**: el texto de la IA se escapa antes de dar formato; el del usuario y los errores usan `textContent` | prueba del formateador con `<script>` e `<img onerror>` |

## Pruebas
`backend/test-ia.js` (`npm run test:ia`, incluido en `npm run test:ci`): **18 pruebas**, todas con el proveedor y Supabase **simulados** (no usan red ni llave). Cubren el flujo con herramienta, errores del proveedor (401, 429, 5xx, red, respuesta vacía), el tope de vueltas, el recorte de resultados enormes y las garantías de arriba.

## Qué falta para usarla de verdad (lo hace el usuario)
1. Crear una llave de API en el panel del proveedor (console.anthropic.com), **fijar allí un tope de gasto mensual** y pegarla en `backend/.env` como `ANTHROPIC_API_KEY=...`. No se pega en el chat ni en el repositorio.
2. Reiniciar el backend y abrir **IA Contable**.
3. Probar con Empresa Demo C (preguntas sugeridas en pantalla).

## Límites conocidos
- **No se ha probado con el proveedor real** (no hay llave en este entorno): el flujo está probado con respuestas simuladas con la forma documentada de la API; la primera prueba real puede pedir ajustes.
- Las cifras salen de las mismas fuentes que el Dashboard (pólizas con estado `ok`); hereda sus límites (ver OT-0043, OT-0051).
- El límite de uso es en memoria: se reinicia al reiniciar el backend y no se comparte entre instancias.
- La IA no da asesoría fiscal definitiva: lo dice en sus instrucciones y debe remitir al contador.
