-- ============================================================
-- Migración 106 · Autoservicio del legajo.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/autoservicio_legajo.test.sql
--
-- Lo que se cuida acá es una sola idea: **el empleado propone, RRHH
-- decide**. Todo lo demás son las formas en que eso se podría romper —
-- escribir el legajo directo, proponer un campo que no le toca, tocar el
-- legajo de otro, o que un supervisor apruebe un CBU.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated, anon;
grant select on table public.solicitudes_datos_legajo to authenticated, anon;
grant select, update on table public.empleados to authenticated;
grant select on table public.usuarios, public.empresas to authenticated;
grant select on table public.auditoria_acciones to authenticated;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Legajo SA', '30-lg-1', 'C', 'c@c.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Otra SA', '30-lg-2', 'D', 'd@d.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector,
                       domicilio, telefono, cbu, estado_civil)
values
  ('aaaaaaaa-0000-0000-0000-000000000101',
   'aaaaaaaa-0000-0000-0000-00000000000a', 'Ana', 'Ruiz', '901', '2020-01-01', 'Op', 'Prod',
   'Calle Vieja 100', '11-1111', '0000000000000000000001', 'soltero'),
  ('aaaaaaaa-0000-0000-0000-000000000102',
   'aaaaaaaa-0000-0000-0000-00000000000a', 'Beto', 'Paz', '902', '2020-01-01', 'Op', 'Prod',
   'Otra 200', '11-2222', '0000000000000000000002', 'soltero'),
  ('aaaaaaaa-0000-0000-0000-000000000103',
   'aaaaaaaa-0000-0000-0000-00000000000b', 'Caro', 'Diaz', '903', '2020-01-01', 'Op', 'Prod',
   'Lejos 300', '11-3333', '0000000000000000000003', 'soltero');

insert into auth.users (id, instance_id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000000', 'lg-ana@t.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000000', 'lg-beto@t.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000000', 'lg-adm@t.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000000', 'lg-sup@t.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000000', 'lg-adm2@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
  ('aaaaaaaa-0000-0000-0000-000000000201', 'lg-ana@t.test', 'empleado', 'Ana Ruiz',
   'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000101'),
  ('aaaaaaaa-0000-0000-0000-000000000202', 'lg-beto@t.test', 'empleado', 'Beto Paz',
   'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000102'),
  ('aaaaaaaa-0000-0000-0000-000000000203', 'lg-adm@t.test', 'admin_rrhh', 'Admin Legajo',
   'aaaaaaaa-0000-0000-0000-00000000000a', null),
  ('aaaaaaaa-0000-0000-0000-000000000204', 'lg-sup@t.test', 'supervisor', 'Supervisor Legajo',
   'aaaaaaaa-0000-0000-0000-00000000000a', null),
  ('aaaaaaaa-0000-0000-0000-000000000205', 'lg-adm2@t.test', 'admin_rrhh', 'Admin Otra',
   'aaaaaaaa-0000-0000-0000-00000000000b', null);

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
 * Filas que una sentencia realmente tocó, o -1 si fue rechazada.
 *
 * Un UPDATE que RLS deja sin filas **no lanza error**: `entra()` diría
 * que sí pudo. Para los permisos de escritura lo que importa es el
 * efecto, no la ausencia de excepción.
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

/** Lee un campo del legajo sin RLS: el estado real, no el visible. */
create or replace function pg_temp.dato(p_emp uuid, p_campo text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('select e.%I::text from public.empleados e where e.id = $1', p_campo)
    into v using p_emp;
  return v;
end $$;

-- =====================================================================
-- El empleado no escribe su legajo, ni antes ni después
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');

do $$
begin
  -- RLS deja el UPDATE en cero filas en vez de lanzar, así que lo que
  -- se mira es cuántas filas tocó.
  perform pg_temp.chk('106.1', 'el empleado NO puede escribir su legajo directo',
    pg_temp.afecta(
      'update empleados set domicilio = ''Hackeada 1''
        where id = ''aaaaaaaa-0000-0000-0000-000000000101''') <= 0);
  perform pg_temp.chk('106.2', 'y el dato quedó como estaba',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'domicilio') = 'Calle Vieja 100');

  perform pg_temp.chk('106.3', 'tampoco puede escribir la tabla de solicitudes',
    not pg_temp.entra(
      'insert into solicitudes_datos_legajo (empresa_id, empleado_id, campo, valor_propuesto)
         values (''aaaaaaaa-0000-0000-0000-00000000000a'',
                 ''aaaaaaaa-0000-0000-0000-000000000101'', ''cbu'', ''"9"''::jsonb)'));
end $$;

-- =====================================================================
-- Proponer: qué sí y qué no
-- =====================================================================
do $$
declare v_filas int;
begin
  select count(*) into v_filas from solicitar_cambio_de_legajo(
    'domicilio', to_jsonb('Calle Nueva 500'::text), 'Me mudé en marzo');
  perform pg_temp.chk('106.4', 'puede proponer un cambio de domicilio', v_filas = 1);

  perform pg_temp.chk('106.5', 'queda pendiente, no aplicada',
    (select estado from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101' and campo = 'domicilio')
    = 'pendiente');
  perform pg_temp.chk('106.6', 'el legajo NO cambió todavía',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'domicilio') = 'Calle Vieja 100');
  perform pg_temp.chk('106.7', 'guarda cómo estaba el dato, para comparar',
    (select valor_actual #>> '{}' from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101' and campo = 'domicilio')
    = 'Calle Vieja 100');

  -- Lo que NO le corresponde proponer.
  perform pg_temp.chk('106.8', 'no puede proponerse un puesto',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''puesto'', ''"Gerente"''::jsonb)'));
  perform pg_temp.chk('106.9', 'no puede cambiarse el DNI',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''dni'', ''"999"''::jsonb)'));
  perform pg_temp.chk('106.10', 'no puede cambiar su modo de fichaje',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''modo_fichaje'', ''"libre"''::jsonb)'));
  perform pg_temp.chk('106.11', 'no puede darse de alta o baja',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''activo'', ''true''::jsonb)'));
  perform pg_temp.chk('106.12', 'un campo inventado tampoco entra',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''no_existe'', ''"x"''::jsonb)'));

  perform pg_temp.chk('106.13', 'no puede vaciar un dato',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''telefono'', ''"   "''::jsonb)'));
  perform pg_temp.chk('106.14', 'proponer lo mismo que ya figura se rechaza',
    not pg_temp.entra(
      'select solicitar_cambio_de_legajo(''telefono'', to_jsonb(''11-1111''::text))'));
end $$;

-- Volver a proponer el mismo campo reemplaza lo anterior, no acumula
do $$
begin
  perform solicitar_cambio_de_legajo('domicilio', to_jsonb('Calle Nueva 700'::text));

  perform pg_temp.chk('106.15', 'una sola pendiente por campo',
    (select count(*) from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101'
        and campo = 'domicilio' and estado = 'pendiente') = 1);
  perform pg_temp.chk('106.16', 'la pendiente es la última que se pidió',
    (select valor_propuesto #>> '{}' from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101'
        and campo = 'domicilio' and estado = 'pendiente') = 'Calle Nueva 700');
  perform pg_temp.chk('106.17', 'y la anterior queda anulada, no borrada',
    (select count(*) from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101'
        and campo = 'domicilio' and estado = 'anulada') = 1);
end $$;

-- =====================================================================
-- Nadie ve ni toca lo ajeno
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000202');

do $$
declare v_filas int;
begin
  perform pg_temp.chk('106.18', 'un compañero no ve las solicitudes de otro',
    (select count(*) from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101') = 0);

  select count(*) into v_filas from anular_solicitud_de_legajo(
    (select id from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101' and estado = 'pendiente'));
  perform pg_temp.chk('106.19', 'ni la puede anular', v_filas = 0);
end $$;

select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('106.20', 'la solicitud ajena sigue pendiente',
    (select estado from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101'
        and campo = 'domicilio' and estado <> 'anulada') = 'pendiente');
end $$;

-- =====================================================================
-- Resolver: quién puede
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');
do $$
begin
  perform pg_temp.chk('106.21', 'el empleado no se aprueba a sí mismo',
    not pg_temp.entra(format(
      'select resolver_solicitud_de_legajo(%L, true)',
      (select id from solicitudes_datos_legajo
        where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101' and estado = 'pendiente'))));
end $$;

-- El supervisor tampoco: aprobar un CBU no es supervisión.
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000204');
do $$
begin
  perform pg_temp.chk('106.22', 'un supervisor no resuelve solicitudes de legajo',
    not pg_temp.entra(format(
      'select resolver_solicitud_de_legajo(%L, true)',
      (select id from solicitudes_datos_legajo where estado = 'pendiente' limit 1))));
  perform pg_temp.chk('106.23', 'y ni siquiera las ve',
    (select count(*) from solicitudes_datos_legajo) = 0);
end $$;

-- Un admin de OTRA empresa tampoco
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000205');
do $$
declare v_filas int;
begin
  perform pg_temp.chk('106.24', 'un admin de otra empresa no las ve',
    (select count(*) from solicitudes_datos_legajo) = 0);

  select count(*) into v_filas from resolver_solicitud_de_legajo(
    (select id from solicitudes_datos_legajo
      where empleado_id = 'aaaaaaaa-0000-0000-0000-000000000101' and estado = 'pendiente'),
    true);
  perform pg_temp.chk('106.25', 'ni las resuelve', v_filas = 0);
end $$;

select pg_temp.servicio();
do $$
begin
  perform pg_temp.chk('106.26', 'el legajo sigue intacto tras los intentos',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'domicilio') = 'Calle Vieja 100');
end $$;

-- =====================================================================
-- El admin de la empresa sí, y ahí recién cambia el legajo
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000203');

do $$
declare
  v_id uuid;
  v_filas int;
begin
  perform pg_temp.chk('106.27', 'el admin ve las solicitudes de su empresa',
    (select count(*) from solicitudes_datos_legajo where estado = 'pendiente') = 1);

  select id into v_id from solicitudes_datos_legajo where estado = 'pendiente';

  select count(*) into v_filas from resolver_solicitud_de_legajo(v_id, true);
  perform pg_temp.chk('106.28', 'el admin aprueba', v_filas = 1);
  perform pg_temp.chk('106.29', 'y AHÍ el legajo cambia',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'domicilio') = 'Calle Nueva 700');
  perform pg_temp.chk('106.30', 'la solicitud queda aprobada y firmada',
    exists (select 1 from solicitudes_datos_legajo
             where id = v_id and estado = 'aprobada'
               and resuelta_en is not null
               and resuelta_por = 'aaaaaaaa-0000-0000-0000-000000000203'));

  -- Aprobar dos veces no vuelve a aplicar nada.
  select count(*) into v_filas from resolver_solicitud_de_legajo(v_id, true);
  perform pg_temp.chk('106.31', 'resolver una ya resuelta no hace nada', v_filas = 0);
end $$;

-- La auditoría deja el antes y el después
do $$
begin
  perform pg_temp.chk('106.32', 'la aprobación queda auditada con antes y después',
    exists (
      select 1 from auditoria_acciones a
      where a.accion = 'aprobar_cambio_legajo'
        and a.entidad_id = 'aaaaaaaa-0000-0000-0000-000000000101'
        and a.detalle ->> 'campo' = 'domicilio'
        and a.detalle #>> '{antes}' = 'Calle Vieja 100'
        and a.detalle #>> '{despues}' = 'Calle Nueva 700'
        and a.actor_id = 'aaaaaaaa-0000-0000-0000-000000000203'
    ));
end $$;

-- =====================================================================
-- Rechazar: no toca el legajo, pero queda el motivo
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');
do $$
begin
  perform solicitar_cambio_de_legajo('cbu', to_jsonb('0000000000000000000099'::text));
end $$;

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000203');
do $$
declare v_id uuid;
begin
  select id into v_id from solicitudes_datos_legajo
   where campo = 'cbu' and estado = 'pendiente';

  perform resolver_solicitud_de_legajo(v_id, false, 'Falta la constancia del banco');

  perform pg_temp.chk('106.33', 'rechazada, con motivo',
    exists (select 1 from solicitudes_datos_legajo
             where id = v_id and estado = 'rechazada'
               and motivo_resolucion = 'Falta la constancia del banco'));
  perform pg_temp.chk('106.34', 'el CBU no se tocó',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'cbu')
    = '0000000000000000000001');
  perform pg_temp.chk('106.35', 'el rechazo también queda auditado',
    exists (select 1 from auditoria_acciones
             where accion = 'rechazar_cambio_legajo'
               and detalle ->> 'campo' = 'cbu'
               and detalle #>> '{despues}' is null));
end $$;

-- =====================================================================
-- Los campos que no son texto plano
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');
do $$
begin
  -- Un enum.
  perform solicitar_cambio_de_legajo('estado_civil', to_jsonb('casado'::text));
  -- Un jsonb.
  perform solicitar_cambio_de_legajo('contacto_emergencia',
    '{"nombreCompleto":"Luis Ruiz","vinculo":"hermano","telefono":"11-9999"}'::jsonb);
end $$;

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000203');
do $$
begin
  perform resolver_solicitud_de_legajo(
    (select id from solicitudes_datos_legajo
      where campo = 'estado_civil' and estado = 'pendiente'), true);
  perform resolver_solicitud_de_legajo(
    (select id from solicitudes_datos_legajo
      where campo = 'contacto_emergencia' and estado = 'pendiente'), true);

  perform pg_temp.chk('106.36', 'un enum se aplica bien',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'estado_civil') = 'casado');
  perform pg_temp.chk('106.37', 'un objeto jsonb se aplica bien',
    (select contacto_emergencia ->> 'telefono' from empleados
      where id = 'aaaaaaaa-0000-0000-0000-000000000101') = '11-9999');
end $$;

-- Un enum con un valor que no existe falla y no deja el legajo a medias
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');
do $$
begin
  perform solicitar_cambio_de_legajo('estado_civil', to_jsonb('marciano'::text));
end $$;

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000203');
do $$
declare v_id uuid;
begin
  select id into v_id from solicitudes_datos_legajo
   where campo = 'estado_civil' and estado = 'pendiente';

  perform pg_temp.chk('106.38', 'un valor de enum inválido no se aplica',
    not pg_temp.entra(format('select resolver_solicitud_de_legajo(%L, true)', v_id)));
  perform pg_temp.chk('106.39', 'y el legajo queda como estaba',
    pg_temp.dato('aaaaaaaa-0000-0000-0000-000000000101', 'estado_civil') = 'casado');
  perform pg_temp.chk('106.40', 'la solicitud sigue pendiente, no "aprobada"',
    (select estado from solicitudes_datos_legajo where id = v_id) = 'pendiente');
end $$;

-- =====================================================================
-- Anular la propia
-- =====================================================================
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000201');
do $$
declare v_id uuid; v_filas int;
begin
  select id into v_id from solicitudes_datos_legajo
   where campo = 'estado_civil' and estado = 'pendiente';

  select count(*) into v_filas from anular_solicitud_de_legajo(v_id);
  perform pg_temp.chk('106.41', 'el empleado anula la suya', v_filas = 1);
  perform pg_temp.chk('106.42', 'y queda anulada',
    (select estado from solicitudes_datos_legajo where id = v_id) = 'anulada');

  perform pg_temp.chk('106.43', 'anulada, ya no se puede resolver',
    (select count(*) from solicitudes_datos_legajo where id = v_id and estado = 'pendiente') = 0);
end $$;

-- =====================================================================
-- Sin sesión, nada
-- =====================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform pg_temp.chk('106.44', 'anon no ve solicitudes',
    (select count(*) from solicitudes_datos_legajo) = 0);
  perform pg_temp.chk('106.45', 'anon no puede proponer',
    not pg_temp.entra('select solicitar_cambio_de_legajo(''cbu'', ''"1"''::jsonb)'));
  perform pg_temp.chk('106.46', 'anon no puede resolver',
    not pg_temp.entra(
      'select resolver_solicitud_de_legajo(''aaaaaaaa-0000-0000-0000-000000000101'', true)'));
end $$;

do $$
begin
  raise notice '';
  raise notice 'OK: autoservicio de legajo (106)';
end $$;

rollback;
