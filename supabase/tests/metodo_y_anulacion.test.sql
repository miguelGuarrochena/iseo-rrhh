-- ============================================================
-- F-07: el método lo decide la base, no el cliente.
-- F-12: anulación auditable de fichajes.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/metodo_y_anulacion.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','Met-A','30-ma-1','A','ma@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7b1','Met-B','30-mb-1','B','mb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

-- Tres empleados de A con modos distintos, para probar la derivación.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version, consentimiento_biometrico) values
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
  'Cel','A','ma-e1','2020-01-01','Op','Prod','celular','[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e2','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
  'Rem','A','ma-e2','2020-01-01','Op','Prod','remoto','[5,5,5]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e3','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
  'Pla','A','ma-e3','2020-01-01','Op','Prod','planta','[9,9,9]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1','00000000-0000-0000-0000-000000000000','ma-adm@t.test','authenticated','authenticated'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c2','00000000-0000-0000-0000-000000000000','ma-sup@t.test','authenticated','authenticated'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3','00000000-0000-0000-0000-000000000000','ma-cel@t.test','authenticated','authenticated'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c4','00000000-0000-0000-0000-000000000000','ma-rem@t.test','authenticated','authenticated'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7d1','00000000-0000-0000-0000-000000000000','mb-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1','ma-adm@t.test','admin_rrhh','Adm A','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', null),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c2','ma-sup@t.test','supervisor','Sup A','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', null),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3','ma-cel@t.test','empleado','Cel A','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c4','ma-rem@t.test','empleado','Rem A','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e2'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7d1','mb-adm@t.test','admin_rrhh','Adm B','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7b1', null);

create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1');
create temp table term as select * from autorizar_terminal('Tablet Met-A');

-- ============================================================
-- F-07 — el método sale del camino, no del request
-- ============================================================

-- CASO 1: 1:1 de un empleado con modo celular → siempre `celular`.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3');
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1');
  assert v_f.metodo = 'celular',
    '1:1 con modo celular tiene que quedar como celular, quedó ' || v_f.metodo;
end $$;

-- El modo remoto es un camino legítimo distinto y se conserva: esa
-- persona ficha desde donde sea y no se le controla zona.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c4');
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[5.01,5,5]'::jsonb, 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e2');
  assert v_f.metodo = 'remoto',
    '1:1 con modo remoto tiene que quedar como remoto, quedó ' || v_f.metodo;
end $$;

-- CASO 2: kiosco autorizado → siempre `facial_tablet`.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1');
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[9.01,9,9]'::jsonb, null, null, null, null,
    (select id from term), (select secreto from term));
  assert v_f.empleado_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e3';
  assert v_f.metodo = 'facial_tablet',
    'el kiosco tiene que quedar como facial_tablet, quedó ' || v_f.metodo;
end $$;

-- CASO 3: no hay `p_metodo` que manipular. La firma vieja que lo
-- aceptaba tiene que estar dropeada: si quedara como sobrecarga,
-- PostgREST la resolvería mandando esa clave en el JSON y F-07 seguiría
-- abierto por otra puerta.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fichar_con_rostro';
  assert v_n = 1, 'tiene que haber UNA sola fichar_con_rostro; hay ' || v_n;

  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fichar_con_rostro'
       and pg_get_function_identity_arguments(p.oid) like '%p_metodo%'
  ), 'ninguna firma de fichar_con_rostro puede aceptar p_metodo';
end $$;

-- CASO 4 y el agujero del INSERT directo: un empleado no puede
-- fabricarse una marca con cara de fichaje en la terminal. Antes el
-- trigger salía temprano en el camino self-service y conservaba lo que
-- mandara el cliente.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3');
do $$
declare v_m metodo_fichaje;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, metodo)
  values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
          'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1', 'egreso', 'facial_tablet')
  returning metodo into v_m;
  assert v_m = 'manual',
    'un INSERT directo no puede declararse facial_tablet, quedó ' || v_m;
end $$;

-- Carga manual legítima de un gestor para un tercero → `manual`, con
-- actor. Este camino no cambia.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c2');
do $$
declare v_f fichajes;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
          'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e3', 'ingreso',
          '2026-08-03T11:00:00Z'::timestamptz, 'celular')
  returning * into v_f;
  assert v_f.metodo = 'manual', 'la carga de terceros es manual';
  assert v_f.registrado_por_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c2',
    'y queda con el actor real';
  assert v_f.ts = '2026-08-03T11:00:00Z'::timestamptz,
    'un gestor sí puede cargar un horario histórico';
end $$;

-- El permiso `app.fichaje_validado` se apaga después de usarse.
--
-- Lo encontró este test: `set_config(..., true)` dura toda la
-- transacción, así que al no apagarse, cualquier INSERT directo
-- posterior en la misma transacción se hacía pasar por "validado por el
-- servidor" — se salteaban el trigger del método Y el guard que impide
-- afirmar confianza y geocerca a mano. Por PostgREST cada request es su
-- propia transacción, así que no era explotable desde la API, pero era
-- un permiso encendido esperando que alguien agrupara dos operaciones.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3');
do $$
declare v_m metodo_fichaje; ok boolean := false;
begin
  -- Primero una fichada real, que enciende el permiso.
  perform fichar_con_rostro(
    '[0.011,0.01,0.01]'::jsonb, 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1');

  -- Y ahora, en la MISMA transacción, un INSERT directo.
  insert into fichajes (empresa_id, empleado_id, tipo, metodo)
  values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
          'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1', 'egreso', 'facial_tablet')
  returning metodo into v_m;
  assert v_m = 'manual',
    'tras una fichada, el INSERT directo sigue siendo manual; quedó ' || v_m;

  -- Y el guard de confianza también volvió a estar armado.
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, metodo, confianza)
    values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
            'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1', 'ingreso', 'celular', 1);
  exception when others then ok := true;
  end;
  assert ok, 'tras una fichada, nadie puede afirmar confianza a mano';
end $$;

-- CASO 5: los flujos legítimos siguen andando — ya se ejercitaron los
-- tres caminos (celular, remoto, facial_tablet) y la carga manual, cada
-- uno con su método correcto.
do $$
declare v_n int;
begin
  select count(distinct metodo) into v_n from fichajes
   where empresa_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1';
  assert v_n = 4,
    'tienen que convivir los cuatro métodos legítimos; hay ' || v_n;
end $$;

-- ============================================================
-- F-12 — anulación auditable
-- ============================================================

-- Una marca de referencia, del kiosco, para anular.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1');
update fichajes
   set ts = ts - interval '3 minutes'
 where empleado_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e3';
create temp table victima as
select * from fichar_con_rostro(
  '[9,9.01,9]'::jsonb, null, null, null, null,
  (select id from term), (select secreto from term));

-- CASO 2: un supervisor NO puede anular. Puede cargar marcas (aditivo)
-- pero no restar horas del registro de su propio equipo.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c2');
do $$
declare ok boolean := false;
begin
  begin
    perform anular_fichaje((select id from victima), 'me parece que no vino');
  exception when others then ok := true;
  end;
  assert ok, 'un supervisor no puede anular fichajes';
end $$;

-- Un empleado, tampoco. Ni el suyo propio.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3');
do $$
declare ok boolean := false;
begin
  begin
    perform anular_fichaje((select id from victima), 'no quiero que figure');
  exception when others then ok := true;
  end;
  assert ok, 'un empleado no puede anular fichajes';
end $$;

-- Un admin de OTRA empresa, tampoco.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7d1');
do $$
declare ok boolean := false;
begin
  begin
    perform anular_fichaje((select id from victima), 'cross tenant');
  exception when others then ok := true;
  end;
  assert ok, 'un admin de otra empresa no puede anular acá';
end $$;

-- CASO 3: motivo vacío o en blanco → rechazo.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1');
do $$
declare ok boolean := false;
begin
  begin perform anular_fichaje((select id from victima), '');
  exception when others then ok := true; end;
  assert ok, 'motivo vacío tiene que rechazarse';

  ok := false;
  begin perform anular_fichaje((select id from victima), '   ');
  exception when others then ok := true; end;
  assert ok, 'motivo en blanco tiene que rechazarse';

  ok := false;
  begin perform anular_fichaje((select id from victima), null);
  exception when others then ok := true; end;
  assert ok, 'motivo nulo tiene que rechazarse';
end $$;

-- CASO 9: hasta acá nadie pudo anular nada en silencio.
do $$
begin
  assert (select anulado_en from fichajes where id = (select id from victima)) is null,
    'ninguno de los intentos rechazados puede haber anulado la marca';
end $$;

-- CASO 1: el admin de la empresa sí puede.
do $$
declare v_f fichajes;
begin
  select * into v_f from anular_fichaje(
    (select id from victima), 'Duplicado: la persona tocó dos veces la tablet');
  assert v_f.anulado_en is not null, 'la anulación tiene que quedar fechada';
  assert v_f.anulado_por = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1',
    'y con el actor real, impuesto por la base';
  assert v_f.anulado_motivo like 'Duplicado%', 'y con el motivo';
end $$;

-- CASO 4: la fila sigue existiendo, con todos sus datos originales.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichajes where id = (select id from victima);
  assert found, 'el fichaje anulado NO se borra';
  assert v_f.metodo = 'facial_tablet', 'conserva su método original';
  assert v_f.confianza is not null, 'conserva la confianza calculada';
  assert v_f.ts = (select ts from victima), 'conserva su horario original';
end $$;

-- CASO 8: quedó auditado, con el contenido de lo que se sacó del registro.
do $$
declare v_a auditoria_acciones;
begin
  select * into v_a from auditoria_acciones
   where entidad = 'fichaje' and accion = 'anular'
     and entidad_id = (select id::text from victima);
  assert found, 'la anulación tiene que generar auditoría';
  assert v_a.actor_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1';
  assert v_a.detalle->>'motivo' like 'Duplicado%';
  assert v_a.detalle->>'tipo' is not null,
    'la auditoría guarda qué marca se anuló, no sólo que se anuló';
end $$;

-- No se puede anular dos veces (ni "des-anular" cambiando el motivo).
do $$
declare ok boolean := false;
begin
  begin perform anular_fichaje((select id from victima), 'otra vez');
  exception when others then ok := true; end;
  assert ok, 'no se puede anular dos veces';
end $$;

-- CASO 7: ningún UPDATE arbitrario, ni siquiera como superusuario.
do $$
declare ok boolean := false;
begin
  begin
    update fichajes set tipo = 'egreso' where id = (select id from victima);
  exception when others then ok := true; end;
  assert ok, 'no se puede cambiar el tipo de un fichaje';

  ok := false;
  begin
    update fichajes set ts = now() where id = (select id from victima);
  exception when others then ok := true; end;
  assert ok, 'no se puede correr el horario de un fichaje';

  ok := false;
  begin
    update fichajes set metodo = 'facial_tablet'
     where id = (select id from victima);
  exception when others then ok := true; end;
  assert ok, 'no se puede reescribir el método';

  -- Ni siquiera escribir las columnas de anulación a mano: sin pasar
  -- por el RPC no hay actor ni auditoría.
  ok := false;
  begin
    update fichajes set anulado_en = now(), anulado_por = null,
                        anulado_motivo = 'a mano'
     where id = (select id from victima);
  exception when others then ok := true; end;
  assert ok, 'la anulación sólo se escribe desde anular_fichaje()';
end $$;

-- Y por PostgREST no hay policy de UPDATE ni de DELETE: ninguna de las
-- dos operaciones existe para un usuario de la API.
do $$
begin
  assert not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='fichajes' and cmd='UPDATE'
  ), 'fichajes no puede tener policy de UPDATE';
  assert not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='fichajes' and cmd='DELETE'
  ), 'fichajes no puede tener policy de DELETE';
end $$;

-- ---------------------------------------------------------------------
-- CASOS 5 y 6: la marca anulada sale de todos los cálculos.
--
-- Se arma una jornada completa y se anula el egreso: la jornada tiene
-- que pasar de cerrada a abierta y las horas tienen que desaparecer.
-- ---------------------------------------------------------------------
delete from fichajes where empresa_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1';

insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo) values
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1',
  'ingreso', ('2026-08-05 08:00'::timestamp at time zone zona_empresa()), 'manual'),
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1',
  'egreso', ('2026-08-05 17:00'::timestamp at time zone zona_empresa()), 'manual'),
 -- Duplicado accidental: dos egresos seguidos.
 ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1','a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1',
  'egreso', ('2026-08-05 17:01'::timestamp at time zone zona_empresa()), 'manual');

do $$
declare v_j record; v_n int;
begin
  select * into v_j from jornadas_de_empresa(
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', '2026-08-05'::date, '2026-08-05'::date,
    array['a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1']::uuid[]);
  assert v_j.cerrada, 'sanity: con las tres marcas la jornada cierra';
  assert v_j.marcas = 3, 'sanity: son tres marcas';

  select count(*) into v_n from fichajes_del_periodo(
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', '2026-08-05'::date, '2026-08-05'::date);
  assert v_n = 3, 'sanity: los movimientos muestran tres';
end $$;

-- Se anula el duplicado.
do $$
declare v_id uuid;
begin
  select id into v_id from fichajes
   where empleado_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1'
   order by ts desc limit 1;
  perform anular_fichaje(v_id, 'Duplicado del egreso de las 17:00');
end $$;

do $$
declare v_j record; v_n int;
begin
  -- CASO 5: no participa en jornadas.
  select * into v_j from jornadas_de_empresa(
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', '2026-08-05'::date, '2026-08-05'::date,
    array['a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1']::uuid[]);
  assert v_j.marcas = 2, 'la jornada tiene que contar dos marcas, no tres';
  assert v_j.cerrada, 'y seguir cerrada por el egreso legítimo';

  -- CASO 6: tampoco aparece en la vista de movimientos, que es la que
  -- alimenta el historial y el Excel.
  select count(*) into v_n from fichajes_del_periodo(
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', '2026-08-05'::date, '2026-08-05'::date);
  assert v_n = 2, 'los movimientos no pueden mostrar la marca anulada';

  -- Pero sigue en la tabla, para la auditoría.
  select count(*) into v_n from fichajes
   where empleado_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1';
  assert v_n = 3, 'físicamente siguen estando las tres filas';
end $$;

-- Anular el ingreso deja la jornada sin entrada: el cálculo reacciona,
-- no queda un dato viejo cacheado.
do $$
declare v_id uuid; v_j record;
begin
  select id into v_id from fichajes
   where empleado_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1'
     and tipo = 'ingreso' and anulado_en is null;
  perform anular_fichaje(v_id, 'Cargado por error en el empleado equivocado');

  select * into v_j from jornadas_de_empresa(
    'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1', '2026-08-05'::date, '2026-08-05'::date,
    array['a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1']::uuid[]);
  assert v_j.entrada is null, 'sin el ingreso, la jornada no tiene entrada';
  assert not v_j.cerrada, 'y deja de estar cerrada';
end $$;

-- ---------------------------------------------------------------------
-- La anulación y el fichaje siguiente: la alternancia tiene que mirar
-- sólo las marcas vigentes.
--
-- Si se anula el último ingreso, la próxima marca vuelve a ser un
-- ingreso. Sin esto se registraría un egreso que cerraría una jornada
-- que ya no existe.
-- ---------------------------------------------------------------------
delete from fichajes where empresa_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1';

do $$
declare v_id uuid;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1',
          'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1',
          'ingreso', clock_timestamp() - interval '1 hour', 'manual')
  returning id into v_id;

  assert tipo_de_marca_siguiente('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1')
         = 'egreso',
    'sanity: con un ingreso vigente, lo próximo es el egreso';

  perform anular_fichaje(v_id, 'Ingreso cargado por error');

  assert tipo_de_marca_siguiente('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1')
         = 'ingreso',
    'anulado el ingreso, lo próximo vuelve a ser un ingreso';
end $$;

-- CASO 10: los fichajes normales no se rompen. Se ficha de nuevo por el
-- camino real y la marca sale vigente y con su método derivado.
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c3');
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.02,0.01,0.01]'::jsonb, 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7e1');
  assert v_f.anulado_en is null, 'una marca nueva nace vigente';
  assert v_f.metodo = 'celular', 'y con su método derivado';
  assert v_f.tipo = 'ingreso',
    'la alternancia ignoró la marca anulada, como corresponde';
end $$;

-- ---------------------------------------------------------------------
-- Y desde el rol real `authenticated`: ni UPDATE ni DELETE existen.
-- El resto del archivo corre como postgres, que saltea los GRANT.
-- ---------------------------------------------------------------------
select pg_temp.como('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7c1');
do $$
declare v_bloqueado boolean;
begin
  execute 'set local role authenticated';

  v_bloqueado := false;
  begin
    update fichajes set anulado_en = now()
     where empresa_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1';
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'authenticated no puede hacer UPDATE sobre fichajes';

  v_bloqueado := false;
  begin
    delete from fichajes
     where empresa_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a1';
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'authenticated no puede borrar fichajes';

  execute 'reset role';
end $$;

rollback;

\echo ''
\echo '  ✓ F-07 (método derivado) y F-12 (anulación auditable) — todo pasó'
\echo ''
