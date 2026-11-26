# Guion de demostración y lista de capturas

Sirve para dos cosas: **presentar** el sistema (unos 12 a 15 minutos) y **juntar las capturas** que necesita el informe técnico. Cada captura tiene un número y un nombre de archivo sugerido para ir armándolas en orden.

**Cómo capturar (Windows):** `Win + Shift + S`, selecciona el área y pega en Paint o guarda el recorte. Guarda todo en una carpeta (por ejemplo `C:\RESIDENCIA\PROYECTO\capturas\`) con el nombre sugerido. Tip: usa el modo claro u oscuro siempre el mismo, y cierra el navegador a pantalla completa para que se vea todo el panel.
**Datos:** todas las capturas son de **Empresa Demo C** (datos de prueba). Evita mostrar correos de personas reales.

## 0. Antes de empezar (5 minutos)
1. Arranca el backend (`npm start` en `backend/`) y sirve el `frontend/` (por ejemplo con Live Server). Comprueba que el proyecto de Supabase no esté pausado.
2. **Procesa una nómina en Empresa Demo C** (Nómina → Calcular → aprobar) para que el historial tenga una y se vean los **Recibos** (hoy el historial está vacío). Es un dato de prueba.
3. Ten a mano las cuentas de **director**, **contador**, **auditor** y, si ya las creaste, **rh** y **vendedor** (ver `Pasos-para-crear-las-cuentas-rh-y-vendedor` al final de este documento).
4. Abre en otra pestaña `docs/informe/diagramas/` por si quieres enseñar la arquitectura.

## 1. Guion de la demostración

| # | Qué hacer | Qué decir |
|---|---|---|
| 1 | **Inicio de sesión** como director. Muestra el correo, la contraseña y "Crear una aquí". | Autenticación con Supabase; cada empresa ve solo lo suyo (multiempresa). |
| 2 | **Dashboard**: tarjetas del mes, alertas, Balance General, composición de gastos, obligaciones. Pulsa una alerta. | Las cifras salen de las pólizas reales; las alertas llevan a donde se resuelven (CFDI sin póliza, pagos sobre facturas sin contabilizar). |
| 3 | **Contabilidad**: catálogo de cuentas, una póliza (partidas Debe = Haber), libro mayor, balanza, estados financieros, periodos. | Partida doble validada en la base; las pólizas no se borran, se anulan o se corrigen. |
| 4 | **Captura rápida → Venta → Importar desde factura timbrada.** | Así una factura se contabiliza (póliza de causación). |
| 5 | **Ventas**: lista, detalle, estados (pendiente, en revisión, confirmado). | Quien registra no valida: separación de funciones. |
| 6 | **Facturación**: lista de CFDI, "Timbrar CFDI", PDF/XML, "Me pagó un cliente". | Timbrado con un proveedor autorizado (Fiscalapi, ambiente de pruebas). |
| 7 | **Cuentas por pagar** (Contabilidad): facturas de proveedor y pagos. | Mismo flujo de registro y confirmación que los cobros. |
| 8 | **Nómina**: empleados (con sus datos fiscales), "Calcular", historial con **"Recibos"** y **"Timbrar"**, detalle con UUID y XML, Simulador fiscal. | El cálculo de ISR e IMSS funciona; cada nómina genera recibos y se puede timbrar el CFDI de nómina **en el ambiente de pruebas** del proveedor (OT-0064). Requiere aplicar el SQL OT-0064 y capturar los datos fiscales de los empleados. |
| 9 | **SAT y Fiscal**: calendario, declaraciones, documentos, DIOT, IVA, "Descargar XML Catálogo" y "Balanza". | XML generado según el esquema oficial del SAT y validado con un validador XSD. |
| 10 | **Asistente contable**: pregunta "¿Cómo va el Balance General?", "¿Cuánto hay en bancos y caja?", "¿Cómo va el IVA este año?", "¿y el año pasado?", "¿Qué es una póliza?", "¿Cómo registro una venta?", "¿Eres una IA?". | Responde con los datos reales y explica lo básico; **no es IA** y no cuesta por consulta; la IA queda preparada y apagada. |
| 11 | **Equipo**: invitaciones y roles. | 6 roles; el rol define qué se puede hacer dentro de la empresa. |
| 12 | **Cambia de rol**: entra como **contador** (menos botones), **auditor** (ningún botón de escritura) y, si están, **rh** y **vendedor**. | Control de acceso en pantalla, en el servidor y en la base de datos. |
| 13 | **Seguridad y pruebas**: abre `npm run test:ci` y deja que termine (16 suites, 208 pruebas). | Pruebas automáticas sin red ni llaves; cada cambio tiene su orden de trabajo. |
| 14 | **Alcance y límites**: enseña los indicadores fiscales del Dashboard y la lista de límites. | Qué queda para el equipo: timbrado de nómina con un emisor real (hoy solo pruebas), ISR provisional exacto, conexión con IA real y la validación contable de los criterios fiscales. |

## 2. Lista de capturas para el informe

### A. Acceso y estructura
| Archivo | Qué mostrar |
|---|---|
| `01-login.png` | Pantalla de inicio de sesión |
| `02-dashboard-director.png` | Dashboard completo con el rol director |
| `03-dashboard-alertas.png` | Zona de alertas (CFDI sin póliza y pagos sin causación) |
| `04-menu-roles.png` | Menú lateral con el nombre y rol abajo a la izquierda |
| `05-equipo-invitaciones.png` | Pantalla Equipo con las invitaciones |

### B. Contabilidad
| Archivo | Qué mostrar |
|---|---|
| `06-contabilidad-catalogo.png` | Catálogo de cuentas |
| `07-contabilidad-polizas.png` | Lista de pólizas |
| `08-contabilidad-poliza-detalle.png` | Detalle de una póliza (partidas Debe y Haber) |
| `09-contabilidad-mayor.png` | Libro Mayor de una cuenta |
| `10-contabilidad-balanza.png` | Balanza de comprobación (cuadrada) |
| `11-contabilidad-estados.png` | Estados financieros |
| `12-contabilidad-periodos.png` | Periodos y cierre |
| `13-contabilidad-configuracion.png` | Configuración contable (cuentas por rol) |
| `14-captura-rapida-importar.png` | Captura rápida → Venta → Importar desde factura timbrada |

### C. Ventas, facturación y pagos
| Archivo | Qué mostrar |
|---|---|
| `15-ventas-lista.png` | Lista de ventas con sus estados |
| `16-ventas-detalle.png` | Detalle de una venta |
| `17-facturacion-lista.png` | Lista de CFDI |
| `18-facturacion-timbrar.png` | Formulario "Timbrar CFDI" |
| `19-cobro-me-pago-un-cliente.png` | "Me pagó un cliente" |
| `20-cuentas-por-pagar.png` | Cuentas por Pagar |

### D. Nómina
| Archivo | Qué mostrar |
|---|---|
| `21-nomina-empleados.png` | Empleados y resumen del periodo |
| `22-nomina-calcular.png` | Cálculo de nómina (ISR e IMSS) |
| `23-nomina-simulador.png` | Simulador fiscal |
| `24-nomina-recibos.png` | Historial de nóminas con el botón "Recibos" y la vista previa de impresión del recibo |

### E. SAT y Fiscal
| Archivo | Qué mostrar |
|---|---|
| `25-sat-calendario.png` | Calendario, obligaciones y declaraciones |
| `26-sat-documentos.png` | Documentos fiscales y vigencias |
| `27-sat-xml-diot-iva.png` | Bloque de XML, DIOT y determinación de IVA |
| `28-sat-codigo-agrupador.png` | "25 de 25 cuentas con código asignado" |
| `29-xml-catalogo.png` | El XML del catálogo abierto en un editor |

### F. Asistente
| Archivo | Qué mostrar |
|---|---|
| `30-asistente-saludo.png` | Saludo con las sugerencias (dice que no es IA) |
| `31-asistente-balance.png` | Respuesta sobre el Balance General |
| `32-asistente-iva-memoria.png` | "¿Cómo va el IVA este año?" y "¿y el año pasado?" |
| `33-asistente-concepto.png` | "¿Qué es una póliza?" |
| `34-asistente-guia.png` | "¿Cómo registro una venta?" |

### G. Roles
| Archivo | Qué mostrar |
|---|---|
| `35-rol-contador.png` | Dashboard o Contabilidad con el rol contador |
| `36-rol-auditor.png` | Contabilidad con el auditor: sin botones de escritura |
| `37-rol-auditor-sat.png` | SAT y Fiscal con el auditor |
| `38-rol-rh-nomina.png` | Nómina con el rol rh |
| `39-rol-vendedor-ventas.png` | Ventas con el rol vendedor |

### H. Seguridad, pruebas y documentación
| Archivo | Qué mostrar |
|---|---|
| `40-pruebas-ci.png` | Terminal con `npm run test:ci` terminado (16 suites, 208 pruebas) |
| `41-diagrama-er.png` | Diagrama entidad-relación (exportado desde mermaid.live) |
| `42-diagrama-arquitectura.png` | Diagrama de arquitectura |
| `43-diagrama-flujo-cobro.png` | Flujo de la factura al cobro |
| `44-ordenes-de-trabajo.png` | Carpeta `docs/work-orders` con las órdenes de trabajo |
| `45-supabase-rls.png` | Panel de Supabase con las tablas y RLS activo (opcional) |

### I. Dashboard: exportar e indicadores
| Archivo | Qué mostrar |
|---|---|
| `46-dashboard-indicadores-fiscales.png` | Tarjeta "Indicadores fiscales" con el IVA del mes y el ISR estimado |
| `47-dashboard-exportar.png` | Botones Exportar (Excel) e Imprimir / PDF, y el CSV abierto en Excel |

**Total:** 47 capturas (algunas, como `26-sat-documentos.png`, son opcionales). Para el informe bastan unas 25 buenas; las demás sirven para la presentación.

## 3. Preguntas que te pueden hacer (y la respuesta honesta)
- **¿Usa inteligencia artificial?** No: es un asistente por reglas. La conexión con un modelo de IA ya está construida y apagada, para activarla más adelante con una llave.
- **¿La nómina se timbra?** Sí, en el **ambiente de pruebas** del proveedor: cada empleado genera su CFDI de nómina 1.2 (se probaron dos, con y sin subsidio, y el proveedor los aceptó). Con un emisor real falta validar con un contador los criterios fiscales (partidas, tratamiento del subsidio), tener CSD y registro patronal reales y los datos fiscales de cada empleado. Detalle en la OT-0064.
- **¿Los cálculos fiscales los validó un contador?** El IVA y la utilidad son cifras de referencia; el Código Agrupador se verificó contra el Anexo 24 oficial; los criterios por empresa deben validarse con un contador.
- **¿Está en producción?** No: está en el ambiente de desarrollo (Supabase `contateck-dev`). Hay una lista de lo necesario para producción en la guía de operación.
- **¿Cómo sabes que funciona?** 208 pruebas automáticas, una prueba manual con tres roles y la comparación del esquema real con el documentado.

## 4. Pasos para crear las cuentas rh y vendedor (para probar y capturar)
1. Entra como **director** → menú **Equipo** → botón de nueva invitación.
2. Crea una invitación con rol **rh** (por ejemplo `demo.rh@contateck.mx`) y otra con rol **vendedor** (`demo.vendedor@contateck.mx`).
3. Cierra sesión. En el inicio de sesión pulsa **"Crear una aquí"**, usa **el mismo correo** de la invitación y la contraseña que tú elijas (anótala en un lugar seguro; yo no la escribo ni la veo).
4. Entra al panel: debe quedar dentro de Empresa Demo C con el rol invitado.
5. Avísame cuando una de las dos esté lista y reviso sus pantallas en solo lectura.
