# OT-0034 · Pulido de Equipo y Contabilidad

**Rama:** `integracion-local` (sobre OT-0027 a OT-0033).
**Alcance:** revisión de Equipo (invitaciones y roles) y de Contabilidad (backend de pólizas, periodos y
pagos, y puntos de riesgo del frontend) y corrección de lo de bajo riesgo. Sin cambios de esquema SQL.

## 1. Qué se cambió

### Equipo

| # | Hallazgo y corrección | Dónde |
|---|---|---|
| E1 | **Escalada de privilegios.** RH podía invitar a su propio correo (u otro) con rol Director o Admin. Ahora solo Admin/Director pueden invitar con esos roles; el rol debe existir; correo y rol se validan | `supabaseOnboarding.js` (`crearInvitacion`) |
| E2 | **RH podía dar de baja o reactivar a un Director/Admin** (y dejar a la empresa sin quien la administre). Ahora RH no toca a Admin/Director | `supabaseEquipo.js` (`cambiarEstadoMiembro`) |
| E3 | **La empresa podía quedarse sin director** (por baja o por cambio de rol). Se exige que quede otro director activo | `supabaseEquipo.js` |
| E4 | Nadie puede cambiarse su propio rol; el valor `activo` debe ser booleano (antes `!!"false"` daba `true`); ids validados como UUID; errores técnicos de Postgres ya no se muestran | `supabaseEquipo.js` |
| E5 | `GET /onboarding/invitaciones` exige rol RH/Admin/Director (antes solo dependía de la política de la base) | `supabaseOnboarding.js` |
| E6 | Una invitación **aceptada** ya no se puede "cancelar" (quedaba cancelada con la persona activa) | `supabaseOnboarding.js` |
| E7 | **Invitaciones con mayúsculas**: se guardan en minúsculas pero se comparaban con el correo del token tal cual, así que una persona con "Juan@Empresa.com" nunca encontraba su invitación | `supabaseOnboarding.js` |
| E8 | Se quitó el "DEBUG TEMPORAL" (`_debugUserId`, `_debugEmail`) que se devolvía al navegador | `supabaseOnboarding.js` |
| E9 | Crear empresa: tope de longitud en nombres y, si falla el perfil (p. ej. doble clic), **se borra la empresa huérfana** recién creada | `supabaseOnboarding.js` |
| E10 | Frontend: texto de la base (correo, nombre, rol) **escapado** (XSS); RH ya no ve Admin/Director en el modal de invitar ni botones sobre ellos; **nuevo selector "cambiar rol"** para Admin/Director (con confirmación); confirmación antes de dar de baja; botones se deshabilitan mientras actúan | `invitaciones.js` (v2) |

### Contabilidad

| # | Hallazgo y corrección | Dónde |
|---|---|---|
| C1 | **XSS en avisos (`toast`)**: el mensaje se pintaba como HTML y varios llevan datos ajenos (nombre del emisor de un XML importado, error crudo del servidor). Ahora va como texto. Ningún aviso usaba etiquetas | `contabilidad.js` (v16) |
| C2 | **Cobranza: se podía pagar de más.** El saldo solo se valida al REGISTRAR un pago; dos pagos registrados por separado y confirmados después dejaban la factura sobrepagada. Ahora se recomprueba el saldo actual antes de confirmar (clientes y proveedores) | `supabasePagosCliente.js`, `supabasePagosProveedor.js` |
| C3 | Cobranza: no se registran cobros sobre notas de crédito, complementos de pago ni facturas canceladas | `supabasePagosCliente.js` |
| C4 | `POST /cfdis-proveedor` ahora exige rol contable (antes cualquier rol con sesión) | `routes/pagosProveedor.js` |
| C5 | **Balanza**: las cuentas desactivadas con movimientos desaparecían de la Balanza (y de su XML) y el chequeo "cuadra" comparaba totales incompletos. Ahora entran si tienen movimientos | `contabilidad.js` (`balanza`) |
| C6 | Validación de entrada en el backend (importes > 0 con 2 decimales, fechas reales, UUID, longitudes, ≤ 200 partidas, ruta de comprobante sin `..`, año/mes) en pólizas, pagos y cierre de periodos | `validacionesContables.js` (nuevo) y las rutas |

## 2. Lo que ya estaba bien (verificado leyendo `database/OT-0029-funciones-contables-dev.sql`)

Las funciones de Postgres validan rol (contador/admin/director), periodo cerrado, Debe = Haber, que las cuentas existan,
reversa y corrección atómicas, y duplicado de CFDI. El backend nuevo es defensa en profundidad, no sustituye eso.

## 3. Mapa de Equipo (6 preguntas)

1. **Nace en:** Equipo → "Nueva invitación"; la persona inicia sesión con ese correo y el sistema la asigna sola.
2. **Afecta:** `invitaciones`, `perfiles` (alta, `activo`, `rol_id`), `empresas` + `cuentas_contables` al crear empresa.
3. **Se consulta en:** Equipo (invitaciones y miembros); el nombre de quien registró cada pago en Ventas.
4. **Póliza:** no genera.
5. **Saldo:** no aplica.
6. **Documento relacionado:** ninguno (el correo de invitación todavía no se envía: se avisa a mano).

## 4. Pruebas hechas

- `node --check` de todos los archivos tocados y carga de las rutas del backend.
- 27 pruebas unitarias de `validacionesContables.js` (importes, fechas, pagos, pólizas, periodos).
- Las reglas de Equipo y la comprobación de saldo requieren la base real: **no se ejercitaron** (ver abajo).

## 5. NO verificado

- Equipo en pantalla y contra la base: invitar como RH con rol Director (debe rechazarse), dar de baja al único
  director (debe rechazarse), cambiar el rol de alguien, invitación con correo en mayúsculas.
- Cobranza: confirmar un segundo pago que sobrepase el saldo (debe rechazarse con mensaje claro).
- Balanza con una cuenta desactivada que tenga movimientos.
- Que `perfiles` permita a RH/Admin actualizar a otros (las políticas RLS de Equipo **no están en el repo**:
  `addendum_equipo_activo.sql` se menciona en el código pero no existe en `database/`).

## 6. Riesgos y pendientes (no corregidos)

- **Alta · configuración de Supabase, no de código:** el onboarding da por bueno el correo del token ("ya verificado").
  Eso solo es cierto si **Authentication → Providers → Email → "Confirm email" está ACTIVADO**. Si no lo está, cualquiera
  puede registrarse con el correo de otra persona invitada y quedarse con su rol. Confirmar antes de producción.
- **Media:** falta en `database/` el SQL de las políticas de `perfiles` (update por RH/Admin) e `invitaciones`; habría que
  exportarlo (como se hizo con las funciones contables) para poder auditarlo.
- **Media:** el correo de invitación no se envía (hay que avisar a mano). Un botón "copiar aviso" ayudaría.
- **Media:** la comprobación de saldo antes de confirmar no es atómica (dos confirmaciones simultáneas); la protección
  completa pide `FOR UPDATE` dentro de `confirmar_pago_*` (SQL).
- **Baja:** URL de Railway como valor por defecto repetida en `contabilidad.js` (5 sitios); la base `perfiles.nombre` al
  aceptar invitación es el correo, no el nombre real.
- **Contadora:** sin preguntas nuevas; las abiertas siguen en la lista ya enviada.
