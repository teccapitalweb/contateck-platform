# OT-0063 · Timbrado masivo (Facturación)

**Rama:** `feature/OT-0063-timbrado-masivo-nomina` (sale de `integracion-local` en `9f05822`). Solo local, sin push.

## Qué había
El botón "Timbrado masivo" de Facturación solo mostraba "El timbrado masivo ante el PAC requiere backend — siguiente fase". El timbrado de **una** factura ya funcionaba (`POST /api/facturar`, Fiscalapi en pruebas).

## Qué se hizo
Subir un archivo **CSV**, revisarlo entero **sin gastar timbres**, confirmar, y timbrar las facturas válidas **una por una**.

| Pieza | Qué hace |
|---|---|
| `frontend/facturacion-masiva-csv.js` | Lee el CSV (coma o punto y coma, comillas, acentos, BOM, números con coma decimal si el separador es `;`). Una fila = una factura con un concepto; si varias filas repiten el valor de la columna `factura`, son conceptos de **una** factura. Genera la plantilla descargable y el CSV de resultado (neutraliza fórmulas de Excel). |
| `POST /api/facturar-masivo/validar` (`backend/src/facturacionMasiva.js`) | Revisión previa: valida cada factura con **las mismas reglas que `/facturar`** (`validarFactura`) y dos reglas que solo vivían en el formulario (RFC genérico ⇒ régimen 616; usos D01–D10 solo para personas físicas). Mismo permiso que timbrar (director, admin, contador). Máximo 50 facturas por lote. No llama al PAC. |
| `frontend/facturacion.js` (ventana "Timbrado masivo") | Paso 1 archivo → paso 2 revisión (filas con su error) → confirmación explícita con el importe → paso 3 timbrado secuencial con estado por fila, "Detener", y resultado descargable en CSV. |

**El camino al PAC no es nuevo:** cada factura se timbra con el mismo `POST /api/facturar` del formulario, así que conserva validaciones, candado contra duplicados, registro en Postgres, permisos y rol.

## Decisiones de seguridad
- **Nada se timbra sin confirmar** (se muestra cuántas y por cuánto, y que es ambiente de pruebas).
- **Posible duplicado** (mismo receptor e importe en los últimos 15 min, regla de OT-0030): esa factura **no se emite sola**; queda marcada y aparece "Emitir de todos modos" por fila.
- **Si el servidor no responde en una factura, el lote se detiene** (esa factura pudo haberse timbrado): se avisa, se refresca la lista y las restantes quedan "no enviadas". No se sigue a ciegas.
- No se puede cerrar la ventana mientras corre un lote (se pierde el seguimiento); hay "Detener".
- Un auditor no ve el botón (se agregó a la lista de OT-0042) y el backend lo rechaza igual.
- Texto del archivo: se escapa al mostrarse; en el CSV de resultado se neutralizan `= + - @`.

## Pruebas
- `node test-facturacion-masiva.js` (16): lector de CSV (plantilla sin errores, agrupación, `;`/comillas/acentos/BOM, columnas faltantes, números ilegibles, receptor distinto en una misma factura, fórmulas de Excel) y revisión del servidor (totales con IVA, exento y 0, errores por factura sin frenar a las demás, RFC genérico, usos D01–D10, factura repetida en el archivo, límite de 50, entradas basura).
- `node test-facturacion-masiva-ruta.js` (6): la ruta real contra un Supabase falso: sin sesión 401, vendedor 403, contador 200 con resumen, 51 facturas 400, vacío 400.
- Ventana real (`facturacion.js` + CSV, en el navegador, con el servidor simulado): carga de archivo, agrupación, fila con error, nombre con HTML mostrado como texto, confirmación, lote con timbrada / posible duplicado / rechazo del PAC, "Emitir de todos modos", descarga del CSV de resultado, cierre bloqueado durante el lote y **corte de red a mitad del lote** (se detiene, marca "sin respuesta" y deja el resto sin enviar).
- Suite completa `npm run test:ci` en verde (incluye las dos nuevas); la de solo lectura exigió ocultar el botón al auditor y registrar los botones internos de la ventana.

## Sin verificar
- **No se ha timbrado un lote real contra el PAC de pruebas de Fiscalapi desde el panel.** Falta que una persona suba la plantilla con su sesión (los RFC de la plantilla son los de prueba del SAT).
- Excel: se probó el formato CSV (UTF-8 con BOM); no se abrió el archivo en Excel.
