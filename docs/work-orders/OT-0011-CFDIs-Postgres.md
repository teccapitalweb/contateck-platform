# CONTATECK · Informe Técnico
## Orden de Trabajo OT-0011 — Migración de CFDIs a PostgreSQL (Opción A)

**Responsable:** Ingeniero de Desarrollo (Claude)
**Fecha:** 29 julio 2026
**Rama:** `feature/OT-0011-cfdis-postgres`
**Alcance aprobado:** sustituir Firestore por Postgres como destino del **registro** de CFDIs timbrados. El timbrado en sí (Fiscalapi + CSD global de pruebas) no cambia. Certificados por empresa quedan para una OT futura de seguridad/producción.

---

## 1. Qué se construyó

1. **`backend/src/supabaseCfdis.js`** (nuevo): `guardarCfdi()` y `marcarCfdiCancelado()`, mismo patrón de siempre (cliente autenticado como el usuario, RLS real).
2. **`backend/src/supabaseAuth.js`**: ahora expone también `req.token` (el JWT crudo), necesario para que `invoices.js` pueda llamar a las funciones de Postgres respetando RLS.
3. **`backend/src/routes/invoices.js`**: las 4 rutas de timbrado (`/facturar`, nota de crédito, REP, `/timbrar`) y la de cancelación ahora guardan **primero en Postgres**. Firestore se conserva **solo como respaldo de emergencia** — si Postgres fallara, se intenta ahí para no perder el registro de una factura que ya es legalmente válida ante el SAT sin importar si nuestro sistema la registró bien.
4. **`database/addendum_cfdis_fiscalapi_id.sql`**: se agrega la columna `fiscalapi_id` a la tabla `cfdis` (necesaria para poder cancelar buscando por el id interno de Fiscalapi, tal como ya hacía el código con Firestore).
5. **Middleware `requireRolFacturacion`** en `invoices.js`: bloquea con 403 antes de tocar Fiscalapi si el rol no es `director`/`admin`/`contador` (ver sección 2).

---

## 2. Restricción de rol — resuelta (aprobado por Jorge)

Se agregó el middleware `requireRolFacturacion` en `invoices.js`, aplicado a las **5 rutas que inician timbrado o cancelación**: `/facturar`, `/nota-credito`, `/rep`, `/timbrar`, `/cancelar`. Corta con **403 Forbidden** antes de llamar a Fiscalapi/SAT si el rol del usuario no es `director`, `admin` o `contador` — consulta el rol real en Postgres (`perfiles` + `roles`), mismo criterio que ya exigían las políticas RLS de `insert`/`update` en `cfdis` desde OT-0003. Las rutas de solo lectura (`/cfdi/:id/pdf`, `/xml`, `/status`, `/enviar-correo`) no llevan esta restricción — ver ese CFDI ya emitido sigue abierto a toda la empresa, como el resto del sistema.

Queda pendiente, tal como señalaste, para la fase de mejora de interfaz: ocultar/deshabilitar estos botones en el frontend según el rol (hoy el botón sigue visible para todos, pero el backend ya rechaza correctamente si alguien sin permiso lo presiona).

---

## 3. Pasos de validación

1. Correr `database/addendum_cfdis_fiscalapi_id.sql` en Supabase.
2. **Timbrar una factura de prueba** (Facturación → Timbrar CFDI, con cualquier usuario `contador`/`admin`/`director`) → debe verse en la tabla `cfdis` de Postgres, con `fiscalapi_id`, `uuid_sat`, `receptor_rfc`, `emisor_rfc`, `usuario_id` y `empresa_id` correctos.
3. **Cancelar esa factura** → `estatus` debe cambiar a `cancelado` y `cancelled_at` debe tener fecha/hora.
4. **Confirmar aislamiento** — con un usuario de otra empresa, ese CFDI no debe ser visible (RLS, ya probado desde OT-0003, pero vale confirmarlo también aquí).
5. *(Si se aprueba la Opción A del hallazgo)* — con `demo.vendedor`, intentar timbrar → debe rechazarse antes de siquiera llamar a Fiscalapi.

### Plantilla de resultados

```
Fecha de prueba:
Probado por:

[ ] Prueba 1 — Timbrar factura, registro correcto en Postgres: PASA / NO PASA
[ ] Prueba 2 — Cancelar actualiza estatus y cancelled_at: PASA / NO PASA
[ ] Prueba 3 — Aislamiento entre empresas: PASA / NO PASA
[ ] Prueba 4 — Vendedor bloqueado con 403 antes de llamar a Fiscalapi: PASA / NO PASA

Conclusión: OT-0011 [ ] CERRADA  [ ] PENDIENTE
```

---

## 4. Qué NO se hizo (a propósito, ya aprobado así)

- No se implementó CSD por empresa — sigue el certificado global de pruebas.
- No se cifran las columnas de CSD en `empresas` (ya identificado como candidato a Supabase Vault, fase futura).
- No se retiró Firestore del código — queda como respaldo de emergencia, no como sistema principal.

---

*Fin del informe. Con OT-0011 cerrada (y resuelto el hallazgo de la sección 2), el núcleo completo del ERP — empresas, perfiles, clientes, productos, empleados, pólizas con detalle, y CFDIs — opera sobre PostgreSQL. Firestore queda relegado a un respaldo de emergencia en un solo módulo, listo para retirarse por completo cuando el equipo lo decida.*
