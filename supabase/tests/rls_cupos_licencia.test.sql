-- ============================================================
-- BUG-010: cupos de licencia (enforcement real)
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_cupos_licencia.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.ausencias to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.cupos_licencia to authenticated;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

-- Tenant A
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'Cupos SA',
  '30-c-1',
  'C',
  'c@c.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

-- Tenant B (aislamiento)
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee9',
  'Otra SA',
  '30-c-9',
  'O',
  'o@o.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'Emp', 'A', '801', '2020-01-01', 'Op', 'Prod'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'Ges', 'B', '802', '2019-01-01', 'Sup', 'Admin'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'Emp', 'C', '803', '2021-01-01', 'Op', 'Prod'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee8',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee9', 'Emp', 'X', '809', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', '00000000-0000-0000-0000-000000000000', 'cupo-emp@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', '00000000-0000-0000-0000-000000000000', 'cupo-ges@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee7', '00000000-0000-0000-0000-000000000000', 'cupo-emp2@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'cupo-emp@t.test', 'empleado', 'Emp A',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', 'cupo-ges@t.test', 'supervisor', 'Ges B',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee7', 'cupo-emp2@t.test', 'empleado', 'Emp C',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4');

-- Cupo mudanza = 2 días/año. Sin fila de 'enfermedad' → libre.
insert into cupos_licencia (empresa_id, tipo, dias_anuales) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'mudanza', 2);

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
-- Empleado: pendiente dentro de cupo → OK (pendiente no consume)
-- =====================================================================
select pg_temp.as_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5');

insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
  'mudanza', '2026-03-01', '2026-03-02', 99, 'pendiente'
);

do $$
begin
  if not exists (
    select 1 from ausencias
    where empleado_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
      and tipo = 'mudanza' and estado = 'pendiente'
  ) then
    raise exception 'FAIL: pendiente dentro de cupo debería insertar';
  end if;
end $$;

-- Empleado no puede insertar aprobada (BUG-003) ni aunque cupo alcance
do $$
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
      'mudanza', '2026-04-01', '2026-04-01', 1, 'aprobada'
    );
    raise exception 'FAIL: empleado no debería insertar aprobada';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null; -- RLS / check
  end;
end $$;

-- Empleado: pendiente que excedería el cupo si se aprobara → OK insertar
-- (regla: solo aprobadas consumen)
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
  'mudanza', '2026-05-01', '2026-05-05', 99, 'pendiente'
);

-- =====================================================================
-- Gestor aprueba dentro de cupo → OK
-- =====================================================================
select pg_temp.as_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6');

do $$
declare
  v_id uuid;
begin
  select id into v_id from ausencias
  where empleado_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
    and fecha_desde = '2026-03-01' and estado = 'pendiente';
  update ausencias set
    estado = 'aprobada',
    resuelta_por = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6',
    resuelta_en = now()
  where id = v_id;
end $$;

-- Disponible mudanza tras 2 días aprobados = 0
do $$
declare
  v int;
begin
  v := saldo_licencia_disponible(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'::uuid,
    'mudanza'::tipo_ausencia,
    2026
  );
  if v is distinct from 0 then
    raise exception 'FAIL: disponible esperado 0, got %', v;
  end if;
end $$;

-- Gestor aprueba el exceso (5 días) → DENIED
do $$
declare
  v_id uuid;
begin
  select id into v_id from ausencias
  where empleado_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
    and fecha_desde = '2026-05-01' and estado = 'pendiente';
  begin
    update ausencias set
      estado = 'aprobada',
      resuelta_por = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6',
      resuelta_en = now()
    where id = v_id;
    raise exception 'FAIL: aprobar sobre cupo debería fallar';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm not like '%licencia suficientes%' then
        raise exception 'FAIL: error inesperado: %', sqlerrm;
      end if;
  end;
end $$;

-- Gestor carga aprobada dentro de cupo de otro empleado → OK (cupo por legajo)
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado,
  resuelta_por, resuelta_en, comentario_resolucion
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4',
  'mudanza', '2026-06-01', '2026-06-02', 99, 'aprobada',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', now(), 'Carga manual'
);

-- Gestor carga aprobada excediendo cupo del mismo → DENIED
do $$
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado,
      resuelta_por, resuelta_en
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4',
      'mudanza', '2026-07-01', '2026-07-03', 99, 'aprobada',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', now()
    );
    raise exception 'FAIL: carga aprobada sobre cupo debería fallar';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm not like '%licencia suficientes%' then
        raise exception 'FAIL: error inesperado: %', sqlerrm;
      end if;
  end;
end $$;

-- Sin cupo (enfermedad) → aprobada OK aunque sean muchos días
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado,
  resuelta_por, resuelta_en
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
  'enfermedad', '2026-08-01', '2026-08-20', 99, 'aprobada',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', now()
);

-- Rechazar no consume
do $$
declare
  v_id uuid;
  v int;
begin
  select id into v_id from ausencias
  where empleado_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'
    and fecha_desde = '2026-05-01';
  update ausencias set
    estado = 'rechazada',
    resuelta_por = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6',
    resuelta_en = now()
  where id = v_id;
  v := saldo_licencia_disponible(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'::uuid,
    'mudanza'::tipo_ausencia,
    2026
  );
  if v is distinct from 0 then
    raise exception 'FAIL: rechazo no debe cambiar disponible (sigue 0), got %', v;
  end if;
end $$;

-- =====================================================================
-- Cross-empleado / cross-tenant
-- =====================================================================
select pg_temp.as_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5');

-- Empleado A no inserta como empleado C
do $$
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4',
      'mudanza', '2026-09-01', '2026-09-01', 1, 'pendiente'
    );
    raise exception 'FAIL: no debería crear ausencia de otro legajo';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- Tenant B
do $$
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee9',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee8',
      'mudanza', '2026-09-01', '2026-09-01', 1, 'pendiente'
    );
    raise exception 'FAIL: no debería insertar en otro tenant';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

select pg_temp.as_service();
do $$ begin raise notice 'PASS rls_cupos_licencia'; end $$;
rollback;
