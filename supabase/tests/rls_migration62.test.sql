-- ============================================================
-- Storage: migración 62 — anti-poison documentos
-- ============================================================
\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema storage to authenticated;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','M62-A','30-m62a','A','m62a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1','M62-B','30-m62b','B','m62b@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','Emp','A','m62e1','2020-01-01','Op','Prod'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a3','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','Sup','A','m62s1','2019-01-01','Sup','Admin'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a4','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','Adm','A','m62a1','2018-01-01','RRHH','Admin'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b2','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1','Emp','B','m62e9','2020-01-01','Op','Prod');

insert into auth.users (id, instance_id, email, aud, role) values
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a5','00000000-0000-0000-0000-000000000000','m62-emp@t.test','authenticated','authenticated'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a6','00000000-0000-0000-0000-000000000000','m62-sup@t.test','authenticated','authenticated'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a7','00000000-0000-0000-0000-000000000000','m62-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a5','m62-emp@t.test','empleado','Emp A',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a6','m62-sup@t.test','supervisor','Sup A',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a3'),
 ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a7','m62-adm@t.test','admin_rrhh','Adm A',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1','d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a4');

-- Objetos storage: secreto B + legítimo A
insert into storage.objects (bucket_id, name) values
 ('documentos', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1/secret.pdf'),
 ('documentos', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1/d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2/ok.pdf')
on conflict do nothing;

-- Doc legítimo A (admin insert as postgres bypassing RLS for fixture)
insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
values (
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2',
  'dni', 'OK',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1/d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2/ok.pdf'
);

-- Poison row: empresa A + path B (simula envenenamiento residual / admin mistake)
insert into documentos_legajo (id, empresa_id, empleado_id, categoria, nombre, archivo_url)
values (
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2aa',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2',
  'dni', 'POISON',
  'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1/secret.pdf'
);

create function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Empleado: poison no abre B; path B directo DENIED; ok ALLOW
select pg_temp.como('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a5'::uuid);

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id='documentos'
     and name='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1/secret.pdf';
  assert n = 0, 'emp NO lee secret B vía poison/direct';
end $$;

do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id='documentos'
     and name='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1/d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2/ok.pdf';
  assert n = 1, 'emp lee doc legítimo A';
end $$;

-- Supervisor: path B DENIED; path A ALLOW (gestor prefijo)
select pg_temp.como('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a6'::uuid);
do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where name='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1/secret.pdf';
  assert n = 0, 'sup NO lee B';
  select count(*) into n from storage.objects
   where name='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1/d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a2/ok.pdf';
  assert n = 1, 'sup lee A';
end $$;

-- Admin: same
select pg_temp.como('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a7'::uuid);
do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where name='d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2b1/secret.pdf';
  assert n = 0, 'adm NO lee B';
  select count(*) into n from storage.objects
   where name like 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2a1/%';
  assert n >= 1, 'adm lee A';
end $$;

do $$ begin raise notice 'PASS rls_migration62'; end $$;
rollback;
