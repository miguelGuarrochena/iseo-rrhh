-- ============================================================
-- Last admin: migración 65
-- ============================================================
\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, update, delete on table public.usuarios to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.empresas to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1','M65-A','30-m65a','A','m65a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b1','M65-B','30-m65b','B','m65b@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a2','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1','Ad1','A','m65a1','2018-01-01','RRHH','Admin'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a3','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1','Ad2','A','m65a2','2018-01-01','RRHH','Admin'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b2','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b1','Solo','B','m65b1','2018-01-01','RRHH','Admin');

insert into auth.users (id, instance_id, email, aud, role) values
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5','00000000-0000-0000-0000-000000000000','m65-ad1@t.test','authenticated','authenticated'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a6','00000000-0000-0000-0000-000000000000','m65-ad2@t.test','authenticated','authenticated'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b5','00000000-0000-0000-0000-000000000000','m65-solo@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5','m65-ad1@t.test','admin_rrhh','Ad1',
  'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a2'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a6','m65-ad2@t.test','admin_rrhh','Ad2',
  'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a3'),
 ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b5','m65-solo@t.test','admin_rrhh','Solo B',
  'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b1','a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b2');

create function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.denied(p_label text, p_sql text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute p_sql; exception when others then ok := true; end;
  assert ok, format('EXPECTED DENIED: %s', p_label);
end;
$$;

-- Solo admin en B: demote DENIED
select pg_temp.como('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b5'::uuid);
select pg_temp.denied(
  'last admin B self-demote',
  $q$update usuarios set rol='empleado' where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b5'$q$
);

select pg_temp.denied(
  'last admin B move empresa',
  $q$update usuarios set empresa_id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a1'
     where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5b5'$q$
);

-- Tenant A with 2 admins: demote first ALLOW
select pg_temp.como('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5'::uuid);
update usuarios set rol='empleado' where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5';
do $$ begin
  assert (select rol::text from usuarios where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5') = 'empleado';
end $$;
-- Second (now last) DENIED
select pg_temp.como('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a6'::uuid);
select pg_temp.denied(
  'last remaining admin A demote',
  $q$update usuarios set rol='empleado' where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a6'$q$
);

select pg_temp.denied(
  'last remaining admin A → supervisor',
  $q$update usuarios set rol='supervisor' where id='a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a6'$q$
);

do $$ begin raise notice 'PASS rls_migration65'; end $$;
rollback;
