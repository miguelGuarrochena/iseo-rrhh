-- ============================================================
-- Adelantos SM: migración 64
-- ============================================================
\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.adelantos to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1','M64-A','30-m64a','A','m64a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1','Emp','A','m64e1','2020-01-01','Op','Prod'),
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a3','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1','Adm','A','m64a1','2018-01-01','RRHH','Admin');

insert into auth.users (id, instance_id, email, aud, role) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a5','00000000-0000-0000-0000-000000000000','m64-emp@t.test','authenticated','authenticated'),
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a6','00000000-0000-0000-0000-000000000000','m64-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a5','m64-emp@t.test','empleado','Emp A',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2'),
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a6','m64-adm@t.test','admin_rrhh','Adm A',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a3');

insert into adelantos (id, empresa_id, empleado_id, monto, estado) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d1','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2',100,'pendiente');

insert into adelantos (id, empresa_id, empleado_id, monto, estado, resuelto_en) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d2','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2',50,'rechazado', now());

insert into adelantos (id, empresa_id, empleado_id, monto, estado, periodo, resuelto_en) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d3','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2',75,'aprobado','2026-07', now());

insert into adelantos (id, empresa_id, empleado_id, monto, estado) values
 ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d4','f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a1',
  'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a2',20,'pendiente');

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

-- Empleado: sin policy UPDATE → 0 filas (no resuelve)
select pg_temp.como('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a5'::uuid);
update adelantos
   set estado='aprobado', periodo='2026-08', resuelto_en=now()
 where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d1';
do $$ begin
  assert (select estado from adelantos where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d1') = 'pendiente',
    'emp no puede resolver adelanto';
end $$;

-- Admin resolve legítimo
select pg_temp.como('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4a6'::uuid);
update adelantos
   set estado='aprobado', periodo='2026-08', resuelto_en=now()
 where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d1';

do $$ begin
  assert (select estado from adelantos where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d1') = 'aprobado';
end $$;

-- Reopen DENIED
select pg_temp.denied(
  'adm rechazado→aprobado',
  $q$update adelantos set estado='aprobado', periodo='2026-08', resuelto_en=now()
     where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d2'$q$
);

select pg_temp.denied(
  'adm aprobado→rechazado',
  $q$update adelantos set estado='rechazado', periodo=null, resuelto_en=now()
     where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d3'$q$
);

select pg_temp.denied(
  'adm change monto on resolve',
  $q$update adelantos set estado='aprobado', periodo='2026-08', resuelto_en=now(), monto=999
     where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d4'$q$
);

-- Legitimate resolve without monto change
update adelantos
   set estado='rechazado', periodo=null, resuelto_en=now()
 where id='f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4d4';

do $$ begin raise notice 'PASS rls_migration64'; end $$;
rollback;
