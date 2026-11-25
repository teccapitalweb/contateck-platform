# Guía de instalación y operación (CONTATECK)

Cómo poner a funcionar el sistema en una computadora nueva, cómo probarlo y qué hacer cuando algo falla. Todo lo de esta guía se comprobó en el repositorio o al operar el sistema; lo que **no** se pudo comprobar se marca como tal.

## 1. Qué se necesita
- **Node.js 22 o superior** (el backend lo exige; `engines` en `backend/package.json`) y **Git**.
- Un proyecto de **Supabase** (Postgres + Auth + Storage). Para desarrollo se usa `contateck-dev`.
- Para timbrar facturas: cuenta de **Fiscalapi** (pruebas: `https://test.fiscalapi.com`).
- Opcional: llave de un proveedor de IA (solo si se activa el modo IA del asistente).

## 2. Estructura
```
frontend/   HTML, CSS y JS del panel (sin compilar)
backend/    Node.js + Express (rutas en src/routes, lógica en src/)
database/   scripts SQL (esquema, políticas, cambios por OT, propuestas sin aplicar)
docs/       engineering/ (arquitectura oficial), work-orders/ (una OT por cambio), informe/ (material del informe)
```

## 3. Backend
```bash
cd backend
npm install
```
Copia `backend/.env.example` como `backend/.env` y llena (el archivo `.env` **nunca** se sube al repositorio):

| Variable | Para qué |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Conexión a la base (la llave `anon` es pública). Las consultas se hacen con el token del usuario, así que RLS siempre aplica |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreta. Solo se usa para validar quién es el usuario; nunca para leer datos |
| `FISCALAPI_URL`, `FISCALAPI_KEY`, `FISCALAPI_TENANT` | Timbrado de CFDI (pruebas o producción) |
| `REQUIRE_AUTH` | `false` solo para pruebas locales; **`true` siempre en producción** |
| `ALLOWED_ORIGINS` | Dominios que pueden llamar al backend |
| `ASISTENTE_MODO` | `reglas` (por defecto, sin llave y sin costo) o `ia` (necesita `ANTHROPIC_API_KEY`) |

Arrancar: `npm start` (puerto 8080). Detener: cerrar el proceso de Node.

## 4. Frontend
Es estático: se puede servir con cualquier servidor de archivos (por ejemplo la extensión Live Server de VS Code) apuntando a la carpeta `frontend/`. `app-config.js` detecta el entorno: si abres desde `localhost` o `127.0.0.1` usa el backend local (`http://localhost:8080`); en cualquier otro dominio usa el backend de Railway. `supabase-config.js` trae la URL y la llave **pública** del proyecto de Supabase.
Abre `login.html`. Al cambiar un archivo JS, súbele el número de versión en el `<script src="…?v=N">` de `dashboard.html` para saltar el caché del navegador.

## 5. Base de datos
- Los scripts de `database/` se corren en el editor SQL de Supabase. Los archivos `OT-XXXX-*.sql` son cambios puntuales; los que dicen **PROPUESTA** o no están marcados como aplicados **no se han ejecutado**.
- Referencia del esquema real: `database/OT-0038-esquema-dev-exportado.sql` y `database/OT-0047-politicas-dev-exportadas.sql` (documentación, no migración).
- **Limitación:** no existe una migración única probada para reconstruir la base desde cero; se hizo por scripts sucesivos. Antes de producción conviene consolidarla.
- Supabase **pausa** los proyectos gratuitos tras unos 7 días sin uso. Si el inicio de sesión muestra "No pudimos comunicarnos con el servidor", entra a supabase.com/dashboard → proyecto → **Resume project**.

## 6. Pruebas
```bash
cd backend
npm run test:ci      # 14 suites, 175 pruebas, sin red, sin llaves y sin base de datos
```
Suites sueltas: `test:fiscal`, `test:lectura`, `test:login`, `test:ia`, `test:asistente`, `test:canceladas`. Las pruebas de aislamiento con base real (`test-aislamiento-empresas.js`, `test-rls-aislamiento.js`…) necesitan credenciales de prueba y no forman parte de `test:ci`. En GitHub, `.github/workflows/pruebas.yml` corre `test:ci` en cada push.

## 7. Operación diaria
- **Respaldo del código:** `git bundle create RESPALDO.bundle --all` genera un solo archivo con todo el historial; se restaura con `git clone RESPALDO.bundle carpeta-nueva`.
- **Roles y permisos:** ver `docs/informe/diagramas/04-Matriz-de-Roles-y-Permisos.md`. Las personas se agregan con **Equipo → invitación**.
- **Cuentas de prueba:** la empresa de pruebas es "Empresa Demo C" (director, contador y auditor).
- **Cerrar un mes:** Contabilidad → Periodos → Cerrar periodo (revisar antes que la balanza cuadre).

## 8. Si algo falla
| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "Sin conexión a internet…" al iniciar sesión | El navegador no tiene red | Revisar la conexión |
| "No pudimos comunicarnos con el servidor…" | Supabase pausado o caído | Reanudar el proyecto en el panel de Supabase |
| El panel carga pero no hay datos | Backend apagado o URL equivocada | Arrancar `npm start`; revisar `app-config.js` |
| Error 401 | Sesión vencida | Cerrar sesión y entrar de nuevo |
| Error 403 o "Tu rol no permite…" | El rol no tiene ese permiso | Ver la matriz de roles |
| El asistente dice "falta configurar la llave" | `ASISTENTE_MODO=ia` sin `ANTHROPIC_API_KEY` | Volver a `reglas` o poner la llave en `backend/.env` |
| Timbrado falla | Llaves de Fiscalapi o certificados | Revisar `FISCALAPI_*` y `EMISOR_*`; en pruebas se usa el CSD público de prueba |
| El XML del catálogo no se descarga | Hay cuentas sin Código Agrupador | Cargar los códigos (Contabilidad → SAT / Declaraciones) |

## 9. Lo que **no** está verificado
- La puesta en producción (Railway, dominio, `REQUIRE_AUTH=true`) no se probó en esta ronda.
- Firebase/Firestore sigue en el código como respaldo heredado y opcional (`data-firestore.js`, panel de plataforma "Firebase (heredado)"); la fuente oficial de datos y de autenticación es Supabase.
- El modo IA del asistente (`ASISTENTE_MODO=ia`) no se ha probado con un proveedor real.
