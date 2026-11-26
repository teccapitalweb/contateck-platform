# OT-0074 · El asistente explica sus límites: órdenes de escritura y preguntas sobre otra empresa

**Rama:** `feature/OT-0074-asistente-escritura-y-otra-empresa` (sobre `integracion-local`). Sale de la revisión de roles (OT-0073).

## Qué se encontró
Con la sesión del contador y la del auditor, el asistente contable respondía bien las consultas, pero:
1. A una **orden de escritura** ("Registra una póliza de $500 por favor") contestaba el aviso genérico "No estoy seguro de qué me preguntas". No ejecutaba nada, pero no explicaba que es de consulta.
2. A una pregunta que nombra **otra empresa** ("¿Cuánto vendió la empresa TEC CAPITAL este mes?") respondía con las cifras de la empresa propia **sin aclararlo**. No filtraba datos ajenos, pero podía confundir.

## Qué se hizo (modo de reglas; `asistenteContable.js`)
- **Órdenes de escritura:** si el mensaje empieza como una orden (registra, crea, cancela, elimina, timbra, modifica, paga, cierra, importa… con prefijos como "por favor" o "quiero"), el asistente responde que es de **consulta**, dice a qué módulo ir (Contabilidad, Ventas y pagos, Facturación, Nómina o SAT y Fiscal) y sugiere preguntar cómo se hace. **No consulta datos ni escribe nada.** Los verbos que nunca son una consulta (cancelar, eliminar, timbrar, modificar…) se atienden siempre; los demás solo cuando el mensaje no se entendió como consulta, para no confundir "Genera un resumen del balance". Las **guías** ("¿Cómo registro una venta?") se respetan.
- **Otra empresa:** si la pregunta dice "la empresa X" y X no es la de la sesión, la respuesta empieza con "Aviso: solo puedo consultar los datos de **Empresa Demo C**, la empresa con la que iniciaste sesión; no tengo acceso a «X»" y sigue con las cifras propias. El nombre de la empresa propia se lee de la **sesión del usuario** (`nombreDeMiEmpresa`, solo lectura con su token, sujeto a RLS), nunca de lo que escriba en la pregunta. "Mi empresa" y el nombre propio no avisan.

## Pruebas
`backend/test-asistente.js` pasa de 27 a **29** pruebas: 7 órdenes de escritura (con módulo esperado y cero llamadas a datos), preguntas y guías que NO deben confundirse, el aviso de otra empresa y su ausencia con la propia, y que el nombre salga de la sesión y de una función de solo lectura. Con mutaciones (quitar cada aviso) las pruebas fallan.

## Límites
Solo el modo de reglas (el modo de IA sigue apagado). La detección de "otra empresa" busca la forma "empresa/compañía/negocio/grupo + Nombre propio"; si alguien nombra una empresa sin esa palabra, no avisa. No es una medida de seguridad: el aislamiento por empresa lo garantizan las reglas de la base (RLS).
