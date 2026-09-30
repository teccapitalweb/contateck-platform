# CONTATECK · Orden de Trabajo OT-0023
## Cuentas por Pagar — facturas de proveedor persistentes + pagos con saldo

**Módulo:** Contabilidad — tab "Cuentas por Pagar" (auxiliar de facturas).
**Espejo de:** OT-0020 (cobranza de clientes), con la dirección del
dinero invertida.

---

## 1. Qué resuelve

Antes: "Importar XML recibido" leía la factura del proveedor, armaba la
póliza de causación (Gastos + IVA acreditable / Proveedores), y **la
olvidaba** — no quedaba como documento consultable, sin saldo, sin poder
pagarla parcialmente de forma controlada. "Le pagué a un proveedor" era
un botón de captura libre, sin ligar a ninguna factura.

Ahora: la factura se persiste al importar, con saldo calculado
(`cfdis_proveedor_saldo`), y "Le pagué a un proveedor" parte de elegir
esa factura — mismo flujo de dos pasos (registrar → confirmar) y
trazabilidad completa que ya existe para clientes.

## 2. Mapa del módulo (obligatorio desde esta OT)

Ver `docs/work-orders/Mapa-Modulos-Cobranza-CxP.md` — sección
"Cuentas por Pagar / Facturas de proveedor".

## 3. Base de datos (`database/OT-0023-cuentas-por-pagar.sql` +
   `database/OT-0023-fix1-indice-unico.sql`)

- **`cfdis_proveedor`** — la factura persistida (espejo de `cfdis`,
  del lado de lo que te facturan a ti). Índice único
  `(empresa_id, uuid_sat)` — completo, no parcial (fix1: un índice
  parcial impide que `ON CONFLICT` funcione desde supabase-js).
- **`pagos_proveedor`** — mismo patrón que `pagos_cliente`: ciclo
  `registrado → confirmado`, folio propio `PP-00001` (contador atómico,
  letra `PP` agregada al check de `folios_contador`).
- **Vista `cfdis_proveedor_saldo`** — saldo calculado, `security_invoker
  = true` (mismo fix de seguridad que se aplicó a `cfdis_saldo`).
- **`registrar_pago_proveedor()` / `confirmar_pago_proveedor()`** —
  valida saldo, exige `cuenta_proveedores_id` configurada, genera la
  póliza (Debe Proveedores / Haber cuenta origen), auditoria_log.

## 4. Backend

- `supabaseCfdisProveedor.js` — `guardarCfdiProveedor`,
  `listarCfdisProveedorSaldo`, `listarCfdisProveedorTodas`.
- `supabasePagosProveedor.js` — `registrarPagoProveedor`,
  `confirmarPagoProveedor`, `listarPagosProveedor`.
- `pagosProveedor.js` — rutas `/api/cfdis-proveedor-saldo`,
  `/api/cfdis-proveedor` (todas), `/api/pagos-proveedor` (POST +
  confirmar).

## 5. Frontend

- `contabilidad.js` — `xmlAPolizaGasto` ahora también persiste la
  factura (`guardarCfdiProveedor`) ligada a la póliza de causación;
  flujo completo `renderProveedorForm → renderProveedorCaptura →
  renderProveedorResumen → confirmarProveedor`, espejo exacto del de
  cobro. Guard anti doble-clic en "Contabilizar" (evita pólizas
  duplicadas si el usuario reintenta mientras tarda).
- `postgres-crud.js` — helpers correspondientes.

## 6. Bugs encontrados y corregidos durante la prueba

- Índice único parcial rompía `ON CONFLICT` → RLS lo reportaba como
  "violates row-level security policy (USING expression)" — engañoso,
  el verdadero problema era el índice, no permisos. Corregido (fix1).
- `.select().single()` encadenado al `upsert()` disparaba el chequeo de
  RLS de LECTURA sobre el RETURNING — innecesario porque el `id` de
  vuelta no se usa. Se quitó.
- Cada intento (fallido o exitoso) sí generaba su póliza de causación —
  varios intentos de prueba dejaron pólizas duplicadas, limpiadas
  manualmente con SQL ad-hoc (no versionado, era limpieza de datos de
  prueba, no schema).

## 7. Pendientes explícitos (no simulados)

- Directorio/catálogo de proveedores (hoy el nombre vive suelto en cada
  factura).
- Bandeja de pagos registrados sin confirmar.
- Antigüedad de saldos.
- Cancelar un pago registrado sin confirmar.
- Clasificación DIOT de cuentas de gasto — pendiente de la contadora.
