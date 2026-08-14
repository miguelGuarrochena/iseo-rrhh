-- ============================================================
-- FRESH red-team probe (post claimed mig 60-65)
-- Independent of prior probe labels; new attack IDs FRT-*
-- Rollback always.
-- ============================================================
\set ON_ERROR_STOP off
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Re-apply mig-66 column lockdown (broad GRANT above would re-open PII).
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

grant execute on all functions in schema public to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('abababab-abab-abab-abab-abababababa1','FRT-A','30-frta','A','frta@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('abababab-abab-abab-abab-abababababa9','FRT-B','30-frtb','B','frtb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb)
on conflict do nothing;

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu) values
 ('abababab-abab-abab-abab-abababababa2','abababab-abab-abab-abab-abababababa1','Emp','A','frt1','2020-01-01','Op','Prod','111'),
 ('abababab-abab-abab-abab-abababababa3','abababab-abab-abab-abab-abababababa1','Sup','A','frt2','2019-01-01','Sup','Admin','222'),
 ('abababab-abab-abab-abab-abababababa4','abababab-abab-abab-abab-abababababa1','Adm','A','frt3','2018-01-01','RRHH','Admin','333'),
 ('abababab-abab-abab-abab-abababababa8','abababab-abab-abab-abab-abababababa9','Emp','B','frt9','2020-01-01','Op','Prod','999')
on conflict do nothing;

-- Biometrics set as service (consent path not under test here).
update empleados
   set consentimiento_biometrico = jsonb_build_object('aceptado', true, 'fecha', current_date::text),
       descriptor_facial = '[0.1]'::jsonb, descriptor_version = 1
 where id = 'abababab-abab-abab-abab-abababababa2';
update empleados
   set consentimiento_biometrico = jsonb_build_object('aceptado', true, 'fecha', current_date::text),
       descriptor_facial = '[0.2]'::jsonb, descriptor_version = 1
 where id = 'abababab-abab-abab-abab-abababababa3';
update empleados
   set consentimiento_biometrico = jsonb_build_object('aceptado', true, 'fecha', current_date::text),
       descriptor_facial = '[0.9]'::jsonb, descriptor_version = 1
 where id = 'abababab-abab-abab-abab-abababababa8';

insert into auth.users (id, instance_id, email, aud, role) values
 ('abababab-abab-abab-abab-abababababa5','00000000-0000-0000-0000-000000000000','frt-emp@t.test','authenticated','authenticated'),
 ('abababab-abab-abab-abab-abababababa6','00000000-0000-0000-0000-000000000000','frt-sup@t.test','authenticated','authenticated'),
 ('abababab-abab-abab-abab-abababababa7','00000000-0000-0000-0000-000000000000','frt-adm@t.test','authenticated','authenticated'),
 ('abababab-abab-abab-abab-ababababab10','00000000-0000-0000-0000-000000000000','frt-empb@t.test','authenticated','authenticated')
on conflict do nothing;

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('abababab-abab-abab-abab-abababababa5','frt-emp@t.test','empleado','Emp A','abababab-abab-abab-abab-abababababa1','abababab-abab-abab-abab-abababababa2'),
 ('abababab-abab-abab-abab-abababababa6','frt-sup@t.test','supervisor','Sup A','abababab-abab-abab-abab-abababababa1','abababab-abab-abab-abab-abababababa3'),
 ('abababab-abab-abab-abab-abababababa7','frt-adm@t.test','admin_rrhh','Adm A','abababab-abab-abab-abab-abababababa1','abababab-abab-abab-abab-abababababa4'),
 ('abababab-abab-abab-abab-ababababab10','frt-empb@t.test','empleado','Emp B','abababab-abab-abab-abab-abababababa9','abababab-abab-abab-abab-abababababa8')
on conflict do nothing;

insert into cupos_licencia (empresa_id, tipo, dias_anuales)
values ('abababab-abab-abab-abab-abababababa9','mudanza',9)
on conflict do nothing;

create or replace function pg_temp.as_role(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.note(ok boolean, label text) returns void language plpgsql as $$
begin
  raise notice '% %', case when ok then 'HIT' else 'BLOCKED' end, label;
end;
$$;

-- ========== Meta: is remediation 60-65 present? ==========
do $$ begin
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='recibos' and p.polname='recibos_gestion' and p.polcmd='*'
  ) then
    raise notice 'META weak recibos_gestion FOR ALL still present';
  else
    raise notice 'META recibos_gestion FOR ALL gone';
  end if;
  if exists (select 1 from pg_proc where proname='assert_empleado_de_empresa') then
    raise notice 'META assert_empleado_de_empresa present';
  else
    raise notice 'META assert_empleado_de_empresa MISSING';
  end if;
end $$;

-- ========== FRT-1 employee forges payroll ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa5'::uuid);

do $$ begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values ('abababab-abab-abab-abab-abababababa1','abababab-abab-abab-abab-abababababa2','2026-08',1,1);
    perform pg_temp.note(true, 'FRT-1 employee INSERT remuneraciones');
  exception when others then
    perform pg_temp.note(false, 'FRT-1 employee INSERT remuneraciones');
  end;
end $$;

-- ========== FRT-2 supervisor forges recibo (payroll privacy class) ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa6'::uuid);

do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa2',
      '2026-08','mensual',
      'abababab-abab-abab-abab-abababababa1/sup-forge.pdf',
      'pendiente', now()
    );
    perform pg_temp.note(true, 'FRT-2 supervisor INSERT recibo for peer');
  exception when others then
    perform pg_temp.note(false, 'FRT-2 supervisor INSERT recibo for peer');
  end;
end $$;

-- ========== FRT-3 supervisor reads peer CBU + biometrics ==========
do $$ declare cbu text; bio jsonb; leaked boolean := false; begin
  begin
    select e.cbu, e.descriptor_facial into cbu, bio from empleados e
    where e.id='abababab-abab-abab-abab-abababababa2';
    leaked := (cbu is not null or bio is not null);
  exception when others then
    leaked := false;
  end;
  perform pg_temp.note(leaked, 'FRT-3a supervisor SELECT peer CBU/face on table');
  begin
    select e.cbu, e.descriptor_facial into cbu, bio from empleados_lectura e
    where e.id='abababab-abab-abab-abab-abababababa2';
    leaked := (cbu is not null or bio is not null);
  exception when others then
    leaked := false;
  end;
  perform pg_temp.note(leaked, 'FRT-3b supervisor SELECT peer CBU/face via view');
end $$;

-- ========== FRT-4 employee ghost + chain absence ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa5'::uuid);

do $$
declare gid uuid;
begin
  begin
    insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
    values ('abababab-abab-abab-abab-abababababa1','Ghost','X','frt-ghost','2026-01-01','Op','Prod')
    returning id into gid;
    insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
    values ('abababab-abab-abab-abab-abababababa1', gid, 'especial','2026-09-01','2026-09-01',1,'pendiente');
    perform pg_temp.note(true, 'FRT-4 employee ghost empleado + ausencia chain');
  exception when others then
    perform pg_temp.note(false, 'FRT-4 ghost chain [' || left(sqlerrm,60) || ']');
  end;
end $$;

-- ========== FRT-5 RPC IDOR saldo ==========
do $$ declare v int; begin
  v := saldo_vacaciones_disponible('abababab-abab-abab-abab-abababababa8'::uuid, 2026);
  perform pg_temp.note(v is not null, 'FRT-5 RPC saldo_vacaciones other tenant=' || coalesce(v::text,'null'));
exception when others then
  perform pg_temp.note(false, 'FRT-5 RPC saldo blocked');
end $$;

-- ========== FRT-6 storage path poison row ==========
do $$ begin
  begin
    insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa2',
      'dni','poison',
      'abababab-abab-abab-abab-abababababa9/secret.pdf'
    );
    perform pg_temp.note(true, 'FRT-6 employee poison documentos_legajo path');
  exception when others then
    perform pg_temp.note(false, 'FRT-6 poison docs');
  end;
end $$;

-- ========== FRT-7 employee self-promote via UPDATE ==========
do $$ begin
  update usuarios set rol='admin_rrhh' where id='abababab-abab-abab-abab-abababababa5';
  perform pg_temp.note(found, 'FRT-7 employee self-promote admin');
exception when others then
  perform pg_temp.note(false, 'FRT-7 self-promote');
end $$;

-- ========== FRT-8 employee change propio empleado_id to peer ==========
do $$ begin
  update usuarios set empleado_id='abababab-abab-abab-abab-abababababa3'
  where id='abababab-abab-abab-abab-abababababa5';
  perform pg_temp.note(found, 'FRT-8 employee rebind legajo to supervisor');
exception when others then
  perform pg_temp.note(false, 'FRT-8 rebind legajo');
end $$;

-- ========== FRT-9 employee forge audit + errores other tenant ==========
do $$ begin
  begin
    insert into auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa5',
      'CEO', 'wipe', 'empresas', '{}'::jsonb
    );
    perform pg_temp.note(true, 'FRT-9a forge auditoria');
  exception when others then
    perform pg_temp.note(false, 'FRT-9a forge auditoria');
  end;
  begin
    insert into errores_app (empresa_id, usuario_id, mensaje)
    values ('abababab-abab-abab-abab-abababababa9','abababab-abab-abab-abab-abababababa5','x');
    perform pg_temp.note(true, 'FRT-9b errores_app foreign empresa_id');
  exception when others then
    perform pg_temp.note(false, 'FRT-9b errores_app');
  end;
end $$;

-- ========== FRT-10 admin last-admin demote ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa7'::uuid);
do $$ begin
  update usuarios set rol='empleado' where id='abababab-abab-abab-abab-abababababa7';
  perform pg_temp.note(found, 'FRT-10 last admin self-demote');
exception when others then
  perform pg_temp.note(false, 'FRT-10 last admin demote blocked');
end $$;

-- restore admin for further tests (clear JWT so service/SQL path can rewrite rol;
-- otherwise lock_usuario_autoedicion still sees the demoted session uid).
reset role;
select set_config('request.jwt.claims', '', true);
update usuarios set rol='admin_rrhh' where id='abababab-abab-abab-abab-abababababa7';
select pg_temp.as_role('abababab-abab-abab-abab-abababababa7'::uuid);

-- ========== FRT-11 admin cross-link + adelanto reopen ==========
do $$ begin
  begin
    insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa8',
      'especial','2026-10-01','2026-10-01',1,'aprobada', now()
    );
    perform pg_temp.note(true, 'FRT-11a admin cross-link ausencia empB+empA');
  exception when others then
    perform pg_temp.note(false, 'FRT-11a cross-link');
  end;
end $$;

reset role;
insert into adelantos (id, empresa_id, empleado_id, monto, estado, resuelto_en)
values (
  'abababab-abab-abab-abab-ababababab11',
  'abababab-abab-abab-abab-abababababa1',
  'abababab-abab-abab-abab-abababababa2',
  50, 'rechazado', now()
);
select pg_temp.as_role('abababab-abab-abab-abab-abababababa7'::uuid);
do $$ begin
  update adelantos set estado='aprobado' where id='abababab-abab-abab-abab-ababababab11';
  perform pg_temp.note(found, 'FRT-11b admin reopen adelanto rechazado→aprobado');
exception when others then
  perform pg_temp.note(false, 'FRT-11b adelanto reopen');
end $$;

-- ========== FRT-12 employee approved ausencia (regression of 56) ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa5'::uuid);
do $$ begin
  begin
    insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa2',
      'especial','2026-11-01','2026-11-01',1,'aprobada', now()
    );
    perform pg_temp.note(true, 'FRT-12 employee INSERT ausencia aprobada');
  exception when others then
    perform pg_temp.note(false, 'FRT-12 employee INSERT ausencia aprobada');
  end;
end $$;

-- ========== FRT-13 employee UPDATE nombre (product feature) ==========
do $$ begin
  update usuarios set nombre_completo='Hacked Name'
  where id='abababab-abab-abab-abab-abababababa5';
  perform pg_temp.note(found, 'FRT-13 employee UPDATE propio nombre_completo');
exception when others then
  perform pg_temp.note(false, 'FRT-13 update nombre');
end $$;

-- ========== FRT-14 supervisor INSERT turnos (legitimate?) vs cupos ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa6'::uuid);
do $$ begin
  begin
    insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa2',
      '2026-12-01','08:00','17:00'
    );
    perform pg_temp.note(true, 'FRT-14a supervisor INSERT turno (expected allowed by design)');
  exception when others then
    perform pg_temp.note(false, 'FRT-14a supervisor INSERT turno');
  end;
  begin
    insert into cupos_licencia (empresa_id, tipo, dias_anuales)
    values ('abababab-abab-abab-abab-abababababa1','examenes',0);
    perform pg_temp.note(true, 'FRT-14b supervisor INSERT cupo=0 (should be admin-only)');
  exception when others then
    perform pg_temp.note(false, 'FRT-14b supervisor INSERT cupo');
  end;
end $$;

-- ========== FRT-15 communications insert as employee for peer ==========
select pg_temp.as_role('abababab-abab-abab-abab-abababababa5'::uuid);
do $$ begin
  begin
    insert into comunicaciones (empresa_id, empleado_id, autor_id, tipo, asunto, cuerpo)
    values (
      'abababab-abab-abab-abab-abababababa1',
      'abababab-abab-abab-abab-abababababa3',
      'abababab-abab-abab-abab-abababababa5',
      'consulta', 'x', 'y'
    );
    perform pg_temp.note(true, 'FRT-15 employee open comunicacion as peer legajo');
  exception when others then
    perform pg_temp.note(false, 'FRT-15 comunicacion peer');
  end;
end $$;

reset role;
do $$ begin raise notice '=== END FRESH PROBE ==='; end $$;
rollback;
