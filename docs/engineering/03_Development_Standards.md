# CONTATECK
## Documento de Ingeniería
### 03 - Development Standards

**Versión:** 1.0.0

**Estado:** Oficial

**Última actualización:** Julio 2026

---

# 1. Objetivo

Este documento establece los estándares oficiales de desarrollo para CONTATECK.

Todo desarrollador, humano o asistido por Inteligencia Artificial, deberá respetar estas reglas antes de modificar el código del proyecto.

---

# 2. Filosofía de Desarrollo

CONTATECK no se desarrolla mediante reconstrucciones completas.

Cada nueva funcionalidad deberá integrarse sobre la base existente.

La prioridad siempre será:

1. Comprender.
2. Reutilizar.
3. Mejorar.
4. Documentar.
5. Implementar.

---

# 3. Principios de Ingeniería

Todo desarrollo deberá cumplir los siguientes principios:

- Código limpio.
- Modularidad.
- Reutilización.
- Simplicidad.
- Escalabilidad.
- Seguridad.
- Mantenibilidad.
- Bajo acoplamiento.
- Alta cohesión.

---

# 4. Antes de Programar

Antes de escribir código es obligatorio:

- Comprender el requerimiento.
- Analizar el código existente.
- Buscar componentes reutilizables.
- Revisar dependencias.
- Validar impacto sobre otros módulos.

Nunca desarrollar sin comprender completamente el contexto.

---

# 5. Reutilización

Antes de crear un nuevo archivo deberá verificarse si existe uno con funcionalidad similar.

Se prohíbe duplicar código cuando pueda reutilizarse.

Siempre deberá priorizarse:

- Funciones existentes.
- Componentes existentes.
- Utilidades existentes.
- Servicios existentes.

---

# 6. Organización del Código

Cada archivo deberá tener una única responsabilidad.

Evitar archivos excesivamente grandes.

Cuando un archivo crezca demasiado deberá dividirse en módulos.

---

# 7. Convenciones de Nombres

Archivos:

login.js

dashboard.js

user-service.js

profile-controller.js

Variables:

camelCase

Funciones:

camelCase

Clases:

PascalCase

Constantes:

UPPER_SNAKE_CASE

---

# 8. Comentarios

Los comentarios deberán explicar el propósito del código.

No deberán describir lo evidente.

Incorrecto:

// Incrementa i

Correcto:

// Calcula el siguiente folio disponible para la empresa.

---

# 9. Seguridad

Nunca:

- Exponer credenciales.
- Hardcodear tokens.
- Desactivar validaciones.
- Ignorar errores.

Toda validación crítica deberá realizarse también en el Backend.

---

# 10. Manejo de Errores

Todo proceso deberá contemplar:

- Validaciones.
- Manejo de excepciones.
- Mensajes claros.
- Registro de errores.

Nunca ocultar errores silenciosamente.

---

# 11. Base de Datos

Toda modificación deberá:

- Respetar PostgreSQL.
- Mantener integridad referencial.
- Evitar consultas innecesarias.
- Utilizar índices cuando sea necesario.

---

# 12. Supabase

Supabase constituye la plataforma oficial.

Toda nueva funcionalidad deberá utilizar:

- Supabase Auth.
- PostgreSQL.
- Edge Functions.
- Storage.

Firebase únicamente será considerado código heredado.

---

# 13. Frontend

El Frontend será responsable únicamente de:

- Interfaz.
- Navegación.
- Validaciones básicas.
- Experiencia del usuario.

Nunca deberá contener lógica crítica de negocio.

---

# 14. Backend

Toda lógica importante deberá implementarse mediante Supabase.

Ejemplos:

- Permisos.
- Reglas.
- Procesamiento.
- Auditoría.
- Seguridad.

---

# 15. Calidad

Todo cambio deberá cumplir:

- Sin errores de sintaxis.
- Sin código muerto.
- Sin dependencias innecesarias.
- Sin duplicidad.
- Compatible con el resto del sistema.

---

# 16. Documentación

Toda modificación importante deberá registrarse.

Las decisiones arquitectónicas deberán quedar documentadas.

Las Órdenes de Trabajo deberán actualizarse cuando corresponda.

---

# 17. Revisión de Código

Antes de dar por finalizada una implementación deberá verificarse:

- ¿Respeta la arquitectura?
- ¿Reutiliza código existente?
- ¿Es escalable?
- ¿Es mantenible?
- ¿Es segura?
- ¿Cumple el objetivo solicitado?

---

# 18. Regla Fundamental

Antes de crear algo nuevo, analizar si ya existe.

Antes de modificar, comprender.

Antes de eliminar, verificar impacto.

Antes de integrar, probar.

---

# 19. Definición de "Trabajo Terminado"

Una funcionalidad se considera terminada únicamente cuando:

- Cumple el requerimiento.
- No rompe funcionalidades existentes.
- Respeta la arquitectura.
- Sigue los estándares definidos.
- Puede mantenerse fácilmente.
- Está lista para integrarse al proyecto.

---

# 20. Declaración Final

Este documento define los estándares oficiales de desarrollo para CONTATECK.

Toda implementación futura deberá respetar estas reglas.

El incumplimiento de estos estándares deberá considerarse una desviación de la arquitectura oficial del proyecto.