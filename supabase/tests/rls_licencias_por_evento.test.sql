-- ============================================================
-- L-02 / L-03 / F-06: cómo se controla el cupo de una licencia.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_licencias_por_evento.test.sql
--
-- Lo que fija:
--   L-02 — fallecimiento, casamiento y nacimiento no tienen cupo anual:
--          la ley los da por cada hecho que los genera (art. 158).
--   L-03 — maternidad y excedencia tampoco, y no compiten con el cupo
--          de 'especial', que es donde caían antes de existir el tipo.
--   F-06 — los días de una licencia que cruza el 31/12 se imputan al año
--          al que pertenecen, no todos al año en que empezó.
--   Y que nada de esto abrió la puerta al saldo de otro tenant (mig 61).
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
  'cccc0000-0000-0000-0000-0000000000a1',
  'Evento SA',
  '30-ev-1',
  'E',
  'e@e.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

-- Tenant B (aislamiento)
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'cccc0000-0000-0000-0000-0000000000b1',
  'Otra Evento SA',
  '30-ev-9',
  'O',
  'o@o.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('cccc0000-0000-0000-0000-0000000000a2',
   'cccc0000-0000-0000-0000-0000000000a1', 'Emp', 'A', '901', '2020-01-01', 'Op', 'Prod'),
  ('cccc0000-0000-0000-0000-0000000000a3',
   'cccc0000-0000-0000-0000-0000000000a1', 'Adm', 'A', '902', '2019-01-01', 'RRHH', 'Admin'),
  ('cccc0000-0000-0000-0000-0000000000b2',
   'cccc0000-0000-0000-0000-0000000000b1', 'Emp', 'B', '903', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('cccc0000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'ev-adm@t.test', 'authenticated', 'authenticated'),
  ('cccc0000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'ev-adm-b@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('cccc0000-0000-0000-0000-0000000000a4', 'ev-adm@t.test', 'admin_rrhh', 'Adm A',
   'cccc0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-0000000000a3'),
  ('cccc0000-0000-0000-0000-0000000000b4', 'ev-adm-b@t.test', 'admin_rrhh', 'Adm B',
   'cccc0000-0000-0000-0000-0000000000b1', 'cccc0000-0000-0000-0000-0000000000b2');

-- La empresa configuró los cupos "correctos" del art. 158. Antes esto
-- alcanzaba para negar la segunda licencia del año.
insert into cupos_licencia (empresa_id, tipo, dias_anuales) values
  ('cccc0000-0000-0000-0000-0000000000a1', 'fallecimiento', 3),
  ('cccc0000-0000-0000-0000-0000000000a1', 'especial', 5),
  ('cccc0000-0000-0000-0000-0000000000a1', 'estudio', 10);

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

/** Carga una ausencia aprobada como RRHH y devuelve el error, o NULL. */
create or replace function pg_temp.cargar(
  p_empleado uuid, p_tipo tipo_ausencia, p_desde date, p_hasta date
) returns text
language plpgsql as $$
begin
  insert into ausencias (
    empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
  ) values (
    'cccc0000-0000-0000-0000-0000000000a1', p_empleado, p_tipo,
    p_desde, p_hasta, 1, 'aprobada'
  );
  return null;
exception when others then
  return sqlerrm;
end;
$$;

select pg_temp.as_user('cccc0000-0000-0000-0000-0000000000a4');

-- =====================================================================
-- L-02: dos fallecimientos en el mismo año, con cupo de 3
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'fallecimiento',
    '2026-03-02', '2026-03-04');
  if v_err is not null then
    raise exception 'FAIL: el primer fallecimiento debería entrar (%)', v_err;
  end if;

  -- El que fallaba: mismo año, cupo agotado por el anterior.
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'fallecimiento',
    '2026-11-02', '2026-11-04');
  if v_err is not null then
    raise exception
      'FAIL: el segundo fallecimiento del año también corresponde (%)', v_err;
  end if;
end $$;

-- Y no hay saldo que consultar para un tipo por evento.
do $$
begin
  if saldo_licencia_disponible(
       'cccc0000-0000-0000-0000-0000000000a2', 'fallecimiento', 2026
     ) is not null then
    raise exception 'FAIL: una licencia por evento no tiene cupo';
  end if;
end $$;

-- =====================================================================
-- L-03: maternidad de 90 días no compite con el cupo de 'especial'
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'maternidad',
    '2026-09-01', '2026-11-29');
  if v_err is not null then
    raise exception 'FAIL: la maternidad no debería topar contra cupo (%)', v_err;
  end if;

  -- El mismo período como 'especial' sí choca: es por qué hacía falta
  -- el tipo propio.
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'especial',
    '2027-09-01', '2027-11-29');
  if v_err is null or v_err not like '%licencia suficientes%' then
    raise exception
      'FAIL: 90 días de "especial" con cupo 5 deberían rechazarse (%)', v_err;
  end if;
end $$;

-- =====================================================================
-- F-06: una licencia que cruza el 31/12 se reparte entre los dos años
-- =====================================================================
do $$
declare v_err text;
begin
  -- Estudio, cupo 10. Del 28/12 al 06/01: 4 días de 2026, 6 de 2027.
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'estudio',
    '2026-12-28', '2027-01-06');
  if v_err is not null then
    raise exception 'FAIL: la licencia a caballo debería entrar (%)', v_err;
  end if;

  if saldo_licencia_disponible(
       'cccc0000-0000-0000-0000-0000000000a2', 'estudio', 2026) <> 6 then
    raise exception 'FAIL: 2026 debería quedar con 6 (consumió 4), dio %',
      saldo_licencia_disponible(
        'cccc0000-0000-0000-0000-0000000000a2', 'estudio', 2026);
  end if;

  if saldo_licencia_disponible(
       'cccc0000-0000-0000-0000-0000000000a2', 'estudio', 2027) <> 4 then
    raise exception 'FAIL: 2027 debería quedar con 4 (consumió 6), dio %',
      saldo_licencia_disponible(
        'cccc0000-0000-0000-0000-0000000000a2', 'estudio', 2027);
  end if;
end $$;

-- El cupo sigue frenando: 5 días más en 2027 no entran (quedan 4).
do $$
declare v_err text;
begin
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'estudio',
    '2027-03-01', '2027-03-05');
  if v_err is null or v_err not like '%licencia suficientes%' then
    raise exception 'FAIL: 5 días con 4 disponibles deberían rechazarse (%)', v_err;
  end if;

  -- Pero 4 sí, y el mensaje dice de qué año habla.
  v_err := pg_temp.cargar(
    'cccc0000-0000-0000-0000-0000000000a2', 'estudio',
    '2027-03-01', '2027-03-04');
  if v_err is not null then
    raise exception 'FAIL: 4 días con 4 disponibles deberían entrar (%)', v_err;
  end if;
end $$;

-- =====================================================================
-- Tenencia (mig 61): el saldo de otro tenant sigue cerrado
-- =====================================================================
select pg_temp.as_user('cccc0000-0000-0000-0000-0000000000b4');

do $$
begin
  begin
    perform saldo_licencia_disponible(
      'cccc0000-0000-0000-0000-0000000000a2', 'estudio', 2026);
    raise exception 'FAIL: B no debería leer el saldo de un legajo de A';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

select pg_temp.as_service();

-- =====================================================================
-- F-10: un documento archivado no se lista ni se firma
-- =====================================================================
insert into documentos_firma (id, empresa_id, titulo, archivo_url, archivado_en)
values ('cccc0000-0000-0000-0000-0000000000f1',
        'cccc0000-0000-0000-0000-0000000000a1', 'Retirado', 'x/y.pdf', now());
insert into documento_firma_destinatarios (id, documento_id, empleado_id)
values ('cccc0000-0000-0000-0000-0000000000f2',
        'cccc0000-0000-0000-0000-0000000000f1',
        'cccc0000-0000-0000-0000-0000000000a2');

insert into auth.users (id, instance_id, email, aud, role) values
  ('cccc0000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000000',
   'ev-emp@t.test', 'authenticated', 'authenticated');
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('cccc0000-0000-0000-0000-0000000000f3', 'ev-emp@t.test', 'empleado', 'Emp A',
   'cccc0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-0000000000a2');

grant select on table public.documentos_firma to authenticated;
grant select, update on table public.documento_firma_destinatarios to authenticated;

select pg_temp.as_user('cccc0000-0000-0000-0000-0000000000f3');

do $$
begin
  -- No lo ve.
  if exists (
    select 1 from documentos_firma
    where id = 'cccc0000-0000-0000-0000-0000000000f1'
  ) then
    raise exception 'FAIL: el destinatario no debería ver un documento archivado';
  end if;

  -- Y no lo puede firmar.
  begin
    update documento_firma_destinatarios
       set firmado_en = now()
     where id = 'cccc0000-0000-0000-0000-0000000000f2';
    if found then
      raise exception 'FAIL: se firmó un documento archivado';
    end if;
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

select pg_temp.as_service();
do $$ begin raise notice 'PASS rls_licencias_por_evento'; end $$;
rollback;
