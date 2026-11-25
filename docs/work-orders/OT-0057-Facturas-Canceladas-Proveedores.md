# OT-0057 · Las facturas canceladas no se pagan ni cuentan como deuda (lado proveedores)

**Rama:** `feature/OT-0057-facturas-proveedor-canceladas` (sobre `integracion-local`). Solo backend; sin SQL.

## Qué se revisó
En la OT-0055 quedó anotado que las pantallas de Cobranza y Cuentas por Pagar podían mostrar facturas **canceladas** con saldo pendiente, porque las vistas `cfdis_saldo` y `cfdis_proveedor_saldo` las incluyen. Al revisar el código:
- **Clientes:** ya estaba resuelto. `listarCfdisSaldo` excluye las canceladas (OT-0029) y `registrarPagoCliente` rechaza un cobro sobre una factura cancelada o que no sea de ingreso (OT-0034). El cobro confirmado que hay en DEV sobre el CFDI cancelado `CT` es anterior a esa regla.
- **Proveedores:** faltaba. La lista de pendientes no filtraba canceladas y `registrarPagoProveedor` no revisaba el estatus.

## Cambio
- `supabasePagosProveedor.js`: antes de registrar un pago se revisa la factura del proveedor; si está cancelada, se rechaza con "ya no se le registran pagos"; si no existe, "no encontrada".
- `supabaseCfdisProveedor.js`: la lista de facturas de proveedor con saldo pendiente excluye las canceladas (el historial completo "Todas" las sigue mostrando, es consulta).
- Prueba nueva `backend/test-facturas-canceladas.js` (`npm run test:canceladas`, dentro de `test:ci`): 4 pruebas que revisan el orden (revisar antes de registrar) y los filtros, tanto de clientes como de proveedores.

## Límites
- Hoy todas las facturas de proveedor de DEV están vigentes, así que el cambio no se ve en los datos; está cubierto por la prueba.
- Las pruebas revisan el código fuente porque estos módulos crean su propio cliente de Supabase y no se pueden simular sin red.
- El cobro ya confirmado sobre una factura cancelada sigue en los datos de DEV (decisión contable: anularlo o reexpedir la factura).
