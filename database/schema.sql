-- ============================================================
--  CONTATECK · schema.sql
--  OT-0003 · Ambiente: Supabase DEV únicamente
--  Basado en el modelo de datos aprobado (OT-0002, Base v1.0)
--  Orden de creación respetado según sección 10 del diseño.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. roles — catálogo, sin dependencias
-- ============================================================
create table roles (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,   -- 'director' | 'contador' | 'admin' | 'vendedor' | 'auditor'
  descripcion text
);

-- ============================================================
-- 2. empresas — sin dependencias
-- ============================================================
create table empresas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  rfc              text not null unique,
  regimen_fiscal   text not null,
  cp               text,
  csd_cer_base64   text,
  csd_key_base64   text,
  csd_password     text,
  -- Mejoras aprobadas (changelog OT-0002 §12):
  plan             text not null default 'basico',
  status           text not null default 'activo',
  timezone         text not null default 'America/Mexico_City',
  currency         text not null default 'MXN',
  country          text not null default 'MX',
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 3. perfiles — depende de auth.users, empresas, roles
-- ============================================================
create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  uuid not null references empresas(id),
  rol_id      uuid not null references roles(id),
  nombre      text,
  email       text,
  -- Mejoras aprobadas (changelog OT-0002 §12):
  last_login  timestamptz,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 4. cuentas_contables — depende de empresas
-- ============================================================
create table cuentas_contables (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  nivel       smallint not null,          -- 1 = cuenta mayor, 2 = subcuenta
  codigo      text not null,              -- código agrupador SAT, ej. "1010"
  nombre      text not null,
  naturaleza  text not null,              -- 'deudora' | 'acreedora'
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. clientes — depende de empresas
-- ============================================================
create table clientes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  nombre      text not null,
  rfc         text,
  email       text,
  uso_cfdi    text,
  cp          text,
  regimen     text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 6. productos — depende de empresas
-- ============================================================
create table productos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id),
  descripcion      text not null,
  clave_prod_serv  text,
  clave_unidad     text,
  precio_unitario  numeric(12,2),
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 7. empleados — depende de empresas
-- ============================================================
create table empleados (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  nombre      text not null,
  puesto      text,
  sueldo      numeric(12,2),
  estado      text not null default 'ok',   -- 'ok' | 'baja'
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 8. polizas — depende de empresas, cuentas_contables
-- ============================================================
create table polizas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  cuenta_id   uuid references cuentas_contables(id),   -- nullable en V1 (ver OT-0002 §9.4)
  folio       text not null,
  tipo        text not null,       -- 'Diario' | 'Ingreso' | 'Egreso'
  fecha       date not null,
  concepto    text,
  monto       numeric(14,2),
  estado      text not null default 'ok',   -- 'ok' | 'rev'
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 9. cfdis — depende de empresas, clientes (opcional), perfiles
-- ============================================================
create table cfdis (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id),
  cliente_id       uuid references clientes(id),        -- nullable, solo para reportes (ver OT-0002 §9.3)
  usuario_id       uuid references perfiles(id),
  uuid_sat         text,
  serie            text,
  folio            text,
  tipo             text,             -- 'I' | 'E' | 'P'
  total            numeric(14,2),
  subtotal         numeric(14,2),
  moneda           text not null default 'MXN',
  fecha            timestamptz,
  receptor_rfc     text,             -- snapshot legal, no referenciar a clientes para este dato
  receptor_nombre  text,             -- snapshot legal
  emisor_rfc       text,
  estatus          text not null default 'vigente',   -- 'vigente' | 'cancelado'
  relacionado_con  text,             -- UUID SAT del CFDI relacionado (nota crédito / REP)
  raw              jsonb,
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz
);

-- ============================================================
-- 10. auditoria_log — depende de empresas, perfiles (referencia
--     polimórfica a tabla_afectada/registro_id, sin FK real)
-- ============================================================
create table auditoria_log (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id),
  usuario_id       uuid references perfiles(id),
  tabla_afectada   text not null,
  registro_id      uuid,
  accion           text not null,    -- 'insert' | 'update' | 'delete'
  detalle          jsonb,
  -- Mejoras aprobadas (changelog OT-0002 §12):
  ip               inet,
  user_agent       text,
  modulo           text,             -- 'facturacion' | 'contabilidad' | 'nomina' | 'core' | 'auth'
  created_at       timestamptz not null default now()
);

-- ============================================================
--  Índices (sección 8 del diseño aprobado)
-- ============================================================

create index idx_cfdis_empresa_fecha       on cfdis (empresa_id, fecha);
create unique index idx_cfdis_uuid_sat      on cfdis (uuid_sat) where uuid_sat is not null;
create index idx_cfdis_receptor_rfc        on cfdis (receptor_rfc);

create index idx_polizas_empresa_fecha      on polizas (empresa_id, fecha);

create index idx_perfiles_empresa          on perfiles (empresa_id);

create index idx_clientes_empresa          on clientes (empresa_id);
create index idx_productos_empresa         on productos (empresa_id);
create index idx_empleados_empresa         on empleados (empresa_id);
create index idx_cuentas_contables_empresa on cuentas_contables (empresa_id);

create index idx_auditoria_empresa_fecha   on auditoria_log (empresa_id, created_at);
create index idx_auditoria_usuario         on auditoria_log (usuario_id);

-- ============================================================
--  Fin de schema.sql
-- ============================================================
