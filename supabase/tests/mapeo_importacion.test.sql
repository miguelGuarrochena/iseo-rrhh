-- ============================================================
-- Migración 109 · El mapeo de importación de cada empresa.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/mapeo_importacion.test.sql
--
-- El mapeo dice cómo interpretar la planilla del estudio contable de una
-- empresa. Que la empresa A pueda leer el de la B revelaría cómo está
-- armada su liquidación; que pueda escribirlo sería peor: le cambiaría
-- en silencio a qué campo va cada columna, y la próxima importación de
-- la B mandaría los importes al lugar equivocado sin que nada se vea
-- raro en pantalla.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated, anon;
-- A anon se le da el grant a propósito: así el chequeo mide la RLS y no
-- la falta de permiso de tabla.
grant select, insert, update, delete
  on table public.mapeos_importacion_remuneraciones to authenticated, anon;
grant select on table public.usuarios, public.empresas to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('dddddddd-0000-0000-0000-00000000000a', 'Estudio A SA', '30-mp-1', 'A', 'a@a.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
     "topeImponibleAportes":1200000}'::jsonb),
  ('dddddddd-0000-0000-0000-00000000000b', 'Estudio B SA', '30-mp-2', 'B', 'b@b.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
     "topeImponibleAportes":1200000}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('dddddddd-0000-0000-0000-000000000101',
   'dddddddd-0000-0000-0000-00000000000a', 'Ana', 'Ruiz', '801', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('dddddddd-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'mp-a@t.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'mp-b@t.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'mp-sup@t.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000000', 'mp-emp@t.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000000', 'mp-super@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('dddddddd-0000-0000-0000-000000000201', 'mp-a@t.test', 'admin_rrhh', 'Admin A',
   'dddddddd-0000-0000-0000-00000000000a', null),
  ('dddddddd-0000-0000-0000-000000000202', 'mp-b@t.test', 'admin_rrhh', 'Admin B',
   'dddddddd-0000-0000-0000-00000000000b', null),
  ('dddddddd-0000-0000-0000-000000000203', 'mp-sup@t.test', 'supervisor', 'Supervisor A',
   'dddddddd-0000-0000-0000-00000000000a', null),
  ('dddddddd-0000-0000-0000-000000000204', 'mp-emp@t.test', 'empleado', 'Ana Ruiz',
   'dddddddd-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-000000000101'),
  ('dddddddd-0000-0000-0000-000000000205', 'mp-super@t.test', 'superadmin', 'ISEO', null, null);

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

/**
 * Filas realmente tocadas, o -1 si fue rechazada.
 *
 * Un UPDATE que RLS deja sin filas **no lanza error**: para los permisos
 * de escritura lo que importa es el efecto, no la ausencia de excepción.
 */
create or replace function pg_temp.afecta(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then return -1;
end $$;

/** El mapeo de una empresa, leído sin RLS: el estado real. */
create or replace function pg_temp.mapeo_de(p_empresa uuid, p_col text)
returns text language sql stable as $$
  select mapeo ->> p_col from public.mapeos_importacion_remuneraciones
   where empresa_id = p_empresa;
$$;

-- =====================================================================
-- Cada empresa guarda el suyo
-- =====================================================================
select pg_temp.como('dddddddd-0000-0000-0000-000000000201');

do $$
begin
  perform pg_temp.chk('109.1', 'sin importaciones previas no hay mapeo',
    (select count(*) from mapeos_importacion_remuneraciones) = 0);

  insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
  values ('dddddddd-0000-0000-0000-00000000000a',
          '{"Legajo":"legajo","Sueldo":"sueldo","Obs.":"__ignorar__"}'::jsonb);

  perform pg_temp.chk('109.2', 'el admin guarda el mapeo de su empresa',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Sueldo') = 'sueldo');
  perform pg_temp.chk('109.3', 'guarda también lo que se decidió no importar',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Obs.') = '__ignorar__');
  perform pg_temp.chk('109.4', 'queda el sello de quién lo guardó',
    (select actualizado_por from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000a')
    = 'dddddddd-0000-0000-0000-000000000201');
end $$;

-- La otra empresa guarda uno distinto, para el mismo campo
select pg_temp.como('dddddddd-0000-0000-0000-000000000202');

do $$
begin
  perform pg_temp.chk('109.5', 'la empresa B no ve el mapeo de la A',
    (select count(*) from mapeos_importacion_remuneraciones) = 0);

  insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
  values ('dddddddd-0000-0000-0000-00000000000b',
          '{"Nro Legajo":"legajo","Haberes":"sueldo"}'::jsonb);

  perform pg_temp.chk('109.6', 'la B guarda el suyo, con otros encabezados',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000b', 'Haberes') = 'sueldo');
  perform pg_temp.chk('109.7', 'y sólo ve el suyo',
    (select count(*) from mapeos_importacion_remuneraciones) = 1);
end $$;

-- Los dos conviven: "Sueldo" en una y "Haberes" en la otra van al mismo campo
select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('109.8', 'dos empresas, dos formatos, el mismo campo',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Sueldo') = 'sueldo'
    and pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000b', 'Haberes') = 'sueldo');
  perform pg_temp.chk('109.9', 'y el encabezado de una no existe en la otra',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000b', 'Sueldo') is null);
end $$;

-- =====================================================================
-- Nadie toca el mapeo de otro
-- =====================================================================
select pg_temp.como('dddddddd-0000-0000-0000-000000000201');

do $$
begin
  perform pg_temp.chk('109.10', 'el admin A no lee el mapeo de la B',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000b') = 0);

  -- Un UPDATE filtrado por RLS deja cero filas y no lanza: se mide el efecto.
  perform pg_temp.chk('109.11', 'ni lo modifica',
    pg_temp.afecta(
      'update mapeos_importacion_remuneraciones
          set mapeo = ''{"Haberes":"otrosDescuentos"}''::jsonb
        where empresa_id = ''dddddddd-0000-0000-0000-00000000000b''') <= 0);

  perform pg_temp.chk('109.12', 'ni lo borra',
    pg_temp.afecta(
      'delete from mapeos_importacion_remuneraciones
        where empresa_id = ''dddddddd-0000-0000-0000-00000000000b''') <= 0);

  perform pg_temp.chk('109.13', 'ni crea uno a nombre de la otra empresa',
    not pg_temp.entra(
      'insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
         values (''dddddddd-0000-0000-0000-00000000000b'',
                 ''{"Haberes":"otrosDescuentos"}''::jsonb)'));
end $$;

select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('109.14', 'el mapeo de la B quedó intacto',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000b', 'Haberes') = 'sueldo');
end $$;

-- El golpe fino: tomar el propio y reasignarlo a otra empresa
select pg_temp.como('dddddddd-0000-0000-0000-000000000201');
do $$
begin
  perform pg_temp.chk('109.15', 'no puede mudar su mapeo a otra empresa',
    pg_temp.afecta(
      'update mapeos_importacion_remuneraciones
          set empresa_id = ''dddddddd-0000-0000-0000-00000000000b''
        where empresa_id = ''dddddddd-0000-0000-0000-00000000000a''') <= 0
    or pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Sueldo') = 'sueldo');
end $$;

select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('109.16', 'cada empresa sigue con el suyo',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000a') = 1
    and (select count(*) from mapeos_importacion_remuneraciones
          where empresa_id = 'dddddddd-0000-0000-0000-00000000000b') = 1);
end $$;

-- =====================================================================
-- Quién puede: sólo quien importa liquidaciones
-- =====================================================================
select pg_temp.como('dddddddd-0000-0000-0000-000000000203');
do $$
begin
  -- El supervisor no importa liquidaciones, así que tampoco define cómo
  -- se leen sus columnas.
  perform pg_temp.chk('109.17', 'un supervisor no ve el mapeo',
    (select count(*) from mapeos_importacion_remuneraciones) = 0);
  perform pg_temp.chk('109.18', 'ni lo puede crear',
    not pg_temp.entra(
      'insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
         values (''dddddddd-0000-0000-0000-00000000000a'', ''{"x":"sueldo"}''::jsonb)'));
end $$;

select pg_temp.como('dddddddd-0000-0000-0000-000000000204');
do $$
begin
  perform pg_temp.chk('109.19', 'un empleado tampoco lo ve',
    (select count(*) from mapeos_importacion_remuneraciones) = 0);
  perform pg_temp.chk('109.20', 'ni lo modifica',
    pg_temp.afecta(
      'update mapeos_importacion_remuneraciones
          set mapeo = ''{"Sueldo":"montoBruto"}''::jsonb') <= 0);
end $$;

select pg_temp.como('dddddddd-0000-0000-0000-000000000205');
do $$
begin
  -- Acotado a las empresas de este test: si dependiera de que la base
  -- esté vacía, fallaría por datos de al lado y no por la RLS.
  perform pg_temp.chk('109.21', 'el superadmin ve los de todas',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id in ('dddddddd-0000-0000-0000-00000000000a',
                           'dddddddd-0000-0000-0000-00000000000b')) = 2);

  /*
   * Y de ahí sale una consecuencia que hay que dejar fijada: para el
   * superadmin la RLS **no** reduce a una fila. La consulta del cliente
   * tiene que traer el `empresa_id` sí o sí; sin él, el `maybeSingle()`
   * de supabase-js falla con PGRST116 y el superadmin no puede ni abrir
   * la importación de una empresa cliente. Pasó.
   */
  perform pg_temp.chk('109.22', 'sin filtrar por empresa, al superadmin le vuelve más de una',
    (select count(*) from mapeos_importacion_remuneraciones) > 1);
  perform pg_temp.chk('109.23', 'filtrando por empresa, exactamente una',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000a') = 1);
  perform pg_temp.chk('109.24', 'y puede entrar a cualquiera de las dos',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Sueldo') = 'sueldo'
    and pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000b', 'Haberes') = 'sueldo');
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform pg_temp.chk('109.25', 'sin sesión no se ve ningún mapeo',
    (select count(*) from mapeos_importacion_remuneraciones) = 0);
  perform pg_temp.chk('109.26', 'ni se puede crear uno',
    not pg_temp.entra(
      'insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
         values (''dddddddd-0000-0000-0000-00000000000a'', ''{"x":"sueldo"}''::jsonb)'));
end $$;

-- =====================================================================
-- Un mapeo activo por empresa
-- =====================================================================
select pg_temp.como('dddddddd-0000-0000-0000-000000000201');

do $$
begin
  perform pg_temp.chk('109.27', 'no se puede tener dos mapeos de la misma empresa',
    not pg_temp.entra(
      'insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
         values (''dddddddd-0000-0000-0000-00000000000a'', ''{"Otro":"sueldo"}''::jsonb)'));

  -- La segunda importación reemplaza el mapeo: el estudio cambió el
  -- formato y lo nuevo es lo que vale.
  insert into mapeos_importacion_remuneraciones (empresa_id, mapeo)
  values ('dddddddd-0000-0000-0000-00000000000a',
          '{"Legajo":"legajo","Haberes":"sueldo"}'::jsonb)
  on conflict (empresa_id) do update set mapeo = excluded.mapeo;

  perform pg_temp.chk('109.28', 'reimportar reemplaza el mapeo, no acumula',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000a') = 1);
  perform pg_temp.chk('109.29', 'con los encabezados nuevos',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Haberes') = 'sueldo');
  perform pg_temp.chk('109.30', 'y sin los viejos',
    pg_temp.mapeo_de('dddddddd-0000-0000-0000-00000000000a', 'Sueldo') is null);

  perform pg_temp.chk('109.31', 'un mapeo que no es un objeto se rechaza',
    not pg_temp.entra(
      'update mapeos_importacion_remuneraciones
          set mapeo = ''[1,2,3]''::jsonb
        where empresa_id = ''dddddddd-0000-0000-0000-00000000000a'''));
end $$;

-- Borrar la empresa se lleva su mapeo: no queda huérfano
select pg_temp.servicio();
do $$
begin
  -- Borrar una empresa está protegido (se lleva legajos y recibos
  -- firmados); el escape es el que documenta el propio guard.
  perform set_config('app.purgar_empresa',
    'dddddddd-0000-0000-0000-00000000000b', true);
  delete from empleados where empresa_id = 'dddddddd-0000-0000-0000-00000000000b';
  delete from usuarios where empresa_id = 'dddddddd-0000-0000-0000-00000000000b';
  delete from empresas where id = 'dddddddd-0000-0000-0000-00000000000b';
  perform pg_temp.chk('109.32', 'al borrar la empresa se va su mapeo',
    (select count(*) from mapeos_importacion_remuneraciones
      where empresa_id = 'dddddddd-0000-0000-0000-00000000000b') = 0);
end $$;

do $$
begin
  raise notice '';
  raise notice 'OK: mapeo de importación por empresa (109)';
end $$;

rollback;
