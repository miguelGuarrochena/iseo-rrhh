-- ============================================================
-- Migration 70 — empresa_de_documento_firma tenant gate (IND-04/06b)
-- ============================================================
\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.empresa_de_documento_firma(uuid) to authenticated;

-- PII lockdown (mig 66/69) after broad GRANT
revoke select on table public.empleados from authenticated;
grant select (
  id, empresa_id, nombre, apellido, dni, cuil, fecha_nacimiento, estado_civil,
  nivel_estudios, domicilio, telefono, email, contacto_emergencia, grupo_familiar,
  foto_url, fecha_ingreso, puesto, sector, supervisor_id, modalidad_contratacion,
  fecha_fin_contrato, modalidad_pago, banco, obra_social, art, activo, fecha_baja,
  motivo_baja, checklist_alta, creado_en, modo_fichaje, geocerca, convenio,
  numero_legajo, sin_usuario
) on table public.empleados to authenticated;
grant insert, update, delete on table public.empleados to authenticated;
grant select on public.empleados_lectura to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','M70-A','30-m70a','A','m70a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b1','M70-B','30-m70b','B','m70b@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a2','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','Emp','A','m70e1','2020-01-01','Op','Prod'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a3','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','Sup','A','m70s1','2019-01-01','Sup','Admin'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a4','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','Adm','A','m70a1','2018-01-01','RRHH','Admin'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b2','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b1','Emp','B','m70e9','2020-01-01','Op','Prod');

insert into auth.users (id, instance_id, email, aud, role) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5','00000000-0000-0000-0000-000000000000','m70-emp@t.test','authenticated','authenticated'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a6','00000000-0000-0000-0000-000000000000','m70-sup@t.test','authenticated','authenticated'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a7','00000000-0000-0000-0000-000000000000','m70-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5','m70-emp@t.test','empleado','Emp A',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a2'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a6','m70-sup@t.test','supervisor','Sup A',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a3'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a7','m70-adm@t.test','admin_rrhh','Adm A',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a4');

-- Docs: own tenant + foreign tenant
insert into documentos_firma (id, empresa_id, titulo, archivo_url) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1','Doc A',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1/a.pdf'),
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b1','Doc B',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b1/b.pdf');

-- Destinatario so employee can legitimately touch dest rows for own doc
insert into documento_firma_destinatarios (documento_id, empleado_id)
values (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a2'
);

create function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- 1–3: A roles → B document → NULL (no tenant-B leak)
select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8'::uuid);
  assert e is null, format('employee A must not learn B empresa_id, got %s', e);
end $$;

select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a6'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8'::uuid);
  assert e is null, format('supervisor A must not learn B empresa_id, got %s', e);
end $$;

select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a7'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8'::uuid);
  assert e is null, format('admin A must not learn B empresa_id, got %s', e);
end $$;

-- 4: Authenticated own-tenant document → ALLOW (own empresa_id)
select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8'::uuid);
  assert e = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1'::uuid,
    format('employee own-tenant doc must return auth empresa, got %s', e);
end $$;

select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a7'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8'::uuid);
  assert e = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a1'::uuid,
    format('admin own-tenant doc must return auth empresa, got %s', e);
end $$;

-- 5–6: anon → DENIED (no EXECUTE) for foreign and "same" docs
reset role;
do $$
declare ok boolean := false; e uuid;
begin
  begin
    execute 'set local role anon';
    e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8'::uuid);
  exception when insufficient_privilege then
    ok := true;
  when others then
    -- Some setups may allow execute but body returns null; both are safe
    if e is null then ok := true; end if;
  end;
  assert ok, 'anon cross-tenant must be denied or null';
end $$;

do $$
declare ok boolean := false; e uuid;
begin
  begin
    execute 'set local role anon';
    e := empresa_de_documento_firma('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8'::uuid);
  exception when insufficient_privilege then
    ok := true;
  when others then
    if e is null then ok := true; end if;
  end;
  assert ok, 'anon must not resolve any document empresa_id';
end $$;

-- 7: random UUID → NULL (not an existence/tenant oracle with a real id)
select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
  assert e is null, 'random UUID must return null';
end $$;

-- 8: Legitimate RLS path — employee SELECT own destinatario row still works
select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a5'::uuid);
do $$
declare n int;
begin
  select count(*) into n from documento_firma_destinatarios
  where documento_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8'
    and empleado_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a2';
  assert n = 1, format('employee must still see own destinatario via RLS, n=%s', n);
end $$;

-- Admin can INSERT destinatario for own-tenant doc (uses function in WITH CHECK)
select pg_temp.como('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a7'::uuid);
insert into documento_firma_destinatarios (documento_id, empleado_id)
values (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a8',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a3'
);

-- Admin cannot attach destinatario to foreign doc via function gate
do $$
declare ok boolean := false;
begin
  begin
    insert into documento_firma_destinatarios (documento_id, empleado_id)
    values (
      'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0b8',
      'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0a2'
    );
  exception when others then
    ok := true;
  end;
  assert ok, 'admin A must not insert destinatario for tenant B doc';
end $$;

-- Grants: anon must not have EXECUTE
do $$
begin
  assert not has_function_privilege(
    'anon', 'public.empresa_de_documento_firma(uuid)', 'EXECUTE'
  ), 'anon must not EXECUTE empresa_de_documento_firma';
end $$;

do $$ begin raise notice 'PASS rls_migration70'; end $$;
rollback;
