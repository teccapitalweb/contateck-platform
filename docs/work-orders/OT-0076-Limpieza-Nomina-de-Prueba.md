# OT-0076 · SQL para limpiar la nómina de prueba de Empresa Demo C

**Rama:** `feature/OT-0076-limpieza-nomina-de-prueba` (sobre `integracion-local`). **El SQL NO está ejecutado**: lo corre la persona responsable en el SQL Editor de contateck-dev.

## Para qué
La nómina de noviembre de 2026 que se pagó y timbró para verificar el timbrado de nómina (OT-0064) dejó en Demo C una póliza de egreso (E-00016, $22,759.73) que vuelve negativo el Balance (Activo ≈ -23,184.30, resultado ≈ -22,673.52) y cambia las cifras del Dashboard que se van a capturar para el informe. Antes de ella: Activo ≈ -424.57 y resultado ≈ 86.21.

## Qué hay en `database/OT-0076-limpieza-nomina-de-prueba-DemoC-PROPUESTA.sql`
- **Bloque 1:** quita solo la **póliza** E-00016 (y sus 2 partidas) y regresa el folio de Egreso a 15. Devuelve el Balance y el Dashboard a su estado anterior y **conserva la nómina y su timbre**, por si aún faltan capturas de Nómina.
- **Bloque 2 (opcional, después de las capturas de Nómina):** quita la nómina, sus 2 renglones y a la empleada de prueba "Karla Fuente Nolasco".
- **Candados:** cada bloque es una transacción que verifica empresa (Empresa Demo C), ids, folio, monto, número de partidas, que nada más referencie la póliza y que el periodo no esté cerrado; si algo no coincide, se detiene sin borrar. El bloque 2 exige que el 1 ya se haya corrido.
- **No toca:** la bitácora de auditoría, otras empresas, las cuentas de prueba (rh, vendedor) ni el CFDI de prueba que quedó en el proveedor de timbrado.

## Verificación previa (solo lectura, 26-nov-2026)
Con los datos actuales, todos los candados darían luz verde: 1 póliza y 2 partidas, 1 nómina con 2 renglones, 1 empleada de prueba, una sola empresa con ese nombre, ningún otro folio de Egreso 16 o mayor, y la expresión de folios distingue E-00015 / E-00009 (no) de E-00017 / E-00100 (sí). No se pudo probar el candado de periodo cerrado porque la función no es ejecutable con el acceso de solo lectura.

## Para el informe
La nómina de prueba (historial, recibos, UUID y XML) sirve como evidencia del timbrado de nómina; conviene tomar esas capturas **antes** del bloque 2, y las del Dashboard y Balance **después** del bloque 1.
