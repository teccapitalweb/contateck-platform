# Reporte · Prueba completa de todos los módulos con tres roles (13-nov-2026)

**Qué se probó:** `integracion-local` (commit `c40e728` + lo posterior), backend en `localhost:8080` y panel en `localhost:5510`, contra la base DEV.
**Cómo:** solo lectura. Recorrido de cada pantalla, barrido de las rutas del backend, cruce de números entre módulos, y rechazo de escrituras con datos inválidos o ids inexistentes
(nada se escribió). No se hizo ningún timbrado, cierre de periodo ni cambio de datos.

| Rol | Usuario | Empresa |
|---|---|---|
| Director | `demo.director.c@contateck.mx` | Empresa Demo C |
| Contador | `demo.contador@contateck.mx` | TEC CAPITAL Group (DEV) |
| Auditor | `demo.auditor@contateck.mx` | Empresa Demo C |

## 1. Lo que está bien
- 23 rutas de lectura responden bien como director; como contador responden las permitidas y **equipo, invitaciones y administración de plataforma dan 403**.
- Dashboard, las 8 pestañas de Contabilidad, Ventas y Pagos, Facturación, Nómina, SAT y Fiscal, Equipo e IA Contable abren sin errores, sin `undefined`/`NaN` y sin errores de programa en la consola.
- Números que cuadran (Demo C): Balance General Dashboard = Contabilidad; Estado de Resultados = resultado del Balance ($86.21); balanza cuadra en todo el ejercicio, julio y noviembre; cada cuenta del catálogo = su fila de balanza; ninguna póliza descuadrada; ingresos y egresos del mes del Dashboard = suma de pólizas.
- TEC CAPITAL (contador): todo en cero y cuadrado.
- **Auditor:** no ve salarios ni datos sensibles de empleados (`columnasRestringidas`). De 42 rutas de escritura probadas, 28 se rechazan por permiso; las demás las rechaza la validación o la base por seguridad (RLS), y en el código SQL exportado de DEV las funciones de pólizas, pagos, corrección y **cierre de periodo** exigen rol contador, admin o director.
- Aislamiento: la empresa TEC CAPITAL no ve nada de Empresa Demo C.

## 2. Hallazgos

| # | Sev. | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| 1 | **Media** | Se pueden registrar y confirmar **pagos sin que el documento esté contabilizado** (sin póliza de venta/compra). Las cuentas de control no coinciden con sus auxiliares | Demo C: Clientes `105` = −$448 contra "Por cobrar" $42.68; Proveedores `201` = −$552.16 contra "Por pagar" $27.84 (factura OT29-001 de $580 sin póliza de gasto). Efecto: Activo −$424.57 y Pasivo −$510.78 en el Balance | Exigir (en la función SQL o en el backend) que el CFDI o la factura de proveedor tenga su póliza de causación antes de registrar un pago |
| 2 | **Media** | Un **cobro confirmado contra un CFDI cancelado** | CFDI cancelado de $580: cobro de $348 confirmado con póliza `I-00005`. El panel no lo ofrece, pero la función SQL lo acepta (ya anotado en OT-0030) | Validar `tipo` y `estatus` del CFDI dentro de `registrar_pago_cliente()` |
| 3 | **Media** | **Botones de acción visibles para el auditor** (el servidor los rechaza al intentarlos) | Dashboard: Nueva póliza. Contabilidad: Configuración contable, Nueva póliza, Nueva cuenta, Contabilizar CFDI, Importar XML recibido, **Cerrar periodo**. Ventas: Nueva venta. Facturación: Configuración, Timbrado masivo, Timbrar CFDI. Nómina: Calcular, Timbrar nómina, Empleado. En SAT y Fiscal ya están ocultos | Ocultarlos (o deshabilitarlos con explicación) según el rol, como en SAT y Fiscal |
| 4 | Media | **Rendimiento al abrir el panel**: 28 peticiones al backend, 17 repetidas | `periodos` ×6, `cfdis-proveedor` ×6, `config-contable` ×3, `con-partidas` ×2; cada llamada tarda ~0.7–1 s (3 consultas a Supabase por llamada); un barrido de 25 rutas en paralelo tardó 9 s | Guardar en memoria la respuesta y reutilizar la que ya está en vuelo; verificar el token una vez, no por llamada |
| 5 | Media | **"Utilidad operativa" del Dashboard (−$1,104.16) ≠ Utilidad del Estado de Resultados (+$86.21)** | El Dashboard resta egresos de ingresos usando el monto de las pólizas (movimientos de caja); el Estado de Resultados usa cuentas de ingresos y gastos | Rotularlo "Ingresos − egresos (pólizas)" o calcularlo con las mismas cuentas |
| 6 | Baja | El Dashboard no avisa de **CFDI timbrados sin póliza** | TEC CAPITAL: Facturación "Por cobrar $232" y Clientes $0 hasta usar "Contabilizar CFDI" | Alerta en el Dashboard como ya hace Ventas |
| 7 | Baja | Varias rutas de escritura **validan datos antes del permiso** | Pólizas, cierre de periodo, nóminas responden "faltan datos" (400) al auditor en vez de "sin permiso"; con datos válidos la base sí lo bloquea | Revisar el rol primero (defensa en profundidad) |
| 8 | Baja | Los rechazos por falta de permiso en escritura salen con **HTTP 400** y no 403 | Visto en SAT y Fiscal y otras rutas | Unificar a 403 |
| 9 | Baja | **`crear_nomina` no está en el repo**: no se puede verificar desde aquí que bloquee al auditor | Se documentará en la Fase 3 de OT-0038 | Consulta de solo lectura (sección 4) |
| 10 | Baja | Datos de prueba raros en Demo C | 2 pólizas "ok" sin partidas (`DEMO-D-00003`, `E-00005`); empleada con salario diario $16.67; cuentas sueltas `103 bancos`, `10003 ban`, `bancos` | Limpiar o corregir |

## 3. Qué NO se probó
- Escrituras con datos **válidos** (crear póliza, venta, pago, nómina, factura), timbrado con el PAC, PDF/XML de CFDI, comprobantes en Storage de Ventas, panel de plataforma (`admin.html`), onboarding, ni el panel en celular.
- Un cierre de periodo real (irreversible). Se verificó solo leyendo el SQL exportado: exige contador, admin o director.

## 4. Consulta de solo lectura para cerrar el hallazgo 9 (Supabase, SQL Editor)
```sql
select proname,
       position('auth_rol' in pg_get_functiondef(oid)) > 0 as revisa_rol,
       substring(pg_get_functiondef(oid) from '(?i)auth_rol\(\)[^\n]*') as linea_del_rol
  from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('crear_nomina', 'cerrar_periodo');
```
Debe devolver `revisa_rol = true` y una línea con los roles permitidos en las dos funciones.

## Limpieza de datos demo en Empresa Demo C (13-nov-2026)
- Se dieron de baja (baja suave, `activo = false`, reversible con "reactivar") las 3 cuentas de prueba sin movimientos ni uso en la configuración contable: `103` "bancos", `10003` "ban" y `bancos` "banco". Las hizo el director desde el visor con la función de eliminar cuenta del propio sistema.
- Después: el catálogo activo pasó de 28 a 25 cuentas, el Balance sigue cuadrando y la configuración contable no cambió.
- **No se tocaron** (decisión pendiente del usuario): las pólizas sin partidas `DEMO-D-00003` ($3,200) y `E-00005` ($200), porque anularlas no se puede deshacer y crea pólizas de reversa nuevas; las pólizas repetidas `E-00009` a `E-00012` ($51.04); el salario diario de 16.67 de una empleada dada de baja.
