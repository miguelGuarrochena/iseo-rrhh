-- ============================================================
-- RLS: estados de solicitud (BUG-003 / BUG-004)
--
-- Cómo se corre (igual que rpc.test.sql):
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_estados_solicitud.test.sql
--
-- Estos tests SÍ ejercitan RLS: cambian a rol `authenticated` y fijan
-- el JWT (`request.jwt.claims`). No son unit tests de Jest.
-- ============================================================

\set ON_ERROR_STOP on
begin;

-- En un proyecto Supabase “de fábrica”, `authenticated` ya tiene
-- SELECT/INSERT/UPDATE/DELETE sobre public.* y RLS decide. Este entorno
-- local a veces restaura un backup sin esos grants: sin ellos el test
-- mide “permission denied” en vez de RLS. Se alinean acá.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.ausencias to authenticated;
grant select, insert, update, delete on table public.adelantos to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;

-- ---------- Fixtures ----------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'RLS Estados SA',
  '30-2-9',
  'B',
  'b@b.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Emp', 'Leado', '301', '2021-01-01', 'Op', 'Prod'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin', 'Rrhh', '302', '2020-01-01', 'RRHH', 'Admin');

insert into auth.users (id, instance_id, email, aud, role)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'empleado@rls.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
   'admin@rls.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'empleado@rls.test', 'empleado', 'Emp Leado',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin@rls.test', 'admin_rrhh', 'Admin Rrhh',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Helper: actúa como un usuario autenticado (RLS aplica).
-- pg_temp.* es visible en esta sesión y no ensucia el schema público.
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
end;
$$;

-- =====================================================================
-- AUSENCIAS — empleado
-- =====================================================================
set local role authenticated;
select pg_temp.como('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);

-- BUG-003: INSERT aprobada → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'vacaciones', '2026-09-01', '2026-09-05', 5, 'aprobada'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado NO puede insertar ausencia aprobada';
end $$;

-- BUG-003: INSERT rechazada → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'vacaciones', '2026-09-01', '2026-09-05', 5, 'rechazada'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado NO puede insertar ausencia rechazada';
end $$;

-- INSERT pendiente → OK
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'especial', '2026-09-10', '2026-09-10', 1, 'pendiente'
);

do $$
begin
  assert (
    select count(*) from ausencias
    where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and estado = 'pendiente'
  ) = 1, 'empleado puede crear ausencia pendiente';
end $$;

-- Omitir estado (default pendiente) → OK
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'estudio', '2026-09-11', '2026-09-11', 1
);

-- pendiente + campos de resolución forjados → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias,
      estado, resuelta_por, resuelta_en
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'especial', '2026-09-12', '2026-09-12', 1,
      'pendiente',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      now()
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado no puede forjar resuelta_por/resuelta_en';
end $$;

-- UPDATE pendiente → aprobada → FAIL (sin policy de update para empleado)
do $$
declare v_fallo boolean := false;
begin
  begin
    update ausencias
       set estado = 'aprobada',
           resuelta_en = now()
     where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
       and estado = 'pendiente';
  exception when others then v_fallo := true;
  end;
  -- RLS: 0 filas actualizadas o error; en Postgres RLS UPDATE silencioso = 0 rows
  if not v_fallo then
    assert (
      select count(*) from ausencias
      where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        and estado = 'aprobada'
    ) = 0, 'empleado no puede pasar pendiente a aprobada';
  end if;
end $$;

-- Legajo ajeno → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'especial', '2026-09-13', '2026-09-13', 1, 'pendiente'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado no puede crear ausencia de otro legajo';
end $$;

-- =====================================================================
-- AUSENCIAS — admin_rrhh (gestor)
-- =====================================================================
select pg_temp.como('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);

-- Carga manual ya aprobada → OK (flujo legítimo)
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias,
  estado, resuelta_por, resuelta_en, comentario_resolucion
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'vacaciones', '2026-10-01', '2026-10-05', 5,
  'aprobada',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  now(),
  'Carga manual de RRHH'
);

-- Resolver pendiente → aprobada → OK
do $$
declare v_id uuid;
begin
  select id into v_id from ausencias
   where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and tipo = 'especial'
     and estado = 'pendiente'
   limit 1;
  update ausencias
     set estado = 'aprobada',
         resuelta_por = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
         resuelta_en = now()
   where id = v_id;
  assert (select estado from ausencias where id = v_id) = 'aprobada',
    'gestor puede aprobar pendiente';
end $$;

-- Resolver pendiente → rechazada → OK
do $$
declare v_id uuid;
begin
  select id into v_id from ausencias
   where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and tipo = 'estudio'
     and estado = 'pendiente'
   limit 1;
  update ausencias
     set estado = 'rechazada',
         resuelta_por = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
         resuelta_en = now(),
         comentario_resolucion = 'No corresponde'
   where id = v_id;
  assert (select estado from ausencias where id = v_id) = 'rechazada',
    'gestor puede rechazar pendiente';
end $$;

-- =====================================================================
-- ADELANTOS — empleado
-- =====================================================================
select pg_temp.como('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);

-- BUG-004: INSERT aprobado → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into adelantos (empresa_id, empleado_id, monto, estado)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      10000, 'aprobado'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado NO puede insertar adelanto aprobado';
end $$;

-- INSERT rechazado → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into adelantos (empresa_id, empleado_id, monto, estado)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      10000, 'rechazado'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado NO puede insertar adelanto rechazado';
end $$;

-- INSERT pendiente → OK
insert into adelantos (empresa_id, empleado_id, monto, motivo, estado)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  5000, 'Urgencia', 'pendiente'
);

-- pendiente + periodo (dato de resolución) → FAIL
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into adelantos (empresa_id, empleado_id, monto, estado, periodo)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      1000, 'pendiente', '2026-09'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado no puede fijar periodo al pedir';
end $$;

-- UPDATE a aprobado → FAIL (empleado no es admin_rrhh)
do $$
declare v_fallo boolean := false;
begin
  begin
    update adelantos
       set estado = 'aprobado',
           periodo = '2026-09',
           resuelto_en = now()
     where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
       and estado = 'pendiente';
  exception when others then v_fallo := true;
  end;
  if not v_fallo then
    assert (
      select count(*) from adelantos
      where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        and estado = 'aprobado'
    ) = 0, 'empleado no puede aprobar su adelanto';
  end if;
end $$;

-- =====================================================================
-- ADELANTOS — admin_rrhh
-- =====================================================================
select pg_temp.como('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);

-- Pedido pendiente por otro → OK
insert into adelantos (empresa_id, empleado_id, monto, estado)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  2000, 'pendiente'
);

-- Resolver pendiente → aprobado → OK
do $$
declare v_id uuid;
begin
  select id into v_id from adelantos
   where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and monto = 5000
     and estado = 'pendiente'
   limit 1;
  update adelantos
     set estado = 'aprobado',
         periodo = '2026-09',
         resuelto_en = now()
   where id = v_id;
  assert (select estado from adelantos where id = v_id) = 'aprobado',
    'admin puede aprobar adelanto pendiente';
end $$;

-- Resolver → rechazado → OK
do $$
declare v_id uuid;
begin
  select id into v_id from adelantos
   where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and monto = 2000
     and estado = 'pendiente'
   limit 1;
  update adelantos
     set estado = 'rechazado',
         resuelto_en = now()
   where id = v_id;
  assert (select estado from adelantos where id = v_id) = 'rechazado',
    'admin puede rechazar adelanto pendiente';
end $$;

reset role;
rollback;
