// ============================================================
//  CONTATECK · OT-0056 · Prueba del SQL de multiempresa en un Postgres EN MEMORIA
//
//  No toca ninguna base real. Arma un esquema mínimo (auth.uid(), perfiles, roles,
//  empresas, auth_empresa_id()/auth_rol(), el trigger real de OT-0038), aplica
//  OT-0056-multiempresa.sql DOS veces (idempotencia), prueba el cambio de empresa,
//  la protección contra cambiarla por la vía directa o con la bandera falsificada,
//  la baja de alguien que está en otra empresa, las reglas de RH / último director,
//  los permisos de anon y, al final, OT-0056-multiempresa-rollback.sql.
//
//  Uso (en una carpeta temporal, fuera del repo, para no agregar dependencias):
//    npm init -y && npm i @electric-sql/pglite
//    node <ruta al repo>/database/OT-0056-prueba-sql-pglite.mjs
//  (copia este archivo junto a node_modules, o corre node desde esa carpeta con la ruta completa).
// ============================================================
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { fileURLToPath } from 'url';
const REPO = fileURLToPath(new URL('./', import.meta.url));
const db = new PGlite();
const run = (sql) => db.exec(sql);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fails++; };
async function as(uid, sql, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}', false); set role ${role};`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
}
async function err(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }

await run(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table empresas (id uuid primary key default gen_random_uuid(), nombre text not null);
create table roles (id uuid primary key default gen_random_uuid(), nombre text not null);
create table perfiles (id uuid primary key references auth.users(id), empresa_id uuid not null references empresas(id), rol_id uuid not null references roles(id), nombre text, email text, activo boolean not null default true, is_active boolean not null default true);
create table auditoria_log (id uuid primary key default gen_random_uuid(), empresa_id uuid, usuario_id uuid, tabla_afectada text, registro_id uuid, accion text check (accion in ('insert','update','delete')), detalle jsonb, modulo text check (modulo in ('contabilidad','auth')));
create function auth_empresa_id() returns uuid language sql stable security definer set search_path=public as $$ select empresa_id from perfiles where id = auth.uid() and activo $$;
create function auth_rol() returns text language sql stable security definer set search_path=public as $$ select r.nombre from perfiles p join roles r on r.id=p.rol_id where p.id=auth.uid() and p.activo $$;
alter table perfiles enable row level security; alter table empresas enable row level security;
create policy perfiles_select_empresa on perfiles for select using (empresa_id = auth_empresa_id());
create policy perfiles_update_propio on perfiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy empresas_sel on empresas for select using (id = auth_empresa_id());
grant usage on schema public, auth to anon, authenticated;
grant select, update on perfiles to authenticated; grant select on empresas, roles to authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000a3'),('00000000-0000-0000-0000-0000000000a4');
insert into empresas (id,nombre) values ('11111111-1111-1111-1111-111111111111','Empresa A'),('22222222-2222-2222-2222-222222222222','Empresa B'),('33333333-3333-3333-3333-333333333333','Empresa C');
insert into roles (id,nombre) values ('aaaaaaaa-0000-0000-0000-000000000001','director'),('aaaaaaaa-0000-0000-0000-000000000002','contador'),('aaaaaaaa-0000-0000-0000-000000000003','rh'),('aaaaaaaa-0000-0000-0000-000000000004','vendedor');
insert into perfiles (id,empresa_id,rol_id,nombre,email) values
 ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Ana','ana@x'),
 ('00000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Beto','beto@x'),
 ('00000000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','Rita','rita@x'),
 ('00000000-0000-0000-0000-0000000000a4','33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000001','Carlos','carlos@x');
`);
// El trigger de OT-0038 (original) ya existía antes: se toma del archivo real del repo
const ot38 = fs.readFileSync(REPO + 'OT-0038-endurecimiento-seguridad.sql', 'utf8');
const bloque = ot38.slice(ot38.indexOf('create or replace function public.perfiles_proteger_campos()'), ot38.indexOf('-- 2) invitaciones'));
await run(bloque);
const A1='00000000-0000-0000-0000-0000000000a1', A2='00000000-0000-0000-0000-0000000000a2', A3='00000000-0000-0000-0000-0000000000a3', A4='00000000-0000-0000-0000-0000000000a4';
const EA='11111111-1111-1111-1111-111111111111', EB='22222222-2222-2222-2222-222222222222', EC='33333333-3333-3333-3333-333333333333';
const R_DIR='aaaaaaaa-0000-0000-0000-000000000001', R_CON='aaaaaaaa-0000-0000-0000-000000000002';
ok((await err(A1, `update perfiles set empresa_id='${EB}' where id='${A1}'`))?.includes('No se puede cambiar la empresa'), 'ANTES: cambiar empresa directo prohibido (trigger OT-0038)');

const sql56 = fs.readFileSync(REPO + 'OT-0056-multiempresa.sql', 'utf8');
await run(sql56); await run(sql56);
ok(true, 'OT-0056-multiempresa.sql corre completo y dos veces');
await run(`grant select on usuario_empresas to authenticated;`); // en Supabase authenticated ya tiene select por defecto
let r = await db.query(`select count(*)::int n from usuario_empresas`); ok(r.rows[0].n === 4, 'respaldo inicial: 4 membresias');

await run(`insert into usuario_empresas (user_id, empresa_id, rol_id) values ('${A1}','${EB}','${R_CON}')`);
ok((await err(A1, `insert into usuario_empresas (user_id, empresa_id, rol_id) values ('${A1}','${EC}','${R_DIR}')`)) !== null, 'un usuario no puede agregarse a otra empresa');
ok((await err(A1, `update usuario_empresas set rol_id='${R_DIR}' where user_id='${A1}' and empresa_id='${EB}'`)) !== null, 'un usuario no puede subirse el rol en una membresia');

ok((await err(A1, `select cambiar_empresa('${EC}')`))?.includes('No perteneces'), 'cambiar_empresa a una empresa ajena: rechazado');
ok((await err(A4, `select cambiar_empresa('${EB}')`))?.includes('No perteneces'), 'a4 (otra empresa) no entra a B');
ok((await err(A1, `update perfiles set empresa_id='${EB}', rol_id='${R_CON}' where id='${A1}'`))?.includes('No se puede cambiar la empresa'), 'via directa sigue prohibida aunque tenga membresia');
ok((await err(A1, `select set_config('contateck.cambiando_empresa','${A1}', true); update perfiles set empresa_id='${EC}', rol_id='${R_DIR}' where id='${A1}'`)) !== null, 'bandera falsificada hacia empresa SIN membresia: rechazado');

r = await as(A1, `select * from mis_empresas()`); ok(r.rows.length === 2 && r.rows.find(x => x.empresa_id === EA).activa === true && r.rows.find(x => x.empresa_id === EB).activa === false, 'mis_empresas: 2 empresas, A activa');
r = await as(A1, `select cambiar_empresa('${EB}') as r`); ok(r.rows[0].r.cambio === true && r.rows[0].r.rol === 'contador', 'cambiar_empresa A a B ok, rol contador');
r = await as(A1, `select auth_empresa_id() e, auth_rol() r`); ok(r.rows[0].e === EB && r.rows[0].r === 'contador', 'auth_empresa_id()/auth_rol() devuelven B/contador');
r = await as(A1, `select * from perfiles where id <> '${A1}'`); ok(r.rows.length === 0, 'en B, a1 no ve a los de A (aislamiento)');
ok((await err(A1, `update perfiles set rol_id='${R_DIR}' where id='${A1}'`)) !== null, 'en B no puede auto-ascenderse a director');
r = await as(A1, `select cambiar_empresa('${EA}') as r`); ok(r.rows[0].r.cambio === true && r.rows[0].r.rol === 'director', 'cambiar B a A ok, rol director');
r = await as(A1, `select cambiar_empresa('${EA}') as r`); ok(r.rows[0].r.cambio === false, 'cambiar a la empresa actual no hace nada');
r = await db.query(`select count(*)::int n from auditoria_log`); console.log('     (filas de auditoria escritas:', r.rows[0].n, ')');

await as(A1, `select cambiar_empresa('${EB}')`);
r = await as(A2, `select * from perfiles where id='${A1}'`); ok(r.rows.length === 1, 'a2 (en A) ve el perfil de a1 aunque a1 este en B');
r = await as(A2, `select membresia_cambiar_estado('${A1}', false) as r`); ok(r.rows[0].r.activo === false, 'a2 da de baja a a1 en A mientras esta en B');
r = await db.query(`select activo from usuario_empresas where user_id='${A1}' and empresa_id='${EA}'`); ok(r.rows[0].activo === false, 'membresia A de a1 quedo inactiva');
r = await db.query(`select activo from perfiles where id='${A1}'`); ok(r.rows[0].activo === true, 'el perfil activo de a1 (en B) sigue activo');
ok((await err(A1, `select cambiar_empresa('${EA}')`))?.includes('dado de baja'), 'a1 NO puede volver a A: esta dado de baja');
await as(A2, `select membresia_cambiar_estado('${A1}', true)`); r = await as(A1, `select cambiar_empresa('${EA}') as r`); ok(r.rows[0].r.cambio === true, 'reactivado: a1 vuelve a A');
ok((await err(A3, `select membresia_cambiar_estado('${A2}', false)`))?.includes('RH no puede'), 'RH no puede dar de baja a un director');
ok((await err(A2, `select membresia_cambiar_estado('${A2}', false)`))?.includes('a ti mismo'), 'nadie se da de baja a si mismo');
ok((await err(A4, `select membresia_cambiar_estado('${A2}', false)`))?.includes('no pertenece'), 'un director de otra empresa no toca gente de A');
await run(`update perfiles set rol_id='${R_CON}' where id='${A2}'`);
r = await db.query(`select rol_id from usuario_empresas where user_id='${A2}' and empresa_id='${EA}'`); ok(r.rows[0].rol_id === R_CON, 'cambio de rol en perfiles se refleja en la membresia (sync)');
ok((await err(A3, `select membresia_cambiar_estado('${A2}', false)`)) === null, 'RH si puede dar de baja a un contador');
// a1 es ahora el unico director activo de A: un admin/director no puede darlo de baja (aqui lo intenta a2 ya contador -> sin permiso; probamos con otro director)
await run(`update perfiles set rol_id='${R_DIR}', activo=true where id='${A2}'`);
await as(A1, `select membresia_cambiar_estado('${A2}', false)`);
ok((await err(A2, `select membresia_cambiar_estado('${A1}', false)`)) !== null, 'a2 inactivo ya no puede dar de baja a nadie');
await run(`update perfiles set activo=true where id='${A2}'`);
await run(`update usuario_empresas set activo=true where user_id='${A2}' and empresa_id='${EA}'`);
try { await db.exec(`set role anon;`); await db.query(`select cambiar_empresa('${EA}')`); ok(false, 'anon NO debe poder ejecutar'); } catch (e) { ok(/permission denied/.test(e.message), 'anon no puede ejecutar cambiar_empresa'); } finally { await db.exec('reset role;'); }

await run(fs.readFileSync(REPO + 'OT-0056-multiempresa-rollback.sql', 'utf8'));
r = await db.query(`select to_regclass('usuario_empresas') t`); ok(r.rows[0].t === null, 'rollback quita la tabla');
ok((await err(A1, `update perfiles set empresa_id='${EB}' where id='${A1}'`))?.includes('No se puede cambiar la empresa'), 'tras el rollback la proteccion de OT-0038 sigue');
console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK'); process.exit(fails ? 1 : 0);
