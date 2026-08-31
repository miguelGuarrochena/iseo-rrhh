-- ============================================================
-- RLS: migración 60 — split de policies FOR ALL débiles
--
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_migration60.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- Fixtures: dos tenants ----------
-- Desde la migración 107 el tope imponible de aportes es obligatorio para
-- guardar remuneraciones. Estos fixtures liquidan, así que lo cargan.
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 (
   'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1',
   'M60-A', '30-m60a', 'A', 'm60a@t.test',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb
 ),
 (
   'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1',
   'M60-B', '30-m60b', 'B', 'm60b@t.test',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb
 );

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'Emp', 'A', 'm60e1', '2020-01-01', 'Op', 'Prod'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a3', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'Sup', 'A', 'm60s1', '2019-01-01', 'Sup', 'Admin'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a4', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'Adm', 'A', 'm60a1', '2018-01-01', 'RRHH', 'Admin'),
 ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1', 'Emp', 'B', 'm60e9', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5', '00000000-0000-0000-0000-000000000000', 'm60-emp@t.test', 'authenticated', 'authenticated'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a6', '00000000-0000-0000-0000-000000000000', 'm60-sup@t.test', 'authenticated', 'authenticated'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a7', '00000000-0000-0000-0000-000000000000', 'm60-adm@t.test', 'authenticated', 'authenticated'),
 ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b5', '00000000-0000-0000-0000-000000000000', 'm60-empb@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5', 'm60-emp@t.test', 'empleado', 'Emp A',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a6', 'm60-sup@t.test', 'supervisor', 'Sup A',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a3'),
 ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a7', 'm60-adm@t.test', 'admin_rrhh', 'Adm A',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a4'),
 ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b5', 'm60-empb@t.test', 'empleado', 'Emp B',
  'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2');

-- Turno seed for supervisor UPDATE/SELECT
insert into turnos (id, empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
values (
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0d1',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1',
  'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
  '2026-06-01', '08:00', '17:00'
);

create function pg_temp.como(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.assert_denied(p_label text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_ok boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_ok := true;
  end;
  assert v_ok, format('EXPECTED DENIED: %s', p_label);
end;
$$;

create function pg_temp.assert_allowed(p_label text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise exception 'EXPECTED ALLOWED: % [%]', p_label, sqlerrm;
  end;
end;
$$;

-- =====================================================================
-- EMPLEADO — INSERT admin resources DENIED (with and without RETURNING)
-- =====================================================================
select pg_temp.como('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5'::uuid);

select pg_temp.assert_denied(
  'emp INSERT recibos (no returning)',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-08','mensual','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/x.pdf','pendiente')$q$
);

select pg_temp.assert_denied(
  'emp INSERT recibos RETURNING',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-08','mensual','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/y.pdf','pendiente')
     returning id$q$
);

select pg_temp.assert_denied(
  'emp INSERT remuneraciones',
  $q$insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-08',1,1)$q$
);

select pg_temp.assert_denied(
  'emp INSERT cupos_licencia',
  $q$insert into cupos_licencia (empresa_id, tipo, dias_anuales)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','mudanza',0)$q$
);

select pg_temp.assert_denied(
  'emp INSERT descuentos_recurrentes',
  $q$insert into descuentos_recurrentes (empresa_id, empleado_id, concepto, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','x',10)$q$
);

select pg_temp.assert_denied(
  'emp INSERT documentos_legajo',
  $q$insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             'dni','poison','b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1/secret.pdf')$q$
);

select pg_temp.assert_denied(
  'emp INSERT documentos_firma',
  $q$insert into documentos_firma (empresa_id, titulo, archivo_url, creado_por)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','x',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/f.pdf',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5')$q$
);

select pg_temp.assert_denied(
  'emp INSERT empleados (no returning)',
  $q$insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','Ghost','X','m60g1','2026-01-01','Op','Prod')$q$
);

select pg_temp.assert_denied(
  'emp INSERT empleados RETURNING',
  $q$insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','Ghost','Y','m60g2','2026-01-01','Op','Prod')
     returning id$q$
);

select pg_temp.assert_denied(
  'emp INSERT facturas_monotributo',
  $q$insert into facturas_monotributo (empresa_id, empleado_id, periodo, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-08',100)$q$
);

select pg_temp.assert_denied(
  'emp INSERT usuarios',
  $q$insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a099','x@t.test','admin_rrhh','X',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1',null)$q$
);

select pg_temp.assert_denied(
  'emp INSERT turnos',
  $q$insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-12-01','08:00','17:00')$q$
);

select pg_temp.assert_denied(
  'emp INSERT eventos_agenda',
  $q$insert into eventos_agenda (empresa_id, tipo, titulo, fecha)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','evento','x','2026-12-01')$q$
);

select pg_temp.assert_denied(
  'emp INSERT alertas',
  $q$insert into alertas (empresa_id, empleado_id, tipo, titulo, fecha, estado)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             'custom','x','2026-12-01','pendiente')$q$
);

-- Self-service nombre OK; rol/empresa/empleado DENIED
select pg_temp.assert_allowed(
  'emp UPDATE own nombre_completo',
  $q$update usuarios set nombre_completo = 'Emp A Renamed'
     where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5'$q$
);

select pg_temp.assert_denied(
  'emp UPDATE own rol',
  $q$update usuarios set rol = 'admin_rrhh'
     where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5'$q$
);

select pg_temp.assert_denied(
  'emp UPDATE own empresa_id',
  $q$update usuarios set empresa_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1'
     where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5'$q$
);

select pg_temp.assert_denied(
  'emp UPDATE own empleado_id',
  $q$update usuarios set empleado_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a3'
     where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a5'$q$
);

-- =====================================================================
-- SUPERVISOR — admin resources DENIED; turnos/eventos ALLOWED
-- =====================================================================
select pg_temp.como('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a6'::uuid);

select pg_temp.assert_denied(
  'sup INSERT recibos',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-08','mensual','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/sup.pdf','pendiente')$q$
);

select pg_temp.assert_denied(
  'sup INSERT remuneraciones',
  $q$insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-09',1,1)$q$
);

select pg_temp.assert_denied(
  'sup INSERT cupos_licencia',
  $q$insert into cupos_licencia (empresa_id, tipo, dias_anuales)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','examenes',0)$q$
);

select pg_temp.assert_denied(
  'sup INSERT descuentos_recurrentes',
  $q$insert into descuentos_recurrentes (empresa_id, empleado_id, concepto, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','y',1)$q$
);

select pg_temp.assert_denied(
  'sup INSERT documentos_legajo',
  $q$insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             'dni','x','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/d.pdf')$q$
);

select pg_temp.assert_denied(
  'sup INSERT documentos_firma',
  $q$insert into documentos_firma (empresa_id, titulo, archivo_url, creado_por)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','x',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/f2.pdf',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a6')$q$
);

select pg_temp.assert_denied(
  'sup INSERT empleados',
  $q$insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','SupGhost','X','m60sg','2026-01-01','Op','Prod')$q$
);

select pg_temp.assert_denied(
  'sup INSERT facturas_monotributo',
  $q$insert into facturas_monotributo (empresa_id, empleado_id, periodo, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-09',50)$q$
);

select pg_temp.assert_allowed(
  'sup INSERT turnos',
  $q$insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-12-02','08:00','17:00')$q$
);

select pg_temp.assert_allowed(
  'sup INSERT eventos_agenda',
  $q$insert into eventos_agenda (empresa_id, tipo, titulo, fecha)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','evento','Capacitacion','2026-12-10')$q$
);

-- Legitimate supervisor SELECT/UPDATE turnos
do $$
declare n int;
begin
  select count(*) into n from turnos
   where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0d1';
  assert n = 1, 'sup SELECT own-tenant turno';
  update turnos set hora_salida = '18:00'
   where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0d1';
  assert found, 'sup UPDATE turno';
end $$;

-- Cross-tenant INSERT denied
select pg_temp.assert_denied(
  'sup INSERT turno other empresa_id',
  $q$insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
     values ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1','b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2',
             '2026-12-03','08:00','17:00')$q$
);

-- =====================================================================
-- ADMIN — INSERT admin resources ALLOWED; tenant isolation
-- =====================================================================
select pg_temp.como('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a7'::uuid);

select pg_temp.assert_allowed(
  'adm INSERT recibos (no returning)',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-08','mensual','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/ok.pdf','pendiente', now())$q$
);

select pg_temp.assert_allowed(
  'adm INSERT remuneraciones',
  $q$insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-08',100,80)$q$
);

select pg_temp.assert_allowed(
  'adm INSERT cupos_licencia',
  $q$insert into cupos_licencia (empresa_id, tipo, dias_anuales)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','mudanza',3)$q$
);

select pg_temp.assert_allowed(
  'adm INSERT descuentos_recurrentes',
  $q$insert into descuentos_recurrentes (empresa_id, empleado_id, concepto, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','sindicato',50)$q$
);

select pg_temp.assert_allowed(
  'adm INSERT documentos_legajo',
  $q$insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             'dni','DNI','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/dni.pdf')$q$
);

select pg_temp.assert_allowed(
  'adm INSERT documentos_firma',
  $q$insert into documentos_firma (empresa_id, titulo, archivo_url, creado_por)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','Politica',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1/pol.pdf',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a7')$q$
);

select pg_temp.assert_allowed(
  'adm INSERT empleados',
  $q$insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','Nuevo','Legajo','m60n1','2026-02-01','Op','Prod')$q$
);

select pg_temp.assert_allowed(
  'adm INSERT facturas_monotributo',
  $q$insert into facturas_monotributo (empresa_id, empleado_id, periodo, monto)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2','2026-08',200)$q$
);

select pg_temp.assert_allowed(
  'adm INSERT turnos',
  $q$insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a2',
             '2026-12-04','09:00','18:00')$q$
);

select pg_temp.assert_allowed(
  'adm INSERT eventos_agenda',
  $q$insert into eventos_agenda (empresa_id, tipo, titulo, fecha)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1','capacitacion','RRHH','2026-12-20')$q$
);

-- No PostgREST INSERT usuarios even as admin
select pg_temp.assert_denied(
  'adm INSERT usuarios via PostgREST',
  $q$insert into usuarios (id, email, rol, nombre_completo, empresa_id)
     values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a098','adm2@t.test','empleado','X',
             'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1')$q$
);

-- Tenant isolation: wrong empresa_id
select pg_temp.assert_denied(
  'adm INSERT recibo other tenant empresa_id',
  $q$insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma)
     values ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1','b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2',
             '2026-08','mensual','b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1/x.pdf','pendiente')$q$
);

select pg_temp.assert_denied(
  'adm INSERT remu other tenant',
  $q$insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
     values ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b1','b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2','2026-08',1,1)$q$
);

-- Cross-link empresa A + empleado B: mig 60 does not add empleado∈empresa
-- (that's mig 63). Document residual: RLS tenant check alone may still allow
-- this for admin. We assert it is NOT opened for non-admin, and wrong
-- empresa_id stays denied above. Optional probe — do not require DENIED yet.
do $$
declare v_allowed boolean := false;
begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values (
      'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a1',
      'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b2',
      '2026-10', 1, 1
    );
    v_allowed := true;
  exception when others then
    v_allowed := false;
  end;
  raise notice 'META cross-link admin remu empB+empA allowed=% (mig63 pending if true)', v_allowed;
end $$;

do $$ begin raise notice 'PASS rls_migration60'; end $$;

rollback;
