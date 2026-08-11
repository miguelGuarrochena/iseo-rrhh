-- Evidence harness for QA-AUDIT-REDTEAM.md (READ/ROLLBACK only).
-- Does NOT change product schema. Run:
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 -f supabase/tests/redteam_probe.test.sql
--
-- Expected notices (2026-08-10 local):
--   CONFIRMED RT-001..RT-008, RT-010, RT-011
--   OK RT-009 (cross-tenant SELECT empleados blocked)

\set ON_ERROR_STOP off
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.recibos, public.remuneraciones,
  public.empleados, public.cupos_licencia, public.adelantos, public.usuarios,
  public.documentos_legajo, public.ausencias to authenticated;

-- Re-apply mig-66 column lockdown after table GRANT.
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

grant select on table public.empresas to authenticated;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','RT-A','30-rta','A','a@a.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9','RT-B','30-rtb','B','b@b.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb)
on conflict do nothing;

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Emp','A','rt1','2020-01-01','Op','Prod','0000000000000000000001'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Adm','A','rt2','2018-01-01','RRHH','Admin','0000000000000000000002'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9','Emp','B','rt9','2020-01-01','Op','Prod','0000000000000000000009')
on conflict do nothing;

insert into auth.users (id, instance_id, email, aud, role) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','00000000-0000-0000-0000-000000000000','rt-emp@t.test','authenticated','authenticated'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','00000000-0000-0000-0000-000000000000','rt-adm@t.test','authenticated','authenticated'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','00000000-0000-0000-0000-000000000000','rt-empb@t.test','authenticated','authenticated')
on conflict do nothing;

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','rt-emp@t.test','empleado','Emp A','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','rt-adm@t.test','admin_rrhh','Adm A','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','rt-empb@t.test','empleado','Emp B','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8')
on conflict do nothing;

delete from cupos_licencia where empresa_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9');
delete from ausencias where empresa_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9');
delete from adelantos where empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
delete from recibos where empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
delete from remuneraciones where empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
delete from documentos_legajo where empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';

insert into cupos_licencia (empresa_id, tipo, dias_anuales)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9', 'mudanza', 7);
insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
  'vacaciones', '2026-01-01', '2026-01-05', 5, 'aprobada', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'role', 'authenticated')::text,
  true
);

do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      '2026-01', 'mensual',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/fake.pdf',
      'pendiente', now()
    );
    raise notice 'CONFIRMED RT-001: empleado INSERT recibo OK';
  exception when others then raise notice 'DENIED RT-001: %', sqlerrm;
  end;
end $$;

do $$ begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      '2026-01', 999999, 999999
    );
    raise notice 'CONFIRMED RT-002: empleado INSERT remuneracion OK';
  exception when others then raise notice 'DENIED RT-002: %', sqlerrm;
  end;
end $$;

do $$ begin
  begin
    insert into cupos_licencia (empresa_id, tipo, dias_anuales)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'casamiento', 0);
    raise notice 'CONFIRMED RT-003: empleado INSERT cupos_licencia OK';
  exception when others then raise notice 'DENIED RT-003: %', sqlerrm;
  end;
end $$;

do $$ declare v int; begin
  v := saldo_vacaciones_disponible('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'::uuid, 2026);
  raise notice 'CONFIRMED RT-004: saldo_vacaciones cross-tenant=%', v;
exception when others then raise notice 'DENIED RT-004: %', sqlerrm;
end $$;

do $$ declare v int; begin
  v := saldo_licencia_disponible(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'::uuid,
    'mudanza'::tipo_ausencia,
    2026
  );
  raise notice 'CONFIRMED RT-005: saldo_licencia cross-tenant=%', v;
exception when others then raise notice 'DENIED RT-005: %', sqlerrm;
end $$;

do $$ begin
  begin
    insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      'dni', 'poison',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9/secreto.pdf'
    );
    raise notice 'CONFIRMED RT-006: empleado INSERT documentos_legajo foreign path OK';
  exception when others then raise notice 'DENIED RT-006: %', sqlerrm;
  end;
end $$;

reset role;
insert into adelantos (id, empresa_id, empleado_id, monto, estado, resuelto_en)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  1000, 'rechazado', now()
);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$ begin
  update adelantos
  set estado = 'aprobado', resuelto_en = now()
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
  if found then
    raise notice 'CONFIRMED RT-007: admin reopen adelanto rechazado→aprobado OK';
  else
    raise notice 'DENIED RT-007: 0 rows';
  end if;
exception when others then raise notice 'DENIED RT-007: %', sqlerrm;
end $$;

do $$ declare n int; begin
  update usuarios set rol = 'empleado'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
  get diagnostics n = row_count;
  raise notice 'CONFIRMED RT-008: last-admin self-demote rows=%', n;
exception when others then raise notice 'DENIED RT-008: %', sqlerrm;
end $$;

do $$ declare cbu text; begin
  select e.cbu into cbu from empleados e
  where e.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8';
  if cbu is null then
    raise notice 'OK RT-009: cross-tenant SELECT blocked';
  else
    raise notice 'LEAK RT-009: cbu=%', cbu;
  end if;
exception when others then raise notice 'OK RT-009 blocked: %', sqlerrm;
end $$;

reset role;
update usuarios set rol = 'admin_rrhh'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$ begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en
    ) values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
      'especial', '2026-06-01', '2026-06-01', 1, 'aprobada', now()
    );
    raise notice 'CONFIRMED RT-010: cross-link ausencia emp B + empresa A OK';
  exception when others then raise notice 'DENIED RT-010: %', sqlerrm;
  end;
end $$;

do $$ declare cbu text; begin
  select e.cbu into cbu from empleados e
  where e.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  raise notice 'CONFIRMED RT-011: gestor lee CBU propio tenant=%', left(coalesce(cbu, 'null'), 4);
exception when others then raise notice 'DENIED RT-011: %', sqlerrm;
end $$;

reset role;
rollback;
