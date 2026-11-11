-- ============================================================
--  OT-0037 · Administradores de PLATAFORMA (dueño de CONTATECK)
--
--  No es un rol de empresa: no vive en `perfiles` ni en `roles`. Es una lista
--  aparte de cuentas que pueden revisar TODAS las empresas desde admin.html.
--
--  Seguridad:
--   * RLS activado y SIN políticas: ningún usuario (anon / authenticated) puede
--     leer ni escribir esta tabla desde el navegador. Solo el backend, con la
--     service role, la consulta (supabasePlataforma.js).
--   * El navegador nunca decide quién es administrador: el backend lo valida en
--     cada llamada a /api/plataforma/*.
--
--  Cómo correrlo: SQL Editor de Supabase (proyecto DEV), pegar y ejecutar.
--  Es idempotente (se puede correr más de una vez).
--
--  Revertir:  drop table administradores_plataforma;
-- ============================================================

create table if not exists administradores_plataforma (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nivel      text not null default 'dueno' check (nivel in ('dueno', 'soporte')),
  created_at timestamptz not null default now()
);

alter table administradores_plataforma enable row level security;
revoke all on administradores_plataforma from anon, authenticated;
-- (sin "create policy": con RLS activado y sin políticas nadie la ve desde el cliente)

-- Alta del dueño de la plataforma (el correo ya existe en Authentication → Users).
insert into administradores_plataforma (user_id, nivel)
select id, 'dueno'
from auth.users
where lower(email) = 'teccapitalweb@gmail.com'
on conflict (user_id) do nothing;

-- Comprobación: debe regresar 1 fila con tu correo.
select a.nivel, u.email, a.created_at
from administradores_plataforma a
join auth.users u on u.id = a.user_id;
