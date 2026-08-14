-- ============================================================
-- FINAL INDEPENDENT production-readiness probe (IND-*)
-- Rollback-wrapped. Does NOT modify schema permanently.
-- Attack classes beyond prior FRT/RT labels.
-- ============================================================
\set ON_ERROR_STOP off
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema storage to authenticated;
grant select on all tables in schema storage to authenticated;

-- Re-apply mig-66/69 PII column lockdown after broad GRANT
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
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','IND-A','30-inda','A','inda@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"vacacionesDiasHabiles":false}'::jsonb),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1','IND-B','30-indb','B','indb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb)
on conflict do nothing;

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu, email) values
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','Emp','A','ind1','2020-01-01','Op','Prod','CBU-PEER','ea@t.test'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa3','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','Sup','A','ind2','2019-01-01','Sup','Admin','CBU-SUP','sa@t.test'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa4','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','Adm','A','ind3','2018-01-01','RRHH','Admin','CBU-ADM','aa@t.test'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa5','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','Ad2','A','ind4','2017-01-01','RRHH','Admin','CBU-AD2','a2@t.test'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb2','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1','Emp','B','ind9','2020-01-01','Op','Prod','CBU-B','eb@t.test')
on conflict do nothing;

update empleados set
  consentimiento_biometrico = '{"aceptado":true,"fecha":"2026-01-01"}'::jsonb,
  descriptor_facial = '[0.11]'::jsonb, descriptor_version = 1
where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';

insert into auth.users (id, instance_id, email, aud, role) values
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01','00000000-0000-0000-0000-000000000000','ind-emp@t.test','authenticated','authenticated'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02','00000000-0000-0000-0000-000000000000','ind-sup@t.test','authenticated','authenticated'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03','00000000-0000-0000-0000-000000000000','ind-adm@t.test','authenticated','authenticated'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf04','00000000-0000-0000-0000-000000000000','ind-ad2@t.test','authenticated','authenticated'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf05','00000000-0000-0000-0000-000000000000','ind-emb@t.test','authenticated','authenticated')
on conflict do nothing;

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01','ind-emp@t.test','empleado','Emp A','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02','ind-sup@t.test','supervisor','Sup A','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa3'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03','ind-adm@t.test','admin_rrhh','Adm A','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa4'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf04','ind-ad2@t.test','admin_rrhh','Ad2 A','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa5'),
 ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf05','ind-emb@t.test','empleado','Emp B','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb2')
on conflict do nothing;

-- Cross-tenant doc + remu fixtures (as postgres)
insert into documentos_firma (id, empresa_id, titulo, archivo_url)
values (
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfd1',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1',
  'secret-b', 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/x.pdf'
) on conflict do nothing;

insert into remuneraciones (id, empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
values (
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcf0f01',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
  '2026-01', 100000, 80000
) on conflict do nothing;

insert into recibos (id, empresa_id, empleado_id, periodo, archivo_url, firmado_empleador_en)
values (
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcf0f02',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
  '2026-01',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1/r.pdf',
  now()
) on conflict do nothing;

create or replace function pg_temp.as_role(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.note(hit boolean, label text) returns void language plpgsql as $$
begin
  raise notice '% %', case when hit then 'HIT' else 'BLOCKED' end, label;
end;
$$;

-- ========== IND-01 supervisor UPDATE peer CBU (column priv without SELECT) ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'::uuid);
do $$ begin
  begin
    update empleados set cbu = 'HACKED-CBU'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
    if found then
      perform pg_temp.note(true, 'IND-01 supervisor UPDATE peer CBU');
    else
      perform pg_temp.note(false, 'IND-01 supervisor UPDATE peer CBU (0 rows)');
    end if;
  exception when others then
    perform pg_temp.note(false, 'IND-01 supervisor UPDATE peer CBU [' || left(sqlerrm,60) || ']');
  end;
end $$;

-- ========== IND-02 employee UPDATE peer / own sensitive via table ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$ begin
  begin
    update empleados set cbu = 'EMP-HACK'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa3';
    perform pg_temp.note(found, 'IND-02a employee UPDATE peer CBU');
  exception when others then
    perform pg_temp.note(false, 'IND-02a employee UPDATE peer CBU');
  end;
  begin
    update empleados set descriptor_facial = '[9]'::jsonb, descriptor_version = 1
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
    perform pg_temp.note(found, 'IND-02b employee UPDATE own descriptor without admin');
  exception when others then
    perform pg_temp.note(false, 'IND-02b employee self biometric UPDATE');
  end;
end $$;

-- ========== IND-03 supervisor SELECT peer remu / adelantos / CBU view ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'::uuid);
do $$
declare n int; cbu text; bio jsonb;
begin
  select count(*) into n from remuneraciones
  where empleado_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
  perform pg_temp.note(n > 0, 'IND-03a supervisor SELECT peer remuneraciones n=' || n);

  select count(*) into n from adelantos
  where empleado_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
  perform pg_temp.note(n > 0, 'IND-03b supervisor SELECT peer adelantos n=' || n);

  begin
    select e.cbu, e.descriptor_facial into cbu, bio
    from empleados_lectura e
    where e.id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
    perform pg_temp.note(cbu is not null or bio is not null, 'IND-03c supervisor view peer PII');
  exception when others then
    perform pg_temp.note(false, 'IND-03c supervisor view peer PII err');
  end;

  begin
    perform cbu from empleados where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
    perform pg_temp.note(true, 'IND-03d supervisor table SELECT cbu column');
  exception when others then
    perform pg_temp.note(false, 'IND-03d supervisor table SELECT cbu denied');
  end;
end $$;

-- ========== IND-04 RPC empresa_de_documento_firma cross-tenant oracle ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$
declare e uuid;
begin
  e := empresa_de_documento_firma('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfd1'::uuid);
  -- HIT if returns other tenant's empresa_id
  perform pg_temp.note(
    e = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1'::uuid,
    'IND-04 empresa_de_documento_firma cross-tenant oracle e=' || coalesce(e::text,'null')
  );
exception when others then
  perform pg_temp.note(false, 'IND-04 empresa_de_documento_firma blocked');
end $$;

-- ========== IND-05 cumples_de_empresa cross-tenant ==========
do $$
declare n int;
begin
  select count(*) into n from cumples_de_empresa('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1'::uuid);
  perform pg_temp.note(n > 0, 'IND-05 cumples other tenant n=' || n);
exception when others then
  perform pg_temp.note(false, 'IND-05 cumples other tenant blocked');
end $$;

-- ========== IND-06 anon EXECUTE sensitive RPCs ==========
reset role;
do $$
declare n int; e uuid;
begin
  begin
    set local role anon;
    select count(*) into n from cumples_de_empresa('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1'::uuid);
    perform pg_temp.note(n > 0, 'IND-06a anon cumples_de_empresa n=' || n);
  exception when others then
    perform pg_temp.note(false, 'IND-06a anon cumples blocked [' || left(sqlerrm,50) || ']');
  end;
  begin
    set local role anon;
    e := empresa_de_documento_firma('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfd1'::uuid);
    perform pg_temp.note(e is not null, 'IND-06b anon empresa_de_documento_firma');
  exception when others then
    perform pg_temp.note(false, 'IND-06b anon empresa_doc blocked');
  end;
  begin
    set local role anon;
    perform saldo_vacaciones_disponible('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2'::uuid, 2026);
    perform pg_temp.note(true, 'IND-06c anon saldo_vacaciones');
  exception when others then
    perform pg_temp.note(false, 'IND-06c anon saldo_vacaciones blocked');
  end;
end $$;

-- ========== IND-07 employee forge approved ausencia / reopen ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$
declare aid uuid;
begin
  begin
    insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      'especial','2026-11-01','2026-11-01',1,'aprobada', now()
    );
    perform pg_temp.note(true, 'IND-07a employee INSERT ausencia aprobada');
  exception when others then
    perform pg_temp.note(false, 'IND-07a employee INSERT ausencia aprobada');
  end;

  insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
  values (
    'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
    'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
    'especial','2026-11-02','2026-11-02',1,'pendiente'
  ) returning id into aid;

  -- switch to admin to approve then employee try reopen
end $$;

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'::uuid);
do $$
declare aid uuid;
begin
  select id into aid from ausencias
  where empleado_id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2' and fecha_desde='2026-11-02'
  order by creada_en desc limit 1;
  update ausencias set estado='aprobada', resuelta_en=now(),
    resuelta_por='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'
  where id = aid;
end $$;

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$
declare aid uuid; ok boolean := false;
begin
  select id into aid from ausencias
  where empleado_id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2' and fecha_desde='2026-11-02'
    and estado='aprobada' limit 1;
  begin
    update ausencias set estado='pendiente', resuelta_en=null where id = aid;
    ok := found;
  exception when others then
    ok := false;
  end;
  perform pg_temp.note(ok, 'IND-07b employee reopen approved ausencia');
end $$;

-- ========== IND-08 supervisor approve ausencia then mutate dias (SM bypass) ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
values (
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
  'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
  'especial','2026-11-10','2026-11-10',1,'pendiente'
);

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'::uuid);
do $$
declare aid uuid; ok boolean := false;
begin
  select id into aid from ausencias
  where fecha_desde='2026-11-10' and empleado_id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2' limit 1;
  update ausencias set estado='aprobada', resuelta_en=now(),
    resuelta_por='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'
  where id = aid;
  begin
    update ausencias set dias = 99 where id = aid;
    ok := found;
  exception when others then
    ok := false;
  end;
  perform pg_temp.note(ok, 'IND-08 supervisor mutate dias after approve');
end $$;

-- ========== IND-09 admin cross-link remu emp B + empresa A ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'::uuid);
do $$ begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb2',
      '2026-02', 1, 1
    );
    perform pg_temp.note(true, 'IND-09 admin remu cross-link empB+empA');
  exception when others then
    perform pg_temp.note(false, 'IND-09 admin remu cross-link [' || left(sqlerrm,60) || ']');
  end;
end $$;

-- ========== IND-10 admin move empleado.empresa_id ==========
do $$ begin
  begin
    update empleados set empresa_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
    perform pg_temp.note(found, 'IND-10 admin rebind empleado.empresa_id');
  exception when others then
    perform pg_temp.note(false, 'IND-10 admin rebind empresa_id [' || left(sqlerrm,60) || ']');
  end;
end $$;

-- ========== IND-11 employee self-promote + rebind empleado_id ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$ begin
  begin
    update usuarios set rol = 'admin_rrhh'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01';
    perform pg_temp.note(
      exists(select 1 from usuarios where id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01' and rol='admin_rrhh'),
      'IND-11a employee self-promote admin_rrhh'
    );
  exception when others then
    perform pg_temp.note(false, 'IND-11a self-promote [' || left(sqlerrm,50) || ']');
  end;
  begin
    update usuarios set empleado_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa4'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01';
    perform pg_temp.note(
      exists(select 1 from usuarios where id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'
        and empleado_id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa4'),
      'IND-11b employee rebind empleado_id to admin legajo'
    );
  exception when others then
    perform pg_temp.note(false, 'IND-11b rebind [' || left(sqlerrm,50) || ']');
  end;
end $$;

-- ========== IND-12 last-admin demote (two admins then demote both) ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'::uuid);
do $$ begin
  update usuarios set rol = 'empleado'
  where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf04'; -- demote second admin first
  begin
    update usuarios set rol = 'empleado'
    where id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03';
    perform pg_temp.note(
      exists(select 1 from usuarios where id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03' and rol='empleado'),
      'IND-12 last admin self-demote'
    );
  exception when others then
    perform pg_temp.note(false, 'IND-12 last admin demote blocked');
  end;
end $$;

-- restore second admin for further tests in same txn
update usuarios set rol = 'admin_rrhh'
where id in ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf04');

-- ========== IND-13 employee INSERT recibo / poison storage path in docs ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, archivo_url)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      '2026-03', 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/secret.pdf'
    );
    perform pg_temp.note(true, 'IND-13a employee INSERT recibo');
  exception when others then
    perform pg_temp.note(false, 'IND-13a employee INSERT recibo');
  end;
  begin
    insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      'dni', 'x', 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/secret.pdf'
    );
    perform pg_temp.note(true, 'IND-13b employee poison documentos_legajo path');
  exception when others then
    perform pg_temp.note(false, 'IND-13b poison docs');
  end;
end $$;

-- ========== IND-14 supervisor INSERT recibo / cupo ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'::uuid);
do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, archivo_url)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      '2026-04', 'x.pdf'
    );
    perform pg_temp.note(true, 'IND-14a supervisor INSERT recibo');
  exception when others then
    perform pg_temp.note(false, 'IND-14a supervisor INSERT recibo');
  end;
  begin
    insert into cupos_licencia (empresa_id, tipo, dias_anuales)
    values ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1','examen',99);
    perform pg_temp.note(true, 'IND-14b supervisor INSERT cupo');
  exception when others then
    perform pg_temp.note(false, 'IND-14b supervisor INSERT cupo');
  end;
end $$;

-- ========== IND-15 forge audit + errores_app + historical fichaje ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$
declare t timestamptz;
begin
  begin
    insert into auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01',
      'System Root', 'wipe', 'empresas', '{}'::jsonb
    );
    perform pg_temp.note(true, 'IND-15a forge auditoria actor_nombre');
  exception when others then
    perform pg_temp.note(false, 'IND-15a forge auditoria');
  end;
  begin
    insert into errores_app (empresa_id, usuario_id, mensaje)
    values ('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01','x');
    perform pg_temp.note(true, 'IND-15b errores_app foreign empresa');
  exception when others then
    perform pg_temp.note(false, 'IND-15b errores_app foreign');
  end;
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      'ingreso', '2019-01-01 08:00:00+00', 'celular'
    ) returning ts into t;
    perform pg_temp.note(t < now() - interval '1 day', 'IND-15c historical fichaje ts stuck');
  exception when others then
    perform pg_temp.note(false, 'IND-15c fichaje insert failed');
  end;
end $$;

-- ========== IND-16 RPC saldo / dias_habiles cross-tenant ==========
do $$ begin
  begin
    perform saldo_vacaciones_disponible('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb2'::uuid, 2026);
    perform pg_temp.note(true, 'IND-16a saldo cross-tenant');
  exception when others then
    perform pg_temp.note(false, 'IND-16a saldo cross-tenant');
  end;
  begin
    perform dias_habiles_entre('2026-01-01','2026-01-10','cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1'::uuid);
    perform pg_temp.note(true, 'IND-16b dias_habiles cross-tenant');
  exception when others then
    perform pg_temp.note(false, 'IND-16b dias_habiles cross-tenant');
  end;
end $$;

-- ========== IND-17 employee SELECT peer recibo / remu count oracle ==========
do $$
declare n int;
begin
  select count(*) into n from remuneraciones
  where empleado_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa3';
  perform pg_temp.note(n > 0, 'IND-17a employee SELECT peer remu n=' || n);

  select count(*) into n from recibos
  where empleado_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa3';
  perform pg_temp.note(n > 0, 'IND-17b employee SELECT peer recibos n=' || n);

  select count(*) into n from empleados
  where empresa_id = 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1';
  perform pg_temp.note(n > 0, 'IND-17c employee SELECT other-tenant empleados n=' || n);
end $$;

-- ========== IND-18 admin poison documentos path to other tenant ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'::uuid);
do $$ begin
  begin
    insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      'dni', 'poison',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/secret.pdf'
    );
    perform pg_temp.note(true, 'IND-18 admin poison docs path other tenant');
  exception when others then
    perform pg_temp.note(false, 'IND-18 poison docs [' || left(sqlerrm,60) || ']');
  end;
end $$;

-- ========== IND-19 storage logos cross-tenant SELECT (policy) ==========
-- Insert storage objects as postgres then probe
reset role;
insert into storage.objects (id, bucket_id, name, owner, metadata)
values
  (gen_random_uuid(), 'logos', 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1/logo.png', null, '{}'::jsonb),
  (gen_random_uuid(), 'logos', 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/logo.png', null, '{}'::jsonb)
on conflict do nothing;

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$
declare n int;
begin
  select count(*) into n from storage.objects
  where bucket_id='logos' and name like 'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfb1/%';
  perform pg_temp.note(n > 0, 'IND-19 auth SELECT other-tenant logos via storage.objects n=' || n);
exception when others then
  perform pg_temp.note(false, 'IND-19 logos cross-tenant [' || left(sqlerrm,50) || ']');
end $$;

-- ========== IND-20 legitimate flows preserved ==========
select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf01'::uuid);
do $$ begin
  begin
    insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      'especial','2026-12-01','2026-12-01',1,'pendiente'
    );
    perform pg_temp.note(false, 'IND-20a employee pending ausencia ALLOW (invert: hit=fail)');
    raise notice 'ALLOW IND-20a employee pending ausencia';
  exception when others then
    perform pg_temp.note(true, 'IND-20a employee pending ausencia unexpectedly denied');
  end;
end $$;

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf03'::uuid);
do $$
declare cbu text;
begin
  select e.cbu into cbu from empleados_lectura e
  where e.id='cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2';
  if cbu is not null then
    raise notice 'ALLOW IND-20b admin sees peer CBU via view';
  else
    perform pg_temp.note(true, 'IND-20b admin CBU redacted unexpectedly');
  end if;
end $$;

select pg_temp.as_role('cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcf02'::uuid);
do $$ begin
  begin
    insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
    values (
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa1',
      'cfcfcfcf-cfcf-cfcf-cfcf-cfcfcfcfcfa2',
      '2026-12-15', '08:00', '17:00'
    );
    raise notice 'ALLOW IND-20c supervisor INSERT turno';
  exception when others then
    perform pg_temp.note(true, 'IND-20c supervisor turno denied [' || left(sqlerrm,50) || ']');
  end;
end $$;

do $$ begin raise notice '=== END INDEPENDENT PROBE ==='; end $$;
rollback;
