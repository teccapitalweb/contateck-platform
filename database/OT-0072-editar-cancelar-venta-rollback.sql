-- OT-0072 · Reversa: quita las dos funciones. Los pagos ya cancelados conservan estado 'cancelado' (no se borra nada).
-- Si hay que regresarlos a pendiente: update ventas set estado = 'pendiente', motivo_rechazo = null where estado = 'cancelado';
drop function if exists public.editar_venta_pendiente(uuid, jsonb);
drop function if exists public.cancelar_venta_pendiente(uuid, text);
