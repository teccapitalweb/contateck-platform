# OT-0069 · PDF del CFDI de nómina timbrado

**Rama:** `feature/OT-0069-pdf-recibo-nomina` (sale de `integracion-local` en `1c20536`). Solo local.

## Qué había
Un recibo de nómina timbrado (OT-0064) se podía bajar en **XML** desde el detalle de la nómina, pero no había forma de obtener su **representación impresa (PDF)**; era uno de los puntos "sin verificar" del informe.

## Qué se hizo
- **Ruta nueva** `GET /api/nominas/detalle/:detalleId/pdf`: igual de estricta que la del XML. Exige sesión, valida el identificador, lee el renglón con el token de la persona (solo de su empresa, por RLS) y **solo si ya está timbrado** pide el PDF al proveedor (`getPdf`). Si no hay CFDI, responde 404 con el motivo; no llega al proveedor.
- **Botón "PDF"** junto al "XML" en la columna "CFDI de nómina" del detalle de la nómina. Mientras el proveedor genera el archivo (unos 4 segundos) el botón se deshabilita y muestra "…"; si falla, avisa con el motivo; al terminar se descarga `nomina-<UUID>.pdf`.

## Pruebas
- `node test-nomina-pdf-ruta.js` (5): sin sesión 401, identificador inválido 400, recibo sin timbrar 404, recibo de otra empresa 404 sin tocar al proveedor, y que la pantalla tiene el botón conectado.
- **Probado en el panel real** (visor, sesión de SA de CV, 26-nov-2026) con el CFDI ya timbrado de Karla Fuente Nolasco (UUID `d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0`): la ruta respondió **200, `application/pdf`, 145,849 bytes, empieza con `%PDF-`, en 3.7 s**; el botón pasó a "…" y deshabilitado, generó la descarga `nomina-d4e1ffd0-ea52-4b48-b7d2-4bb10b495dd0.pdf` y volvió a su estado.

## Sin verificar
- El contenido visual del PDF (diseño, logotipo y datos): lo genera el proveedor y no se abrió en un lector.
- El PDF de un recibo con deducciones u otros pagos distintos al de la prueba.
