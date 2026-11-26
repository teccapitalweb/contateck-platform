# OT-0070 · La pantalla de rh y vendedor sigue su rol

**Rama:** `feature/OT-0070-interfaz-por-rol` (sobre `integracion-local`).

## Qué se encontró (revisión de roles en pantalla, 26-nov-2026, Empresa Demo C)
Se entró al panel con `demo.rh@contateck.mx` (rh de Empresa Demo C). Lo que le toca funciona: Nómina (Calcular, Ver, Recibos y Timbrar), empleados y el servidor rechaza lo que no es suyo (facturar y cancelar: 403; SAT y Fiscal: 403; indicadores fiscales: "restringido"; asistente contable: sin acceso). Pero **la pantalla le mostraba todo**: las 7 secciones del menú, 17 pólizas con saldos y movimientos, los botones "Nueva póliza", "Configuración contable", "Timbrar CFDI" y "Timbrado masivo", y las cifras de ingresos y egresos del Dashboard. La matriz de roles dice que rh no ve contabilidad ni SAT.
La causa: desde la OT-0042 solo el **auditor** tenía la pantalla ajustada a su rol (`html[data-rol="auditor"]`).

## Qué se hizo
- **`frontend/acceso-roles.js` (nuevo):** define qué secciones ve cada rol y las aplica en la pantalla.
  - **rh:** Nómina y Equipo (arranca en Nómina).
  - **vendedor:** Ventas y pagos y Facturación (arranca en Ventas).
  - director, admin, contador y auditor: sin cambios.
  - Se oculta el menú, el rótulo de los grupos que quedan vacíos y las secciones; si la sección activa no es suya, se pasa a la de inicio de su rol.
- **`auth-guard.js`:** aplica lo anterior en cuanto se conoce el rol. **`app.js`:** la navegación rechaza una sección ajena, también si otro módulo intenta abrirla con un clic programático.
- **Buscador global y notificaciones (OT-0068):** solo buscan en lo que el rol ve (facturas y clientes si ve Facturación, pólizas si ve Contabilidad, empleados si ve Nómina) y no muestran las alertas del Dashboard a quien no lo ve.
- **`styles.css`:** al vendedor se le muestra la Facturación en solo lectura (se ocultan sus botones que escriben, los mismos que ya se ocultan al auditor) y en Ventas se le quitan los de revisar, confirmar y contabilizar. **"Nueva venta" se queda**: registrar ventas es de su rol.
- **SQL propuesto, NO ejecutado:** `database/OT-0070-cfdis-proveedor-solo-contables-PROPUESTA.sql`. Las políticas de escritura de `cfdis_proveedor` solo pedían ser de la misma empresa, sin revisar el rol. La propuesta las limita a contador, admin y director. La app hoy solo lee esa tabla.

## Límite importante
Esto **ordena la pantalla; no es la seguridad**. La seguridad sigue siendo el servidor y las reglas de la base. Hoy la base aún deja **leer** facturas, pólizas, ventas y pagos a cualquier rol de la empresa (rh incluido) si habla directo con la API; endurecer esa lectura es otra decisión (cambia qué ve el vendedor en Facturación, por ejemplo) y queda anotada, sin hacer.

## Pruebas
`backend/test-acceso-roles.js` (7 pruebas, en `npm run test:ci`): las vistas por rol, el DOM armado con las secciones **reales** de `dashboard.html` (rh, vendedor y los demás roles), idempotencia, sección activa que ya es del rol, orden de carga de los scripts, buscador y navegación, y que los estilos del vendedor cubran todos los botones de escritura de Facturación que ya se le ocultan al auditor sin quitar "Nueva venta". Se comprobó con una mutación (dar a rh la sección de Contabilidad) que la prueba falla.

## Verificado en vivo (rh, Empresa Demo C, 26-nov-2026)
Con la sesión de `demo.rh@contateck.mx` y el cambio ya aplicado: el menú muestra solo **Nómina** y **Equipo** (los grupos Inicio, Fiscal y Asistente quedan ocultos), la pantalla arranca en **Nómina**, no hay botones de "Nueva póliza", "Configuración contable", "Timbrar CFDI" ni "Timbrado masivo", un clic programático a Contabilidad no cambia de sección, y el buscador no encuentra facturas ("CT-" → sin resultados) pero sí al empleado ("Karla").

## No verificado
El vendedor en pantalla (la cuenta `demo.vendedor.c@contateck.mx` está creada, pendiente de entrar), la vista de rh en un teléfono y el parpadeo del menú completo durante el instante en que carga el perfil (el menú se ajusta al conocer el rol).
