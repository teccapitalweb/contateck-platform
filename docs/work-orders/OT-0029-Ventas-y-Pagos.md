# OT-0029 · Ventas y Pagos — pulido y documentación

**Rama:** `feature/OT-0029-ventas-pulido`
**Origen:** auditoría de solo lectura del módulo (Fase 1) y aprobación de los
pulidos A1–A9, B1 y B4.
**Nota:** Ventas se construyó en OT-0014 y en los commits "Conexión
Ventas-Contabilidad" sin OT escrita; este documento es esa OT.

---

## 1. Mapa del módulo (6 preguntas obligatorias)

1. **¿Dónde nace?**
   Ventas y Pagos → "Nueva venta" → cliente, concepto, importe, ¿incluye
   IVA?, fecha de pago, método, referencia, banco (no aplica en efectivo),
   comprobante → Guardar (queda `pendiente`). Después un validador
   (contador/admin/director): "Tomar para revisión" → "Confirmar" o
   "Rechazar" (con motivo).

2. **¿Qué afecta?**
   - Al registrar: `ventas` (insert) + archivo en Storage
     `documentos/{empresa}/ventas/{uuid}/comprobante.ext`.
   - Al tomar / rechazar: `ventas` (`estado`, `tomado_por/en`,
     `revisado_por/en`, `motivo_rechazo`).
   - Al confirmar: `ventas` + `polizas` + `poliza_partidas` (vía
     `crear_poliza_completa`) y `ventas.poliza_id` queda ligado a la póliza.
   - No toca `cfdis`, `cfdis_saldo`, `pagos_cliente` ni `auditoria_log`
     (ver pendientes).

3. **¿Dónde se consulta?**
   - Ventas y Pagos: bandeja, KPIs, filtros (estado, "Sin póliza", búsqueda,
     mes) y detalle (con folio de póliza o aviso de que falta).
   - Contabilidad → Pólizas: folio `I-000XX`, marcada "Generada
     automáticamente desde Ventas", sin botón Editar.
   - Contabilidad → Libro Mayor: Bancos, Ventas y servicios, IVA trasladado.
   - Dashboard: a través de las pólizas de Ingreso del mes (no lee `ventas`).
   - Facturación: **no** la ve.

4. **¿Qué póliza genera?**
   Una póliza de tipo **Ingreso**, **al confirmar** (diferida):
   Debe `Bancos` (total) / Haber `Ventas y servicios` (subtotal) /
   Haber `IVA trasladado` (si "incluye IVA", total/1.16). Cuentas tomadas de
   `configuracion_contable`. Fecha = fecha de pago capturada.
   Si no se puede generar (falta cuenta, periodo cerrado…), la venta queda
   confirmada con la marca **"Sin póliza"** y el botón **"Generar póliza"**
   reintenta sin duplicar (si ya existe una póliza de esa venta, solo la
   liga).

5. **¿Qué saldo modifica?**
   Cuentas de control: Bancos (sube), Ventas (sube), IVA trasladado (sube).
   No hay auxiliar: no afecta `cfdis_saldo` ni Clientes (105).

6. **¿Qué documento queda relacionado?**
   El comprobante subido (imagen/PDF en Storage, `ventas.comprobante_path`)
   y la póliza (`ventas.poliza_id`). No hay CFDI ni complemento de pago.

---

## 2. Cambios de esta OT

**Frontend — `frontend/ventas.js`**
- A1: todo dato de usuario se escapa antes de `innerHTML` (XSS almacenado).
- A2: "hoy" en fecha local (antes UTC: después de ~18:00 proponía mañana);
  la fecha de pago no puede ser futura.
- A4: si el comprobante no se puede subir, **no** se guarda la venta; banco
  y método ya no vienen preseleccionados (BBVA/SPEI); en efectivo se oculta
  el banco; botones bloqueados mientras la acción está en curso; avisos de
  error/póliza más largos.
- A5: se quitó la URL de respaldo hacia un dominio fijo de Railway.
- A6: tarjeta "Confirmado este mes" (la anterior repetía el monto), filtro
  por mes, buscador y aviso si se alcanza el tope de 300 ventas.
- A9: limpieza (`window.CTVentas` sin uso, variable `perfil`, comentario
  huérfano, CSS de `select`).
- B1: aviso persistente de configuración contable incompleta, marca "Sin
  póliza", filtro "Sin póliza", folio de póliza en el detalle, botón
  "Generar póliza", rechazo con motivo (se muestra en el detalle).

**Backend**
- A3 `supabaseVentas.js`: validación al registrar (importe > 0 a 2
  decimales, fecha válida no futura, longitudes, rol en `ROLES_REGISTRO`,
  ruta del comprobante dentro de `{empresa}/ventas/`).
- A9: se quitó `consultora_id` del insert (sin UI).
- B1: liga `poliza_id`; rechazo exige `motivo`; pre-chequeo de cuentas
  (con IVA y sin cuenta de IVA ya no genera una póliza descuadrada: dice qué
  falta); endpoints nuevos `GET /api/ventas/config-contable` y
  `POST /api/ventas/:id/generar-poliza`.
- A8 `supabasePagosCliente.js`: el selector de "Me pagó un cliente" ya no
  ofrece facturas canceladas.

**Contabilidad — `frontend/contabilidad.js`** (A7): se corrigió el comentario
y el texto de la póliza de Ventas, que prometían una corrección ("rechazar y
re-registrar") que no existe para ventas confirmadas.

**Base de datos**
- `database/OT-0029-ventas.sql`: definición base de `ventas` (documentación),
  columnas `poliza_id` y `motivo_rechazo`, índices y backfill.
- `database/OT-0029-ventas-introspeccion.sql`: consultas de solo lectura
  para exportar de DEV lo que falta documentar (B4).

### Orden de despliegue
1. Correr `OT-0029-ventas.sql` en DEV (SQL Editor).
2. Reiniciar el backend con esta rama.
3. Recargar el panel (el código tolera que el SQL aún no se haya corrido,
   pero sin él no se ve la liga con la póliza ni se guarda el motivo).

---

## 3. Pendientes (no incluidos)

**Requieren decisión de la contadora**
- Cómo corregir o cancelar una venta ya **confirmada** (reversa + estado
  `cancelada`).
- Contrapartida correcta: Bancos/Ventas directo vs Clientes; Caja en
  efectivo; cuenta destino por método de pago.
- Reglas de IVA (16% fijo hoy; tasas 8%/0%/exento; retenciones).
- Riesgo de ingreso duplicado Ventas ↔ Facturación/Cobranza (una venta no
  se liga a un CFDI).
- Fecha de la póliza y periodos cerrados; moneda; pagos parciales;
  folio continuo; motivo obligatorio ya implementado, falta confirmar si un
  rechazo puede reabrirse.

**Técnicos aprobables aparte (con SQL)**
- Folio atómico `siguiente_folio_venta` (hoy `count + 1`).
- Registro de cada transición en `auditoria_log`.
- Revalidar saldo en `confirmar_pago_cliente/proveedor` (hoy se puede
  confirmar de más si hay dos pagos registrados).
- Validar que la cuenta destino/origen de un pago pertenezca a la empresa.
- Editar/cancelar una venta `pendiente` por quien la registró.
- B4 completo: pegar en `OT-0029-ventas.sql` (sección 4) las políticas RLS y
  de Storage exportadas de DEV; incluir en `database/` las funciones de
  periodos y ajustes (OT-0025/0026) y la versión real de
  `crear_poliza_completa` (el repo trae la de 4 parámetros; el backend usa 6).
- Quitar el mismo respaldo de URL fija en `contabilidad.js` (3 sitios).

---

## 4. Pruebas sugeridas (DEV, hechas por una persona)

| Caso | Esperado |
|---|---|
| Registrar con importe 0 / negativo / fecha futura | Rechazado con mensaje claro (pantalla y backend) |
| Registrar en efectivo | No pide banco |
| Adjuntar comprobante y que falle la subida | No se guarda la venta |
| Escribir `<b>x</b>` en cliente/notas | Se ve como texto, no como HTML |
| Rechazar sin motivo | No deja; con motivo, el detalle lo muestra |
| Confirmar con cuentas contables configuradas | Póliza `I-000XX` y su folio aparece en el detalle |
| Confirmar con IVA y sin cuenta de IVA | Venta confirmada, "Sin póliza", aviso dice qué falta; tras configurar, "Generar póliza" la crea una sola vez |
| Doble clic en Confirmar | Una sola petición |
| "Me pagó un cliente" con factura cancelada | No aparece en el selector |
