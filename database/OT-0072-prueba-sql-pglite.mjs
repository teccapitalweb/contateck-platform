// ============================================================
//  CONTATECK · OT-0072 · Prueba del SQL de editar/cancelar un pago pendiente en un Postgres EN MEMORIA
//  No toca ninguna base real. Esquema mínimo (auth.uid(), perfiles, roles, ventas con las MISMAS políticas RLS
//  que DEV: UPDATE solo contador/admin/director), aplica OT-0072-editar-cancelar-venta.sql DOS veces (idempotencia),
//  prueba las reglas con usuarios reales de distintos roles y, al final, la reversa.
//  Uso (carpeta temporal con  npm i @electric-sql/pglite ):  node <repo>/database/OT-0072-prueba-sql-pglite.mjs
// ============================================================
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { fileURLToPath } from 'url';
const REPO = fileURLToPath(new URL('./', import.meta.url));
const db = new PGlite();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fails++; };
async function as(uid, sql, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}', false); set role ${role};`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
}
async function err(uid, sql, role) { try { await as(uid, sql, role); return null; } catch (e) { return e.message; } }

const U = { ven: '00000000-0000-0000-0000-0000000000b1', ven2: '00000000-0000-0000-0000-0000000000b2', con: '00000000-0000-0000-0000-0000000000b3', dir: '00000000-0000-0000-0000-0000000000b4', rh: '00000000-0000-0000-0000-0000000000b5', otra: '00000000-0000-0000-0000-0000000000b6' };
const EA = '11111111-1111-1111-1111-111111111111', EB = '22222222-2222-2222-2222-222222222222';
const V = (n) => '0000000a-0000-0000-0000-00000000000' + n;

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table empresas (id uuid primary key, nombre text);
create table roles (id uuid primary key, nombre text);
create table perfiles (id uuid primary key references auth.users(id), empresa_id uuid not null references empresas(id), rol_id uuid not null references roles(id), activo boolean not null default true);
create table auditoria_log (id uuid primary key default gen_random_uuid(), empresa_id uuid, usuario_id uuid, tabla_afectada text, registro_id uuid, accion text, detalle jsonb, modulo text check (modulo in ('contabilidad','auth')));
create function auth_empresa_id() returns uuid language sql stable security definer set search_path=public as $$ select empresa_id from perfiles where id = auth.uid() and activo $$;
create function auth_rol() returns text language sql stable security definer set search_path=public as $$ select r.nombre from perfiles p join roles r on r.id=p.rol_id where p.id=auth.uid() and p.activo $$;
create table ventas (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, folio text, cliente text not null, concepto text not null, importe numeric(14,2) not null, fecha_pago date, metodo_pago text, referencia text, banco text, notas text, incluye_iva boolean default true,
  estado text not null default 'pendiente', created_by uuid, vendedor_id uuid, motivo_rechazo text, comprobante_path text, poliza_id uuid, updated_at timestamptz default now());
alter table ventas enable row level security;
create policy ventas_sel on ventas for select using (empresa_id = auth_empresa_id());
create policy ventas_ins on ventas for insert with check (empresa_id = auth_empresa_id() and auth_rol() in ('vendedor','contador','admin','director'));
create policy ventas_upd on ventas for update using (empresa_id = auth_empresa_id() and auth_rol() in ('contador','admin','director'));
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update on ventas to authenticated; grant execute on function auth.uid() to anon, authenticated;
insert into empresas values ('${EA}','A'),('${EB}','B');
insert into roles values ('aaaaaaaa-0000-0000-0000-000000000001','director'),('aaaaaaaa-0000-0000-0000-000000000002','contador'),('aaaaaaaa-0000-0000-0000-000000000003','rrhh'),('aaaaaaaa-0000-0000-0000-000000000004','vendedor');
insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(',')};
insert into perfiles (id, empresa_id, rol_id) values
 ('${U.ven}','${EA}','aaaaaaaa-0000-0000-0000-000000000004'), ('${U.ven2}','${EA}','aaaaaaaa-0000-0000-0000-000000000004'),
 ('${U.con}','${EA}','aaaaaaaa-0000-0000-0000-000000000002'), ('${U.dir}','${EA}','aaaaaaaa-0000-0000-0000-000000000001'),
 ('${U.rh}','${EA}','aaaaaaaa-0000-0000-0000-000000000003'), ('${U.otra}','${EB}','aaaaaaaa-0000-0000-0000-000000000001');
insert into ventas (id, empresa_id, folio, cliente, concepto, importe, fecha_pago, estado, created_by) values
 ('${V(1)}','${EA}','P-0001','Cliente Uno','Servicio',100,'2026-11-01','pendiente','${U.ven}'),
 ('${V(2)}','${EA}','P-0002','Cliente Dos','Servicio',200,'2026-11-02','pendiente','${U.ven2}'),
 ('${V(3)}','${EA}','P-0003','Cliente Tres','Servicio',300,'2026-11-03','revision','${U.ven}'),
 ('${V(4)}','${EA}','P-0004','Cliente Cuatro','Servicio',400,'2026-11-04','confirmado','${U.ven}'),
 ('${V(5)}','${EA}','P-0005','Cliente Cinco','Servicio',500,'2026-11-05','pendiente','${U.dir}'),
 ('${V(6)}','${EA}','P-0006','Cliente Seis','Servicio',600,'2026-11-06','pendiente','${U.ven}');
`);

const sql = fs.readFileSync(REPO + 'OT-0072-editar-cancelar-venta.sql', 'utf8');
await db.exec(sql); await db.exec(sql);
ok(true, 'el SQL se aplica dos veces sin error (idempotente)');
const datos = (o = {}) => JSON.stringify({ cliente: 'Cliente Corregido', concepto: 'Servicio', importe: 150.456, fechaPago: '2026-11-10', metodoPago: 'Transferencia', referencia: 'R-9', banco: 'BBVA', notas: '', incluyeIva: false, ...o }).replace(/'/g, "''");
const editar = (uid, id, o, role) => as(uid, `select editar_venta_pendiente('${id}', '${datos(o)}'::jsonb) r`, role);
const cancelar = (uid, id, m) => as(uid, `select cancelar_venta_pendiente('${id}', '${m}') r`);

// Premisa: por RLS un vendedor NO puede actualizar ventas directamente (por eso existen las funciones)
let r = await as(U.ven, `update ventas set cliente = 'x' where id = '${V(1)}' returning id`);
ok(r.rows.length === 0, 'premisa: por RLS el vendedor no puede actualizar `ventas` directamente');

// Editar
r = await editar(U.ven, V(1));
const v1 = r.rows[0].r;
ok(v1.cliente === 'Cliente Corregido' && Number(v1.importe) === 150.46 && v1.fecha_pago === '2026-11-10' && v1.incluye_iva === false && v1.notas === null, 'el vendedor corrige su pago pendiente (importe a 2 decimales, vacío → null)');
ok(v1.folio === 'P-0001' && v1.estado === 'pendiente' && v1.created_by === U.ven, 'folio, estado y quién lo registró no cambian');
r = await db.query(`select detalle from auditoria_log where registro_id = '${V(1)}'`);
ok(r.rows.length === 1 && r.rows[0].detalle.operacion === 'editar_venta_pendiente' && r.rows[0].detalle.antes.cliente === 'Cliente Uno' && r.rows[0].detalle.despues.cliente === 'Cliente Corregido', 'queda rastro en auditoría con el antes y el después');
ok(/Solo quien registró/.test(await err(U.ven, `select editar_venta_pendiente('${V(2)}', '${datos()}'::jsonb)`)), 'el pago de otra persona no se edita');
ok(/Solo quien registró/.test(await err(U.dir, `select editar_venta_pendiente('${V(2)}', '${datos()}'::jsonb)`)), 'ni un director edita el pago ajeno');
r = await editar(U.dir, V(5)); ok(r.rows[0].r.cliente === 'Cliente Corregido', 'un director corrige un pago que él registró');
ok(/ya no está pendiente \(estado: revision\)/.test(await err(U.ven, `select editar_venta_pendiente('${V(3)}', '${datos()}'::jsonb)`)), 'en revisión ya no se edita');
ok(/ya no está pendiente \(estado: confirmado\)/.test(await err(U.ven, `select editar_venta_pendiente('${V(4)}', '${datos()}'::jsonb)`)), 'confirmado tampoco');
ok(/no encontrado|no es de tu empresa/i.test(await err(U.otra, `select editar_venta_pendiente('${V(1)}', '${datos()}'::jsonb)`)), 'otra empresa: no la ve ni la edita');
ok(/rol no permite/.test(await err(U.rh, `select editar_venta_pendiente('${V(1)}', '${datos()}'::jsonb)`)), 'RH no edita');
ok(/iniciar sesión/.test(await err('', `select editar_venta_pendiente('${V(1)}', '${datos()}'::jsonb)`)), 'sin sesión no hay nada que hacer');
ok(/permission denied/.test(await err(U.ven, `select editar_venta_pendiente('${V(1)}', '${datos()}'::jsonb)`, 'anon')), 'anon (sin sesión de usuario) no puede ni ejecutar la función');
for (const [o, t] of [[{ cliente: '  ' }, /cliente/], [{ concepto: '' }, /concepto/], [{ importe: 0 }, /importe/], [{ importe: -1 }, /importe/], [{ importe: 'abc' }, /importe/], [{ importe: 1e12 }, /máximo/], [{ fechaPago: '2999-01-01' }, /fecha/], [{ fechaPago: '1990-01-01' }, /fecha/], [{ fechaPago: 'mañana' }, /fecha/], [{ cliente: 'x'.repeat(151) }, /150/], [{ notas: 'x'.repeat(1001) }, /1000/]]) {
  ok(t.test(await err(U.ven, `select editar_venta_pendiente('${V(6)}', '${datos(o)}'::jsonb)`) || ''), 'la base también rechaza: ' + JSON.stringify(o).slice(0, 40));
}
r = await db.query(`select cliente from ventas where id = '${V(6)}'`);
ok(r.rows[0].cliente === 'Cliente Seis', 'después de todos esos rechazos el pago quedó intacto');

// Cancelar
r = await cancelar(U.ven, V(6), 'Me equivoqué de cliente');
ok(r.rows[0].r.estado === 'cancelado' && r.rows[0].r.motivo_rechazo === 'Me equivoqué de cliente', 'quien lo registró lo cancela con motivo');
ok(/ya no está pendiente \(estado: cancelado\)/.test(await err(U.ven, `select cancelar_venta_pendiente('${V(6)}', 'otra vez')`)), 'cancelar dos veces no se puede');
ok(/ya no está pendiente \(estado: cancelado\)/.test(await err(U.ven, `select editar_venta_pendiente('${V(6)}', '${datos()}'::jsonb)`)), 'un pago cancelado ya no se edita');
r = await cancelar(U.dir, V(2), 'Duplicado del P-0001');
ok(r.rows[0].r.estado === 'cancelado', 'un director cancela el pendiente de otra persona');
r = await db.query(`select detalle from auditoria_log where registro_id = '${V(2)}'`);
ok(r.rows.length === 1 && r.rows[0].detalle.operacion === 'cancelar_venta_pendiente' && r.rows[0].detalle.motivo === 'Duplicado del P-0001', 'y queda rastro de quién y por qué');
ok(/Solo quien registró el pago, o un Admin\/Director/.test(await err(U.con, `select cancelar_venta_pendiente('${V(1)}', 'no me gusta')`)), 'un contador a secas no cancela el pago ajeno');
ok(/Solo quien registró/.test(await err(U.ven2, `select cancelar_venta_pendiente('${V(1)}', 'no me gusta')`)), 'otro vendedor tampoco');
ok(/ya no está pendiente \(estado: revision\)/.test(await err(U.dir, `select cancelar_venta_pendiente('${V(3)}', 'ya no va')`)), 'en revisión no se cancela');
ok(/ya no está pendiente \(estado: confirmado\)/.test(await err(U.dir, `select cancelar_venta_pendiente('${V(4)}', 'ya no va')`)), 'confirmado no se cancela (tiene póliza)');
for (const m of ['', '  ', 'ab', 'x'.repeat(501)]) ok(/motivo/i.test(await err(U.ven, `select cancelar_venta_pendiente('${V(1)}', '${m}')`) || ''), 'sin motivo válido no se cancela: ' + JSON.stringify(m.slice(0, 5)));
ok(/rol no permite/.test(await err(U.rh, `select cancelar_venta_pendiente('${V(1)}', 'ya no va')`)), 'RH no cancela');
ok(/no encontrado|no es de tu empresa/i.test(await err(U.otra, `select cancelar_venta_pendiente('${V(1)}', 'ya no va')`)), 'otra empresa no cancela');
r = await db.query(`select estado, count(*)::int n from ventas group by estado order by estado`);
ok(JSON.stringify(r.rows) === JSON.stringify([{ estado: 'cancelado', n: 2 }, { estado: 'confirmado', n: 1 }, { estado: 'pendiente', n: 2 }, { estado: 'revision', n: 1 }]), 'al final: 2 cancelados, 1 confirmado, 2 pendientes y 1 en revisión; nada se borró (6 filas)');

// Reversa
await db.exec(fs.readFileSync(REPO + 'OT-0072-editar-cancelar-venta-rollback.sql', 'utf8'));
r = await db.query(`select count(*)::int n from pg_proc where proname in ('editar_venta_pendiente','cancelar_venta_pendiente')`);
ok(r.rows[0].n === 0, 'la reversa quita las dos funciones');

console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
process.exit(fails ? 1 : 0);
