# OT-0051 · Pagos confirmados sobre facturas sin póliza de causación

**Rama:** `feature/OT-0051-alerta-pagos-sin-causacion` (sobre `integracion-local`). Cierra la parte accionable del **hallazgo 1** de `Reporte-Prueba-Completa-Modulos-2026-11-13.md`.

## Qué pasa hoy (medido en DEV el 25-nov-2026, solo lectura)
`confirmar_pago_cliente` y `confirmar_pago_proveedor` crean la póliza Bancos/Clientes (o Proveedores/Bancos) **sin comprobar que la factura ya tiene su póliza de causación**. Si no la tiene, Clientes o Proveedores quedan con saldo de naturaleza inversa y el Balance se distorsiona (en Demo C: Clientes −448.00, Proveedores −552.16).

| Empresa (DEV) | Cobros confirmados | …sin causación | Pagos a proveedor confirmados | …sin causación |
|---|---|---|---|---|
| Empresa Demo C | 2 | **2** | 5 | **5** |
| SA de CV | 2 | **2** | 3 | 0 |

## Qué se hizo (sin tocar la base)
Una alerta nueva en el Dashboard: **"N pagos confirmados sobre facturas sin póliza de causación"**, con el desglose (cobros y pagos a proveedor), amarilla, que lleva a Contabilidad.
- Cobro sin causación: no existe una póliza con estado `ok` ligada por UUID a la factura emitida.
- Pago a proveedor sin causación: la factura del proveedor no tiene `poliza_causacion_id`.
- No cuenta pagos sobre CFDI cancelados ni facturas que no se ven en la lista; si alguna lista llega al tope de 1,000 filas no avisa (podría estar incompleta); si una consulta falla, el Dashboard responde igual sin la alerta.
- Archivos: `backend/src/alertasContables.js` (`pagosSinCausacion`, `alertaPagosSinCausacion`), `backend/src/supabaseDashboard.js`, prueba en `backend/test-fiscal.js` (24 en total).

## Propuesta de SQL (NO ejecutada): `database/OT-0051-pagos-exigir-causacion-PROPUESTA.sql`
Para **impedir** el problema y no solo avisarlo: una opción por empresa, **apagada por defecto**, `configuracion_contable.exigir_causacion_pagos`; con la opción encendida, las dos funciones de confirmación rechazan el pago si la factura no tiene su póliza de causación activa. Son copias de las funciones reales de DEV con solo ese bloque añadido.
**Por qué es opcional:** bloquear o no es una decisión contable (base devengado o flujo de efectivo). Mientras la contadora de cada empresa no la tome, el sistema solo avisa. Las funciones son del módulo de Ventas y Pagos: conviene que esa sesión las revise antes de aplicar.

## Límites
- La alerta avisa del síntoma, no corrige los saldos ya registrados: para Demo C hay que contabilizar las facturas o anular los pagos, decisión de quien lleve su contabilidad.
- Un pago a proveedor cuya póliza de causación quedó **anulada** no se detecta (solo se mira que exista el vínculo).
