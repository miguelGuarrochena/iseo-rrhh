-- ============================================================
-- RLS/RPC: migración 61 — tenant check en saldo_* (anti-IDOR)
--
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_migration61.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.ausencias to authenticated;
grant select on table public.vacaciones_pendientes to authenticated;
grant select on table public.cupos_licencia to authenticated;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

-- ---------- Fixtures ----------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 (
   'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1',
   'M61-A', '30-m61a', 'A', 'm61a@t.test',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
 ),
 (
   'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b1',
   'M61-B', '30-m61b', 'B', 'm61b@t.test',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
 );

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'Emp', 'A1', 'm61a1', '2020-01-01', 'Op', 'Prod'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a3', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'Emp', 'A2', 'm61a2', '2019-01-01', 'Op', 'Prod'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a4', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'Sup', 'A', 'm61s1', '2018-01-01', 'Sup', 'Admin'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a5', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'Adm', 'A', 'm61d1', '2017-01-01', 'RRHH', 'Admin'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b1', 'Emp', 'B1', 'm61b1', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a6', '00000000-0000-0000-0000-000000000000', 'm61-a1@t.test', 'authenticated', 'authenticated'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a7', '00000000-0000-0000-0000-000000000000', 'm61-sup@t.test', 'authenticated', 'authenticated'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a8', '00000000-0000-0000-0000-000000000000', 'm61-adm@t.test', 'authenticated', 'authenticated'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a9', '00000000-0000-0000-0000-000000000000', 'm61-b1@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a6', 'm61-a1@t.test', 'empleado', 'Emp A1',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a7', 'm61-sup@t.test', 'supervisor', 'Sup A',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a4'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a8', 'm61-adm@t.test', 'admin_rrhh', 'Adm A',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a5'),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a9', 'm61-b1@t.test', 'empleado', 'Emp B1',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b1', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2');

insert into cupos_licencia (empresa_id, tipo, dias_anuales) values
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a1', 'mudanza', 5),
 ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b1', 'mudanza', 9)
on conflict do nothing;

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

create function pg_temp.assert_denied_saldo(p_label text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_denied boolean := false;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_denied := true;
    v_msg := sqlerrm;
  end;
  assert v_denied, format('EXPECTED DENIED: %s', p_label);
  assert v_msg ilike '%No autorizado%',
    format('EXPECTED generic auth error for %s, got: %s', p_label, v_msg);
end;
$$;

-- =====================================================================
-- A — mismo tenant, propio legajo
-- =====================================================================
select pg_temp.como('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a6'::uuid);

do $$
declare v int;
begin
  v := saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2'::uuid, 2026);
  assert v is not null, 'A: saldo propio vacaciones';
  assert v >= 0, 'A: saldo no negativo';
end $$;

do $$
declare v int;
begin
  v := saldo_licencia_disponible(
    'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2'::uuid, 'mudanza'::tipo_ausencia, 2026
  );
  assert v = 5, format('A: cupo mudanza propio=%s', v);
end $$;

-- =====================================================================
-- B — otro empleado mismo tenant (contrato histórico: sin filtro de rol)
-- =====================================================================
do $$
declare v int;
begin
  v := saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a3'::uuid, 2026);
  assert v is not null, 'B: peer mismo tenant vacaciones';
end $$;

do $$
declare v int;
begin
  v := saldo_licencia_disponible(
    'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a3'::uuid, 'mudanza'::tipo_ausencia, 2026
  );
  assert v = 5, 'B: peer mismo tenant licencia';
end $$;

-- =====================================================================
-- C — empleado cross-tenant
-- =====================================================================
select pg_temp.assert_denied_saldo(
  'C emp A1 → vacaciones B1',
  $q$select saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'C emp A1 → licencia B1',
  $q$select saldo_licencia_disponible(
       'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 'mudanza'::tipo_ausencia, 2026)$q$
);

-- =====================================================================
-- D — supervisor cross-tenant
-- =====================================================================
select pg_temp.como('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a7'::uuid);

select pg_temp.assert_denied_saldo(
  'D sup A → vacaciones B1',
  $q$select saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'D sup A → licencia B1',
  $q$select saldo_licencia_disponible(
       'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 'mudanza'::tipo_ausencia, 2026)$q$
);

-- Supervisor same-tenant still OK
do $$
declare v int;
begin
  v := saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2'::uuid, 2026);
  assert v is not null, 'D: sup same-tenant OK';
end $$;

-- =====================================================================
-- E — admin_rrhh cross-tenant (no es superadmin)
-- =====================================================================
select pg_temp.como('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a8'::uuid);

select pg_temp.assert_denied_saldo(
  'E adm A → vacaciones B1',
  $q$select saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'E adm A → licencia B1',
  $q$select saldo_licencia_disponible(
       'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 'mudanza'::tipo_ausencia, 2026)$q$
);

do $$
declare v int;
begin
  v := saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a2'::uuid, 2026);
  assert v is not null, 'E: adm same-tenant OK';
end $$;

-- =====================================================================
-- F — IDs inexistentes / NULL → fail closed, mismo error
-- =====================================================================
select pg_temp.como('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1a6'::uuid);

select pg_temp.assert_denied_saldo(
  'F UUID inexistente vacaciones',
  $q$select saldo_vacaciones_disponible('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'F UUID inexistente licencia',
  $q$select saldo_licencia_disponible(
       'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'mudanza'::tipo_ausencia, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'F NULL empleado vacaciones',
  $q$select saldo_vacaciones_disponible(null::uuid, 2026)$q$
);

select pg_temp.assert_denied_saldo(
  'F NULL empleado licencia',
  $q$select saldo_licencia_disponible(null::uuid, 'mudanza'::tipo_ausencia, 2026)$q$
);

-- =====================================================================
-- G — no hay p_empresa_id en la firma; spoofing N/A.
--     Documentamos: autoridad = auth_empresa() ∩ empleados.empresa_id.
-- =====================================================================
do $$ begin
  raise notice 'META G: saldo_* no aceptan p_empresa_id; spoofing de empresa imposible por firma';
end $$;

-- Sin JWT (service): sigue calculando (concurrencia / mantenimiento)
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare v int;
begin
  v := saldo_vacaciones_disponible('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1b2'::uuid, 2026);
  assert v is not null, 'service sin JWT puede calcular (triggers/concurrencia)';
end $$;

do $$ begin raise notice 'PASS rls_migration61'; end $$;

rollback;
