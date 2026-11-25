# OT-0060 · Sin botones muertos ni "Próximamente" engañosos

**Rama:** `feature/OT-0060-sin-proximamente` (sobre `integracion-local`). Decisión del usuario: en el informe no se quiere decir "próximamente" de cosas que se pueden hacer; lo que ya funciona debe estar hecho, y lo que no se va a ofrecer no debe verse como un botón.

## Inventario de lo que decía "próximamente", "no disponible" o "siguiente fase" y qué se hizo
| Dónde | Antes | Ahora |
|---|---|---|
| Dashboard · **Exportar** | "La exportación a Excel/PDF llega en la siguiente fase" | **Exportar (Excel)** descarga un CSV con el resumen (facturación, ingresos y egresos, nómina, Balance, gastos por cuenta, alertas y obligaciones; BOM para acentos; textos de usuario neutralizados contra fórmulas) e **Imprimir / PDF** abre la impresión del navegador con una hoja de estilos que oculta el menú y los botones |
| Facturación · **Timbrado masivo** | Botón con "siguiente fase" | Se **quitó**: no tenía una definición ni se iba a ofrecer |
| SAT y Fiscal · "Descargar XML del SAT" y "Presentar declaración" | Dos botones deshabilitados "no disponible" | Se **quitaron**. Es una frontera de diseño, no algo pendiente: las declaraciones se presentan en el portal del SAT con la e.firma y aquí se registra la fecha y el acuse; el texto de la pantalla lo explica |
| Equipo · invitaciones | "El envío automático de correo todavía no está activo" | Botón **Enviar por correo**: abre el correo del usuario con el aviso ya redactado (enlace, correo a usar, rol y vencimiento; nunca contraseñas) |
| Tarjetas vacías del Dashboard | Rótulo "Próximamente" | Rótulo **"Sin información"** (eran estados vacíos, no funciones futuras) |
| Dashboard · Indicadores fiscales | "Próximamente… pendiente de definición fiscal" | Implementado en la **OT-0061** |
| Nómina · **Timbrar nómina** | "siguiente fase" | **Sigue igual**: se decide aparte (requiere el timbrado de CFDI de nómina con el proveedor) |

## Pruebas
`backend/test-interfaz.js` (`npm run test:interfaz`, dentro de `test:ci`): 7 pruebas que ejecutan el código real: el generador del CSV (BOM, secciones, números negativos sin apóstrofo, fórmulas `=`/`+` neutralizadas, comillas y comas), el texto del correo de invitación, que no queden botones "siguiente fase" salvo el de nómina, que SAT y Fiscal no tenga botones deshabilitados y las versiones de caché. Se actualizó la prueba de solo lectura (OT-0042): Exportar e Imprimir son lecturas y el auditor las conserva.

## No verificado
La vista de impresión (se ve en el navegador al imprimir; no se comprobó la maquetación); abrir el cliente de correo con "Enviar por correo" depende del equipo del usuario.
