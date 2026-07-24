# CONTATECK

Panel de contabilidad, facturación (CFDI 4.0) y nómina para las consultoras aliadas de IPCI.
Proyecto de **TEC CAPITAL Group** — Tehuacán, Puebla.

## Estructura del repositorio

```
frontend/     → HTML/CSS/JS del panel (hoy Firebase Auth + Firestore, en migración a Supabase)
backend/      → Node/Express en Railway, timbrado CFDI vía Fiscalapi
database/     → schema.sql, policies.sql, seed.sql del proyecto Supabase
docs/
  engineering/  → arquitectura oficial, estándares de desarrollo
  work-orders/  → Órdenes de Trabajo (OT-0001, OT-0002, ...), una por fase del proyecto
CLAUDE/       → cómo debe trabajar Claude dentro de este proyecto
```

## Arquitectura oficial

- **Frontend:** HTML/CSS/JS vanilla, hosteado en GitHub Pages (carpeta `frontend/`).
- **Backend:** Node/Express en Railway (carpeta `backend/`).
- **Base de datos y Auth oficial:** Supabase (PostgreSQL + Supabase Auth). Ver `docs/engineering/02_Architecture.md`.
- **Firebase:** código heredado, en proceso de migración — no es la arquitectura destino.

## Equipo

Jorge (Director General) · Miguel · Miguel · Britney · Jesús · Jesús · Ricardo

## Cómo trabajar

1. Cada tarea nueva parte de una Orden de Trabajo en `docs/work-orders/`.
2. Rama por tarea: `feature/OT-00XX-descripcion-corta`.
3. Commits con el número de OT: `OT-0004: agregar cliente de Supabase Auth`.
4. Pull Request hacia `dev`. Nunca push directo a `main`.
5. `main` = lo que está en producción.

## Estado actual

Migración Firebase → Supabase en curso. Ver `docs/work-orders/OT-0003.md` para el estado del esquema de base de datos.
