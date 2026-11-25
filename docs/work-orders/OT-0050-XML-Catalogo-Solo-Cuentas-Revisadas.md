# OT-0050 · El XML del catálogo del SAT ya no lleva cuentas sin Código Agrupador válido

**Rama:** `feature/OT-0050-xml-catalogo-solo-cuentas-sat` (sobre `integracion-local`). Solo frontend; sin SQL.
Salió de probar el XML real de Empresa Demo C después de cargar los 25 códigos agrupador (OT-0049).

## Problema encontrado
Al generar el XML del catálogo (capturado en memoria, sin guardar ningún archivo) salieron **29 cuentas** y no 25. Las 4 de más eran cuentas **inactivas y sin movimientos** (`103`, `208`, `10003`, `bancos`) que no tenían Código Agrupador, así que el XML les puso su **código interno** en `CodAgrup`:
- `CodAgrup="10003"` y `CodAgrup="bancos"` no son códigos del SAT (ni siquiera tienen el formato `NNN` o `NNN.NN`): el SAT rechazaría el archivo.
- `103` y `208` parecían válidos por casualidad, pero significan otra cosa en el catálogo del SAT.
Además el panel decía "25 de 25 cuentas con código" mientras el XML llevaba 29: dos listas distintas de cuentas.

## Cambio (`frontend/contabilidad.js`, `?v=23`)
1. El XML del catálogo ahora lleva las **mismas cuentas que se revisan para el Código Agrupador** (activas, más inactivas con movimientos), y se les suman sus **cuentas madre** (para que cada `SubCtaDe` exista en el catálogo).
2. Si alguna cuenta del XML **no tiene Código Agrupador**, el botón **no descarga** y avisa cuántas faltan y cuáles son las primeras. Antes descargaba igual con un aviso y un archivo que el SAT iba a rechazar.

## Pruebas
`backend/test-fiscal.js` (23 en total): se ajustó la prueba del XML (ya no espera todas las cuentas) y se agregó una nueva (cuenta inactiva sin uso fuera, cuenta madre dentro, el aviso va antes de la descarga). Comprobado con una mutación: con el código anterior la prueba falla.

## Decisión que queda
Una cuenta inactiva **con** movimientos sigue entrando al XML, porque aparece en la Balanza. Si la contadora prefiere otra regla, es un ajuste en `cuentasParaXmlCatalogo()`.
