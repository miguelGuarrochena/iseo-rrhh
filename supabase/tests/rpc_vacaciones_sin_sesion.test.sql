-- ============================================================
-- P0: los RPC de vacaciones no se consultan sin sesión ni entre empresas.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rpc_vacaciones_sin_sesion.test.sql
--
-- `vacaciones_legales_corridas` y `dias_vacaciones_corresponden` son
-- `security definer` y leen `empleados` salteando RLS. Las migraciones 91
-- y 92 les dieron EXECUTE a `authenticated` sin sacarle el de PUBLIC, así
-- que `anon` —la clave que va en el bundle del cliente— las tenía. Con un
-- UUID de legajo se obtenía el cupo de vacaciones de cualquier empresa, y
-- de paso se confirmaba si ese UUID existía.
--
-- Esto fija las dos mitades del arreglo: el permiso y el gate de tenencia.
-- ============================================================

\set ON_ERROR_STOP on
begin;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('aaaa1111-0000-0000-0000-00000000000a', 'Victima SA', '30-p0-1', 'V', 'v@v.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
  ('aaaa1111-0000-0000-0000-00000000000c', 'Curiosa SA', '30-p0-2', 'C', 'c@c.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  -- Ingreso viejo a propósito: devuelve 35, que delata la antigüedad.
  ('aaaa1111-0000-0000-0000-00000000000b', 'aaaa1111-0000-0000-0000-00000000000a',
   'Ana', 'Victima', '9001', '2001-01-01', 'Dir', 'Dir'),
  ('aaaa1111-0000-0000-0000-00000000000d', 'aaaa1111-0000-0000-0000-00000000000c',
   'Caro', 'Curiosa', '9002', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('aaaa1111-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000',
   'curiosa@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('aaaa1111-0000-0000-0000-00000000000e', 'curiosa@t.test', 'admin_rrhh', 'Caro',
   'aaaa1111-0000-0000-0000-00000000000c', 'aaaa1111-0000-0000-0000-00000000000d');

create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- =====================================================================
-- 1. El permiso: anon no puede ni ejecutarlas
-- =====================================================================
do $$
begin
  if has_function_privilege('anon',
       'public.vacaciones_legales_corridas(uuid,int)', 'EXECUTE') then
    raise exception 'FAIL: anon no debería poder ejecutar vacaciones_legales_corridas';
  end if;
  if has_function_privilege('anon',
       'public.dias_vacaciones_corresponden(uuid,int,jsonb)', 'EXECUTE') then
    raise exception 'FAIL: anon no debería poder ejecutar dias_vacaciones_corresponden';
  end if;
  if has_function_privilege('anon',
       'public.dias_no_computables_art152(uuid,date,date)', 'EXECUTE') then
    raise exception 'FAIL: anon no debería poder ejecutar dias_no_computables_art152';
  end if;
  -- Y tampoco PUBLIC, que es de donde venía el permiso de anon.
  if has_function_privilege('public',
       'public.vacaciones_legales_corridas(uuid,int)', 'EXECUTE') then
    raise exception 'FAIL: PUBLIC no debería tener EXECUTE';
  end if;
end $$;

-- Ejecutarlas de verdad como anon tiene que fallar.
set local role anon;
do $$
begin
  begin
    perform vacaciones_legales_corridas(
      'aaaa1111-0000-0000-0000-00000000000b', 2026);
    raise exception 'FAIL: anon ejecutó vacaciones_legales_corridas';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

select pg_temp.as_service();

-- =====================================================================
-- 2. El gate: un autenticado de otra empresa tampoco
-- =====================================================================
select pg_temp.as_user('aaaa1111-0000-0000-0000-00000000000e');

do $$
begin
  begin
    perform vacaciones_legales_corridas(
      'aaaa1111-0000-0000-0000-00000000000b', 2026);
    raise exception 'FAIL: Curiosa leyó el cupo de un legajo de Victima';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;

  begin
    perform dias_vacaciones_corresponden(
      'aaaa1111-0000-0000-0000-00000000000b', 2026, '{}'::jsonb);
    raise exception 'FAIL: Curiosa leyó el derecho de un legajo de Victima';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- 3. Sobre su propia empresa sigue funcionando igual
-- =====================================================================
do $$
declare v_dias int;
begin
  v_dias := vacaciones_legales_corridas(
    'aaaa1111-0000-0000-0000-00000000000d', 2026);
  -- Ingreso 2020-01-01, año 2026: más de 5 y hasta 10 → 21 (art. 150).
  if v_dias <> 21 then
    raise exception 'FAIL: sobre su propia empresa debería dar 21, dio %', v_dias;
  end if;

  v_dias := dias_vacaciones_corresponden(
    'aaaa1111-0000-0000-0000-00000000000d', 2026, '{}'::jsonb);
  if v_dias <> 21 then
    raise exception 'FAIL: el despachador debería dar 21, dio %', v_dias;
  end if;
end $$;

-- =====================================================================
-- 4. Sin JWT (migraciones, jobs, fixtures) el gate no aplica
-- =====================================================================
select pg_temp.as_service();

do $$
declare v_dias int;
begin
  v_dias := vacaciones_legales_corridas(
    'aaaa1111-0000-0000-0000-00000000000b', 2026);
  if v_dias <> 35 then
    raise exception 'FAIL: sin sesión debería seguir calculando (35), dio %', v_dias;
  end if;
end $$;

do $$ begin raise notice 'PASS rpc_vacaciones_sin_sesion'; end $$;
rollback;
