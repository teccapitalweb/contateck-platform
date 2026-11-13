# OT-0044 · `config-contable` se pide una sola vez al abrir el panel

**Rama:** `feature/OT-0044-config-contable-y-permisos` (sobre `integracion-local`). Sin cambios de servidor ni de SQL.
Cierra el "pendiente menor" de `OT-0042-Auditor-Solo-Lectura-y-Menos-Peticiones.md`.

## Problema
Al abrir el panel, `auth-guard.js` pedía `/api/config-contable` con un `fetch` propio y Contabilidad la pedía otra vez por `CTPostgres`, que sí tiene caché. Eran 2 peticiones iguales.

## Cambio
- `frontend/auth-guard.js` (`?v=8` en `dashboard.html`): pide la configuración por `window.CTPostgres.leerConfigContable()` (caché de 8 s con petición compartida). Si `CTPostgres` no está cargado, usa el `fetch` directo de antes.
- `backend/test-solo-lectura-y-cache.js`: una prueba más (14 en total) que comprueba que auth-guard usa el caché y que dos lecturas simultáneas hacen 1 sola petición.

## Revisado y NO cambiado (hallazgos 7 y 8 del reporte de prueba completa)
- **Rol antes de validar datos** (pólizas, cierre de periodo, nóminas) y **403 en vez de 400**: esas rutas dejan la decisión de permiso a la función SQL (`crear_nomina`, cierre de periodo, pólizas), que ya rechaza al auditor aunque los datos sean válidos. Duplicar la lista de roles en el backend la dejaría en dos lugares que pueden desalinearse, y cambiar el código HTTP puede afectar a pantallas que hoy leen el 400. Es de baja gravedad y toca módulos que no son de SAT y Fiscal: queda como decisión del dueño de esos módulos (Ventas/Pagos y Auditoría).
- **Nómina "Calcular" visible para el contador**: `crear_nomina` exige rh, admin o director. Ocultarlo o permitirlo depende de si el contador debe crear nóminas (decisión de negocio).

## Verificación en pantalla (13-nov-2026, rama unida a `integracion-local`)
- Pruebas: 14 de `npm run test:lectura` pasan (21 de `test:fiscal` no se tocaron).
- Director, Empresa Demo C, `auth-guard.js?v=8`: al abrir el panel **15 peticiones y ninguna repetida**; `config-contable` = **1** (antes 2); la configuración contable llega completa (8 de 8). Después de abrir Contabilidad: `config-contable` sigue en 1.
- Al abrir Contabilidad pasados unos segundos, `periodos` y `cfdis-proveedor` se piden 2 veces cada una: es el caché de 8 s que ya había vencido, no una repetición simultánea.

**No verificado:** roles contador y auditor con esta versión.
