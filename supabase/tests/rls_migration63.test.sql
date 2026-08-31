-- ============================================================
-- Invariante: migración 63 — empleado ∈ empresa
-- ============================================================
\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Desde la migración 107 el tope imponible de aportes es obligatorio para
-- guardar remuneraciones. Estos fixtures liquidan, así que lo cargan.
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','M63-A','30-m63a','A','m63a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b1','M63-B','30-m63b','B','m63b@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','Emp','A','m63e1','2020-01-01','Op','Prod'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a3','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','Adm','A','m63a1','2018-01-01','RRHH','Admin'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a4','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','Sup','A','m63s1','2019-01-01','Sup','Admin'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b2','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b1','Emp','B','m63e9','2020-01-01','Op','Prod');

insert into auth.users (id, instance_id, email, aud, role) values
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a5','00000000-0000-0000-0000-000000000000','m63-emp@t.test','authenticated','authenticated'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a6','00000000-0000-0000-0000-000000000000','m63-adm@t.test','authenticated','authenticated'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a7','00000000-0000-0000-0000-000000000000','m63-sup@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a5','m63-emp@t.test','empleado','Emp A',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a6','m63-adm@t.test','admin_rrhh','Adm A',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a3'),
 ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a7','m63-sup@t.test','supervisor','Sup A',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a4');

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

-- Legítimo A+A
select pg_temp.como('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a6'::uuid);
insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
values (
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2',
  'especial','2026-09-01','2026-09-01',1,'pendiente'
);

insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
values (
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2',
  '2026-08',100,80
);

-- Cross-link DENIED
select pg_temp.denied(
  'adm A: empresa A + empleado B ausencia',
  $q$insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
     values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b2',
             'especial','2026-10-01','2026-10-01',1,'aprobada')$q$
);

select pg_temp.denied(
  'adm A: empresa B + empleado A remu (también RLS)',
  $q$insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
     values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2','2026-09',1,1)$q$
);

select pg_temp.denied(
  'adm A: empresa A + empleado B recibo',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma)
     values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b2',
             '2026-08','mensual','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1/x.pdf','pendiente')$q$
);

select pg_temp.denied(
  'adm A: empresa A + empleado B adelanto',
  $q$insert into adelantos (empresa_id, empleado_id, monto, estado)
     values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b2',50,'pendiente')$q$
);

-- Supervisor turnos cross-link
select pg_temp.como('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a7'::uuid);
select pg_temp.denied(
  'sup A: turno emp B',
  $q$insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
     values ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1','e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b2',
             '2026-12-01','08:00','17:00')$q$
);

-- Legítimo turno
insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
values (
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a1',
  'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2',
  '2026-12-02','08:00','17:00'
);

-- empleados.empresa_id immutable
select pg_temp.como('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a6'::uuid);
select pg_temp.denied(
  'adm no mueve legajo a otra empresa',
  $q$update empleados set empresa_id='e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3b1'
     where id='e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3a2'$q$
);

-- Service path still can seed (null JWT) — already used above as postgres for fixtures.
-- Assert function exists
do $$ begin
  assert exists(select 1 from pg_proc where proname='assert_empleado_de_empresa'),
    'assert_empleado_de_empresa present';
  raise notice 'PASS rls_migration63';
end $$;

rollback;
