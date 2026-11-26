# OT-0073 · Revisión de los seis roles en pantalla (Empresa Demo C, 26-nov-2026)

Solo documenta lo observado; no cambia código. Cada rol se revisó con su propia sesión en el panel y con consultas al servidor desde esa sesión (solo lectura; no se guardó nada).

| Rol (cuenta) | Menú que ve | Escritura en pantalla | Servidor |
|---|---|---|---|
| **director** (`demo.director.c`) | todo | todos los botones | todo |
| **contador** (`demo.contador.c`) | Dashboard, Contabilidad, Ventas, Facturación, Nómina, SAT y Fiscal, Asistente (sin Equipo) | "Nueva póliza", "Configuración contable", "Timbrar CFDI", "Timbrado masivo", "Nueva venta"; en Nómina solo Ver y Recibos (sin Calcular ni Timbrar) | empleados, nóminas, SAT y Fiscal e indicadores: 200 |
| **auditor** (`demo.auditor`) | igual que el contador | **0** botones de escritura en las 7 vistas | 200 de lectura; empleados sin RFC, CURP, NSS, sueldo ni cuenta bancaria |
| **rh** (`demo.rh`) | Nómina y Equipo (OT-0070) | Calcular, Timbrar y Recibos; sin botones de contabilidad ni facturación | facturar y cancelar 403; SAT y Fiscal 403; indicadores "restringido"; asistente sin acceso |
| **vendedor** (`demo.vendedor.c`) | Ventas y pagos y Facturación (OT-0070) | "Nueva venta"; Facturación sin botones; sin el aviso "sin póliza" (OT-0071) | empleados 403; SAT y Fiscal 403; nóminas vacías |
| **admin** | no se probó con una cuenta propia en esta ronda | | |

## Asistente contable (contador y auditor)
- Responde con los datos de la propia empresa: balance (Activo -23,184.30 y Resultado -22,673.52 tras la nómina de prueba, que cuadra), por cobrar $42.68 y por pagar $27.84, IVA del mes en cero, alertas (1 CFDI sin póliza y pagos sobre facturas sin póliza de causación), la factura CT-29 sin póliza y "¿qué es el IVA?" y "¿cómo registro una venta?".
- Una pregunta que nombra **otra empresa** ("¿cuánto vendió TEC CAPITAL?") se contesta con las cifras de la empresa propia **sin aclararlo**: no filtra datos ajenos, pero puede confundir.
- Una orden de **escritura** ("Registra una póliza de $500") recibe el aviso genérico de que no entiende; no la ejecuta, pero no explica que el asistente es de consulta.

## Efecto de la nómina de prueba en las cifras de Demo C
La nómina de noviembre pagada para probar el timbrado generó su póliza de egreso: el Balance de Demo C ahora muestra Activo negativo y pérdida (antes ISR estimado de $25.86 y resultado de $86.21). Hay que decidir cómo dejar esos datos antes de tomar las capturas del Dashboard.

## No verificado
El rol admin con cuenta propia, los seis roles en un teléfono y el asistente con un proveedor de IA real (el modo de IA sigue apagado).
