# OT-0068 · Buscador global y notificaciones de la barra superior

**Rama:** `feature/OT-0068-buscador-notificaciones` (sale de `integracion-local` en `c3327a7`). Solo local.

## Qué había
Los dos iconos de la barra superior (🔍 Buscar y 🔔 Notificaciones) estaban en todas las pantallas pero **no hacían nada**; la campana además mostraba siempre un punto rojo fijo. Se detectaron revisando qué botones de `dashboard.html` no tenían ningún código detrás.

## Qué se hizo
| Pieza | Qué hace |
|---|---|
| **Buscar** (clic en 🔍 o `Ctrl+K` / `⌘K`) | Ventana de búsqueda sobre lo que el panel **ya tiene cargado** y la persona ya puede ver: **facturas** (folio, UUID, cliente, RFC del cliente), **pólizas** (folio, concepto, tipo), **clientes** y **empleados** (solo nombre, puesto y departamento). Sin acentos ni mayúsculas, varias palabras (todas deben aparecer), lo que empieza con lo escrito sale primero, máximo 6 por grupo y se avisa el total. Flechas y Enter para elegir, Esc para cerrar. Al elegir: factura/cliente → Facturación filtrada; póliza → abre su **detalle** en Contabilidad → Pólizas; empleado → Nómina filtrada. |
| **Notificaciones** (clic en 🔔) | Lista las **mismas alertas reales y accionables que ya calcula el Dashboard** (CFDI sin póliza, pagos sin causación, obligaciones y documentos por vencer, etc.) y las **invitaciones a otras empresas** dirigidas a tu correo. Cada aviso lleva a su módulo (o al selector de empresa). **El punto rojo solo aparece si hay algo pendiente** y el botón dice cuántos. |
| `frontend/panel-busqueda-core.js` | Lógica pura (búsqueda y armado de avisos), sin DOM ni red. |
| `frontend/panel-busqueda.js` | La pantalla: ventana, teclado, campana y navegación. |
| `app.js` | Una línea: avisa (`contateck:dashboard-datos`) cuando el Dashboard ya tiene sus alertas. |

## Decisiones de seguridad y privacidad
- **No pide nada nuevo al servidor** para buscar ni para las alertas: usa lo que la sesión ya cargó, así que respeta lo que cada rol puede ver (el auditor no recibe columnas sensibles de empleados, y por eso tampoco aparecen aquí).
- **Nunca busca por RFC, CURP, NSS, cuenta ni sueldo de un empleado**, y esos datos no aparecen en los resultados.
- Todo texto se escapa antes de pintarse (un nombre con HTML se ve como texto).
- Es de solo lectura: no hay ninguna acción que escriba; no entra en la lista de botones que se ocultan al auditor.

## Pruebas
- `node test-busqueda-notificaciones.js` (16): sin acentos, mínimo 2 letras, varias palabras, folio / UUID / RFC del cliente, destino de cada tipo de resultado, empleados sin datos sensibles, orden y límite, filas raras, HTML, notificaciones (orden por urgencia, invitaciones, datos raros) y cableado del HTML.
- `npm run test:ci` en verde (16 suites).
- **Probado en el panel real** (visor, sesión de SA de CV, 26-nov-2026): la campana mostró 3 avisos reales y el punto rojo; al pulsar el primero llevó a Contabilidad; `Ctrl+K` abrió la búsqueda; "CT-46" encontró la factura y Enter dejó Facturación filtrada con esa única fila; "karla" encontró al empleado; "kemper" a las facturas; el RFC de Karla **no** produjo resultados; "Nómina" encontró pólizas y elegir una abrió su detalle (E-00020); Esc cerró la ventana.

## Sin verificar
- Aspecto visual en pantallas pequeñas (la barra ya oculta el selector de empresa en celular; la búsqueda y la campana usan ventanas que se ajustan al ancho, pero no se revisaron en un teléfono real).
- Que el buscador cubra más de las 200 facturas más recientes: busca solo en las cargadas (la lista de Facturación ya avisa cuando hay más).
