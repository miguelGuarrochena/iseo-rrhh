-- ============================================================
-- SYSTEMATIC RLS AUTHZ PROBE (employee attacker)
-- Class focus: FOR ALL + weak WITH CHECK (RT-001 pattern)
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 -f supabase/tests/redteam_systematic_probe.test.sql
--
-- Entire transaction ROLLS BACK. Does not modify product schema.
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

grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;
grant execute on function public.firmar_recibo(uuid) to authenticated;
grant execute on function public.empresa_de_documento_firma(uuid) to authenticated;
grant execute on function public.dias_habiles_entre(date, date, uuid) to authenticated;
grant execute on function public.cumples_de_empresa(uuid) to authenticated;

-- ---------- Fixtures: tenant A (attacker) + tenant B (victim) ----------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','SYS-A','30-sysa','A','sysa@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9','SYS-B','30-sysb','B','sysb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb)
on conflict do nothing;

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector, cbu) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Emp','A','sys1','2020-01-01','Op','Prod','1111111111111111111111'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Peer','A','sys2','2019-01-01','Op','Prod','2222222222222222222222'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','Adm','A','sys3','2018-01-01','RRHH','Admin','3333333333333333333333'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9','Emp','B','sys9','2020-01-01','Op','Prod','9999999999999999999999')
on conflict do nothing;

insert into auth.users (id, instance_id, email, aud, role) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5','00000000-0000-0000-0000-000000000000','sys-emp@t.test','authenticated','authenticated'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6','00000000-0000-0000-0000-000000000000','sys-adm@t.test','authenticated','authenticated'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb7','00000000-0000-0000-0000-000000000000','sys-empb@t.test','authenticated','authenticated')
on conflict do nothing;

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5','sys-emp@t.test','empleado','Emp A','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6','sys-adm@t.test','admin_rrhh','Adm A','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb7','sys-empb@t.test','empleado','Emp B','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8')
on conflict do nothing;

-- Victim data on B
delete from cupos_licencia where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9';
insert into cupos_licencia (empresa_id, tipo, dias_anuales)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9', 'mudanza', 7);
insert into ausencias (empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8',
  'vacaciones', '2026-02-01', '2026-02-05', 5, 'aprobada', now()
)
on conflict do nothing;

create or replace function pg_temp.as_emp() returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6',
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.probe(label text, ok boolean) returns void
language plpgsql as $$
begin
  if ok then
    raise notice 'CONFIRMED %', label;
  else
    raise notice 'DENIED %', label;
  end if;
end;
$$;

select pg_temp.as_emp();

-- ============================================================
-- A. INSERT unauthorized management records (FOR ALL weak CHECK)
-- ============================================================

do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      '2026-03', 'mensual',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/sys-fake.pdf',
      'pendiente', now()
    );
    perform pg_temp.probe('A1 empleado INSERT recibos', true);
  exception when others then
    perform pg_temp.probe('A1 empleado INSERT recibos [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      '2026-03', 888888, 888888
    );
    perform pg_temp.probe('A2 empleado INSERT remuneraciones', true);
  exception when others then
    perform pg_temp.probe('A2 empleado INSERT remuneraciones [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into cupos_licencia (empresa_id, tipo, dias_anuales)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'casamiento', 0);
    perform pg_temp.probe('A3 empleado INSERT cupos_licencia=0', true);
  exception when others then
    perform pg_temp.probe('A3 empleado INSERT cupos_licencia [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into descuentos_recurrentes (empresa_id, empleado_id, concepto, monto, modo, porcentaje)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'hack', 5000, 'monto', null
    );
    perform pg_temp.probe('A4 empleado INSERT descuentos_recurrentes', true);
  exception when others then
    perform pg_temp.probe('A4 empleado INSERT descuentos [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into documentos_legajo (empresa_id, empleado_id, categoria, nombre, archivo_url)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'dni', 'legajo-hack',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9/secreto-b.pdf'
    );
    perform pg_temp.probe('A5 empleado INSERT documentos_legajo (foreign path)', true);
  exception when others then
    perform pg_temp.probe('A5 empleado INSERT documentos_legajo [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into documentos_firma (empresa_id, titulo, descripcion, archivo_url, creado_por)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'Doc hack', 'x',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/doc.pdf',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5'
    );
    perform pg_temp.probe('A6 empleado INSERT documentos_firma', true);
  exception when others then
    perform pg_temp.probe('A6 empleado INSERT documentos_firma [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into empleados (empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'Ghost', 'Emp', 'sys-ghost', '2026-01-01', 'Op', 'Prod'
    );
    perform pg_temp.probe('A7 empleado INSERT empleados (ghost)', true);
  exception when others then
    perform pg_temp.probe('A7 empleado INSERT empleados [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into facturas_monotributo (empresa_id, empleado_id, periodo, monto, archivo_url)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      '2026-03', 12345,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/mono.pdf'
    );
    perform pg_temp.probe('A8 empleado INSERT facturas_monotributo', true);
  exception when others then
    perform pg_temp.probe('A8 empleado INSERT facturas_mono [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into turnos (empresa_id, empleado_id, fecha, hora_entrada, hora_salida)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      '2026-03-10', '08:00', '17:00'
    );
    perform pg_temp.probe('A9 empleado INSERT turnos', true);
  exception when others then
    perform pg_temp.probe('A9 empleado INSERT turnos [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into alertas (empresa_id, empleado_id, tipo, titulo, fecha, dias_aviso, estado)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'documento', 'Hack alerta', '2026-12-01', 30, 'pendiente'
    );
    perform pg_temp.probe('A10 empleado INSERT alertas', true);
  exception when others then
    perform pg_temp.probe('A10 empleado INSERT alertas [' || sqlerrm || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into eventos_agenda (empresa_id, tipo, titulo, fecha)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'evento', 'Hack evento', '2026-03-15'
    );
    perform pg_temp.probe('A11 empleado INSERT eventos_agenda', true);
  exception when others then
    perform pg_temp.probe('A11 empleado INSERT eventos [' || sqlerrm || ']', false);
  end;
end $$;

-- ============================================================
-- B. INSERT approved/resolved states (should fail for employee)
-- ============================================================

do $$ begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'especial', '2026-04-01', '2026-04-01', 1, 'aprobada', now()
    );
    perform pg_temp.probe('B1 empleado INSERT ausencia aprobada', true);
  exception when others then
    perform pg_temp.probe('B1 empleado INSERT ausencia aprobada [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into adelantos (empresa_id, empleado_id, monto, estado, resuelto_en)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      5000, 'aprobado', now()
    );
    perform pg_temp.probe('B2 empleado INSERT adelanto aprobado', true);
  exception when others then
    perform pg_temp.probe('B2 empleado INSERT adelanto aprobado [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- C. INSERT for another employee (same tenant)
-- ============================================================

do $$ begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
      'especial', '2026-04-02', '2026-04-02', 1, 'pendiente'
    );
    perform pg_temp.probe('C1 empleado INSERT ausencia de peer', true);
  exception when others then
    perform pg_temp.probe('C1 empleado INSERT ausencia peer [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
      '2026-04', 'mensual',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/peer.pdf',
      'pendiente', now()
    );
    perform pg_temp.probe('C2 empleado INSERT recibo de peer (FOR ALL hole)', true);
  exception when others then
    perform pg_temp.probe('C2 empleado INSERT recibo peer [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- D. INSERT using another tenant empresa_id
-- ============================================================

do $$ begin
  begin
    insert into recibos (empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8',
      '2026-05', 'mensual',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9/x.pdf',
      'pendiente', now()
    );
    perform pg_temp.probe('D1 empleado INSERT recibo tenant B', true);
  exception when others then
    perform pg_temp.probe('D1 empleado INSERT recibo tenant B [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- E/F/G. UPDATE protected state / ownership (employee)
-- ============================================================

-- Seed a pending ausencia as service for UPDATE tests
reset role;
insert into ausencias (
  id, empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'estudio', '2026-05-01', '2026-05-01', 1, 'pendiente'
);
insert into adelantos (
  id, empresa_id, empleado_id, monto, estado
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  1000, 'pendiente'
);
insert into recibos (
  id, empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma, firmado_empleador_en
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  '2026-06', 'mensual',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/seed.pdf',
  'pendiente', now()
);

select pg_temp.as_emp();

do $$ begin
  update ausencias set estado = 'aprobada', resuelta_en = now()
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1';
  if found then
    perform pg_temp.probe('E1 empleado UPDATE ausencia→aprobada', true);
  else
    perform pg_temp.probe('E1 empleado UPDATE ausencia→aprobada', false);
  end if;
exception when others then
  perform pg_temp.probe('E1 empleado UPDATE ausencia [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  update adelantos set estado = 'aprobado', resuelto_en = now()
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2';
  if found then
    perform pg_temp.probe('E2 empleado UPDATE adelanto→aprobado', true);
  else
    perform pg_temp.probe('E2 empleado UPDATE adelanto→aprobado', false);
  end if;
exception when others then
  perform pg_temp.probe('E2 empleado UPDATE adelanto [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  update recibos set archivo_url = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9/stolen.pdf'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba3';
  if found then
    perform pg_temp.probe('E3 empleado UPDATE recibo archivo_url', true);
  else
    perform pg_temp.probe('E3 empleado UPDATE recibo archivo_url', false);
  end if;
exception when others then
  perform pg_temp.probe('E3 empleado UPDATE recibo [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  update empleados set empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
  if found then
    perform pg_temp.probe('F1 empleado UPDATE propia empresa_id→B', true);
  else
    perform pg_temp.probe('F1 empleado UPDATE propia empresa_id→B', false);
  end if;
exception when others then
  perform pg_temp.probe('F1 empleado UPDATE empresa_id [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  update empleados set cbu = '0000000000000000000099'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3';
  if found then
    perform pg_temp.probe('G1 empleado UPDATE CBU de peer', true);
  else
    perform pg_temp.probe('G1 empleado UPDATE CBU de peer', false);
  end if;
exception when others then
  perform pg_temp.probe('G1 empleado UPDATE peer CBU [' || left(sqlerrm,80) || ']', false);
end $$;

-- ============================================================
-- H. DELETE immutable / management rows
-- ============================================================

do $$ begin
  delete from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba3';
  if found then
    perform pg_temp.probe('H1 empleado DELETE recibo', true);
  else
    perform pg_temp.probe('H1 empleado DELETE recibo', false);
  end if;
exception when others then
  perform pg_temp.probe('H1 empleado DELETE recibo [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  delete from ausencias where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1';
  if found then
    perform pg_temp.probe('H2 empleado DELETE ausencia', true);
  else
    perform pg_temp.probe('H2 empleado DELETE ausencia', false);
  end if;
exception when others then
  perform pg_temp.probe('H2 empleado DELETE ausencia [' || left(sqlerrm,80) || ']', false);
end $$;

-- ============================================================
-- I. Cross-tenant SELECT
-- ============================================================

do $$ declare n int; begin
  select count(*) into n from empleados
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8';
  perform pg_temp.probe('I1 empleado SELECT emp tenant B count=' || n, n > 0);
end $$;

do $$ declare n int; begin
  select count(*) into n from remuneraciones
  where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9';
  perform pg_temp.probe('I2 empleado SELECT remu tenant B count=' || n, n > 0);
end $$;

-- ============================================================
-- J. Cross-tenant RPC / SECURITY DEFINER
-- ============================================================

do $$ declare v int; begin
  v := saldo_vacaciones_disponible('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8'::uuid, 2026);
  perform pg_temp.probe('J1 RPC saldo_vacaciones cross-tenant=' || coalesce(v::text,'null'), v is not null);
exception when others then
  perform pg_temp.probe('J1 RPC saldo_vacaciones [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ declare v int; begin
  v := saldo_licencia_disponible(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8'::uuid,
    'mudanza'::tipo_ausencia,
    2026
  );
  perform pg_temp.probe('J2 RPC saldo_licencia cross-tenant=' || coalesce(v::text,'null'), v is not null);
exception when others then
  perform pg_temp.probe('J2 RPC saldo_licencia [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ declare e uuid; begin
  -- oracle: any doc uuid; use random — expect null or value
  e := empresa_de_documento_firma('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform pg_temp.probe('J3 RPC empresa_de_documento_firma=' || coalesce(e::text,'null'), e is not null);
exception when others then
  perform pg_temp.probe('J3 RPC empresa_de_documento_firma [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ declare n int; begin
  n := dias_habiles_entre(
    '2026-01-01'::date, '2026-01-10'::date,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9'::uuid
  );
  perform pg_temp.probe('J4 RPC dias_habiles_entre other empresa=' || n, true);
exception when others then
  perform pg_temp.probe('J4 RPC dias_habiles_entre [' || left(sqlerrm,80) || ']', false);
end $$;

-- firmar_recibo on peer/other — should fail
do $$ begin
  begin
    perform firmar_recibo('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba3');
    -- may return empty; check firmado
    if exists (
      select 1 from recibos
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba3' and estado_firma = 'firmado'
    ) then
      perform pg_temp.probe('J5 firmar_recibo own pending', true);
    else
      perform pg_temp.probe('J5 firmar_recibo own pending (no-op/empty)', false);
    end if;
  exception when others then
    perform pg_temp.probe('J5 firmar_recibo [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- L. Privilege escalation
-- ============================================================

do $$ begin
  update usuarios set rol = 'admin_rrhh'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5';
  if found then
    perform pg_temp.probe('L1 empleado self-promote admin_rrhh', true);
  else
    perform pg_temp.probe('L1 empleado self-promote admin_rrhh', false);
  end if;
exception when others then
  perform pg_temp.probe('L1 empleado self-promote [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  update usuarios set rol = 'superadmin'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5';
  if found then
    perform pg_temp.probe('L2 empleado self-promote superadmin', true);
  else
    perform pg_temp.probe('L2 empleado self-promote superadmin', false);
  end if;
exception when others then
  perform pg_temp.probe('L2 empleado self-promote superadmin [' || left(sqlerrm,80) || ']', false);
end $$;

do $$ begin
  begin
    insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb7', -- already exists other tenant — try new
      'ghost-user@t.test', 'admin_rrhh', 'Ghost',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'
    );
    perform pg_temp.probe('L3 empleado INSERT usuarios admin', true);
  exception when others then
    -- try with nonexistent auth id — will FK fail; still tests policy
    begin
      insert into auth.users (id, instance_id, email, aud, role)
      values (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1',
        '00000000-0000-0000-0000-000000000000',
        'ghost-user@t.test', 'authenticated', 'authenticated'
      );
      insert into usuarios (id, email, rol, nombre_completo, empresa_id)
      values (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1',
        'ghost-user@t.test', 'admin_rrhh', 'Ghost',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
      );
      perform pg_temp.probe('L3 empleado INSERT usuarios admin (new auth)', true);
    exception when others then
      perform pg_temp.probe('L3 empleado INSERT usuarios [' || left(sqlerrm,80) || ']', false);
    end;
  end;
end $$;

-- ============================================================
-- M. Financial manipulation extras
-- ============================================================

do $$ begin
  begin
    insert into movimientos_financieros (tipo, concepto, categoria, empresa_id, monto, fecha, periodo)
    values (
      'ingreso', 'hack', 'otro',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      1000000, current_date, '2026-03'
    );
    perform pg_temp.probe('M1 empleado INSERT movimientos_financieros', true);
  exception when others then
    perform pg_temp.probe('M1 empleado INSERT movimientos_financieros [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- N. Notifications / audit / errors
-- ============================================================

do $$ begin
  begin
    insert into notificaciones (usuario_id, tipo, titulo, cuerpo)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6',
      'ausencia_solicitada', 'Spam', 'hola admin'
    );
    perform pg_temp.probe('N1 empleado INSERT notificacion a admin', true);
  exception when others then
    perform pg_temp.probe('N1 empleado INSERT notificacion [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into auditoria_acciones (empresa_id, actor_id, actor_nombre, accion, entidad, detalle)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
      'Fake Admin', 'borrar_todo', 'empresas', '{"lie":true}'::jsonb
    );
    perform pg_temp.probe('N2 empleado INSERT auditoria forjada', true);
  exception when others then
    perform pg_temp.probe('N2 empleado INSERT auditoria [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

do $$ begin
  begin
    insert into errores_app (empresa_id, usuario_id, ruta, mensaje)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
      '/hack', 'poison tenant B'
    );
    perform pg_temp.probe('N3 empleado INSERT errores_app empresa B', true);
  exception when others then
    perform pg_temp.probe('N3 empleado INSERT errores_app [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- ============================================================
-- O. State machine / admin reopen adelanto
-- ============================================================

reset role;
update adelantos set estado = 'rechazado', resuelto_en = now()
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2';
select pg_temp.as_admin();

do $$ begin
  update adelantos set estado = 'aprobado', resuelto_en = now()
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2';
  if found then
    perform pg_temp.probe('O1 admin reopen adelanto rechazado→aprobado', true);
  else
    perform pg_temp.probe('O1 admin reopen adelanto', false);
  end if;
exception when others then
  perform pg_temp.probe('O1 admin reopen adelanto [' || left(sqlerrm,80) || ']', false);
end $$;

-- Cross-link ausencia
do $$ begin
  begin
    insert into ausencias (
      empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado, resuelta_en
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8',
      'especial', '2026-07-01', '2026-07-01', 1, 'aprobada', now()
    );
    perform pg_temp.probe('O2 admin cross-link ausencia emp B + empresa A', true);
  exception when others then
    perform pg_temp.probe('O2 admin cross-link [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- Fichaje forge ts (employee) — mig 67 forces ts=now() on employee INSERT
select pg_temp.as_emp();
do $$
declare t timestamptz;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'ingreso', '2020-01-01 08:00:00+00', 'celular'
    )
    returning ts into t;
    -- HIT only if historical timestamp stuck (bypass of lock_fichaje_ts_empleado)
    perform pg_temp.probe(
      'O3 empleado INSERT fichaje con ts histórico',
      t < now() - interval '1 day'
    );
  exception when others then
    perform pg_temp.probe('O3 empleado INSERT fichaje [' || left(sqlerrm,80) || ']', false);
  end;
end $$;

-- Legitimate controls that should DENY (false-positive checks)
do $$ begin
  begin
    insert into feriados (empresa_id, fecha, nombre, tipo, no_laborable)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      '2026-12-25', 'Fake', 'nacional', true
    );
    perform pg_temp.probe('FP1 empleado INSERT feriados (SHOULD DENY)', true);
  exception when others then
    perform pg_temp.probe('FP1 empleado INSERT feriados correctly denied', false);
  end;
end $$;

do $$ begin
  begin
    insert into convenios (empresa_id, nombre, texto)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Hack', 'x'
    );
    perform pg_temp.probe('FP2 empleado INSERT convenios (SHOULD DENY)', true);
  exception when others then
    perform pg_temp.probe('FP2 empleado INSERT convenios correctly denied', false);
  end;
end $$;

do $$ begin
  begin
    insert into vacaciones_pendientes (empresa_id, empleado_id, anio, dias)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      2026, 99
    );
    perform pg_temp.probe('FP3 empleado INSERT vacaciones_pendientes (SHOULD DENY)', true);
  exception when others then
    perform pg_temp.probe('FP3 empleado INSERT vacaciones_pendientes correctly denied', false);
  end;
end $$;

do $$ begin
  begin
    insert into notas_internas (empresa_id, empleado_id, autor_id, cuerpo)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
      'hack'
    );
    perform pg_temp.probe('FP4 empleado INSERT notas_internas (SHOULD DENY)', true);
  exception when others then
    perform pg_temp.probe('FP4 empleado INSERT notas_internas correctly denied', false);
  end;
end $$;

do $$ begin
  begin
    select count(*) from invitaciones;
    perform pg_temp.probe('FP5 empleado SELECT invitaciones rows visible', true);
  exception when others then
    perform pg_temp.probe('FP5 empleado SELECT invitaciones correctly denied', false);
  end;
end $$;

reset role;
do $$ begin raise notice '=== END systematic probe (rolling back) ==='; end $$;
rollback;
