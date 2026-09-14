-- ============================================================
-- RLS de objetivos_venta_mes.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/objetivos_venta.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete
  on table public.objetivos_venta_mes to authenticated, anon;
grant select on table public.usuarios, public.empresas to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'Ventas A', '30-ov-1', 'A', 'a@a.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"modulos":{"objetivos-ventas":true}}'::jsonb),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'Ventas B', '30-ov-2', 'B', 'b@b.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"modulos":{"objetivos-ventas":true}}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('eeeeeeee-0000-0000-0000-000000000101',
   'eeeeeeee-0000-0000-0000-00000000000a', 'Ana', 'Ruiz', '901', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('eeeeeeee-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'ov-a@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'ov-b@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'ov-emp@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('eeeeeeee-0000-0000-0000-000000000201', 'ov-a@t.test', 'admin_rrhh', 'Admin A',
   'eeeeeeee-0000-0000-0000-00000000000a', null),
  ('eeeeeeee-0000-0000-0000-000000000202', 'ov-b@t.test', 'admin_rrhh', 'Admin B',
   'eeeeeeee-0000-0000-0000-00000000000b', null),
  ('eeeeeeee-0000-0000-0000-000000000203', 'ov-emp@t.test', 'empleado', 'Ana Ruiz',
   'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-000000000101');

create or replace function pg_temp.como(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.servicio() returns void
language plpgsql as $$
begin execute 'set local role postgres'; perform set_config('request.jwt.claims','',true); end $$;

create or replace function pg_temp.chk(nro text, desc_ text, ok boolean)
returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLA % — %', nro, desc_; end if;
  raise notice '  ok  % %', rpad(nro, 6), desc_;
end $$;

create or replace function pg_temp.entra(sql text) returns boolean
language plpgsql as $$
begin execute sql; return true;
exception when others then return false;
end $$;

/**
 * Filas realmente tocadas, o -1 si fue rechazada.
 *
 * Un UPDATE que RLS deja sin filas no lanza error: WITH CHECK falla
 * con excepción (INSERT), USING no (UPDATE de 0 filas).
 */
create or replace function pg_temp.afecta(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then return -1;
end $$;

-- Admin A escribe el objetivo de su empresa.
select pg_temp.como('eeeeeeee-0000-0000-0000-000000000201');
select pg_temp.chk('OV-1', 'admin A inserta su mes',
  pg_temp.entra($i$
    insert into objetivos_venta_mes (empresa_id, periodo, monto_objetivo, monto_alcanzado, bono_monto)
    values ('eeeeeeee-0000-0000-0000-00000000000a', '2026-09', 1000000, 250000, 50000)
  $i$));

-- Admin B no lee ni escribe el de A.
select pg_temp.como('eeeeeeee-0000-0000-0000-000000000202');
select pg_temp.chk('OV-2', 'admin B no ve el objetivo de A',
  (select count(*) from objetivos_venta_mes) = 0);
select pg_temp.chk('OV-3', 'admin B no inserta en empresa A',
  not pg_temp.entra($i$
    insert into objetivos_venta_mes (empresa_id, periodo, monto_objetivo)
    values ('eeeeeeee-0000-0000-0000-00000000000a', '2026-10', 1)
  $i$));

-- El colaborador de A sí lee, no escribe.
select pg_temp.como('eeeeeeee-0000-0000-0000-000000000203');
select pg_temp.chk('OV-4', 'empleado ve el objetivo de su empresa',
  (select count(*) from objetivos_venta_mes) = 1);
select pg_temp.chk('OV-5', 'empleado no actualiza',
  pg_temp.afecta($u$
    update objetivos_venta_mes set monto_alcanzado = 999 where periodo = '2026-09'
  $u$) = 0
  and (select monto_alcanzado from objetivos_venta_mes where periodo = '2026-09') = 250000);

select pg_temp.servicio();
rollback;
