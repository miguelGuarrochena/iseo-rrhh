-- ============================================================
-- Migration 66–68 security tests
-- ============================================================
\set ON_ERROR_STOP on
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
grant execute on function public.dias_habiles_entre(date, date, uuid) to authenticated;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;
grant execute on function public.dias_vacaciones_en_anio(date, date, int, uuid, boolean) to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','M66-A','30-m66a','A','m66a@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"],"vacacionesDiasHabiles":false}'::jsonb),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b1','M66-B','30-m66b','B','m66b@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu, descriptor_facial, descriptor_version, consentimiento_biometrico) values
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','Emp','A','m66e1','2020-01-01','Op','Prod','111',null,null,null),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a3','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','Sup','A','m66s1','2019-01-01','Sup','Admin','222','[0.1]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-01-01"}'::jsonb),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a4','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','Adm','A','m66a1','2018-01-01','RRHH','Admin','333',null,null,null),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b2','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b1','Emp','B','m66e9','2020-01-01','Op','Prod','999',null,null,null);

-- Set peer emp A2 cbu + face for supervisor probe
update empleados
   set cbu='PEER-CBU',
       consentimiento_biometrico='{"aceptado":true,"fecha":"2026-01-01"}'::jsonb,
       descriptor_facial='[0.9]'::jsonb,
       descriptor_version=1
 where id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';

insert into auth.users (id, instance_id, email, aud, role) values
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5','00000000-0000-0000-0000-000000000000','m66-emp@t.test','authenticated','authenticated'),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a6','00000000-0000-0000-0000-000000000000','m66-sup@t.test','authenticated','authenticated'),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a7','00000000-0000-0000-0000-000000000000','m66-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5','m66-emp@t.test','empleado','Emp A',
  'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2'),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a6','m66-sup@t.test','supervisor','Sup A',
  'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a3'),
 ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a7','m66-adm@t.test','admin_rrhh','Adm A',
  'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a4');

create function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- P1: supervisor cannot see peer CBU via view.
--
-- El descriptor ya no se comprueba acá porque desde FIC-011 la vista no
-- lo expone a NADIE —ni al titular ni a admin_rrhh—, así que la
-- redacción por rol dejó de ser la defensa: la columna no existe. Eso lo
-- verifica `rpc.test.sql` contra information_schema, que es más fuerte
-- que preguntar si vino null.
select pg_temp.como('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a6'::uuid);
do $$
declare cbu text; rostro boolean;
begin
  select e.cbu, e.tiene_rostro into cbu, rostro
  from empleados_lectura e
  where e.id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  assert cbu is null, 'sup must not see peer CBU';
  -- Saber que un compañero está enrolado no es un dato sensible: es lo
  -- que necesita la pantalla de fichaje para explicar por qué la
  -- terminal no lo reconoce.
  assert rostro, 'tiene_rostro sí es visible: no es el dato biométrico';
end $$;

-- El descriptor no sale ni por la vista ni por la tabla, para nadie.
do $$
declare ok boolean := false;
begin
  begin
    perform descriptor_facial from empleados_lectura
     where id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  exception when others then ok := true;
  end;
  assert ok, 'empleados_lectura.descriptor_facial no debe existir';

  ok := false;
  begin
    perform descriptor_facial from empleados
     where id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  exception when others then ok := true;
  end;
  assert ok, 'la tabla base tampoco expone descriptor_facial a authenticated';
end $$;

-- Direct table SELECT of cbu denied
do $$
declare ok boolean := false;
begin
  begin
    perform cbu from empleados where id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  exception when others then ok := true;
  end;
  assert ok, 'direct table SELECT cbu denied';
end $$;

-- Admin sees peer CBU
select pg_temp.como('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a7'::uuid);
do $$
declare cbu text;
begin
  select e.cbu into cbu from empleados_lectura e
  where e.id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  assert cbu = 'PEER-CBU', 'admin sees peer CBU';
end $$;

-- Self sees own CBU
select pg_temp.como('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5'::uuid);
do $$
declare cbu text;
begin
  select e.cbu into cbu from empleados_lectura e
  where e.id='b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2';
  assert cbu = 'PEER-CBU', 'employee sees own CBU';
end $$;

-- Auditoria forge actor_nombre DENIED
do $$
declare ok boolean := false;
begin
  begin
    insert into auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
    values (
      'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1',
      'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5',
      'CEO Fake', 'wipe', 'empresas', '{}'::jsonb
    );
  exception when others then ok := true;
  end;
  assert ok, 'forged actor_nombre denied';
end $$;

-- Legitimate audit OK
insert into auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
values (
  'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1',
  'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5',
  'Emp A', 'ver', 'empleado', '{}'::jsonb
);

-- errores_app foreign empresa DENIED
do $$
declare ok boolean := false;
begin
  begin
    insert into errores_app (empresa_id, usuario_id, mensaje)
    values ('b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b1','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a5','x');
  exception when others then ok := true;
  end;
  assert ok, 'errores_app foreign empresa denied';
end $$;

-- dias_habiles cross-tenant DENIED
do $$
declare ok boolean := false;
begin
  begin
    perform dias_habiles_entre('2026-01-01','2026-01-07','b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6b1'::uuid);
  exception when others then ok := true;
  end;
  assert ok, 'dias_habiles other tenant denied';
end $$;

-- El empleado no puede fabricarse una marca con fecha inventada.
--
-- Antes el trigger le dejaba insertar y le pisaba el `ts` con la hora
-- real; este caso comprobaba eso. Desde la migración 86 directamente no
-- puede insertar: ficha por `fichar_con_rostro`. La garantía es más
-- fuerte, así que el caso la comprueba de esa forma.
do $$
declare ok boolean := false;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
    values (
      'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1',
      'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a2',
      'ingreso', '2020-01-01 10:00:00+00', 'celular'
    );
  exception when others then ok := true;
  end;
  assert ok, 'employee cannot insert a fichaje with a made-up ts';
end $$;

-- BUG-012: year split helper
do $$
declare d2025 int; d2026 int;
begin
  d2025 := dias_vacaciones_en_anio('2025-12-28','2026-01-05',2025,
    'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1'::uuid, false);
  d2026 := dias_vacaciones_en_anio('2025-12-28','2026-01-05',2026,
    'b6b6b6b6-b6b6-b6b6-b6b6-b6b6b6b6b6a1'::uuid, false);
  assert d2025 = 4, format('2025 days=%s', d2025); -- 28,29,30,31
  assert d2026 = 5, format('2026 days=%s', d2026); -- 1..5
end $$;

do $$ begin raise notice 'PASS rls_migration66_68'; end $$;
rollback;
