-- ============================================================
-- BUG-007 / BUG-008: estados de ausencias + saldo atómico
--
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_ausencias_estados_saldo.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.ausencias to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.vacaciones_pendientes to authenticated;
grant select on table public.feriados to authenticated;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'Vacaciones SA',
  '30-v-1',
  'V',
  'v@v.com',
  -- Corridos LCT: ingreso 2020 → 21 días en 2026 (≥5 años).
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
    "vacacionesDiasHabiles":false}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Emp', 'Vac', '601', '2020-01-01', 'Op', 'Prod'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Ges', 'Tor', '602', '2019-01-01', 'Sup', 'Admin');

insert into auth.users (id, instance_id, email, aud, role)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc4', '00000000-0000-0000-0000-000000000000',
   'emp@vac.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc5', '00000000-0000-0000-0000-000000000000',
   'ges@vac.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc4', 'emp@vac.test', 'empleado', 'Emp Vac',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc5', 'ges@vac.test', 'supervisor', 'Ges Tor',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'cccccccc-cccc-cccc-cccc-ccccccccccc3');

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
-- BUG-008: saldo
-- =====================================================================
set local role authenticated;
select pg_temp.como('cccccccc-cccc-cccc-cccc-ccccccccccc4'::uuid);

do $$
begin
  assert saldo_vacaciones_disponible(
    'cccccccc-cccc-cccc-cccc-ccccccccccc2', 2026
  ) = 21, 'saldo inicial 21 (LCT 5–10 años)';
end $$;

-- Dentro de saldo → OK (5 días)
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'vacaciones', '2026-03-01', '2026-03-05', 99, 'pendiente'
);

do $$
declare v_dias int;
begin
  select dias into v_dias from ausencias
   where empleado_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc2'
     and fecha_desde = '2026-03-01';
  assert v_dias = 5, 'el servidor recalcula días (ignora 99 del cliente)';
  assert saldo_vacaciones_disponible(
    'cccccccc-cccc-cccc-cccc-ccccccccccc2', 2026
  ) = 16, 'pendientes reservan saldo';
end $$;

-- Exceder saldo → DENIED
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'cccccccc-cccc-cccc-cccc-ccccccccccc1',
      'cccccccc-cccc-cccc-cccc-ccccccccccc2',
      'vacaciones', '2026-04-01', '2026-04-30', 30, 'pendiente'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado no puede pedir más días que el disponible';
end $$;

-- Empleado no puede auto-override insertando aprobada (mig 56)
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'cccccccc-cccc-cccc-cccc-ccccccccccc1',
      'cccccccc-cccc-cccc-cccc-ccccccccccc2',
      'vacaciones', '2026-05-01', '2026-05-02', 2, 'aprobada'
    );
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado no inserta vacaciones ya aprobadas';
end $$;

-- =====================================================================
-- BUG-007: máquina de estados
-- =====================================================================
select pg_temp.como('cccccccc-cccc-cccc-cccc-ccccccccccc5'::uuid);

-- Gestor aprueba pendiente → OK
do $$
declare v_id uuid;
begin
  select id into v_id from ausencias
   where fecha_desde = '2026-03-01' and estado = 'pendiente';
  update ausencias
     set estado = 'aprobada',
         resuelta_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc5',
         resuelta_en = now(),
         comentario_resolucion = 'OK'
   where id = v_id;
  assert (select estado from ausencias where id = v_id) = 'aprobada',
    'gestor puede aprobar pendiente';
end $$;

-- Crear pendiente para rechazar
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'especial', '2026-06-01', '2026-06-01', 1, 'pendiente'
);

do $$
declare v_id uuid;
begin
  select id into v_id from ausencias
   where fecha_desde = '2026-06-01' and estado = 'pendiente';
  update ausencias
     set estado = 'rechazada',
         resuelta_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc5',
         resuelta_en = now()
   where id = v_id;
  assert (select estado from ausencias where id = v_id) = 'rechazada',
    'gestor puede rechazar pendiente';
end $$;

-- Transiciones inválidas sobre resueltas
do $$
declare
  v_id uuid;
  v_fallo boolean;
begin
  select id into v_id from ausencias where fecha_desde = '2026-03-01';

  v_fallo := false;
  begin
    update ausencias set estado = 'rechazada' where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'aprobada → rechazada denegada';

  v_fallo := false;
  begin
    update ausencias set estado = 'pendiente' where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'aprobada → pendiente denegada';

  v_fallo := false;
  begin
    update ausencias set fecha_desde = '2026-03-02' where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'no se alteran fechas de resuelta';

  v_fallo := false;
  begin
    update ausencias set dias = 99 where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'no se alteran días de resuelta';

  v_fallo := false;
  begin
    update ausencias set empleado_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc3' where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'no se altera empleado_id de resuelta';

  select id into v_id from ausencias where fecha_desde = '2026-06-01';
  v_fallo := false;
  begin
    update ausencias set estado = 'aprobada', resuelta_en = now() where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'rechazada → aprobada denegada';

  v_fallo := false;
  begin
    update ausencias set estado = 'pendiente' where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'rechazada → pendiente denegada';
end $$;

-- Al resolver no se pueden cambiar datos de la solicitud
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'estudio', '2026-07-01', '2026-07-01', 1, 'pendiente'
);

do $$
declare v_id uuid; v_fallo boolean := false;
begin
  select id into v_id from ausencias
   where fecha_desde = '2026-07-01' and estado = 'pendiente';
  begin
    update ausencias
       set estado = 'aprobada',
           resuelta_en = now(),
           dias = 5
     where id = v_id;
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'al aprobar no se pueden cambiar los días';
end $$;

-- Empleado no puede resolver
select pg_temp.como('cccccccc-cccc-cccc-cccc-ccccccccccc4'::uuid);
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'especial', '2026-08-01', '2026-08-01', 1, 'pendiente'
);

do $$
declare v_id uuid;
begin
  select id into v_id from ausencias
   where fecha_desde = '2026-08-01' and estado = 'pendiente';
  update ausencias
     set estado = 'aprobada', resuelta_en = now()
   where id = v_id;
  -- Sin policy UPDATE: 0 filas
  assert (select estado from ausencias where id = v_id) = 'pendiente',
    'empleado no resuelve ausencias';
end $$;

-- Override gestor: exceder saldo → OK
select pg_temp.como('cccccccc-cccc-cccc-cccc-ccccccccccc5'::uuid);
insert into ausencias (
  empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias,
  estado, resuelta_por, resuelta_en, comentario_resolucion
) values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'vacaciones', '2026-09-01', '2026-09-30', 30,
  'aprobada',
  'cccccccc-cccc-cccc-cccc-ccccccccccc5',
  now(),
  'Carga manual de RRHH'
);

do $$
begin
  assert (
    select count(*) from ausencias
    where fecha_desde = '2026-09-01' and estado = 'aprobada'
  ) = 1, 'gestor puede override de saldo';
end $$;

reset role;
rollback;
