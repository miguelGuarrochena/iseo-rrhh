-- ============================================================
-- Cierre de novedades (migración 99): rol, tenant, cierre, reapertura
-- y bloqueo del período cerrado.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/cierre_periodo.test.sql
--
-- Todo dentro de una transacción que se revierte al final.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select on table public.cierres_periodo to authenticated;
grant select, insert, update, delete on table public.remuneraciones to authenticated;
grant select, insert, update, delete on table public.adelantos to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;
grant select, insert on table public.auditoria_acciones to authenticated;

-- ---------- Datos ----------

-- Tenant A
-- Desde la migración 107 el tope imponible de aportes es obligatorio para
-- guardar remuneraciones. Estos fixtures liquidan, así que lo cargan.
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'Cierre SA', '30-ci-1', 'C', 'c@c.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb
);

-- Tenant B (aislamiento)
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'cccccccc-cccc-cccc-cccc-ccccccccccc9',
  'Otra SA', '30-ci-9', 'O', 'o@o.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],"topeImponibleAportes":1200000}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Emp', 'A', '901', '2020-01-01', 'Op', 'Prod'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc8',
   'cccccccc-cccc-cccc-cccc-ccccccccccc9', 'Emp', 'X', '909', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', '00000000-0000-0000-0000-000000000000', 'ci-admin@t.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc4', '00000000-0000-0000-0000-000000000000', 'ci-sup@t.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc5', '00000000-0000-0000-0000-000000000000', 'ci-emp@t.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc6', '00000000-0000-0000-0000-000000000000', 'ci-super@t.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc7', '00000000-0000-0000-0000-000000000000', 'ci-adminb@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'ci-admin@t.test', 'admin_rrhh', 'Admin A',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', null),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc4', 'ci-sup@t.test', 'supervisor', 'Sup A',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', null),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc5', 'ci-emp@t.test', 'empleado', 'Emp A',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'cccccccc-cccc-cccc-cccc-ccccccccccc2'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc6', 'ci-super@t.test', 'superadmin', 'ISEO', null, null),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc7', 'ci-adminb@t.test', 'admin_rrhh', 'Admin B',
   'cccccccc-cccc-cccc-cccc-ccccccccccc9', null);

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

-- Un período pasado, siempre válido corra cuando corra el test.
create or replace function pg_temp.periodo() returns text
language sql stable as $$
  select to_char(
    (now() at time zone zona_empresa()) - interval '1 month', 'YYYY-MM'
  );
$$;

-- =====================================================================
-- Un empleado no cierra nada
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc5');

do $$
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo()
    );
    raise exception 'FAIL: un empleado no debería poder cerrar el período';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- Un supervisor tampoco: cerrar el mes es de administración
-- =====================================================================
--
-- Se prueban los TRES RPC de escritura, no sólo el de cerrar. Los tres
-- comparten `assert_puede_cerrar_periodo`, pero eso es una decisión de
-- hoy: si mañana alguno afloja su guarda por su cuenta, el agujero
-- aparece en el que no se estaba mirando.
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc4');

do $$
declare
  v_periodo text := pg_temp.periodo();
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo
    );
    raise exception 'FAIL: un supervisor no debería poder cerrar el período';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;

  begin
    perform reabrir_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'porque sí'
    );
    raise exception 'FAIL: un supervisor no debería poder reabrir el período';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;

  begin
    perform marcar_categoria_revisada(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'altas', true
    );
    raise exception 'FAIL: un supervisor no debería poder tildar categorías';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;

  -- Y ninguno de los tres dejó rastro.
  if exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  ) then
    raise exception 'FAIL: el supervisor creó un cierre';
  end if;
end $$;

-- =====================================================================
-- Aislamiento: el admin de B no cierra el período de A
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc7');

do $$
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo()
    );
    raise exception 'FAIL: cross-tenant: B no debería cerrar el período de A';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- Período futuro: no hay novedades que revisar
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc3');

do $$
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', '2999-12'
    );
    raise exception 'FAIL: no debería dejar cerrar un período futuro';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- Formato inválido
do $$
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', '2026-13'
    );
    raise exception 'FAIL: 2026-13 no es un período';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- Período anterior al piso: `marcar_categoria_revisada` CREA la fila si
-- no existe, así que sin piso un admin podía sembrar su propio tenant de
-- cierres de meses que nunca existieron.
do $$
begin
  begin
    perform marcar_categoria_revisada(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', '0001-01', 'altas', true
    );
    raise exception 'FAIL: 0001-01 no debería aceptarse';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
  if exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and periodo = '0001-01'
  ) then
    raise exception 'FAIL: quedó una fila de un período imposible';
  end if;
end $$;

-- =====================================================================
-- El admin de A sí cierra, y queda auditado
-- =====================================================================
do $$
declare
  v_periodo text := pg_temp.periodo();
begin
  perform cerrar_periodo('cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'todo ok');

  if not exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and periodo = v_periodo
      and estado = 'cerrado'
      and cerrado_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc3'
      and cerrado_en is not null
  ) then
    raise exception 'FAIL: el período debería quedar cerrado y con autor';
  end if;

  if not exists (
    select 1 from auditoria_acciones
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and entidad = 'cierre_periodo'
      and accion = 'cerrar'
      and entidad_id = v_periodo
      and actor_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc3'
  ) then
    raise exception 'FAIL: cerrar debería quedar en la auditoría';
  end if;
end $$;

-- Cerrar dos veces falla: "cerrado dos veces" no existe como hecho
do $$
begin
  begin
    perform cerrar_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo()
    );
    raise exception 'FAIL: no debería dejar cerrar dos veces';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- Con el período cerrado, remuneraciones y adelantos quedan bloqueados
-- =====================================================================
do $$
begin
  begin
    insert into remuneraciones
      (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values
      ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
       'cccccccc-cccc-cccc-cccc-ccccccccccc2',
       pg_temp.periodo(), 100, 83);
    raise exception 'FAIL: no debería dejar cargar una remuneración del mes cerrado';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm not like '%PERIODO_CERRADO%' then
        raise exception 'FAIL: el error debería ser PERIODO_CERRADO, fue: %', sqlerrm;
      end if;
    when others then null;
  end;
end $$;

-- Otro período sigue funcionando: el freno es del mes cerrado, no global
insert into remuneraciones
  (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
   'cccccccc-cccc-cccc-cccc-ccccccccccc2',
   '2020-01', 100, 83);

-- Mover una remuneración HACIA el mes cerrado tampoco
do $$
begin
  begin
    update remuneraciones
       set periodo = pg_temp.periodo()
     where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
       and periodo = '2020-01';
    raise exception 'FAIL: no debería dejar mover una fila al mes cerrado';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- La empresa B no se ve afectada por el cierre de A
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc7');

insert into remuneraciones
  (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc9',
   'cccccccc-cccc-cccc-cccc-ccccccccccc8',
   pg_temp.periodo(), 100, 83);

-- Y no ve el cierre de A
do $$
begin
  if exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  ) then
    raise exception 'FAIL: B no debería ver los cierres de A';
  end if;
end $$;

-- =====================================================================
-- Reapertura
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc3');

-- Sin motivo no se reabre
do $$
begin
  begin
    perform reabrir_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo(), '   '
    );
    raise exception 'FAIL: reabrir sin motivo no debería andar';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

do $$
declare
  v_periodo text := pg_temp.periodo();
begin
  perform reabrir_periodo(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'el estudio devolvió un error'
  );

  if not exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and periodo = v_periodo
      and estado = 'abierto'
      and reabierto_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc3'
      and motivo_reapertura = 'el estudio devolvió un error'
      -- El rastro de quién lo había cerrado no se pisa.
      and cerrado_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc3'
  ) then
    raise exception 'FAIL: la reapertura debería dejar estado, autor y motivo';
  end if;

  if not exists (
    select 1 from auditoria_acciones
    where entidad = 'cierre_periodo' and accion = 'reabrir'
      and entidad_id = v_periodo
  ) then
    raise exception 'FAIL: reabrir debería quedar en la auditoría';
  end if;
end $$;

-- Reabierto: la remuneración del mes vuelve a poder cargarse
insert into remuneraciones
  (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
   'cccccccc-cccc-cccc-cccc-ccccccccccc2',
   pg_temp.periodo(), 100, 83);

-- Reabrir uno que no está cerrado falla
do $$
begin
  begin
    perform reabrir_periodo(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo(), 'otra vez'
    );
    raise exception 'FAIL: no debería reabrir un período abierto';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- Categorías revisadas: tildar, destildar, y no tocar un mes cerrado
-- =====================================================================
do $$
declare
  v_periodo text := pg_temp.periodo();
  v_cats jsonb;
begin
  perform marcar_categoria_revisada(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'altas', true
  );
  -- Dos veces la misma no la duplica.
  perform marcar_categoria_revisada(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'altas', true
  );
  perform marcar_categoria_revisada(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'bajas', true
  );

  select categorias_revisadas into v_cats
  from cierres_periodo
  where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
    and periodo = v_periodo;

  if jsonb_array_length(v_cats) <> 2 or not (v_cats ? 'altas') then
    raise exception 'FAIL: se esperaban altas y bajas revisadas, hay %', v_cats;
  end if;

  perform marcar_categoria_revisada(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'altas', false
  );

  select categorias_revisadas into v_cats
  from cierres_periodo
  where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
    and periodo = v_periodo;

  if v_cats ? 'altas' then
    raise exception 'FAIL: altas debería haberse destildado';
  end if;
end $$;

-- Cerrado no se tilda
do $$
declare
  v_periodo text := pg_temp.periodo();
begin
  perform cerrar_periodo('cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo);
  begin
    perform marcar_categoria_revisada(
      'cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo, 'altas', true
    );
    raise exception 'FAIL: no debería dejar tildar en un período cerrado';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- El superadmin de ISEO opera sobre cualquier cliente
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc6');

do $$
begin
  perform reabrir_periodo(
    'cccccccc-cccc-cccc-cccc-ccccccccccc1', pg_temp.periodo(), 'soporte de ISEO'
  );
  if not exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and periodo = pg_temp.periodo()
      and estado = 'abierto'
      and reabierto_por = 'cccccccc-cccc-cccc-cccc-ccccccccccc6'
  ) then
    raise exception 'FAIL: el superadmin debería poder reabrir el mes de un cliente';
  end if;
end $$;

-- =====================================================================
-- Nadie escribe la tabla a mano: sólo por los RPC
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc3');

do $$
begin
  begin
    insert into cierres_periodo (empresa_id, periodo, estado)
    values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '2019-01', 'cerrado');
    raise exception 'FAIL: no debería poder insertarse un cierre a mano';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;

  begin
    update cierres_periodo set estado = 'cerrado'
     where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
    -- RLS sin policy de UPDATE no lanza error: no afecta filas.
    if exists (
      select 1 from cierres_periodo
      where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
        and periodo = pg_temp.periodo()
        and estado = 'cerrado'
    ) then
      raise exception 'FAIL: un UPDATE directo no debería cerrar el período';
    end if;
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- No hay atajo: borrar el renglón del cierre para desbloquear el mes
-- =====================================================================
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc3');

do $$
declare
  v_periodo text := pg_temp.periodo();
  n int;
begin
  perform cerrar_periodo('cccccccc-cccc-cccc-cccc-ccccccccccc1', v_periodo);

  -- `cierres_periodo` no tiene policy de DELETE: RLS no borra nada en vez
  -- de fallar. Si algún día alguien le agrega una, esto lo caza.
  delete from cierres_periodo
   where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
  get diagnostics n = row_count;
  if n > 0 then
    raise exception 'FAIL: el admin borró el cierre y se saltearía el bloqueo';
  end if;

  -- Se mira la tabla y no `periodo_cerrado()`: esa función está revocada
  -- para `authenticated` a propósito (sólo la usa el trigger).
  if not exists (
    select 1 from cierres_periodo
    where empresa_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
      and periodo = v_periodo
      and estado = 'cerrado'
  ) then
    raise exception 'FAIL: el período debería seguir cerrado';
  end if;
end $$;

-- =====================================================================
-- Ni el superadmin escribe en un mes cerrado: tiene que reabrirlo
-- =====================================================================
--
-- Es a propósito. Reabrir queda auditado con nombre y motivo; escribir
-- por arriba del cierre, no. Que ISEO tenga que pasar por la puerta es
-- lo que hace que el cierre signifique algo.
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc6');

do $$
begin
  begin
    insert into remuneraciones
      (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values
      ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
       'cccccccc-cccc-cccc-cccc-ccccccccccc2',
       pg_temp.periodo(), 500, 415);
    raise exception 'FAIL: el superadmin tampoco debería escribir en un mes cerrado';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm not like '%PERIODO_CERRADO%' then
        raise exception 'FAIL: se esperaba PERIODO_CERRADO, fue: %', sqlerrm;
      end if;
    when others then null;
  end;
end $$;

-- =====================================================================
-- Sin sesión (service role) la cascada de una purga no se frena
-- =====================================================================
--
-- Borrar una empresa arrastra sus remuneraciones. Si el trigger frenara
-- eso, un cliente con un mes cerrado sería imposible de purgar cuando
-- pide que le borren todo.
select pg_temp.as_service();

do $$
begin
  perform set_config(
    'app.purgar_empresa', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', true
  );
  delete from empresas where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
exception
  when others then
    raise exception 'FAIL: la purga no debería frenarse por el cierre: %', sqlerrm;
end $$;

do $$
begin
  raise notice 'OK: cierre_periodo (rol, tenant, cierre, reapertura, bloqueo, purga)';
end $$;

rollback;
