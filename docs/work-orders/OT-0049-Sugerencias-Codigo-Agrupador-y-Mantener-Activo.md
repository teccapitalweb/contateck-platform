# OT-0049 · Sugerencias de Código Agrupador y tarea para mantener activo el proyecto DEV

Trabajo preparatorio mientras la contadora no responde. **No cambia código de la app ni la base de datos.**

## 1. Hoja con sugerencias de Código Agrupador (Empresa Demo C)
Archivo (fuera del repo): `C:\RESIDENCIA\PROYECTO\Cuentas_Sugerencias_CodigoAgrupador_EmpresaDemoC.csv`, con las 25 cuentas activas leídas de DEV por el MCP (solo lectura).

- Columnas: Código, Nombre, Nivel, Naturaleza, Cuenta de mayor, **Sugerido por Claude (NO es oficial)**, **Confianza** (Alta / Media / Dudosa), **Comentario** y, al final y **vacía**, "Código agrupador SAT (llenar)".
- La última columna se deja vacía a propósito: la hoja que se carga al sistema solo lee esa columna, así ninguna sugerencia se aplica sin que la contadora la revise.
- De las 25 cuentas, 24 llevan un código sugerido y 1 (Productos financieros) queda sin sugerencia; los 24 se validaron contra el catálogo oficial del SAT de `backend/src/catalogoCodigoAgrupador.js` (1,080 códigos): **todos existen**. Eso prueba que el código es válido, no que sea el correcto para la cuenta: el catálogo del repo no trae nombres, y el significado sale del conocimiento del Anexo 24, por eso se marca la confianza.
- Resumen: 10 Alta, 10 Media, 5 Dudosa. Dudosas: IVA trasladado (¿cobrado 208.01 o no cobrado 209.01?), Resultado del ejercicio (¿utilidad o pérdida?), Productos financieros (sin sugerencia; suele ir en la serie 700) y el posible **cruce** entre Gastos de administración (602 en el catálogo propio, 603 en el del SAT) y Gastos de venta (603 propio, 602 del SAT).

**Qué falta:** que la contadora corrija las sugerencias y llene la última columna; luego se carga con el flujo ya existente en Contabilidad → SAT. No se carga nada hasta entonces.

### Verificación contra el Anexo 24 oficial (25-nov-2026)
El usuario descargó del SAT el **Anexo 24 de la RMF 2026** (`Anexo_24_RMF2026-13012026.pdf`, 37 páginas) y se leyó su texto para contrastar cada sugerencia con el **nombre oficial** del código. (El "Anexo Técnico de Contabilidad Electrónica 1.3" no sirve para esto: es la guía del XML y no trae nombres.)
- Se leyeron 1,061 códigos con nombre; de los 1,080 del catálogo del repo, 19 no se pudieron leer por cortes de línea del PDF (por ejemplo "2 10.04" por "210.04"). Ningún código leído del Anexo falta en el repo.
- La hoja se regeneró con una columna nueva, "Nombre oficial de ese código (Anexo 24 RMF 2026)", y la última columna sigue vacía.
- Correcciones que salieron de la verificación: **205.01 era un error** (es "Socios, accionistas o representante legal"; el correcto es 205.02 "Acreedores diversos a corto plazo nacional"); **603.01 era un error** (es "Sueldos y salarios"; se sugiere 603, "Gastos de administración"); los productos financieros van en **702** (sugerido 702.04 "Intereses a favor bancarios nacional"); y el **cruce 602/603 quedó confirmado**.
- Resultado: 12 Alta, 12 Media y 1 Dudosa (IVA trasladado: cobrado 208.01 o no cobrado 209.01, depende de cómo lleven el IVA).

**Qué sigue siendo criterio contable:** qué subcódigo corresponde a cada cuenta (por ejemplo IVA pagado o pendiente, capital fijo o variable). Eso lo confirma quien lleve la contabilidad de cada empresa.

## 2. Tarea programada para que Supabase no pause DEV
`supabase-dev-mantener-activo` (en la app, sección Programadas): lunes y jueves a las 10:00 hora local ejecuta una sola consulta de **solo lectura** (`select now(), count(empresas)`) con el MCP `supabase-dev`. Si falla, solo avisa que el proyecto parece pausado.
- Limitaciones: solo corre con la app abierta (si estaba cerrada, corre al abrirla). No está demostrado que una consulta del MCP cuente como actividad para Supabase; si el proyecto se pausa igual, habrá que usar otra vía (por ejemplo, entrar al panel).
- No reanuda el proyecto ni modifica nada.

## 3. Carga en Empresa Demo C (25-nov-2026)
Con el director de Empresa Demo C en el visor se llamó a `PUT /api/fiscal/codigos-agrupador` (la misma ruta que usa Contabilidad → SAT → "Cargar códigos agrupador") con las 25 cuentas activas y los códigos de la hoja verificada. Antes se validó el contenido con `validarCodigosAgrupador` de la propia app: sin errores.
- Respuesta: `ok`, **25 actualizadas, 0 no encontradas**.
- Base de datos (lectura por el MCP): Empresa Demo C pasó de 0 a **25 cuentas activas con código** (las 4 dadas de baja siguen sin él); las otras tres empresas de DEV siguen con **0**. Los valores guardados coinciden con la hoja.
- Pantalla (tras recargar, director): Contabilidad ve los 25 códigos y el bloque SAT dice **"Código Agrupador SAT: 25 de 25 cuentas con código asignado"**.
- Es reversible: basta volver a dejar la columna vacía con la misma ruta.

**Dato de prueba, no definitivo:** las cuentas dudosas llevan la sugerencia, entre ellas IVA trasladado = `208.01` (IVA cobrado). En una empresa real lo debe confirmar quien lleve su contabilidad.

**No verificado:** la descarga real del XML del catálogo desde la pantalla (no se descargó ningún archivo); sí está cubierto por la prueba automática de `xmlCatalogoSAT` (usa el Código Agrupador si existe).
