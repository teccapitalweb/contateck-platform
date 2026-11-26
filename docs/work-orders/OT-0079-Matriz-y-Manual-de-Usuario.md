# OT-0079 · Matriz del cronograma al día y manual breve de usuario

**Rama:** `feature/OT-0079-matriz-y-manual` (sobre `integracion-local`). Solo documentación; no cambia código.

## Qué se hizo
- **`docs/informe/Matriz-Cronograma-vs-Plataforma.md` puesta al día (26-nov-2026):** los roles rh y vendedor ya se probaron en pantalla (antes decía que no), el asistente tiene memoria corta y corrige faltas (antes decía "sin contexto") y ahora avisa de sus límites (OT-0075), la base ya valida el cierre de periodo en `crear_nomina` (en DEV), y los pendientes de seguridad quedan claros (`cfdis_proveedor`, lectura amplia, SQL por aplicar en producción). Los **números del repositorio se volvieron a medir**: 301 commits, 26 tablas con RLS y 58 políticas, 29 funciones `SECURITY DEFINER`, 99 rutas HTTP, 45 scripts SQL, 64 órdenes de trabajo documentadas.
- **`docs/informe/Manual-de-Usuario.md` (nuevo):** manual breve por rol con los nombres reales de los botones, a partir de las guías del asistente (que están verificadas contra las etiquetas y los roles reales del sistema) y de lo probado en pantalla. Incluye mensajes frecuentes y lo que el sistema todavía no hace.
- El índice del informe (`docs/informe/README.md`) lista el manual.

## Límites
El manual no lleva capturas (las toma la persona responsable). Las partes marcadas como "no probado" (apertura del CSV en Excel; invitación a una segunda empresa con datos reales) se dejaron como tales. Los conteos de rutas salen de una búsqueda en el código.
