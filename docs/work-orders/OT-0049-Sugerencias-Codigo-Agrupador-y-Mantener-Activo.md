# OT-0049 · Sugerencias de Código Agrupador y tarea para mantener activo el proyecto DEV

Trabajo preparatorio mientras la contadora no responde. **No cambia código de la app ni la base de datos.**

## 1. Hoja con sugerencias de Código Agrupador (Empresa Demo C)
Archivo (fuera del repo): `C:\RESIDENCIA\PROYECTO\Cuentas_Sugerencias_CodigoAgrupador_EmpresaDemoC.csv`, con las 25 cuentas activas leídas de DEV por el MCP (solo lectura).

- Columnas: Código, Nombre, Nivel, Naturaleza, Cuenta de mayor, **Sugerido por Claude (NO es oficial)**, **Confianza** (Alta / Media / Dudosa), **Comentario** y, al final y **vacía**, "Código agrupador SAT (llenar)".
- La última columna se deja vacía a propósito: la hoja que se carga al sistema solo lee esa columna, así ninguna sugerencia se aplica sin que la contadora la revise.
- De las 25 cuentas, 24 llevan un código sugerido y 1 (Productos financieros) queda sin sugerencia; los 24 se validaron contra el catálogo oficial del SAT de `backend/src/catalogoCodigoAgrupador.js` (1,080 códigos): **todos existen**. Eso prueba que el código es válido, no que sea el correcto para la cuenta: el catálogo del repo no trae nombres, y el significado sale del conocimiento del Anexo 24, por eso se marca la confianza.
- Resumen: 10 Alta, 10 Media, 5 Dudosa. Dudosas: IVA trasladado (¿cobrado 208.01 o no cobrado 209.01?), Resultado del ejercicio (¿utilidad o pérdida?), Productos financieros (sin sugerencia; suele ir en la serie 700) y el posible **cruce** entre Gastos de administración (602 en el catálogo propio, 603 en el del SAT) y Gastos de venta (603 propio, 602 del SAT).

**Qué falta:** que la contadora corrija las sugerencias y llene la última columna; luego se carga con el flujo ya existente en Contabilidad → SAT. No se carga nada hasta entonces.

## 2. Tarea programada para que Supabase no pause DEV
`supabase-dev-mantener-activo` (en la app, sección Programadas): lunes y jueves a las 10:00 hora local ejecuta una sola consulta de **solo lectura** (`select now(), count(empresas)`) con el MCP `supabase-dev`. Si falla, solo avisa que el proyecto parece pausado.
- Limitaciones: solo corre con la app abierta (si estaba cerrada, corre al abrirla). No está demostrado que una consulta del MCP cuente como actividad para Supabase; si el proyecto se pausa igual, habrá que usar otra vía (por ejemplo, entrar al panel).
- No reanuda el proyecto ni modifica nada.
