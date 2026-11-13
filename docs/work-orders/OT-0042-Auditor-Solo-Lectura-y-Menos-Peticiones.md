# OT-0042 · El auditor ya no ve botones que no puede usar + menos peticiones repetidas al abrir el panel

**Rama:** `feature/OT-0042-auditor-solo-lectura` (sobre `integracion-local`). Sin cambios de SQL ni dependencias nuevas.
Sale de los hallazgos 3 y 4 de `Reporte-Prueba-Completa-Modulos-2026-11-13.md`.

## 1. Auditor de solo lectura (hallazgo 3)
**Problema:** el auditor veía botones de acción en casi todos los módulos (Nueva póliza, Cerrar periodo, Nueva venta, Timbrar CFDI, Calcular, Empleado…). El servidor y la base los rechazaban al
intentarlos, pero verlos confunde. En SAT y Fiscal ya estaban ocultos por código; en el resto no.

**Cambio:**
- \`auth-guard.js\` pone \`<html data-rol="…">\` con el rol del perfil en cuanto se conoce.
- \`styles.css\` (bloque "OT-0042 · Rol de solo lectura") oculta, solo cuando \`data-rol="auditor"\`, los botones que **escriben**: crear, editar, eliminar, confirmar, anular, timbrar, cerrar periodo,
  contabilizar, importar, configurar, calcular, tomar/rechazar/generar póliza en Ventas, correo/NC/REP/cancelar en Facturación, y los avisos "Timbrado masivo" y "Timbrar nómina". Incluye los botones de las ventanas y de las filas.
- **No** se ocultan los de lectura: Ver, PDF, historial, descargas de XML y hojas, Simulador fiscal, Exportar.
- Es una regla central: un botón que se pinta después (en una fila, en una ventana) también queda oculto sin tocar cada módulo.

**Qué NO es:** no es la seguridad. El servidor y la base siguen siendo quienes bloquean (ver el reporte: 28 de 42 rutas rechazan por permiso; las funciones SQL de pólizas, pagos y cierre exigen contador, admin o director). Esto solo evita mostrar botones que fallarían.

**Límite conocido:** el rol llega con el perfil (1 a 2 s tras abrir). En ese instante los botones pueden verse un momento antes de ocultarse.

## 2. Menos peticiones repetidas al abrir (hallazgo 4)
**Problema:** al abrir el panel se hacían 28 peticiones al backend y 17 eran repeticiones (\`periodos\` ×6, \`cfdis-proveedor\` ×6, \`config-contable\` ×3, \`con-partidas\` ×2); cada una tarda ~1 s.

**Cambio (en \`postgres-crud.js\`, el cliente que ya usan todos):** caché corta para esas 4 rutas de lectura:
- Pedidos iguales al mismo tiempo comparten **una** petición.
- El resultado se reutiliza **8 segundos**.
- **Cualquier escritura** (POST, PUT, DELETE) borra todo el caché; un error nunca se guarda.
- Cada quien recibe su propia copia del resultado (modificarlo no afecta a los demás).

**Límite conocido:** si otra persona cambia datos en el mismo instante, esta pantalla puede tardar hasta 8 s en enterarse (las escrituras de esta misma pantalla se ven al instante).

## 3. Versiones de caché y pruebas
- \`dashboard.html\`: \`styles.css?v=2\`, \`postgres-crud.js?v=3\`, \`auth-guard.js?v=7\`.
- **\`backend/test-solo-lectura-y-cache.js\`** (\`npm run test:lectura\`, 13 pruebas, sin red ni base): la lista de botones ocultos y de lectura; que todo atributo de la lista exista en el código; **que un botón nuevo que parece escribir y no está
  en la lista ni en las excepciones haga fallar la prueba** (así no se vuelve a olvidar); que \`auth-guard.js\` marque el rol; y el caché completo (una petición en vuelo, vigencia, escritura que borra, error que no se guarda, copias, rutas con ids distintos).
  Se comprobó que detecta errores rompiendo a propósito tres cosas (el borrado del caché al escribir, un botón de la lista, un botón nuevo sin ocultar).
- Las 20 pruebas de \`npm run test:fiscal\` siguen pasando.

**NO verificado:** en pantalla todavía (el panel que corre no trae esta rama).
