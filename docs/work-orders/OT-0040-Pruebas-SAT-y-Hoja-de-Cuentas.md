# OT-0040 · Pruebas del módulo SAT y Fiscal dentro del repo + hoja de cuentas más limpia

**Rama:** `feature/OT-0040-pruebas-sat-hoja` (sobre `integracion-local`). Sin cambios de SQL, sin dependencias nuevas.

## 1. Pruebas guardadas en el proyecto
Las pruebas con las que se verificó SAT y Fiscal (OT-0031, 0031b, 0031c y 0039) vivían en una carpeta temporal fuera del proyecto. Ahora están en
`backend/test-fiscal.js`, con el mismo estilo que `test-storage-empresa.js` (sin red, sin base, sin servidor, sin instalar nada):

```
cd backend
npm run test:fiscal          # o:  node test-fiscal.js
```

| Bloque | Qué cubre |
|---|---|
| 1. Validaciones | Fechas en hora de México, días entre fechas, obligaciones, declaraciones, documentos, rutas de Storage, duplicados, alertas de vigencia, catálogo oficial de Códigos Agrupadores (1,080 códigos) |
| 2. Backend con base falsa | Calendario, alta con aviso de duplicado, marcar presentada y regresar, documentos, corregir y eliminar (roles, presentada, acuse, sin permiso de borrado), Código Agrupador, proveedores de la DIOT y que el router importe solo funciones que existen |
| 3. Ayudas del panel | Fechas sugeridas y plantilla (`fiscal.js`), mensajes del inicio de sesión (`auth-login.js`) |
| 4. `contabilidad.js` completo en un navegador simulado | IVA y DIOT con pólizas sin RFC de proveedor, carga de proveedores sin bucle, hoja de cuentas, XML del catálogo y de la balanza |

**20 pruebas.** Se comprobó que detectan errores: se rompieron a propósito dos cosas (que la hoja vuelva a traer todas las cuentas; que una complementaria cuente
como duplicada) y las pruebas fallaron en las dos; después se restauró.

El cliente de la base, la configuración y la consulta del rol se reemplazan solo para `supabaseFiscal.js` con un gancho de módulos de Node (`module.register`):
no se toca el código de producción para poder probarlo.

**No cubre:** la pantalla real (modales, botones, subida de archivos a Storage) ni la base real; eso sigue siendo verificación en el visor.

## 2. La hoja de cuentas ya no trae cuentas inactivas sin uso
La hoja para la contadora (y el indicador "N de M cuentas con código" y el aviso al bajar el catálogo) contaban **todas** las cuentas, incluso las desactivadas. En Empresa Demo C
salía una cuenta inactiva y duplicada (`208 IVA trasladado`). Ahora se mandan a revisar:

- las cuentas **activas**, y
- las **inactivas que ya tienen movimientos** (siguen saliendo en la balanza y su XML, así que necesitan código).

Una cuenta inactiva sin ningún movimiento ya no sale. Lo prueban `hoja de cuentas: solo activas e inactivas con movimientos…` y la de fórmulas y comillas.

| Cambio | Dónde |
|---|---|
| `cuentasParaSat()` y su uso en la hoja, el indicador y el aviso; se exponen `cuentasParaSat` y `csvCuentasContadora` en `CTCont` para poder probarlas | `frontend/contabilidad.js` |
| Versión de caché `contabilidad.js?v=22` | `frontend/dashboard.html` |
| Comando `npm run test:fiscal` | `backend/package.json` |

**Decisión pendiente (no se cambió):** el XML del Catálogo sigue incluyendo **todas** las cuentas, también las inactivas sin uso (mismo criterio por defecto de antes: catálogo completo). Si se
prefiere que el XML siga la misma regla que la hoja, es un cambio de una línea; conviene confirmarlo con la contadora porque es un criterio contable.

**NO verificado:** en pantalla (el panel que corre todavía no trae esta rama).
