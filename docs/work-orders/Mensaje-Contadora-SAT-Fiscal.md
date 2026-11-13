# Mensaje para la contadora · Módulo SAT y Fiscal (revisión de ~15 minutos)

Para mandar por correo o WhatsApp. Tiene una versión corta (para el chat) y la versión completa con tus propuestas por defecto.
Sirve para que ella conteste "sí / no / cámbialo" sin tener que explicar nada.

---

## Versión corta (para WhatsApp)

> Hola, ¿tienes 15 minutos esta semana? Estamos cerrando el módulo SAT y Fiscal del sistema y necesito tu visto bueno en 3 cosas.
>
> **1. Códigos agrupador del SAT (lo único que bloquea el XML del catálogo).** Te mando una hoja de Excel con las cuentas; en la última columna solo anotas el código del Código Agrupador del SAT de cada cuenta (por ejemplo 102.01 para Bancos). El sistema revisa que el código exista en el catálogo oficial.
>
> **2. Obligaciones y fechas.** Te mando la lista de obligaciones que dejamos por defecto (IVA, ISR provisional, DIOT, retenciones de sueldos, IMSS, RCV/INFONAVIT: día 17 del mes siguiente). Solo dime si está bien o qué falta.
>
> **3. Cálculos de IVA, DIOT e ISR provisional.** Te mando mis propuestas; dime si van o qué cambiar. Esto no corre prisa.
>
> Te paso todo por correo. ¡Gracias!

---

## Versión completa

**Asunto:** Revisión rápida del módulo SAT y Fiscal (3 puntos)

Hola. El módulo ya funciona y está probado; lo que falta son decisiones que solo tú puedes confirmar. Para cada punto va mi propuesta
por defecto: si estás de acuerdo basta con responder "OK". Si no, dime qué cambiar.

### 1. Código Agrupador SAT por cuenta  ← lo más importante

**Qué pasa hoy:** el XML del Catálogo de cuentas (Contabilidad Electrónica 1.3) lleva en cada cuenta el código del Código Agrupador del SAT.
Mientras las cuentas no lo tengan, el sistema manda el código interno de la cuenta y el SAT puede rechazar el archivo.

**Qué necesito de ti:** abre la hoja adjunta (`Cuentas_para_contadora.csv`), y en la última columna ("Código agrupador SAT (llenar)")
escribe el código que corresponde a cada cuenta, en formato `NNN` (cuenta de mayor) o `NNN.NN` (subcuenta), por ejemplo `102.01`.
Si Excel te pide un formato para esa columna, elige **Texto** (así no se pierde el cero final, como en `105.10`).

**Cómo se carga:** yo subo la hoja al sistema. El sistema revisa que **cada código exista en el catálogo oficial del SAT**
(1,080 códigos) y avisa de los que no; no cambia nada hasta que se confirma.

**Detalle que conviene que revises:** en el catálogo del sistema, `100 Activo` es la cuenta de mayor y cuentas como `101 Caja` y `102 Bancos`
están como subcuentas. En el Código Agrupador del SAT, `101` y `102` son ellos mismos cuentas de primer nivel y sus subcuentas son
`101.01`, `102.01`, etc. Dime si prefieres que asigne a cada cuenta del sistema el código `NNN.NN` del SAT (lo que propongo) o si
cambiamos la estructura del catálogo.

### 2. Obligaciones y fechas límite

**Lo que dejé como plantilla** (botón "Cargar comunes"; todas "día 17 del mes siguiente", editables y desactivables):

| Obligación | Periodicidad | Día límite |
|---|---|---|
| IVA mensual | Mensual | 17 |
| ISR pagos provisionales | Mensual | 17 |
| DIOT | Mensual | 17 |
| Retenciones de ISR por sueldos | Mensual | 17 |
| Cuotas IMSS | Mensual | 17 |
| RCV e INFONAVIT | Bimestral | 17 |

**Regla de fechas:** al crear una declaración el sistema sugiere la fecha límite (día 17 del mes siguiente al periodo; si cae en sábado
o domingo, la recorre al lunes) y tú la confirmas. **No** considera días inhábiles por feriados.

**Preguntas:**
- ¿La plantilla está bien o falta/sobra alguna? *(Propuesta: así como está; no incluí Contabilidad Electrónica ni la declaración anual porque dependen del régimen.)*
- ¿Qué fecha y regla uso para **Contabilidad Electrónica** (balanza y catálogo) y para la **declaración anual** de cada régimen? *(Propuesta: me las dices y las cargo como obligaciones propias con su mes y día.)*
- ¿Me pasas la lista de **días inhábiles** del año para considerarlos? *(Propuesta: por ahora solo fines de semana.)*

### 3. Cálculos de IVA, DIOT e ISR provisional  ← puede esperar

Hoy esas cifras salen rotuladas como "referencia, no es la declaración" y el ISR provisional está oculto. Nadie presenta con ellas.

| Tema | Mi propuesta por defecto | ¿OK? |
|---|---|---|
| **IVA**: ¿cobrado/pagado (flujo) o devengado? | Flujo de efectivo | |
| **IVA**: saldo a favor de meses anteriores, retenciones, acreditamiento proporcional | Saldo a favor anterior capturado a mano; retenciones y proporcional, aparte | |
| **DIOT**: ¿qué cuentas de gasto/costo/activo entran? (hoy 601, 602, 603 y 501 fijas) | Todas las de gasto y costo, más activo fijo ligado a factura recibida | |
| **DIOT**: ¿por pago efectivo o por fecha de factura? | Por pago efectivo, con los pagos a proveedor | |
| **DIOT**: tipo de tercero (04/05/15), tipo de operación (03/06/85) y desglose por tasa (16, 8, 0, exento) | Capturarlos una vez por proveedor | |
| **DIOT**: proveedores sin RFC | Avisar y excluirlos de la DIOT | |
| **ISR provisional**: fórmula (coeficiente de utilidad, ingresos acumulados, deducciones autorizadas, pérdidas, pagos anteriores, retenciones) | No mostrar nada hasta que me la confirmes | |
| **Balanza**: saldos contrarios a su naturaleza con signo negativo; mes 13 y envío complementario | Negativo; mes 13 y complementaria no soportados por ahora | |

### Lo que ya dejé decidido (avísame solo si algo no te late)

- Se permiten declaraciones **complementarias** y **extemporáneas** (se distinguen con una etiqueta junto al periodo).
- Una declaración presentada puede **regresarse a pendiente** (borra la fecha y el responsable; conserva folio y acuse).
- Los documentos con vigencia (opinión de cumplimiento, constancia) **avisan 5 días antes** de vencer.
- **Nadie borra documentos** desde el sistema.
- La declaración **no registra pagos** ni línea de captura; el pago se contabiliza aparte.
- Lo que requiere **e.firma** (descarga masiva de XML del SAT y presentación electrónica) sigue desactivado y marcado como no disponible.

Gracias. Con tus respuestas cierro el módulo.

---

### Archivos que hay que adjuntar
1. `Cuentas_para_contadora.csv`: se descarga desde el panel, en **Contabilidad → SAT / Declaraciones → "Hoja de cuentas para la contadora (CSV)"**.
2. (Opcional) Una captura de **SAT y Fiscal** con la tabla de obligaciones.
