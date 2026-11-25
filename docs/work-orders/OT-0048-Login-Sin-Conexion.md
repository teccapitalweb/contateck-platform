# OT-0048 · El inicio de sesión distingue "sin internet" de "el servidor no responde"

**Rama:** `feature/OT-0048-login-sin-conexion` (sobre `integracion-local`). Solo frontend; sin SQL ni cambios de servidor.

## Problema
El 25-nov-2026 el proyecto `contateck-dev` de Supabase estaba **pausado por inactividad** y su nombre dejó de resolver. El inicio de sesión mostró "Sin conexión. Revisa tu internet." aunque el internet estaba bien, y eso mandó a buscar en el lugar equivocado.
"Failed to fetch" solo dice que el navegador no pudo llegar a Supabase, y eso pasa por dos motivos distintos.

## Cambio (`frontend/auth-login.js`, `login.html?v=3`)
| Situación | Mensaje |
|---|---|
| El navegador no tiene internet (`navigator.onLine === false`) | "Sin conexión a internet. Revisa tu red e inténtalo de nuevo." |
| Hay internet pero no se llega a Supabase | "No pudimos comunicarnos con el servidor, aunque tu internet parece estar bien. Puede estar en mantenimiento o pausado. Inténtalo en unos minutos y, si sigue igual, avisa al administrador." |

- Cubre las formas del error: `Failed to fetch`, `NetworkError…`, `Load failed`, `ERR_NAME_NOT_RESOLVED`, `Network request failed`.
- En la consola queda un aviso con el error técnico y si el navegador estaba en línea, para diagnosticar.
- Los demás mensajes (contraseña incorrecta, correo sin confirmar, límite de intentos…) no cambian.

## Pruebas
`backend/test-login-mensajes.js` (`npm run test:login`, también dentro de `npm run test:ci`): 7 pruebas que cargan el bloque real de mensajes de `auth-login.js` con un `navigator` simulado.

## Verificación
- Pruebas en el checkout de integración, ver abajo.
- **No verificado en el caso real:** no se provocó una caída real de Supabase ni se desconectó la red del navegador; el comportamiento se comprobó con el código real en un contexto simulado.

## Verificación (25-nov-2026, rama unida a `integracion-local`)
- `npm run test:ci` en el checkout de integración: pasan las 6 suites (22 + 14 + 10 + 3 + 13 + 7).
- Hubo que ajustar una prueba vieja de `test-fiscal.js` (OT-0039) que esperaba "Sin conexión" para `Failed to fetch`; ese caso ahora se prueba en `test-login-mensajes.js`.
- Visor (`http://127.0.0.1:5510/login.html`, origen distinto para no tocar la sesión abierta): la página carga `auth-login.js?v=3`, trae los dos mensajes nuevos y no hay errores en la consola.

**No verificado:** el mensaje en un fallo real (no se pausó Supabase ni se cortó la red del navegador). Solo se probó el código real en un contexto simulado.
