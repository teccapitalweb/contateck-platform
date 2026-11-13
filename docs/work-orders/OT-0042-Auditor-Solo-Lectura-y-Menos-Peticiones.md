# OT-0042 · El auditor ya no ve botones que no puede usar + menos peticiones repetidas al abrir el panel

**Rama:** `feature/OT-0042-auditor-solo-lectura` (sobre `integracion-local`). Sin cambios de SQL ni dependencias nuevas.
Sale de los hallazgos 3 y 4 de `Reporte-Prueba-Completa-Modulos-2026-11-13.md`.

## 1. Auditor de solo lectura (hallazgo 3)
**Problema:** el auditor veía botones de acción en casi todos los módulos (Nueva póliza, Cerrar periodo, Nueva venta, Timbrar CFDI, Calcular, Empleado…). El servidor y la base los rechazaban al
intentarlos, pero verlos confunde. En SAT y Fiscal ya estaban ocultos por código; en el resto no.

**Cambio:**
- `auth-guard.js` pone `<html data-rol="…">` con el rol del perfil en cuanto se conoce.
- `styles.css` (bloque "OT-0042 · Rol de solo lectura") oculta, solo cuando `data-rol="auditor"`, los botones que **escriben**: crear, editar, eliminar, confirmar, anular, timbrar, cerrar periodo,
  contabilizar, importar, configurar, calcular, tomar/rechazar/generar póliza en Ventas, correo/NC/REP/cancelar en Facturación, y los avisos "Timbrado masivo" y "Timbrar nómina". Incluye los botones de las ventanas y de las filas.
- **No** se ocultan los de lectura: Ver, PDF, historial, descargas de XML y hojas, Simulador fiscal, Exportar.
- Es una regla central: un botón que se pinta después (en una fila, en una ventana) también queda oculto sin tocar cada módulo.

**Qué NO es:** no es la seguridad. El servidor y la base siguen siendo quienes bloquean (ver el reporte: 28 de 42 rutas rechazan por permiso; las funciones SQL de pólizas, pagos y cierre exigen contador, admin o director). Esto solo evita mostrar botones que fallarían.

**Límite conocido:** el rol llega con el perfil (1 a 2 s tras abrir). En ese instante los botones pueden verse un momento antes de ocultarse.

## 2. Menos peticiones repetidas al abrir (hallazgo 4)
**Problema:** al abrir el panel se hacían 28 peticiones al backend y 17 eran repeticiones (`periodos` ×6, `cfdis-proveedor` ×6, `config-contable` ×3, `con-partidas` ×2); cada una tarda ~1 s.

**Cambio (en `postgres-crud.js`, el cliente que ya usan todos):** caché corta para esas 4 rutas de lectura:
- Pedidos iguales al mismo tiempo comparten **una** petición.
- El resultado se reutiliza **8 segundos**.
- **Cualquier escritura** (POST, PUT, DELETE) borra todo el caché; un error nunca se guarda.
- Cada quien recibe su propia copia del resultado (modificarlo no afecta a los demás).

**Límite conocido:** si otra persona cambia datos en el mismo instante, esta pantalla puede tardar hasta 8 s en enterarse (las escrituras de esta misma pantalla se ven al instante).

## 3. Versiones de caché y pruebas
- `dashboard.html`: `styles.css?v=2`, `postgres-crud.js?v=3`, `auth-guard.js?v=7`.
- **`backend/test-solo-lectura-y-cache.js`** (`npm run test:lectura`, 13 pruebas, sin red ni base): la lista de botones ocultos y de lectura; que todo atributo de la lista exista en el código; **que un botón nuevo que parece escribir y no está
  en la lista ni en las excepciones haga fallar la prueba** (así no se vuelve a olvidar); que `auth-guard.js` marque el rol; y el caché completo (una petición en vuelo, vigencia, escritura que borra, error que no se guarda, copias, rutas con ids distintos).
  Se comprobó que detecta errores rompiendo a propósito tres cosas (el borrado del caché al escribir, un botón de la lista, un botón nuevo sin ocultar).
- Las 20 pruebas de `npm run test:fiscal` siguen pasando.

## 4. Verificación en pantalla (13-nov-2026, rama unida a `integracion-local`, commit `4cdea42`)

Las 13 pruebas de esta OT y las 20 de `npm run test:fiscal` también pasan en el checkout de integración.

| Rol | Qué se comprobó | Resultado |
|---|---|---|
| Auditor (Demo C) | Botones de escritura visibles | **Ninguno**: 17 tipos de botón de acción presentes en pantalla (Nueva póliza/cuenta, Editar y Eliminar cuenta, Cerrar periodo, Nueva venta, Timbrar CFDI, correo, NC, cancelar CFDI, Calcular, Empleado…) con 0 visibles |
| Auditor | Botones de lectura | Siguen visibles: Ver venta (5/5), Ver póliza (16/16), Mayor (22/22), historial de proveedor, PDF de CFDI (2/2), Simulador fiscal, descargas de XML y hoja, "Ver acuse" |
| Auditor | Ventanas | Detalle de ventas y de pólizas sin botones de acción; en la póliza `E-00013` el "Editar" sale oculto |
| Director (Demo C) | Botones | Todos visibles (los 24 tipos presentes en pantalla); el "1/2" de Nueva póliza es el botón del Dashboard y el de Contabilidad, que no se muestran a la vez |
| Director | Datos que pasan por el caché | Iguales a antes: 16 pólizas (14 con partidas), Activo −424.57, Pasivo −510.78, Resultado 86.21, balanza cuadrada (3,132.16), 2 periodos, 1 factura de proveedor, configuración contable 8 de 8 |
| Auditor y director | Peticiones al backend al abrir el panel | **16** (antes 28); la única repetida es `config-contable` ×2 |
| Director | Caché en acción | Tres lecturas simultáneas de periodos = 1 petición |

**Pendiente menor:** `config-contable` aún se pide 2 veces al abrir, porque `auth-guard.js` la pide directo y no pasa por el caché. Se evita haciendo que `auth-guard.js` la deje en el caché o que Contabilidad reutilice `window.CONTATECK_CONFIG_CONTABLE_PG`.

**No verificado:** el rol contador con esta versión (la regla solo actúa con `data-rol="auditor"`, así que no debería cambiar nada para él; el caché sí lo usa); el parpadeo de 1 a 2 s antes de ocultarse los botones del auditor; el caché frente a datos cambiados por otra persona a la vez.

