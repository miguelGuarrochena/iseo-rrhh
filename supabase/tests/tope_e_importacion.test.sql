-- ============================================================
-- Migraciones 107 y 108.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/tope_e_importacion.test.sql
--
-- 107 · sin tope de aportes no se liquida, y el tope tiene que ser un
--       importe. La validación del formulario y la del servicio corren en
--       el navegador; ésta es la única que no se puede saltear entrando
--       por la API con el token de un admin.
-- 108 · la importación escribe por el mismo camino que la carga manual,
--       así que pasa por los frenos que ya existían: empleado de la
--       empresa, período cerrado y una fila por persona y mes.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on table public.remuneraciones to authenticated;
-- A anon se le da el grant a propósito: así el chequeo mide la RLS y no
-- la falta de permiso de tabla, que es la afirmación más fuerte.
grant select, insert on table public.remuneraciones to anon;
grant select, update on table public.empresas to authenticated;
grant select on table public.usuarios, public.empleados to authenticated;
grant select, insert, update on table public.cierres_periodo to authenticated;

-- Una en relación de dependencia y sin tope; otra simplificada.
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, regimen, config)
values
  ('cccccccc-0000-0000-0000-00000000000a', 'Con Aportes SA', '30-tp-1', 'C', 'c@c.com',
   'relacion_dependencia',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
  ('cccccccc-0000-0000-0000-00000000000b', 'Simplificada SA', '30-tp-2', 'D', 'd@d.com',
   'simplificado',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('cccccccc-0000-0000-0000-000000000101',
   'cccccccc-0000-0000-0000-00000000000a', 'Ana', 'Ruiz', '701', '2020-01-01', 'Op', 'Prod'),
  ('cccccccc-0000-0000-0000-000000000102',
   'cccccccc-0000-0000-0000-00000000000a', 'Beto', 'Paz', '702', '2020-01-01', 'Op', 'Prod'),
  -- De la OTRA empresa: es el que no tiene que poder entrar.
  ('cccccccc-0000-0000-0000-000000000103',
   'cccccccc-0000-0000-0000-00000000000b', 'Caro', 'Diaz', '703', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('cccccccc-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'tp-adm@t.test', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'tp-adm2@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('cccccccc-0000-0000-0000-000000000201', 'tp-adm@t.test', 'admin_rrhh', 'Admin A',
   'cccccccc-0000-0000-0000-00000000000a', null),
  ('cccccccc-0000-0000-0000-000000000202', 'tp-adm2@t.test', 'admin_rrhh', 'Admin B',
   'cccccccc-0000-0000-0000-00000000000b', null);

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

create or replace function pg_temp.entra(sql text) returns boolean
language plpgsql as $$
begin execute sql; return true;
exception when others then return false;
end $$;

/** Filas realmente tocadas, o -1 si la sentencia fue rechazada. */
create or replace function pg_temp.afecta(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then return -1;
end $$;

/** Una remuneración de la empresa A, con los importes que se le pasen. */
create or replace function pg_temp.sql_remu(
  p_empleado text, p_periodo text, p_bruto numeric default 900000
) returns text language sql immutable as $$
  select format(
    'insert into remuneraciones
       (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
        otros_descuentos, aportes, monto_neto)
     values (%L, %L, %L, ''mensual'', %s, 0, 0, %s, %s)',
    'cccccccc-0000-0000-0000-00000000000a', p_empleado, p_periodo,
    p_bruto, round(p_bruto * 0.17), round(p_bruto * 0.83));
$$;

-- =====================================================================
-- 107 · Sin tope no se liquida
-- =====================================================================
select pg_temp.como('cccccccc-0000-0000-0000-000000000201');

do $$
begin
  perform pg_temp.chk('107.1', 'la empresa arranca sin tope cargado',
    tope_imponible_de_empresa('cccccccc-0000-0000-0000-00000000000a') is null);

  -- Éste es el punto: entrar directo por la API, sin pasar por el
  -- formulario ni por el servicio.
  perform pg_temp.chk('107.2', 'sin tope NO se puede guardar una remuneración',
    not pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-07')));

  perform pg_temp.chk('107.3', 'y no quedó nada guardado',
    (select count(*) from remuneraciones) = 0);
end $$;

-- Cargar el tope: recién ahí se puede
do $$
begin
  perform pg_temp.chk('107.4', 'un tope de cero se rechaza al configurarlo',
    not pg_temp.entra(
      'update empresas
          set config = config || ''{"topeImponibleAportes": 0}''::jsonb
        where id = ''cccccccc-0000-0000-0000-00000000000a'''));
  perform pg_temp.chk('107.5', 'un tope negativo también',
    not pg_temp.entra(
      'update empresas
          set config = config || ''{"topeImponibleAportes": -5}''::jsonb
        where id = ''cccccccc-0000-0000-0000-00000000000a'''));
  perform pg_temp.chk('107.6', 'un tope que no es número, también',
    not pg_temp.entra(
      'update empresas
          set config = config || ''{"topeImponibleAportes": "mucho"}''::jsonb
        where id = ''cccccccc-0000-0000-0000-00000000000a'''));
  perform pg_temp.chk('107.7', 'y un tope vacío, que es el que se escapaba',
    not pg_temp.entra(
      'update empresas
          set config = config || ''{"topeImponibleAportes": ""}''::jsonb
        where id = ''cccccccc-0000-0000-0000-00000000000a'''));

  update empresas
     set config = config || '{"topeImponibleAportes": 1200000}'::jsonb
   where id = 'cccccccc-0000-0000-0000-00000000000a';

  perform pg_temp.chk('107.8', 'con un importe positivo sí se guarda',
    tope_imponible_de_empresa('cccccccc-0000-0000-0000-00000000000a') = 1200000);

  perform pg_temp.chk('107.9', 'y ahora sí se puede liquidar',
    pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-07')));
end $$;

-- Un admin no puede tocar la configuración de otra empresa
select pg_temp.como('cccccccc-0000-0000-0000-000000000202');
do $$
begin
  perform pg_temp.chk('107.10', 'un admin no configura el tope de otra empresa',
    pg_temp.afecta(
      'update empresas
          set config = config || ''{"topeImponibleAportes": 1}''::jsonb
        where id = ''cccccccc-0000-0000-0000-00000000000a''') <= 0);
end $$;

select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('107.11', 'el tope de la empresa A quedó como estaba',
    tope_imponible_de_empresa('cccccccc-0000-0000-0000-00000000000a') = 1200000);
end $$;

-- En régimen simplificado no se pide: no hay aportes de ley que retener
select pg_temp.como('cccccccc-0000-0000-0000-000000000202');
do $$
begin
  perform pg_temp.chk('107.12', 'la simplificada no tiene aportes de ley',
    not empresa_con_aportes_de_ley('cccccccc-0000-0000-0000-00000000000b'));
  perform pg_temp.chk('107.13', 'la de relación de dependencia sí',
    empresa_con_aportes_de_ley('cccccccc-0000-0000-0000-00000000000a'));

  perform pg_temp.chk('107.14', 'la simplificada liquida sin tope',
    pg_temp.entra(
      'insert into remuneraciones
         (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
          otros_descuentos, aportes, monto_neto)
       values (''cccccccc-0000-0000-0000-00000000000b'',
               ''cccccccc-0000-0000-0000-000000000103'', ''2026-07'', ''mensual'',
               900000, 0, 0, 0, 900000)'));
  perform pg_temp.chk('107.15', 'y quedó guardada',
    (select count(*) from remuneraciones
      where empresa_id = 'cccccccc-0000-0000-0000-00000000000b') = 1);
end $$;

-- Sacarle el tope a una empresa que ya liquidó no borra lo liquidado
select pg_temp.servicio();
do $$
declare v_aportes numeric;
begin
  select aportes into v_aportes from remuneraciones
   where empleado_id = 'cccccccc-0000-0000-0000-000000000101' and periodo = '2026-07';

  update empresas set config = config - 'topeImponibleAportes'
   where id = 'cccccccc-0000-0000-0000-00000000000a';

  perform pg_temp.chk('107.16', 'quitar el tope no toca lo ya liquidado',
    (select aportes from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000101'
        and periodo = '2026-07') = v_aportes);
end $$;

/*
 * Y es la razón por la que el tope puede vivir en la configuración sin
 * necesitar historia: cada fila guarda su propio `aportes` y
 * `monto_neto`, calculados al grabar. Cambiar el tope hoy no puede mover
 * un período anterior porque nada los vuelve a calcular.
 */
select pg_temp.como('cccccccc-0000-0000-0000-000000000201');
do $$
begin
  perform pg_temp.chk('107.17', 'pero sin tope no se puede liquidar el mes siguiente',
    not pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-08')));
end $$;

select pg_temp.servicio();
update empresas
   set config = config || '{"topeImponibleAportes": 1200000}'::jsonb
 where id = 'cccccccc-0000-0000-0000-00000000000a';

-- =====================================================================
-- 108 · La importación pasa por los mismos frenos
-- =====================================================================
select pg_temp.como('cccccccc-0000-0000-0000-000000000201');

do $$
begin
  perform pg_temp.chk('108.1', 'una importación guarda el desglose informado',
    pg_temp.entra(
      'insert into remuneraciones
         (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
          otros_descuentos, aportes, monto_neto, origen, detalle)
       values (''cccccccc-0000-0000-0000-00000000000a'',
               ''cccccccc-0000-0000-0000-000000000102'', ''2026-07'', ''mensual'',
               1000000, 0, 0, 170000, 830000, ''importacion'',
               ''{"sueldo": 800000, "antiguedad": 200000}''::jsonb)'));

  perform pg_temp.chk('108.2', 'queda marcada como importada',
    (select origen from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000102') = 'importacion');
  perform pg_temp.chk('108.3', 'y el desglose se puede leer después',
    (select (detalle ->> 'antiguedad')::numeric from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000102') = 200000);
  perform pg_temp.chk('108.4', 'la carga manual sigue marcándose como manual',
    (select origen from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000101'
        and periodo = '2026-07') = 'manual');

  perform pg_temp.chk('108.5', 'un origen inventado se rechaza',
    not pg_temp.entra(
      'update remuneraciones set origen = ''magia''
        where empleado_id = ''cccccccc-0000-0000-0000-000000000102'''));
  perform pg_temp.chk('108.6', 'un detalle que no es un objeto se rechaza',
    not pg_temp.entra(
      'update remuneraciones set detalle = ''[1,2,3]''::jsonb
        where empleado_id = ''cccccccc-0000-0000-0000-000000000102'''));
end $$;

-- El freno que importa: no se le puede cargar plata al empleado de otro
do $$
begin
  perform pg_temp.chk('108.7', 'no se puede importar para un empleado de otra empresa',
    not pg_temp.entra(
      'insert into remuneraciones
         (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
          otros_descuentos, aportes, monto_neto, origen)
       values (''cccccccc-0000-0000-0000-00000000000a'',
               ''cccccccc-0000-0000-0000-000000000103'', ''2026-07'', ''mensual'',
               900000, 0, 0, 153000, 747000, ''importacion'')'));

  perform pg_temp.chk('108.8', 'y no quedó nada del empleado ajeno',
    (select count(*) from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000103'
        and empresa_id = 'cccccccc-0000-0000-0000-00000000000a') = 0);

  -- Ni haciéndose pasar por la otra empresa.
  perform pg_temp.chk('108.9', 'ni firmando la fila como de la otra empresa',
    not pg_temp.entra(
      'insert into remuneraciones
         (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
          otros_descuentos, aportes, monto_neto, origen)
       values (''cccccccc-0000-0000-0000-00000000000b'',
               ''cccccccc-0000-0000-0000-000000000103'', ''2026-08'', ''mensual'',
               900000, 0, 0, 0, 900000, ''importacion'')'));
end $$;

-- Reimportar el mismo mes reemplaza, no duplica
do $$
begin
  insert into remuneraciones
    (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
     otros_descuentos, aportes, monto_neto, origen, detalle)
  values ('cccccccc-0000-0000-0000-00000000000a',
          'cccccccc-0000-0000-0000-000000000102', '2026-07', 'mensual',
          1100000, 0, 0, 187000, 913000, 'importacion',
          '{"sueldo": 900000, "antiguedad": 200000}'::jsonb)
  on conflict (empleado_id, periodo, tipo) do update
     set monto_bruto = excluded.monto_bruto,
         aportes = excluded.aportes,
         monto_neto = excluded.monto_neto,
         detalle = excluded.detalle,
         origen = excluded.origen;

  perform pg_temp.chk('108.10', 'reimportar deja una sola fila por persona y mes',
    (select count(*) from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000102'
        and periodo = '2026-07') = 1);
  perform pg_temp.chk('108.11', 'con los importes corregidos',
    (select monto_bruto from remuneraciones
      where empleado_id = 'cccccccc-0000-0000-0000-000000000102'
        and periodo = '2026-07') = 1100000);

  perform pg_temp.chk('108.12', 'insertar dos veces el mismo mes sin upsert falla',
    not pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-07')));
end $$;

-- Un mes cerrado no se reimporta
select pg_temp.servicio();
insert into cierres_periodo (empresa_id, periodo, estado, cerrado_en)
values ('cccccccc-0000-0000-0000-00000000000a', '2026-07', 'cerrado', now())
on conflict do nothing;

select pg_temp.como('cccccccc-0000-0000-0000-000000000201');
do $$
begin
  perform pg_temp.chk('108.13', 'no se importa a un período cerrado',
    not pg_temp.entra(
      'insert into remuneraciones
         (empresa_id, empleado_id, periodo, tipo, monto_bruto, no_remunerativo,
          otros_descuentos, aportes, monto_neto, origen)
       values (''cccccccc-0000-0000-0000-00000000000a'',
               ''cccccccc-0000-0000-0000-000000000101'', ''2026-07'', ''mensual'',
               1, 0, 0, 0, 1, ''importacion'')'));

  perform pg_temp.chk('108.14', 'ni se pisa lo que ya estaba en ese mes',
    not pg_temp.entra(
      'update remuneraciones set monto_bruto = 1
        where empleado_id = ''cccccccc-0000-0000-0000-000000000101''
          and periodo = ''2026-07'''));

  perform pg_temp.chk('108.15', 'un mes abierto sigue funcionando',
    pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-09')));
end $$;

-- Un empleado no puede escribir remuneraciones, importadas ni manuales
select pg_temp.servicio();
insert into auth.users (id, instance_id, email, aud, role) values
  ('cccccccc-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000',
   'tp-emp@t.test', 'authenticated', 'authenticated');
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('cccccccc-0000-0000-0000-000000000203', 'tp-emp@t.test', 'empleado', 'Ana Ruiz',
   'cccccccc-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-000000000101');

select pg_temp.como('cccccccc-0000-0000-0000-000000000203');
do $$
begin
  perform pg_temp.chk('108.16', 'un empleado no importa remuneraciones',
    not pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-10')));
  perform pg_temp.chk('108.17', 'ni se sube el sueldo editando la suya',
    pg_temp.afecta(
      'update remuneraciones set monto_bruto = 9999999
        where empleado_id = ''cccccccc-0000-0000-0000-000000000101''') <= 0);
  perform pg_temp.chk('108.18', 'sólo ve las propias',
    (select count(*) from remuneraciones
      where empleado_id <> 'cccccccc-0000-0000-0000-000000000101') = 0);
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform pg_temp.chk('108.19', 'sin sesión no se ven remuneraciones',
    (select count(*) from remuneraciones) = 0);
  perform pg_temp.chk('108.20', 'ni se importan',
    not pg_temp.entra(
      pg_temp.sql_remu('cccccccc-0000-0000-0000-000000000101', '2026-11')));
end $$;

do $$
begin
  raise notice '';
  raise notice 'OK: tope de aportes (107) e importación de liquidaciones (108)';
end $$;

rollback;
