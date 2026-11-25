# Matriz de roles y permisos (CONTATECK)

**Fuente:** listas de roles leídas del código (`backend/src`, `frontend/*.js`) y de las funciones reales de la base de datos (lectura con `pg_proc`) el 25-nov-2026. La prueba `backend/test-asistente.js` revisa que las guías del asistente coincidan con estas listas del código.
Roles: **director**, **admin**, **contador**, **auditor**, **rh**, **vendedor**. ✔ = puede; — = no puede.

| Acción | director | admin | contador | auditor | rh | vendedor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver contabilidad, SAT y Fiscal (consulta) | ✔ | ✔ | ✔ | ✔ | — | — |
| Crear, corregir o anular pólizas | ✔ | ✔ | ✔ | — | — | — |
| Cerrar un periodo contable | ✔ | ✔ | ✔ | — | — | — |
| Registrar y confirmar cobros y pagos a proveedores | ✔ | ✔ | ✔ | — | — | — |
| Timbrar y cancelar CFDI (facturación) | ✔ | ✔ | ✔ | — | — | — |
| Registrar una venta (pago recibido) | ✔ | ✔ | ✔ | — | — | ✔ |
| Revisar, confirmar o rechazar una venta | ✔ | ✔ | ✔ | — | — | — |
| Confirmar una venta que registró uno mismo | ✔ | ✔ | — | — | — | — |
| Registrar declaraciones y documentos fiscales | ✔ | ✔ | ✔ | — | — | — |
| Configurar las obligaciones del calendario fiscal; eliminar una declaración no presentada | ✔ | ✔ | — | — | — | — |
| Ver empleados | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Dar de alta empleados y calcular la nómina | ✔ | ✔ | — | — | ✔ | — |
| Invitar personas y gestionar el equipo | ✔ | ✔ | — | — | ✔ | — |
| Invitar con rol admin o director; cambiar roles | ✔ | ✔ | — | — | — | — |
| Usar el asistente contable | ✔ | ✔ | ✔ | ✔ | — | — |

## Notas
- **Auditor:** puede consultar pero no modificar nada; en pantalla se le ocultan todos los botones de escritura (prueba del 25-nov-2026 en Empresa Demo C: 0 botones de escritura visibles en las 7 vistas) y la base también rechaza sus escrituras.
- **Separación de funciones:** quien registra una venta no la valida, salvo admin y director.
- **Todos los datos están aislados por empresa** (RLS); el rol define qué se puede hacer dentro de la propia empresa.
- **Pendiente de decisión:** si el contador debe poder procesar nómina (hoy no; ver el reporte de prueba completa).
- Los roles **rh** y **vendedor** se documentan desde el código; no se probaron en pantalla en la ronda final.
