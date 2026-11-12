# OT-0037 · Administración de plataforma (solo lectura)

**Rama:** `feature/OT-0037-admin-plataforma` (sale de `integracion-local`). Solo local: sin push.
**Alcance:** una cuenta de **dueño de la plataforma** que revisa todas las empresas desde `admin.html`. No es un
rol de empresa y no toca los roles existentes (director, admin, contador, vendedor, auditor, rh).

## 1. Cómo funciona

- Tabla nueva `administradores_plataforma` (`database/OT-0037-administradores-plataforma.sql`): `user_id`, `nivel`
  (`dueno` | `soporte`). RLS activado **sin políticas**: el navegador no puede leerla ni escribirla; solo el backend
  con la service role.
- El backend decide quién es administrador en **cada** llamada a `/api/plataforma/*`
  (`backend/src/routes/plataforma.js`). El navegador nunca lo decide.
- `onboarding.html` (por donde pasa todo login) pregunta `/api/plataforma/yo`; si es administrador va a
  `admin.html`. Si esa pregunta falla por lo que sea, sigue el flujo normal: nunca impide entrar a una empresa.
- `admin.html` + `admin.js` (sin sesión → login; sin acceso → aviso con atajo a su panel de empresa).

## 2. Qué muestra (solo lectura)

| Bloque | Fuente |
|---|---|
| Totales: empresas, usuarios, pólizas, CFDI, invitaciones pendientes, movimientos 7 días | conteos |
| Empresas: plan, estado, usuarios activos/total, pólizas, CFDI, último acceso, última actividad; clic → usuarios | `empresas`, `perfiles`, Supabase Auth |
| Usuarios de una empresa: rol, estado, correo confirmado, último acceso | `perfiles`, Supabase Auth |
| Actividad reciente de todas las empresas | `auditoria_log` |
| Estado del sistema: backend, Supabase (ms), Fiscalapi (pruebas/producción), CORS, auth obligatoria | banderas |

**Último acceso** viene de Supabase Auth (`last_sign_in_at`): `perfiles.last_login` está vacío en todas las filas.

## 3. Lo que NO se ve ni se puede hacer

- Nunca se leen `csd_cer_base64`, `csd_key_base64`, `csd_password` (cada consulta lista sus columnas).
- De la auditoría no se lee `detalle`, `ip` ni `user_agent`.
- No hay botones que modifiquen nada: no suspende empresas, no cambia roles, no entra "como" otro usuario.

## 4. Pruebas hechas

- `node --check` de todos los archivos.
- Funciones del backend contra la base DEV (service role, solo lectura): 4 empresas, 8 usuarios, 45 pólizas,
  12 CFDI; sin campos `csd_*` en la respuesta; sin `detalle`/`ip` en la actividad; límite de actividad acotado a 200;
  id de empresa inválido → 400.
- HTTP: las 6 rutas sin token → 401; token falso → 401. Sin la tabla creada, `consultarAdministrador` responde
  `tablaFaltante` y la página lo explica.

## 5. NO verificado

- La página en pantalla y el flujo completo de login → `admin.html`: requiere correr el SQL y entrar como
  `teccapitalweb@gmail.com`.
- `/api/plataforma/yo` con un administrador real (la tabla aún no existe en DEV).

## 6. Pasos para activarlo (los hace Jorge)

1. Supabase DEV → SQL Editor → pegar y correr `database/OT-0037-administradores-plataforma.sql`. La última
   consulta debe devolver 1 fila con `teccapitalweb@gmail.com`.
2. Iniciar sesión con ese correo (contraseña, no Google, salvo que esa cuenta use Google): debe llevar a `admin.html`.

## 7. Riesgos y pendientes

- **Cuenta de plataforma = acceso a datos de todos los clientes.** Conviene activar verificación en dos pasos (MFA)
  para esa cuenta y reflejarlo en el aviso de privacidad antes de tener clientes reales.
- Los accesos de administrador solo se registran en el log del backend (`[plataforma] …`); `auditoria_log` exige
  `empresa_id` y no sirve para acciones de plataforma. Si se agregan acciones de escritura, crear una tabla propia.
- `empresas` tiene `status` y `estado`; `perfiles` tiene `activo` e `is_active`. La app usa `activo` en perfiles; no hay
  reglas que bloqueen el acceso por `empresas.status`. **Suspender empresas** (siguiente fase) necesita decidir cuál
  columna manda y hacer que `verifyAuth` la respete.
- Los conteos por empresa se piden uno a uno: bien con pocas empresas; con cientos conviene una vista o RPC.
- Las llaves del CSD siguen guardadas en texto plano en `empresas`: cifrarlas antes de clientes reales (OT de emisor/CSD).
