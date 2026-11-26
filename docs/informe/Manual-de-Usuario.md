# Manual breve de usuario · CONTATECK

**Para quién es:** las personas que usan el panel en una empresa (director, admin, contador, auditor, rh y vendedor). Es una guía corta de "dónde se hace cada cosa", escrita con los nombres reales de los botones. Lo que aquí se dice sobre cada pantalla se comprobó en el panel de la **Empresa Demo C** (26-nov-2026) o está respaldado por las pruebas automáticas; lo que no, se marca como **no probado**.

> **Aviso importante:** el timbrado de facturas y de nómina de esta versión se probó en el **ambiente de pruebas** del proveedor de timbrado. Los timbres de prueba no tienen efecto fiscal. Las cifras fiscales (ISR, IVA, DIOT) son de **referencia**: no sustituyen la revisión de tu contador.

---

## 1. Entrar y orientarte

1. Entra con tu **correo y contraseña** en la pantalla de inicio de sesión.
2. Si es la primera vez y alguien te **invitó**, regístrate con **ese mismo correo** (con otro correo el sistema no encuentra tu invitación). Quedas dentro de la empresa con el rol que te asignaron.
3. Si no tienes empresa ni invitación, el sistema te lleva a dar de alta tu empresa.

**La pantalla**
- **Menú de la izquierda:** solo muestra las secciones de tu rol (ver la sección 2).
- **Barra de arriba:**
  - **Selector de empresa:** si perteneces a más de una, aquí cambias.
  - **Lupa (`Ctrl+K`):** busca facturas, pólizas, clientes y empleados por folio, UUID, nombre o concepto. Solo busca en lo que tu rol puede ver y no muestra RFC, CURP ni sueldos.
  - **Campana:** las alertas reales de la empresa (por ejemplo, una factura sin póliza) y las invitaciones a otras empresas. El punto rojo solo aparece si hay avisos.
  - **Sol o luna:** modo claro u oscuro.
- **Cerrar sesión:** pulsa tu nombre al final del menú izquierdo.

---

## 2. Qué ve cada rol

| Rol | Secciones del menú | Puede hacer |
|---|---|---|
| **Director** y **Admin** | todas, incluido **Equipo** | todo |
| **Contador** | Dashboard, Contabilidad, Ventas y pagos, Facturación, Nómina (solo consulta), SAT y Fiscal, Asistente | contabilidad, facturación, cobros y pagos, SAT y Fiscal |
| **Auditor** | las mismas que el contador | **solo consultar:** no tiene ningún botón que escriba |
| **RH** | **Nómina** y **Equipo** | alta de empleados, calcular y timbrar nómina, invitar personas |
| **Vendedor** | **Ventas y pagos** y **Facturación** (solo lectura) | registrar ventas ("Nueva venta") |

El menú solo ordena lo que ves; la **seguridad real** la ponen el servidor y las reglas de la base de datos: aunque alguien llegara a una pantalla que no es suya, el sistema le rechaza la acción.

---

## 3. Contabilidad (contador, admin, director)

- **Configuración contable** (primero, una vez): en **Contabilidad → Configuración contable** indicas qué cuenta de tu catálogo usa el sistema para **bancos, clientes, proveedores, ventas, IVA trasladado, IVA acreditable y gastos**. Sin esto no se generan las pólizas automáticas ni se confirman cobros y pagos.
- **Catálogo de cuentas:** **Nueva cuenta** (código, nombre, nivel y naturaleza). Las cuentas no se borran: se dan de baja y se reactivan.
- **Crear una póliza:** **Pólizas → Nueva póliza**. Eliges tipo (Ingreso, Egreso o Diario), fecha y concepto, y capturas las partidas; **no se guarda si el Debe no es igual al Haber**. Para operaciones comunes usa **Captura rápida**. Una póliza equivocada se **anula o corrige**, no se borra.
- **Contabilizar una factura:**
  - *Que tú emitiste:* **Captura rápida → Venta → "Importar desde factura timbrada"** (genera Clientes / Ventas / IVA).
  - *De un proveedor:* **"Importar CFDI"** con el XML recibido.
- **Cobros y pagos:**
  - **"Me pagó un cliente"** (en Facturación y Contabilidad): factura, monto, fecha y cuenta. Queda registrado y un contador, admin o director lo **confirma**; entonces se genera la póliza.
  - **Cuentas por Pagar:** eliges la factura del proveedor, registras el pago y lo confirma un contador, admin o director.
  - La factura debe estar **contabilizada** antes; si no, el saldo queda negativo.
- **Cerrar un periodo:** **Periodos → Cerrar periodo**. Antes revisa que la **balanza cuadre**. Ya cerrado, no se registran ni modifican pólizas de ese mes.
- **Reportes:** Libro Mayor, Balanza y Estados financieros.

## 4. Ventas y pagos

- **Registrar una venta** (vendedor, contador, admin, director): **Ventas → Nueva venta**. Es el registro de un **pago recibido** con su comprobante. Estados: **pendiente → en revisión → confirmado** (o rechazado).
- **Quien la registra no la valida:** la revisa un contador, admin o director con **"Tomar para revisión"** y luego **Confirmar** o **Rechazar**. Al confirmarla se genera su póliza.
- **Corregir un pago pendiente:** mientras está pendiente se puede **editar** o **cancelar con motivo** (queda como Cancelado y sale de los totales). Corregir un pago **ya confirmado** todavía no está definido.
- **Aviso "sin póliza":** las ventas confirmadas sin su póliza se avisan a contabilidad (el vendedor no ve este aviso).

## 5. Facturación (director, admin, contador)

- **Timbrar una factura:** **Facturación → Timbrar CFDI**. Eliges el cliente, agregas conceptos con impuestos y timbras. Después descargas **PDF** y **XML**, o la envías por correo.
- **Cancelar o corregir:** **Cancelar CFDI** o emitir una **nota de crédito**. El SAT tiene reglas sobre el motivo y la aceptación del cliente: ante la duda, consulta a tu contador.
- **Timbrado masivo:** **Facturación → Timbrado masivo.** Subes un archivo CSV (hay plantilla). Antes de timbrar, el sistema hace una **revisión previa sin gastar timbres** y te dice qué filas tienen errores (RFC mal formado, cantidad ilegible…) o parecen duplicadas; luego confirmas el importe y se timbran una por una. Los posibles duplicados no se emiten solos.
- **Vendedor y auditor** ven la lista y descargan, pero no ven botones para timbrar o cancelar.

## 6. Nómina (rh, admin, director; el contador y el auditor consultan)

1. **Alta del empleado:** **Nómina → Empleado.** Captura nombre, puesto, fecha de ingreso, tipo de sueldo y monto pactado. Para poder **timbrar** también hacen falta: **RFC, CURP, código postal fiscal, entidad federativa (clave SAT, por ejemplo CMX o JAL) y tipo de contrato**. NSS, cuenta bancaria, jornada y riesgo del puesto son opcionales. Sin los datos fiscales el empleado se paga igual, pero su nómina no se puede timbrar y el sistema dice exactamente qué falta.
2. **Calcular:** **Calcular** → eliges periodicidad y fechas → **Generar prenómina.** Verás el ISR (con subsidio) y el IMSS de cada empleado; puedes capturar otras percepciones y deducciones. Solo entran los empleados **Activos** con la periodicidad elegida.
3. **Aprobar y pagar:** guarda la nómina en el historial (**no se puede editar después**) y genera su póliza de egreso.
4. **Historial:** **Ver** (detalle por empleado), **Recibos** (imprime un recibo informativo por empleado) y **Timbrar.**
5. **Timbrar nómina:** genera el CFDI de nómina de cada empleado (**solo ambiente de pruebas**). Los que ya están timbrados no se repiten; los que fallan se explican (por ejemplo, "el RFC del empleado no está inscrito en el SAT"). En el detalle verás el **UUID** y los botones **XML** y **PDF.**
6. **Simulador fiscal:** calcula ISR e IMSS de un caso sin guardar nada.

## 7. SAT y Fiscal (contador, admin, director; el auditor consulta)

- **Obligaciones y calendario:** **"+ Obligación"** y **"Cargar comunes"** (solo admin y director).
- **Declaraciones:** **"+ Declaración"** (periodo y fecha límite) y **"Marcar presentada"** cuando ya la presentaste (puedes adjuntar el acuse). La presentación se hace en el **portal del SAT**; el sistema solo la registra.
- **Contabilidad electrónica:** en **Contabilidad → SAT / Declaraciones**: captura RFC, mes y año, y descarga el **XML del Catálogo** y el de la **Balanza** (la balanza es de un solo mes y debe cuadrar). Antes, cada cuenta necesita su **Código Agrupador**: descarga la hoja de cuentas, tu contadora llena la última columna y la subes con **"Cargar códigos agrupador (CSV)"**. El envío se hace en el portal del SAT.
- **DIOT e IVA:** cifras de referencia a partir de tus pólizas.

## 8. Equipo (director, admin, rh)

**Equipo → Nueva invitación:** escribes el **correo** y eliges el **rol.** Para invitar con rol Admin o Director hay que ser Admin o Director. La persona se registra con **ese mismo correo.** Si ya tiene cuenta en otra empresa, la invitación le llega a sus notificaciones (esa ruta solo se probó con datos simulados). Desde la lista puedes **Reenviar** (renueva 7 días), **Enviar por correo** o **Cancelar** una invitación pendiente.

## 9. Dashboard

Resume la empresa: facturación del mes, ingresos y egresos de pólizas, nómina estimada, Balance General, gastos, **indicadores fiscales** (IVA del mes e ISR estimado, solo para el régimen general de personas morales) y **alertas.** Al pulsar una alerta te lleva a la pantalla donde se resuelve. **Exportar (Excel)** baja un CSV del resumen e **Imprimir / PDF** abre el diálogo de impresión del navegador.

## 10. Exportar a Excel

Varias listas tienen un botón para **exportar a CSV (Excel)**: Ventas y pagos, Pólizas, Libro Mayor, Cuentas por pagar, Balanza, Estados financieros, Facturación y Nómina (historial y detalle). Si has filtrado la lista, exporta **solo lo que ves.** Si no hay resultados, avisa y no descarga. Se abre en Excel. *(No se verificó la apertura del archivo en Excel.)*

## 11. Asistente contable (director, admin, contador, auditor)

Un asistente de **solo consulta** que contesta con los datos de tu empresa; **no es inteligencia artificial** y no modifica nada. Pregúntale, por ejemplo:
- "¿Cómo va el Balance General?", "¿Cuánto hay en bancos y caja?"
- "¿Cuánto me deben mis clientes y cuánto debo a proveedores?"
- "¿Cómo va el IVA este mes?", "¿Qué obligaciones fiscales vencen pronto?"
- "¿Cuánto gané este mes?", "¿Tengo alertas pendientes?", "¿Qué facturas no tienen póliza?"
- Conceptos y guías: "¿Qué es el IVA?", "¿Cómo registro una venta?", "¿Cómo cierro un periodo?"

Entiende meses ("octubre", "el mes pasado") y preguntas de seguimiento ("¿y el mes pasado?"). Si le ordenas registrar o cancelar algo, te dice a qué módulo ir. Si nombras otra empresa, aclara que solo ve la tuya. Las cifras son de referencia.

---

## 12. Si algo no sale

| Mensaje o situación | Qué significa |
|---|---|
| "Sin conexión" al iniciar sesión | El servidor no responde. Si usas la versión gratuita de la base de datos, puede estar **pausada** por falta de uso: avisa al administrador técnico. |
| "Faltan las cuentas de IVA… en la Configuración contable" | Primero llena **Contabilidad → Configuración contable.** |
| "El periodo … está cerrado" | No se registran ni modifican pólizas ni nóminas en un mes cerrado. |
| "Faltan datos fiscales del empleado: …" | Captura en el empleado lo que menciona el mensaje y vuelve a timbrar. |
| "El RFC del empleado no está inscrito en el SAT" | El proveedor valida el RFC contra el listado del SAT: revisa el RFC y el nombre. |
| "Esta nómina se guardó sin el desglose de ISR e IMSS" | Es una nómina anterior al timbrado: vuelve a calcularla y pagarla. |
| "Falta aplicar en la base el SQL…" | Falta una actualización de la base de datos: avisa al administrador técnico. |
| No aparece una sección en el menú | Tu rol no la usa (ver la sección 2). |
| La factura queda como "posible duplicado" | Ya hay una igual (mismo receptor e importe) reciente; confirma solo si de verdad quieres otra. |

## 13. Lo que el sistema todavía no hace

- No presenta declaraciones ante el SAT (se hace en su portal con la e.firma).
- El timbrado de nómina y el masivo son de pruebas; con un emisor real faltan certificado de sello digital, registro patronal y criterios fiscales validados por un contador.
- No cancela CFDI de nómina ni cubre nóminas extraordinarias, incapacidades, horas extra o finiquitos.
- El asistente no usa inteligencia artificial.
- Corregir un pago **ya confirmado** y el REP de facturas a plazo están pendientes de definir con la contadora.
