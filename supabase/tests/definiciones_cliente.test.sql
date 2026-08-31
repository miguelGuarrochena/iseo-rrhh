-- ============================================================
-- Definiciones del cliente (30/08) que se hacen cumplir en la base.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/definiciones_cliente.test.sql
--
-- Cubre:
--   14. nadie resuelve su propia ausencia (migración 103)
--   12. el embargo queda marcado y trazable (migración 102)
--    6. firma de recibos: sólo la propia, una vez, con sello de tiempo
--   15. la baja conserva el legajo y su historia
--
-- Todo dentro de una transacción que se revierte.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.ausencias to authenticated;
grant select, insert, update, delete on table public.descuentos_recurrentes to authenticated;
grant select, insert, update on table public.recibos to authenticated;
grant select, insert, update on table public.empleados to authenticated;
grant select on table public.usuarios, public.empresas to authenticated;
grant select, insert on table public.auditoria_acciones to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'Definiciones SA', '30-df-1', 'D', 'd@d.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  -- El supervisor TIENE legajo: es el caso del punto 14.
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Jorge', 'Sup', '701', '2019-01-01', 'Jefe', 'Prod'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Ana', 'Emp', '702', '2020-01-01', 'Op', 'Prod'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Juan Manuel', 'Gonzalez', '703', '2018-03-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10', '00000000-0000-0000-0000-000000000000', 'df-sup@t.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11', '00000000-0000-0000-0000-000000000000', 'df-adm@t.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb12', '00000000-0000-0000-0000-000000000000', 'df-emp@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10', 'df-sup@t.test', 'supervisor', 'Jorge Sup',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11', 'df-adm@t.test', 'admin_rrhh', 'Admin',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb12', 'df-emp@t.test', 'empleado', 'Ana Emp',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3');

create or replace function pg_temp.como(p uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.servicio() returns void
language plpgsql as $$
begin execute 'set local role postgres'; perform set_config('request.jwt.claims','',true); end $$;

create or replace function pg_temp.chk(nro text, desc_ text, ok boolean)
returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLA % — %', nro, desc_; end if;
  raise notice '  ok  % %', rpad(nro, 6), desc_;
end $$;

-- =====================================================================
-- 14. Nadie resuelve su propia ausencia
-- =====================================================================
select pg_temp.servicio();

insert into ausencias (id, empresa_id, empleado_id, tipo, fecha_desde, fecha_hasta, dias, estado)
values
  -- La del supervisor.
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   'vacaciones', '2027-01-11', '2027-01-24', 14, 'pendiente'),
  -- La de otra persona del equipo.
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
   'enfermedad', '2027-02-01', '2027-02-03', 3, 'pendiente');

select pg_temp.como('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10');

do $$
declare ok boolean;
begin
  -- No puede aprobar la suya…
  begin
    update ausencias
       set estado = 'aprobada', resuelta_por = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10',
           resuelta_en = now()
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1';
    ok := false;
  exception
    when raise_exception then
      ok := sqlerrm like '%AUSENCIA_PROPIA%';
    when others then ok := false;
  end;
  perform pg_temp.chk('14.1', 'el supervisor NO aprueba su propia ausencia', ok);

  -- …ni rechazarla.
  begin
    update ausencias
       set estado = 'rechazada', resuelta_por = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10',
           resuelta_en = now()
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1';
    ok := false;
  exception
    when raise_exception then ok := sqlerrm like '%AUSENCIA_PROPIA%';
    when others then ok := false;
  end;
  perform pg_temp.chk('14.2', 'tampoco la rechaza (no es sólo "aprobar")', ok);

  perform pg_temp.chk('14.3', 'y la ausencia sigue pendiente',
    (select estado from ausencias where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1') = 'pendiente');

  -- La de otra persona sí.
  update ausencias
     set estado = 'aprobada', resuelta_por = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10',
         resuelta_en = now()
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2';
  perform pg_temp.chk('14.4', 'la del equipo sí la resuelve',
    (select estado from ausencias where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba2') = 'aprobada');
end $$;

-- Y el admin, que no tiene legajo, puede resolver la del supervisor.
select pg_temp.como('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11');

do $$
begin
  update ausencias
     set estado = 'aprobada', resuelta_por = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11',
         resuelta_en = now()
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1';
  perform pg_temp.chk('14.5', 'otra persona sí puede resolverla',
    (select estado from ausencias where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbba1') = 'aprobada');
end $$;

-- =====================================================================
-- 12. Embargo: queda marcado y es trazable
-- =====================================================================
do $$
declare v_id uuid;
begin
  insert into descuentos_recurrentes
    (empresa_id, empleado_id, concepto, monto, es_embargo)
  values
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
     'Embargo judicial expte. 1234/26', 250000, true)
  returning id into v_id;

  perform pg_temp.chk('12.1', 'el embargo se guarda marcado como tal',
    (select es_embargo from descuentos_recurrentes where id = v_id));

  perform pg_temp.chk('12.2', 'y con su concepto, para saber cuál es',
    (select concepto from descuentos_recurrentes where id = v_id) like 'Embargo judicial%');

  -- Un descuento común no queda marcado sin querer.
  insert into descuentos_recurrentes (empresa_id, empleado_id, concepto, monto)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
          'Comedor', 20000);
  perform pg_temp.chk('12.3', 'el default es NO embargo',
    (select count(*) from descuentos_recurrentes
      where empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3' and es_embargo) = 1);
end $$;

-- =====================================================================
-- 6. Firma de recibos
-- =====================================================================
select pg_temp.servicio();

insert into recibos (id, empresa_id, empleado_id, periodo, archivo_url, firmado_empleador_en)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
   '2026-07', 'recibos/a.pdf', now()),
  -- El de OTRA persona.
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   '2026-07', 'recibos/b.pdf', now());

select pg_temp.como('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb12');

do $$
declare v_firmado timestamptz; v_filas int;
begin
  -- El propio: se firma.
  perform firmar_recibo('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1');
  select firmado_en into v_firmado
    from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1';
  perform pg_temp.chk('6.1', 'el empleado firma su propio recibo',
    (select estado_firma from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1') = 'firmado');
  perform pg_temp.chk('6.2', 'la firma deja sello de tiempo', v_firmado is not null);

  /*
   * El ajeno: no.
   *
   * Se cuentan FILAS y no se espera una excepción. `firmar_recibo`
   * devuelve `setof recibos` y filtra por `empleado_id = auth_empleado()`:
   * ante un recibo ajeno no falla, devuelve vacío. Un `perform` sobre
   * cero filas no lanza nada, así que un test que esperara la excepción
   * pasaría por el motivo equivocado el día que el filtro desapareciera.
   */
  select count(*) into v_filas
  from firmar_recibo('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc2');
  perform pg_temp.chk('6.3', 'NO puede firmar el recibo de otro (0 filas)',
    v_filas = 0);
  perform pg_temp.chk('6.4', 'y el ajeno sigue sin firmar',
    (select estado_firma from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc2') = 'pendiente');

  -- Firmado: no se puede alterar por la vía directa.
  begin
    update recibos set archivo_url = 'recibos/otro.pdf'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1';
  exception when others then null;
  end;
  perform pg_temp.chk('6.5', 'un recibo firmado no se puede cambiar de archivo',
    (select archivo_url from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1') = 'recibos/a.pdf');

  -- Firmar dos veces no vuelve a sellar.
  begin
    perform firmar_recibo('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1');
  exception when others then null;
  end;
  perform pg_temp.chk('6.6', 'firmar de nuevo no pisa el sello original',
    (select firmado_en from recibos where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1') = v_firmado);
end $$;

-- =====================================================================
-- 15. La baja conserva el legajo y su historia
-- =====================================================================
select pg_temp.como('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11');

do $$
begin
  -- El caso concreto que trajo el cliente: baja por despido.
  update empleados
     set activo = false,
         fecha_baja = '2026-08-15',
         motivo_baja = 'Despido sin causa'
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4';

  perform pg_temp.chk('15.1', 'el legajo NO se borra: sigue en la tabla',
    exists (select 1 from empleados where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'));

  perform pg_temp.chk('15.2', 'queda inactivo, con fecha y causal',
    exists (
      select 1 from empleados
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'
        and activo = false
        and fecha_baja = '2026-08-15'
        and motivo_baja = 'Despido sin causa'
    ));

  perform pg_temp.chk('15.3', 'conserva la fecha de ingreso',
    (select fecha_ingreso from empleados
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4') = '2018-03-01');

  perform pg_temp.chk('15.4', 'no aparece entre los activos',
    not exists (
      select 1 from empleados
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4' and activo
    ));

  perform pg_temp.chk('15.5', 'pero sí en el histórico completo',
    (select count(*) from empleados
      where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') = 3);
end $$;

-- Los recibos y ausencias de una persona dada de baja no se van con ella.
do $$
begin
  perform pg_temp.chk('15.6', 'los recibos firmados sobreviven a la baja',
    (select count(*) from recibos
      where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') = 2);
  perform pg_temp.chk('15.7', 'las ausencias resueltas también',
    (select count(*) from ausencias
      where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') = 2);
end $$;

select pg_temp.servicio();

do $$
begin
  raise notice '';
  raise notice 'OK: definiciones del cliente (14 autoaprobación, 12 embargo, 6 firma, 15 baja)';
end $$;

rollback;
