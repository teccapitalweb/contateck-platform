-- ============================================================
--  CONTATECK · OT-0038 · Fase 3 · Esquema REAL de DEV (contateck-dev) exportado al repo
--
--  *** DOCUMENTACIÓN. NO SE APLICA. NO ES UNA MIGRACIÓN. ***
--
--  Qué es: la estructura que existe en la base de DEV y que no estaba en `database/`, reconstruida a partir de
--  la consulta de solo lectura `OT-0038-introspeccion-esquema.sql` (information_schema, pg_constraint,
--  pg_indexes y pg_get_functiondef), corrida por el usuario en el SQL Editor de DEV el 2026-11-13.
--  Cubre: invitaciones, nominas, nomina_detalle, obligaciones_fiscales, declaraciones, documentos_fiscales,
--  periodos_contables, y las funciones crear_nomina, periodo_esta_cerrado, siguiente_folio_pago,
--  siguiente_folio_pago_proveedor y set_updated_at.
--
--  Para qué sirve: auditar, y tener de dónde partir si hay que rehacer la base de DEV en otra máquina.
--
--  Qué NO trae (queda fuera de esta consulta):
--    · Políticas RLS: están en `policies.sql` (las anteriores) y en el resultado de la introspección
--      `OT-0038-introspeccion-rls.sql`, documentado en la OT-0038.
--    · Triggers: los de endurecimiento están en `OT-0038-endurecimiento-seguridad.sql`. Esta consulta no los
--      listó; si estas tablas tienen alguno propio (por ejemplo `set_updated_at` en declaraciones y
--      obligaciones_fiscales, que es lo esperado por la función), no está confirmado aquí.
--    · RLS habilitado/forzado, permisos (GRANT) y comentarios de las tablas.
--    · El nombre de la política o trigger de Storage del bucket `documentos`.
--
--  Cómo se reconstruyó: las columnas, tipos, `NOT NULL` y `DEFAULT` salen tal cual de information_schema; las
--  restricciones salen de pg_get_constraintdef. Los `CREATE TABLE` de abajo son una reescritura legible, no el
--  DDL original. El orden de las columnas es el de `ordinal_position`.
-- ============================================================


-- ============================================================
-- 1. TABLAS
--    Las referencias a `empresas`, `perfiles`, `roles` y `empleados` apuntan a tablas que sí están en schema.sql
--    y addendum_empleados.sql.
-- ============================================================

-- ---- periodos_contables  (cierre de periodos; OT-0026) ----
create table public.periodos_contables (
  id          uuid        not null default gen_random_uuid(),
  empresa_id  uuid        not null,
  anio        integer     not null,
  mes         integer     not null,
  estado      text        not null default 'abierto',
  cerrado_por uuid,
  cerrado_en  timestamptz,
  created_at  timestamptz not null default now(),
  constraint periodos_contables_pkey primary key (id),
  constraint periodos_contables_empresa_id_fkey  foreign key (empresa_id)  references empresas(id),
  constraint periodos_contables_cerrado_por_fkey foreign key (cerrado_por) references perfiles(id),
  constraint periodos_contables_empresa_id_anio_mes_key unique (empresa_id, anio, mes),
  constraint periodos_contables_estado_check check (estado = any (array['abierto'::text, 'cerrado'::text])),
  constraint periodos_contables_mes_check    check (mes >= 1 and mes <= 12)
);
create index idx_periodos_contables_empresa on public.periodos_contables using btree (empresa_id, anio, mes);
-- (el índice único periodos_contables_empresa_id_anio_mes_key lo crea la restricción UNIQUE de arriba)


-- ---- nominas  (encabezado de cada nómina pagada; OT-0027 y anteriores) ----
create table public.nominas (
  id                 uuid          not null default gen_random_uuid(),
  empresa_id         uuid          not null,
  periodicidad       text          not null,
  fecha_inicio       date          not null,
  fecha_fin          date          not null,
  dias               integer       not null,
  total_percepciones numeric       not null default 0,
  total_deducciones  numeric       not null default 0,
  total_neto         numeric       not null default 0,
  empleados_pagados  integer       not null default 0,
  estado             text          not null default 'pagada',
  created_by         uuid,
  created_at         timestamptz   not null default now(),
  constraint nominas_pkey primary key (id)
  -- OJO: en DEV `nominas` NO tiene llave foránea a empresas(id) ni a perfiles(id), ni CHECK en periodicidad,
  -- estado, fechas o días. Ver "Observaciones" al final.
);
create index nominas_empresa_fecha_idx on public.nominas using btree (empresa_id, fecha_inicio);


-- ---- nomina_detalle  (un renglón por empleado, "foto" del momento del pago) ----
create table public.nomina_detalle (
  id                 uuid    not null default gen_random_uuid(),
  nomina_id          uuid    not null,
  empresa_id         uuid    not null,
  empleado_id        uuid,
  nombre             text    not null,
  puesto             text,
  salario_diario     numeric,
  sueldo_base        numeric not null default 0,
  otras_percepciones numeric not null default 0,
  deducciones        numeric not null default 0,
  neto               numeric not null default 0,
  notas              text,
  constraint nomina_detalle_pkey primary key (id),
  constraint nomina_detalle_nomina_id_fkey   foreign key (nomina_id)   references nominas(id) on delete cascade,
  constraint nomina_detalle_empleado_id_fkey foreign key (empleado_id) references empleados(id)
  -- OJO: tampoco tiene llave foránea de empresa_id a empresas(id).
);
create index nomina_detalle_nomina_idx on public.nomina_detalle using btree (nomina_id);


-- ---- invitaciones  (alta de miembros del equipo; OT-0034) ----
create table public.invitaciones (
  id           uuid        not null default gen_random_uuid(),
  empresa_id   uuid        not null,
  correo       text        not null,
  rol_id       uuid        not null,
  estado       text        not null default 'pendiente',
  token        uuid        not null default gen_random_uuid(),
  invitado_por uuid,
  created_at   timestamptz not null default now(),
  expira_en    timestamptz not null default (now() + '7 days'::interval),
  aceptada_en  timestamptz,
  constraint invitaciones_pkey primary key (id),
  constraint invitaciones_empresa_id_fkey   foreign key (empresa_id)   references empresas(id),
  constraint invitaciones_invitado_por_fkey foreign key (invitado_por) references perfiles(id),
  constraint invitaciones_rol_id_fkey       foreign key (rol_id)       references roles(id)
  -- OJO: sin CHECK en `estado` y sin índice único en `token`.
);
create index idx_invitaciones_correo  on public.invitaciones using btree (correo, estado);
create index idx_invitaciones_empresa on public.invitaciones using btree (empresa_id);
-- Una sola invitación pendiente por correo y empresa:
create unique index idx_invitaciones_pendiente_unica on public.invitaciones using btree (empresa_id, correo)
  where (estado = 'pendiente'::text);


-- ---- obligaciones_fiscales  (calendario fiscal de cada empresa; OT-0031) ----
create table public.obligaciones_fiscales (
  id           uuid        not null default gen_random_uuid(),
  empresa_id   uuid        not null,
  nombre       text        not null,
  periodicidad text        not null,
  dia_limite   smallint    not null,
  mes_limite   smallint,
  activa       boolean     not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint obligaciones_fiscales_pkey primary key (id),
  constraint obligaciones_fiscales_empresa_id_fkey foreign key (empresa_id) references empresas(id),
  constraint obligaciones_fiscales_created_by_fkey foreign key (created_by) references perfiles(id)
  -- OJO: sin CHECK en periodicidad, dia_limite (1–31) ni mes_limite (1–12).
);
create index idx_obligaciones_empresa on public.obligaciones_fiscales using btree (empresa_id);


-- ---- declaraciones  (cada presentación de una obligación; OT-0031 / 0031c) ----
create table public.declaraciones (
  id                 uuid        not null default gen_random_uuid(),
  empresa_id         uuid        not null,
  obligacion_id      uuid        not null,
  periodo            text        not null,
  fecha_vencimiento  date        not null,
  fecha_presentacion date,
  folio_acuse        text,
  documento_path     text,
  estado             text        not null default 'pendiente',
  presentado_por     uuid,
  notas              text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint declaraciones_pkey primary key (id),
  constraint declaraciones_empresa_id_fkey     foreign key (empresa_id)     references empresas(id),
  constraint declaraciones_obligacion_id_fkey  foreign key (obligacion_id)  references obligaciones_fiscales(id),
  constraint declaraciones_presentado_por_fkey foreign key (presentado_por) references perfiles(id),
  constraint declaraciones_created_by_fkey     foreign key (created_by)     references perfiles(id)
  -- OJO: sin índice ni restricción única (obligacion_id, periodo): los duplicados los evita solo la app (OT-0031).
);
create index idx_declaraciones_empresa    on public.declaraciones using btree (empresa_id, estado);
create index idx_declaraciones_obligacion on public.declaraciones using btree (obligacion_id);


-- ---- documentos_fiscales  (archivos fiscales de la empresa; sin filas en DEV al 2026-11-13) ----
create table public.documentos_fiscales (
  id              uuid        not null default gen_random_uuid(),
  empresa_id      uuid        not null,
  tipo            text        not null,
  nombre          text        not null,
  documento_path  text        not null,
  fecha_documento date,
  vigencia_hasta  date,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint documentos_fiscales_pkey primary key (id),
  constraint documentos_fiscales_empresa_id_fkey foreign key (empresa_id) references empresas(id),
  constraint documentos_fiscales_created_by_fkey foreign key (created_by) references perfiles(id)
);
create index idx_documentos_fiscales_empresa on public.documentos_fiscales using btree (empresa_id);


-- ============================================================
-- 2. FUNCIONES  (cuerpo tal como las devuelve pg_get_functiondef en DEV)
--    Las cuatro de folio y periodo ya traen la comprobación de empresa del endurecimiento (OT-0038 fase 4).
-- ============================================================

-- set_updated_at: disparador genérico para columnas updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


-- periodo_esta_cerrado: ¿el mes de esa fecha está cerrado? (sin registro = abierto)
CREATE OR REPLACE FUNCTION public.periodo_esta_cerrado(p_empresa_id uuid, p_fecha date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  return coalesce(
    (select estado = 'cerrado' from periodos_contables
      where empresa_id = p_empresa_id
        and anio = extract(year from p_fecha)::int
        and mes  = extract(month from p_fecha)::int),
    false  -- sin registro = abierto
  );
end;
$function$;


-- siguiente_folio_pago: folio P-00001 de cobros a clientes (contador atómico en folios_contador).
CREATE OR REPLACE FUNCTION public.siguiente_folio_pago(p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_numero integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'P', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'P-' || lpad(v_numero::text, 5, '0');
end;
$function$;


-- siguiente_folio_pago_proveedor: folio PP-00001 de pagos a proveedores.
CREATE OR REPLACE FUNCTION public.siguiente_folio_pago_proveedor(p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_numero integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_empresa_id is distinct from auth_empresa_id() then
    raise exception 'Empresa no válida.';
  end if;
  insert into folios_contador (empresa_id, tipo, ultimo_numero)
  values (p_empresa_id, 'PP', 1)
  on conflict (empresa_id, tipo)
  do update set ultimo_numero = folios_contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;
  return 'PP-' || lpad(v_numero::text, 5, '0');
end;
$function$;


-- crear_nomina: guarda una nómina pagada (encabezado + detalle por empleado) con totales recalculados en el servidor.
CREATE OR REPLACE FUNCTION public.crear_nomina(p_periodicidad text, p_fecha_inicio date, p_fecha_fin date, p_dias integer, p_detalle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id  uuid;
  v_nomina_id   uuid;
  v_item        jsonb;
  v_tot_perc    numeric(14,2) := 0;
  v_tot_ded     numeric(14,2) := 0;
  v_tot_neto    numeric(14,2) := 0;
  v_conteo      integer := 0;
  v_base        numeric(12,2);
  v_extras      numeric(12,2);
  v_ded         numeric(12,2);
  v_neto        numeric(12,2);
begin
  -- Empresa del usuario (mismo patrón que crear_poliza_completa).
  select empresa_id into v_empresa_id from perfiles where id = auth.uid();
  if v_empresa_id is null then
    raise exception 'No se encontró tu perfil/empresa.';
  end if;

  -- Solo quien gestiona nómina (mismos roles que dan de alta empleados
  -- y que la política INSERT de la tabla ya exige).
  if auth_rol() not in ('rh', 'admin', 'director') then
    raise exception 'No tienes permiso para procesar nómina.';
  end if;

  if p_detalle is null or jsonb_array_length(p_detalle) = 0 then
    raise exception 'La nómina no tiene empleados que pagar.';
  end if;

  -- Totales calculados EN EL SERVIDOR a partir del detalle — no se
  -- confía en totales mandados por el cliente (se recalculan aquí).
  for v_item in select * from jsonb_array_elements(p_detalle) loop
    v_base  := round(coalesce((v_item->>'sueldo_base')::numeric, 0), 2);
    v_extras := round(coalesce((v_item->>'otras_percepciones')::numeric, 0), 2);
    v_ded   := round(coalesce((v_item->>'deducciones')::numeric, 0), 2);
    v_neto  := round(v_base + v_extras - v_ded, 2);
    v_tot_perc := v_tot_perc + v_base + v_extras;
    v_tot_ded  := v_tot_ded + v_ded;
    v_tot_neto := v_tot_neto + v_neto;
    v_conteo   := v_conteo + 1;
  end loop;

  -- Encabezado.
  insert into nominas (
    empresa_id, periodicidad, fecha_inicio, fecha_fin, dias,
    total_percepciones, total_deducciones, total_neto,
    empleados_pagados, estado, created_by
  ) values (
    v_empresa_id, p_periodicidad, p_fecha_inicio, p_fecha_fin, p_dias,
    v_tot_perc, v_tot_ded, v_tot_neto,
    v_conteo, 'pagada', auth.uid()
  ) returning id into v_nomina_id;

  -- Detalle (snapshot por empleado).
  for v_item in select * from jsonb_array_elements(p_detalle) loop
    v_base  := round(coalesce((v_item->>'sueldo_base')::numeric, 0), 2);
    v_extras := round(coalesce((v_item->>'otras_percepciones')::numeric, 0), 2);
    v_ded   := round(coalesce((v_item->>'deducciones')::numeric, 0), 2);
    v_neto  := round(v_base + v_extras - v_ded, 2);
    insert into nomina_detalle (
      nomina_id, empresa_id, empleado_id, nombre, puesto, salario_diario,
      sueldo_base, otras_percepciones, deducciones, neto, notas
    ) values (
      v_nomina_id, v_empresa_id,
      nullif(v_item->>'empleado_id', '')::uuid,
      v_item->>'nombre',
      v_item->>'puesto',
      round(coalesce((v_item->>'salario_diario')::numeric, 0), 2),
      v_base, v_extras, v_ded, v_neto,
      nullif(v_item->>'notas', '')
    );
  end loop;

  return jsonb_build_object(
    'id', v_nomina_id,
    'empleados_pagados', v_conteo,
    'total_neto', v_tot_neto
  );
end;
$function$;


-- ============================================================
-- 3. OBSERVACIONES de la exportación (nada de esto se corrigió; son hallazgos para decidir)
--
--  Del esquema:
--   a) `nominas` y `nomina_detalle` no tienen llave foránea de `empresa_id` hacia `empresas(id)`, ni `created_by`
--      hacia `perfiles(id)`. El resto de las tablas de esta lista sí las tienen. Hoy `crear_nomina` siempre pone
--      la empresa del usuario, así que no se rompe, pero la base no lo garantiza.
--   b) Sin CHECK en `nominas.periodicidad`, `nominas.estado`, `invitaciones.estado`, `declaraciones.estado`,
--      `obligaciones_fiscales.periodicidad`, `dia_limite` (1–31) ni `mes_limite` (1–12). Los valores válidos los
--      impone solo el código de la app.
--   c) `declaraciones` no tiene restricción única (obligacion_id, periodo): los duplicados los evita solo la app
--      (OT-0031, "declaraciones duplicadas no se crean sin confirmar"). Es una decisión de diseño, porque la
--      contadora puede querer presentar una complementaria; si se quisiera forzar, sería un índice único parcial.
--   d) `invitaciones.token` no tiene índice único; con gen_random_uuid() la colisión es improbable, pero no está
--      garantizada.
--   e) Los importes de nomina son `numeric` sin precisión fija (la función redondea a 2 decimales al guardar).
--
--  De `crear_nomina`:
--   f) No revisa `periodo_esta_cerrado` para la fecha de la nómina (a diferencia de las pólizas).
--   g) `empleado_id` viene del cliente y solo se comprueba con la llave foránea a `empleados(id)`: no se valida que
--      ese empleado sea de la misma empresa. Con un id válido de otra empresa se podría ligar un renglón a un
--      empleado ajeno (severidad baja: requiere conocer un UUID).
--   h) No valida p_periodicidad, p_dias, ni que fecha_fin >= fecha_inicio, ni que los importes no sean negativos.
--
--  Para que estas observaciones se conviertan en cambios hace falta una OT y SQL con aprobación del usuario.
-- ============================================================
