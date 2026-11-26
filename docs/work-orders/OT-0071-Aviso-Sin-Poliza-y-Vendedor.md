# OT-0071 · El vendedor ya no ve el estado contable de las ventas

**Rama:** `feature/OT-0071-aviso-sin-poliza-vendedor` (sobre `integracion-local`). Sale de la revisión del rol vendedor (OT-0070).

## Qué se hizo
En **Ventas y pagos**, al vendedor se le ocultan: el aviso "N ventas confirmadas sin póliza contable", el filtro "Sin póliza" y la etiqueta "Sin póliza" de cada venta. Es información de administración; los demás roles (director, admin, contador, auditor y rh) siguen viéndola. El cambio es solo de pantalla: `veAvisosContables()` en `frontend/ventas.js` (versión `ventas.js?v=4`).

## Pruebas
Una prueba nueva en `backend/test-acceso-roles.js` (8 en total) evalúa la función real para cada rol y comprueba los dos puntos donde se usa. Con una mutación (devolver siempre verdadero) la prueba falla.

## Límite
No cambia lo que la base permite leer: el vendedor sigue viendo las ventas de la empresa (la base lo permite) y la lectura amplia por rol queda como decisión pendiente (ver OT-0070).

## Corrección a la OT-0070 encontrada al verificar esto (OT-0071b)
Al recargar con la sesión del vendedor, **Ventas arrancaba en blanco**: los módulos dibujan su sección cuando se hace clic en su opción del menú, y la OT-0070 la activaba sin ese clic (el perfil llega después de que cargan los módulos). En la primera revisión no se notó porque se navegó con clics. Ahora `aplicar` hace el clic real en la sección de inicio del rol (`acceso-roles.js?v=2`), y la prueba comprueba que se hace una vez y solo cuando hay que mover a la persona. Con una mutación (quitar el clic) la prueba falla.
