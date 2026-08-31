-- ============================================================
-- Migraciones 104 y 105.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/parametros_y_constancia.test.sql
--
-- 104 · parámetros legales: sólo ISEO los escribe, todos los leen, y el
--       valor que se devuelve es el del período que se pide.
-- 105 · constancia de firma: el hash queda atado al recibo y no se puede
--       reescribir, ni siquiera desde ISEO.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on table public.parametros_legales to authenticated, anon;
grant select, insert, update on table public.recibos to authenticated;
grant select on table public.usuarios, public.empresas, public.empleados to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  'eeeeeeee-0000-0000-0000-00000000000a',
  'Parametros SA', '30-pl-1', 'P', 'p@p.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('eeeeeeee-0000-0000-0000-00000000000b',
   'eeeeeeee-0000-0000-0000-00000000000a', 'Ana', 'P', '801', '2020-01-01', 'Op', 'Prod'),
  -- Existe sólo para intentar mover un recibo firmado a otra persona.
  ('eeeeeeee-0000-0000-0000-00000000000f',
   'eeeeeeee-0000-0000-0000-00000000000a', 'Beto', 'Q', '802', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role) values
  ('eeeeeeee-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'pl-adm@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'pl-super@t.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'pl-emp@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('eeeeeeee-0000-0000-0000-00000000000c', 'pl-adm@t.test', 'admin_rrhh', 'Admin',
   'eeeeeeee-0000-0000-0000-00000000000a', null),
  ('eeeeeeee-0000-0000-0000-00000000000d', 'pl-super@t.test', 'superadmin', 'ISEO', null, null),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'pl-emp@t.test', 'empleado', 'Ana',
   'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000b');

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

/** Corre algo y dice si entró, sin tragarse errores inesperados. */
create or replace function pg_temp.entra(sql text) returns boolean
language plpgsql as $$
begin execute sql; return true;
exception
  when insufficient_privilege then return false;
  when raise_exception then return false;
  when others then return false;
end $$;

-- =====================================================================
-- 104 · Sólo ISEO escribe los parámetros
-- =====================================================================
select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000c');

do $$
declare n int;
begin
  perform pg_temp.chk('104.1', 'el admin de una empresa NO carga parámetros legales',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde)
         values (''tope_imponible_aportes'', 999, ''2026-06'')'));

  select count(*) into n from parametros_legales;
  perform pg_temp.chk('104.2', 'y no quedó nada cargado', n = 0);
end $$;

-- El superadmin sí
select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000d');

do $$
begin
  insert into parametros_legales (clave, valor, vigencia_desde, vigencia_hasta, fuente)
  values ('tope_imponible_aportes', 1000000, '2026-03', '2026-05', 'Res. ANSES 1/2026');
  insert into parametros_legales (clave, valor, vigencia_desde, vigencia_hasta)
  values ('tope_imponible_aportes', 1200000, '2026-06', '2026-08');
  insert into parametros_legales (clave, valor, vigencia_desde)
  values ('tope_imponible_aportes', 1500000, '2026-09');

  perform pg_temp.chk('104.3', 'el superadmin sí los carga',
    (select count(*) from parametros_legales) = 3);

  perform pg_temp.chk('104.4', 'queda el sello de quién lo cargó',
    (select count(*) from parametros_legales
      where actualizado_por = 'eeeeeeee-0000-0000-0000-00000000000d'
        and actualizado_en is not null) = 3);
end $$;

-- =====================================================================
-- 104 · El valor es el del período que se pide, no el último cargado
-- =====================================================================
do $$
begin
  perform pg_temp.chk('104.5', 'abril devuelve el tope de abril',
    parametro_legal_vigente('tope_imponible_aportes', '2026-04') = 1000000);
  perform pg_temp.chk('104.6', 'julio devuelve el de julio',
    parametro_legal_vigente('tope_imponible_aportes', '2026-07') = 1200000);
  perform pg_temp.chk('104.7', 'noviembre cae en el rango abierto',
    parametro_legal_vigente('tope_imponible_aportes', '2026-11') = 1500000);
  perform pg_temp.chk('104.8', 'un período anterior a todo no tiene valor',
    parametro_legal_vigente('tope_imponible_aportes', '2025-12') is null);
  perform pg_temp.chk('104.9', 'una clave que no existe tampoco',
    parametro_legal_vigente('otra_cosa', '2026-07') is null);

  -- Correción: se carga un rango que pisa julio. Gana el más reciente,
  -- y los meses anteriores no se tocan.
  insert into parametros_legales (clave, valor, vigencia_desde, vigencia_hasta)
  values ('tope_imponible_aportes', 1300000, '2026-07', '2026-08');

  perform pg_temp.chk('104.10', 'al pisarse un rango, gana el de vigencia más reciente',
    parametro_legal_vigente('tope_imponible_aportes', '2026-07') = 1300000);
  perform pg_temp.chk('104.11', 'y el mes anterior NO cambia',
    parametro_legal_vigente('tope_imponible_aportes', '2026-06') = 1200000);
end $$;

-- Los rangos incoherentes y los duplicados no entran
do $$
begin
  perform pg_temp.chk('104.12', 'vigencia hasta anterior a desde: rechazada',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde, vigencia_hasta)
         values (''tope_imponible_aportes'', 1, ''2026-08'', ''2026-06'')'));
  perform pg_temp.chk('104.13', 'período mal formado: rechazado',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde)
         values (''tope_imponible_aportes'', 1, ''2026-13'')'));
  perform pg_temp.chk('104.14', 'el mismo trimestre dos veces: rechazado',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde)
         values (''tope_imponible_aportes'', 1, ''2026-09'')'));
  perform pg_temp.chk('104.15', 'valor negativo: rechazado',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde)
         values (''tope_imponible_aportes'', -1, ''2027-01'')'));
end $$;

-- Todos los leen (no es dato sensible), anon no
select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000e');
do $$
begin
  perform pg_temp.chk('104.16', 'un empleado los puede leer',
    (select count(*) from parametros_legales) > 0);
  perform pg_temp.chk('104.17', 'pero no los puede escribir',
    not pg_temp.entra(
      'insert into parametros_legales (clave, valor, vigencia_desde)
         values (''tope_imponible_aportes'', 1, ''2028-01'')'));
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform pg_temp.chk('104.18', 'sin sesión no se ven',
    (select count(*) from parametros_legales) = 0);
end $$;

-- =====================================================================
-- 105 · Constancia de firma
-- =====================================================================
select pg_temp.servicio();

insert into recibos (id, empresa_id, empleado_id, periodo, archivo_url, firmado_empleador_en)
values
  ('eeeeeeee-0000-0000-0000-0000000000c1',
   'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000b',
   '2026-07', 'recibos/julio.pdf', now());

select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000e');

do $$
declare
  v_hash constant text := repeat('a', 64);
  v_filas int;
  v_firmado timestamptz;
begin
  select count(*) into v_filas
  from firmar_recibo_con_constancia('eeeeeeee-0000-0000-0000-0000000000c1', v_hash);
  perform pg_temp.chk('105.1', 'el empleado firma su recibo con constancia', v_filas = 1);

  select firmado_en into v_firmado from recibos
   where id = 'eeeeeeee-0000-0000-0000-0000000000c1';

  perform pg_temp.chk('105.2', 'queda el hash del documento',
    (select hash_firmado from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c1') = v_hash);
  perform pg_temp.chk('105.3', 'y con qué algoritmo se calculó',
    (select hash_algoritmo from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c1') = 'SHA-256');
  perform pg_temp.chk('105.4', 'con sello de tiempo', v_firmado is not null);

  -- Firmar de nuevo no vuelve a sellar ni pisa el hash.
  select count(*) into v_filas
  from firmar_recibo_con_constancia(
    'eeeeeeee-0000-0000-0000-0000000000c1', repeat('b', 64));
  perform pg_temp.chk('105.5', 'firmar dos veces no devuelve nada', v_filas = 0);
  perform pg_temp.chk('105.6', 'y el hash original queda intacto',
    (select hash_firmado from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c1') = v_hash);
end $$;

-- Un hash con formato inválido no entra
select pg_temp.servicio();
insert into recibos (id, empresa_id, empleado_id, periodo, archivo_url, firmado_empleador_en)
values
  ('eeeeeeee-0000-0000-0000-0000000000c2',
   'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000b',
   '2026-08', 'recibos/agosto.pdf', now());
select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000e');

do $$
begin
  perform pg_temp.chk('105.7', 'un hash con formato inválido se rechaza',
    not pg_temp.entra(
      'select firmar_recibo_con_constancia(
         ''eeeeeeee-0000-0000-0000-0000000000c2'', ''no-es-un-hash'')'));
  perform pg_temp.chk('105.8', 'y el recibo sigue pendiente',
    (select estado_firma from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c2') = 'pendiente');
end $$;

-- =====================================================================
-- 105 · La constancia es inmutable, incluso para ISEO
-- =====================================================================
--
-- Una evidencia que el dueño de la plataforma puede reescribir no es
-- evidencia. Por eso el trigger no exceptúa al superadmin.
select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000d');

do $$
declare v_id constant text := 'eeeeeeee-0000-0000-0000-0000000000c1';
begin
  perform pg_temp.chk('105.9', 'ni ISEO cambia el hash de un recibo firmado',
    not pg_temp.entra(format(
      'update recibos set hash_firmado = %L where id = %L', repeat('c', 64), v_id)));
  perform pg_temp.chk('105.10', 'ni la fecha de firma',
    not pg_temp.entra(format(
      'update recibos set firmado_en = now() - interval ''1 year'' where id = %L', v_id)));
  perform pg_temp.chk('105.11', 'ni de quién es el recibo',
    not pg_temp.entra(format(
      'update recibos set empleado_id = %L where id = %L',
      'eeeeeeee-0000-0000-0000-00000000000f', v_id) ));
  perform pg_temp.chk('105.12', 'ni el archivo asociado',
    not pg_temp.entra(format(
      'update recibos set archivo_url = ''recibos/otro.pdf'' where id = %L', v_id)));

  perform pg_temp.chk('105.13', 'todo quedó como estaba',
    exists (
      select 1 from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c1'
        and hash_firmado = repeat('a', 64)
        and archivo_url = 'recibos/julio.pdf'
        and empleado_id = 'eeeeeeee-0000-0000-0000-00000000000b'
    ));
end $$;

-- =====================================================================
-- 105 · Nadie firma el recibo de otro
-- =====================================================================
--
-- La función filtra por `empleado_id = auth_empleado()`, así que un
-- recibo ajeno simplemente no entra en el update. Como devuelve un
-- `setof`, no lanza error: hay que mirar el efecto, no la ausencia de
-- excepción.
select pg_temp.servicio();
insert into recibos (id, empresa_id, empleado_id, periodo, archivo_url, firmado_empleador_en)
values
  ('eeeeeeee-0000-0000-0000-0000000000c3',
   'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000f',
   '2026-08', 'recibos/agosto-beto.pdf', now());

select pg_temp.como('eeeeeeee-0000-0000-0000-00000000000e');

do $$
declare v_filas int;
begin
  select count(*) into v_filas
  from firmar_recibo_con_constancia(
    'eeeeeeee-0000-0000-0000-0000000000c3', repeat('d', 64));
  perform pg_temp.chk('105.15', 'firmar el recibo de otro no devuelve nada', v_filas = 0);

end $$;

-- El estado del recibo ajeno hay que mirarlo sin RLS: como Ana no lo ve,
-- un `exists` vacío no distinguiría "no se firmó" de "no lo veo".
select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('105.16', 'y el recibo ajeno sigue sin firmar',
    exists (
      select 1 from recibos r
      where r.id = 'eeeeeeee-0000-0000-0000-0000000000c3'
        and r.estado_firma = 'pendiente'
        and r.hash_firmado is null
        and r.firmado_en is null
    ));
end $$;

-- Un recibo NO firmado sí se puede corregir: la inmutabilidad es de la
-- constancia, no de la tabla.
select pg_temp.servicio();
do $$
begin
  update recibos set archivo_url = 'recibos/agosto-v2.pdf'
   where id = 'eeeeeeee-0000-0000-0000-0000000000c2';
  perform pg_temp.chk('105.14', 'un recibo sin firmar sí se puede corregir',
    (select archivo_url from recibos
      where id = 'eeeeeeee-0000-0000-0000-0000000000c2') = 'recibos/agosto-v2.pdf');
end $$;

do $$
begin
  raise notice '';
  raise notice 'OK: parametros_legales (104) y constancia de firma (105)';
end $$;

rollback;
