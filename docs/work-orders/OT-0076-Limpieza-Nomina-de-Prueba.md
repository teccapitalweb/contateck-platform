# OT-0076 · SQL para limpiar la nómina de prueba de Empresa Demo C

**Rama:** `feature/OT-0076-limpieza-nomina-de-prueba` (sobre `integracion-local`). **Estado: EJECUTADO por la persona responsable en contateck-dev el 26-nov-2026** (ver "Resultado"). Lo corre ella en el SQL Editor; el asistente solo tiene acceso de lectura.

## Para qué
La nómina de noviembre de 2026 que se pagó y timbró para verificar el timbrado de nómina (OT-0064) dejó en Demo C una póliza de egreso (E-00016, $22,759.73) que vuelve negativo el Balance (Activo ≈ -23,184.30, resultado ≈ -22,673.52) y cambia las cifras del Dashboard que se van a capturar para el informe. Antes de ella: Activo ≈ -424.57 y resultado ≈ 86.21.

## Qué hay en `database/OT-0076-limpieza-nomina-de-prueba-DemoC-PROPUESTA.sql`
- **Bloque 1:** quita solo la **póliza** E-00016 (y sus 2 partidas) y regresa el folio de Egreso a 15. Devuelve el Balance y el Dashboard a su estado anterior y **conserva la nómina y su timbre**, por si aún faltan capturas de Nómina.
- **Bloque 2 (opcional, después de las capturas de Nómina):** quita la nómina, sus 2 renglones y a la empleada de prueba "Karla Fuente Nolasco".
- **Candados:** cada bloque es una transacción que verifica empresa (Empresa Demo C), ids, folio, monto, número de partidas, que nada más referencie la póliza y que el periodo no esté cerrado; si algo no coincide, se detiene sin borrar. El bloque 2 exige que el 1 ya se haya corrido.
- **No toca:** la bitácora de auditoría, otras empresas, las cuentas de prueba (rh, vendedor) ni el CFDI de prueba que quedó en el proveedor de timbrado.

## Verificación previa (solo lectura, 26-nov-2026)
Con los datos actuales, todos los candados darían luz verde: 1 póliza y 2 partidas, 1 nómina con 2 renglones, 1 empleada de prueba, una sola empresa con ese nombre, ningún otro folio de Egreso 16 o mayor, y la expresión de folios distingue E-00015 / E-00009 (no) de E-00017 / E-00100 (sí). El candado de periodo cerrado consulta `periodos_contables` directamente (noviembre de 2026 no está cerrado).

## Corrección (OT-0076b)
La primera versión usaba `periodo_esta_cerrado()` para ese candado y, dentro del SQL Editor (sin sesión de usuario), respondió `Empresa no válida`: el script se detuvo **sin borrar nada** (se comprobó después: la póliza, sus partidas, la nómina y el folio seguían intactos). Ahora el candado lee la tabla de periodos.

## Para el informe
La nómina de prueba (historial, recibos, UUID y XML) sirve como evidencia del timbrado de nómina; conviene tomar esas capturas **antes** del bloque 2, y las del Dashboard y Balance **después** del bloque 1.

## Resultado (verificado en solo lectura tras la ejecución)
Se ejecutaron **los dos bloques** (el SQL Editor corre el texto completo que se pega). En Empresa Demo C: la póliza E-00016 y sus partidas ya no existen, el folio de Egreso volvió a 15 (último egreso E-00015), no queda ninguna nómina ni renglones de nómina, y la empleada de prueba se borró. Los saldos regresaron a su estado anterior: Activo -424.57, Pasivo 510.78 (saldo acreedor), ingresos 258.62 y gastos 172.41, es decir resultado 86.21. Las 7 nóminas de otras empresas siguen intactas.

**Consecuencia para el informe:** como el bloque 2 también corrió, la evidencia de Nómina (historial, recibos, UUID y XML) ya no está en Demo C. Para capturarla hay que volver a dar de alta una empleada con datos fiscales, pagar una nómina y timbrarla; conviene hacerlo **después** de las capturas del Dashboard y la Contabilidad, porque esa nómina vuelve a mover las cifras.
