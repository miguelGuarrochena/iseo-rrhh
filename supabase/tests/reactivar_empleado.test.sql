-- ============================================================
-- Reactivar un colaborador dado de baja.
--
-- La baja es un UPDATE (activo=false + borrar biometría). La
-- reactivación es el UPDATE inverso, con la misma policy
-- `empleados_gestion_update`: admin_rrhh / superadmin de esa empresa.
-- Supervisor y empleado no pueden. No se crea otro legajo. El DNI y el
-- vínculo con la cuenta se conservan. El rostro no vuelve.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/reactivar_empleado.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, update on table public.empleados to authenticated;
grant select on table public.usuarios, public.empresas to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'Poster Group', '30-pg-1', 'P', 'p@p.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (
  id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector,
  activo, fecha_baja, motivo_baja,
  descriptor_facial, descriptor_version, consentimiento_biometrico
) values
  (
    'bbbbbbbb-0000-0000-0000-000000000101',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    'Dueño', 'Poster', '20111222', '2024-01-15', 'Socio', 'Dirección',
    false, '2026-09-01', 'Alta de prueba',
    null, null, null
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000102',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    'Ana', 'Activa', '30111222', '2020-01-01', 'Op', 'Prod',
    true, null, null,
    '[0.1]'::jsonb, 1,
    '{"aceptado":true,"fecha":"2026-01-01"}'::jsonb
  );

insert into auth.users (id, instance_id, email, aud, role) values
  ('bbbbbbbb-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'pg-adm@t.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'pg-sup@t.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'pg-emp@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('bbbbbbbb-0000-0000-0000-000000000201', 'pg-adm@t.test', 'admin_rrhh', 'Admin Poster',
   'bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000101'),
  ('bbbbbbbb-0000-0000-0000-000000000202', 'pg-sup@t.test', 'supervisor', 'Sup Poster',
   'bbbbbbbb-0000-0000-0000-00000000000a', null),
  ('bbbbbbbb-0000-0000-0000-000000000203', 'pg-emp@t.test', 'empleado', 'Emp Poster',
   'bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000102');

create or replace function pg_temp.como(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.servicio() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.chk(nro text, desc_ text, ok boolean)
returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLA % — %', nro, desc_; end if;
  raise notice '  ok  % %', rpad(nro, 6), desc_;
end $$;

-- Supervisor: el UPDATE no tira, RLS lo deja en 0 filas.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000202'::uuid);
update empleados
   set activo = true, fecha_baja = null, motivo_baja = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000101';
select pg_temp.servicio();
select pg_temp.chk('R.1', 'supervisor no reactiva',
  (select not activo from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));

-- Empleado: igual.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000203'::uuid);
update empleados
   set activo = true, fecha_baja = null, motivo_baja = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000101';
select pg_temp.servicio();
select pg_temp.chk('R.2', 'empleado no reactiva',
  (select not activo from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));

-- Admin: sí. Mismo id, mismo DNI, sin biometría, vínculo intacto.
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000201'::uuid);
update empleados
   set activo = true, fecha_baja = null, motivo_baja = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000101'
   and activo = false;
select pg_temp.servicio();

select pg_temp.chk('R.3', 'admin reactiva',
  (select activo from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.4', 'limpia fecha de baja',
  (select fecha_baja is null from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.5', 'limpia motivo de baja',
  (select motivo_baja is null from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.6', 'conserva el mismo id y DNI',
  (select dni = '20111222' from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.7', 'no duplica el DNI',
  (select count(*) = 1 from empleados
    where empresa_id = 'bbbbbbbb-0000-0000-0000-00000000000a'
      and dni = '20111222'));
select pg_temp.chk('R.8', 'no restaura biometría',
  (select descriptor_facial is null
       and descriptor_version is null
       and consentimiento_biometrico is null
     from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.9', 'conserva usuario y rol',
  (select empleado_id = 'bbbbbbbb-0000-0000-0000-000000000101'
       and rol = 'admin_rrhh'
     from usuarios
    where id = 'bbbbbbbb-0000-0000-0000-000000000201'));

-- Ya activo: el filtro activo=false no pisa nada (ni la biometría).
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000201'::uuid);
update empleados
   set activo = true, fecha_baja = null, motivo_baja = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000102'
   and activo = false;
select pg_temp.servicio();
select pg_temp.chk('R.10', 'ya activo: 0 filas, biometría intacta',
  (select activo
       and descriptor_facial is not null
     from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000102'));

-- El UPDATE no inventa una segunda fila. El unique (empresa_id, dni)
-- sigue cerrando el otro camino (un INSERT con el mismo DNI).
select pg_temp.chk('R.11', 'sigue habiendo un solo colaborador con ese id',
  (select count(*) = 1 from empleados
    where id = 'bbbbbbbb-0000-0000-0000-000000000101'));
select pg_temp.chk('R.12', 'la empresa no ganó un legajo extra',
  (select count(*) = 2 from empleados
    where empresa_id = 'bbbbbbbb-0000-0000-0000-00000000000a'));

do $$
declare
  v_ok boolean := false;
begin
  begin
    insert into empleados (
      id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector
    ) values (
      'bbbbbbbb-0000-0000-0000-000000000199',
      'bbbbbbbb-0000-0000-0000-00000000000a',
      'Copia', 'Poster', '20111222', '2024-01-15', 'Socio', 'Dirección'
    );
  exception when unique_violation then
    v_ok := true;
  end;
  perform pg_temp.chk('R.13', 'DNI duplicado sigue rechazado', v_ok);
end $$;

do $$
begin
  raise notice '';
  raise notice 'OK: reactivar empleado';
end $$;

rollback;
