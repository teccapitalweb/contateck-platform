# OT-0039 · Mensajes claros al entrar o crear cuenta

**Rama:** `feature/OT-0039-mensajes-inicio-sesion` (sobre `integracion-local`). Sin cambios de SQL.

## Por qué
Al crear la cuenta del auditor de pruebas, la pantalla mostró "No se pudo iniciar sesión. Inténtalo de nuevo." sin decir la causa. Ese texto era el
mensaje de respaldo para **cualquier** error de Supabase que el panel no tradujera (solo traducía 5), y se usaba igual para entrar, para crear cuenta y
para entrar con Google. Quien creaba una cuenta veía "iniciar sesión" aunque lo que falló fuera el registro.

## Qué cambió
| Cambio | Dónde |
|---|---|
| Se traducen más errores de Supabase: correo ya registrado, demasiados correos enviados, registro desactivado, falla al enviar el correo de confirmación, contraseña débil, correo no válido, cuenta suspendida y falta de conexión (incluye "failed to fetch") | `frontend/auth-login.js` (`ERR_MATCH`) |
| Cada acción tiene su propio mensaje de respaldo: entrar ("No se pudo iniciar sesión…"), crear cuenta ("No se pudo crear la cuenta…") y Google ("No se pudo conectar con Google…") | `auth-login.js` (`msgFor(mensaje, porDefecto)`) |
| El mensaje técnico original nunca se muestra al usuario, pero queda en la consola del navegador (`[auth] error no reconocido: …`) para diagnosticar | `auth-login.js` |
| Versión de caché del script: `auth-login.js?v=2` (antes sin versión) | `frontend/login.html` |

## Pruebas
- `node --check` del archivo y una prueba unitaria de `msgFor` con 16 mensajes reales de Supabase (todos traducidos), 4 desconocidos (usan el mensaje de su acción y dejan rastro en consola) y la comprobación de que el texto técnico no llega al usuario.

**NO verificado:** en pantalla (el panel que corre todavía no tiene esta rama; el login, además, solo se ve cerrando sesión). No se probó contra errores reales de Supabase, solo con los textos que
Supabase suele devolver; si algún error real no coincide, cae en el mensaje de respaldo de su acción y queda en la consola.
