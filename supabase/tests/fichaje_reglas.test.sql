-- ============================================================
-- Fichaje — reglas de tiempo, zona y tipo (migración 89)
--
-- A04  Ninguna marca nace en el futuro, venga por donde venga.
-- A06  Con geocerca configurada, fichar exige coordenadas y estar dentro.
-- A07  `p_tipo` sólo sirve en el kiosco, y queda auditado.
--
-- Más los controles que sostienen todo lo demás y que conviene ejercitar
-- juntos: aislamiento entre empresas, permisos del supervisor, y que un
-- empleado no pueda escribir directo por PostgREST.
--
-- La autoridad de estas reglas es ésta, no la interfaz: todo lo que se
-- prueba acá es alcanzable con un `curl` y el JWT de alguien.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/fichaje_reglas.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

-- ------------------------------------------------------------
-- Fixtures: dos empresas, para poder probar el cruce de tenant.
-- ------------------------------------------------------------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('aaaa0000-0000-0000-0000-0000000000a1','Reglas-A','30-reg-1','A','rega@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('aaaa0000-0000-0000-0000-0000000000a2','Reglas-B','30-reg-2','B','regb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

-- e1: con geocerca (A06). e2: sin geocerca, para el resto.
-- e3: de la OTRA empresa. e4: el legajo del propio admin (A07).
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, geocerca, descriptor_facial, descriptor_version,
  consentimiento_biometrico) values
 ('aaaa0000-0000-0000-0000-0000000000e1','aaaa0000-0000-0000-0000-0000000000a1',
  'Geo','Uno','reg-e1','2020-01-01','Op','Prod','celular',
  '{"lat":-34.6,"lng":-58.4,"radioM":100}'::jsonb,
  '[0.10,0.10,0.10]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('aaaa0000-0000-0000-0000-0000000000e2','aaaa0000-0000-0000-0000-0000000000a1',
  'Libre','Dos','reg-e2','2020-01-01','Op','Prod','celular', null,
  '[0.20,0.20,0.20]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('aaaa0000-0000-0000-0000-0000000000e3','aaaa0000-0000-0000-0000-0000000000a2',
  'Otra','Empresa','reg-e3','2020-01-01','Op','Prod','celular', null,
  '[0.80,0.80,0.80]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('aaaa0000-0000-0000-0000-0000000000e4','aaaa0000-0000-0000-0000-0000000000a1',
  'Admin','ConLegajo','reg-e4','2020-01-01','RRHH','Adm','celular', null,
  '[0.40,0.40,0.40]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 -- e5 existe sólo para el caso del kiosco: necesita no tener marcas de
 -- los últimos tres minutos, porque si no la pausa anti-rebote devuelve
 -- la marca anterior en vez de crear una nueva y no se estaría probando
 -- p_tipo sino la pausa.
 ('aaaa0000-0000-0000-0000-0000000000e5','aaaa0000-0000-0000-0000-0000000000a1',
  'Planta','Kiosco','reg-e5','2020-01-01','Op','Prod','planta', null,
  '[0.60,0.60,0.60]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('aaaa0000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','reg-adm@t.test','authenticated','authenticated'),
 ('aaaa0000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','reg-emp1@t.test','authenticated','authenticated'),
 ('aaaa0000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','reg-emp2@t.test','authenticated','authenticated'),
 ('aaaa0000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-000000000000','reg-sup@t.test','authenticated','authenticated'),
 ('aaaa0000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-000000000000','reg-admb@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 -- admin_rrhh de A, CON legajo propio: es el caso de A07.
 ('aaaa0000-0000-0000-0000-0000000000c1','reg-adm@t.test','admin_rrhh','Adm A',
  'aaaa0000-0000-0000-0000-0000000000a1','aaaa0000-0000-0000-0000-0000000000e4'),
 ('aaaa0000-0000-0000-0000-0000000000c2','reg-emp1@t.test','empleado','Geo Uno',
  'aaaa0000-0000-0000-0000-0000000000a1','aaaa0000-0000-0000-0000-0000000000e1'),
 ('aaaa0000-0000-0000-0000-0000000000c3','reg-emp2@t.test','empleado','Libre Dos',
  'aaaa0000-0000-0000-0000-0000000000a1','aaaa0000-0000-0000-0000-0000000000e2'),
 ('aaaa0000-0000-0000-0000-0000000000c4','reg-sup@t.test','supervisor','Sup A',
  'aaaa0000-0000-0000-0000-0000000000a1', null),
 ('aaaa0000-0000-0000-0000-0000000000c5','reg-admb@t.test','admin_rrhh','Adm B',
  'aaaa0000-0000-0000-0000-0000000000a2', null);

-- Identidad para las funciones SECURITY DEFINER, que miran `auth.uid()`.
-- No cambia el rol de sesión: seguimos como `postgres`, que es superusuario
-- y por lo tanto NO pasa por RLS. Alcanza para todo lo que valida el
-- cuerpo de un RPC.
create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Para lo que hay que probar es la RLS —quién puede escribir qué fila—
-- no alcanza con el JWT: hay que dejar de ser superusuario. Es la
-- diferencia entre "el RPC me rechazó" y "la policy me rechazó", y las
-- dos tienen que sostenerse por separado.
create function pg_temp.como_rls(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- ============================================================
-- A04 — ninguna marca nace en el futuro
--
-- La validación vivía sólo en el modal de carga manual. Acá se ataca por
-- donde de verdad se puede atacar: un INSERT directo con el JWT de un
-- gestor, que es lo que hace PostgREST.
-- ============================================================
select pg_temp.como('aaaa0000-0000-0000-0000-0000000000c1');

do $$
declare
  v_fallo boolean := false;
  v_mensaje text;
  v_f fichajes;
begin
  -- Un año adelante: el caso del año mal tipeado.
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('aaaa0000-0000-0000-0000-0000000000a1',
            'aaaa0000-0000-0000-0000-0000000000e2',
            'ingreso', now() + interval '1 year', 'Prueba A04');
  exception when others then
    v_fallo := true; v_mensaje := sqlerrm;
  end;
  assert v_fallo, 'un fichaje del año que viene tiene que rechazarse';
  assert v_mensaje like '%fecha futura%',
    'el mensaje tiene que nombrar el problema';

  -- Una hora adelante también: no es un reloj desajustado, es el futuro.
  v_fallo := false;
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('aaaa0000-0000-0000-0000-0000000000a1',
            'aaaa0000-0000-0000-0000-0000000000e2',
            'ingreso', now() + interval '1 hour', 'Prueba A04');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'una hora adelante sigue siendo el futuro';

  -- Pero dos minutos sí: las tablets de planta se desajustan, y rechazar
  -- una fichada real por noventa segundos de deriva sería peor que el
  -- problema que esto resuelve.
  insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
  values ('aaaa0000-0000-0000-0000-0000000000a1',
          'aaaa0000-0000-0000-0000-0000000000e2',
          'ingreso', now() + interval '2 minutes', 'Reloj adelantado')
  returning * into v_f;
  assert v_f.id is not null,
    'el margen de reloj tiene que dejar pasar un desfasaje chico';

  -- Y una marca del pasado entra sin problema: la corrección histórica
  -- es justamente para lo que existe la carga manual.
  insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
  values ('aaaa0000-0000-0000-0000-0000000000a1',
          'aaaa0000-0000-0000-0000-0000000000e2',
          'egreso', now() - interval '3 hours', 'Corrección de ayer')
  returning * into v_f;
  assert v_f.id is not null, 'una marca del pasado se puede cargar';
end $$;

-- Y una marca futura tampoco puede congelar la alternancia.
--
-- Para simular una fila que hubiera quedado de antes de esta regla hay
-- que meterla igual, y el trigger —bien— no deja. Se adelanta el reloj
-- del fichaje: contra ESE reloj la marca es pasada, así que entra. Es la
-- misma costura que usan los otros tests para mover el tiempo sin editar
-- `fichajes`, que no admite UPDATE desde la migración 76.
reset request.jwt.claims;

do $$
begin
  perform set_config('app.reloj_fichaje',
    (now() + interval '201 days')::text, true);

  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('aaaa0000-0000-0000-0000-0000000000a1',
          'aaaa0000-0000-0000-0000-0000000000e1',
          'ingreso', now() + interval '200 days', 'facial_tablet');

  -- Se devuelve el reloj a la hora real: si quedara adelantado, todo lo
  -- que sigue en esta transacción se evaluaría contra un futuro falso.
  perform set_config('app.reloj_fichaje', '', true);
end $$;

do $$
begin
  -- `tipo_de_marca_siguiente` ordena por `ts desc`: sin la cota, esa
  -- marca sería "la última" hasta dentro de 200 días y devolvería
  -- 'egreso' para siempre.
  assert tipo_de_marca_siguiente(
           'aaaa0000-0000-0000-0000-0000000000e1', now()) = 'ingreso',
    'una marca futura no puede decidir qué toca fichar ahora';
end $$;

do $$
declare v_en_curso boolean;
begin
  -- Y tampoco puede pintar una jornada "en curso" que no empezó.
  select j.en_curso into v_en_curso
    from jornadas_de_empresa(
           'aaaa0000-0000-0000-0000-0000000000a1',
           (now() + interval '200 days')::date,
           (now() + interval '200 days')::date,
           array['aaaa0000-0000-0000-0000-0000000000e1'::uuid]) j
   limit 1;
  assert coalesce(v_en_curso, false) = false,
    'una jornada que todavía no empezó no está en curso';
end $$;

-- ============================================================
-- A06 — la geocerca rechaza, no anota
-- ============================================================
select pg_temp.como('aaaa0000-0000-0000-0000-0000000000c2');

do $$
declare
  v_fallo boolean := false;
  v_mensaje text;
  v_antes bigint;
  v_despues bigint;
  v_f fichajes;
begin
  select count(*) into v_antes from fichajes
   where empleado_id = 'aaaa0000-0000-0000-0000-0000000000e1';

  -- Sin coordenadas: el agujero. `obtenerUbicacion()` en el cliente es
  -- best-effort, así que denegar el permiso alcanzaba para esquivar el
  -- control y la marca quedaba indistinguible de una hecha en la zona.
  begin
    perform fichar_con_rostro(
      '[0.101,0.10,0.10]'::jsonb,
      'aaaa0000-0000-0000-0000-0000000000e1', null, null, null);
  exception when others then v_fallo := true; v_mensaje := sqlerrm; end;
  assert v_fallo, 'con geocerca y sin coordenadas no se ficha';
  assert v_mensaje like '%verificar tu ubicación%',
    'el mensaje tiene que pedir el permiso de ubicación';

  -- Fuera de la zona.
  v_fallo := false;
  begin
    perform fichar_con_rostro(
      '[0.102,0.10,0.10]'::jsonb,
      'aaaa0000-0000-0000-0000-0000000000e1', -33.6, -58.4, null);
  exception when others then v_fallo := true; v_mensaje := sqlerrm; end;
  assert v_fallo, 'a 111 km de su zona no se ficha';
  assert v_mensaje like '%fuera de tu zona%',
    'el mensaje tiene que decirle que se acerque';

  -- Ningún rechazo dejó una marca a medias.
  select count(*) into v_despues from fichajes
   where empleado_id = 'aaaa0000-0000-0000-0000-0000000000e1';
  assert v_despues = v_antes,
    'un fichaje rechazado por zona no puede haber insertado nada';

  -- Dentro de la zona, ficha.
  select * into v_f from fichar_con_rostro(
    '[0.103,0.10,0.10]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e1', -34.6, -58.4, null);
  assert v_f.id is not null, 'dentro de su zona tiene que poder fichar';
  assert v_f.fuera_de_zona = false, 'y queda registrado como dentro';
end $$;

-- Sin geocerca configurada la ubicación no hace falta: no se le puede
-- exigir una prueba de zona a quien no tiene zona asignada.
select pg_temp.como('aaaa0000-0000-0000-0000-0000000000c3');

do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.201,0.20,0.20]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e2', null, null, null);
  assert v_f.id is not null, 'sin geocerca se ficha sin coordenadas';
  assert v_f.fuera_de_zona is null,
    'sin zona configurada no se puede afirmar nada sobre la zona';
end $$;

-- El modo remoto está exento por definición: ficha desde donde sea.
do $$
declare v_f fichajes;
begin
  update empleados
     set modo_fichaje = 'remoto',
         geocerca = '{"lat":-34.6,"lng":-58.4,"radioM":100}'::jsonb
   where id = 'aaaa0000-0000-0000-0000-0000000000e2';

  select * into v_f from fichar_con_rostro(
    '[0.202,0.20,0.20]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e2', null, null, null);
  assert v_f.metodo = 'remoto', 'el método sale del modo del empleado';
  assert v_f.fuera_de_zona is null,
    'en modo remoto la zona no se evalúa aunque haya geocerca cargada';

  update empleados set modo_fichaje = 'celular', geocerca = null
   where id = 'aaaa0000-0000-0000-0000-0000000000e2';
end $$;

-- ============================================================
-- A07 — `p_tipo` no sirve para fichar por uno mismo
--
-- El actor es admin_rrhh Y titular del legajo e4. Antes el `if` sólo
-- miraba el rol, así que podía encadenar ingresos sobre su propia
-- jornada salteándose `tipo_de_marca_siguiente()`.
-- ============================================================
select pg_temp.como('aaaa0000-0000-0000-0000-0000000000c1');

do $$
declare
  v_uno fichajes;
  v_dos fichajes;
begin
  select * into v_uno from fichar_con_rostro(
    '[0.401,0.40,0.40]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e4', null, null, 'ingreso');
  assert v_uno.tipo = 'ingreso', 'la primera marca abre la jornada';

  -- Pide 'ingreso' otra vez. Si `p_tipo` se respetara, quedarían dos
  -- ingresos seguidos: una secuencia imposible con la que estirar la
  -- jornada propia.
  select * into v_dos from fichar_con_rostro(
    '[0.402,0.40,0.40]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e4', null, null, 'ingreso');
  assert v_dos.tipo = 'egreso',
    'un gestor no puede imponer el tipo de su propia marca';
end $$;

-- En el kiosco sí se acepta, y queda auditado. Es el caso para el que se
-- abrió `p_tipo` (FIC-009): una corrección puntual en planta.
-- Una marca de hace diez minutos para e5: deja la jornada abierta (lo que
-- corresponde después es un egreso) y queda fuera de la pausa de tres
-- minutos del kiosco.
insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
values ('aaaa0000-0000-0000-0000-0000000000a1',
        'aaaa0000-0000-0000-0000-0000000000e5',
        'ingreso', now() - interval '10 minutes', 'Fixture del kiosco');

do $$
declare
  v_t uuid;
  v_s text;
  v_f fichajes;
  v_detalle jsonb;
begin
  select id, secreto into v_t, v_s from autorizar_terminal('Tablet reglas');

  -- e5 tiene la jornada abierta, así que lo que corresponde es un egreso.
  -- Se fuerza 'ingreso' para ver que en el kiosco p_tipo sí manda.
  select * into v_f from fichar_con_rostro(
    '[0.601,0.60,0.60]'::jsonb, null, null, null, 'ingreso', v_t, v_s);
  assert v_f.tipo = 'ingreso', 'en el kiosco p_tipo sí se acepta';
  assert v_f.empleado_id = 'aaaa0000-0000-0000-0000-0000000000e5',
    'y reconoce a la persona correcta';

  -- La parte que faltaba: rastro. Era la única operación privilegiada
  -- del camino facial que no dejaba ninguno.
  select detalle into v_detalle from auditoria_acciones
   where entidad = 'fichaje' and entidad_id = v_f.id::text
     and accion = 'forzar_tipo_fichaje';
  assert v_detalle is not null,
    'forzar el tipo tiene que quedar auditado';
  assert v_detalle ->> 'tipoForzado' = 'ingreso',
    'la auditoría guarda el tipo que se impuso';
  assert v_detalle ->> 'tipoQueCorrespondia' = 'egreso',
    'y el que habría calculado el servidor, que es lo que se sobrescribió';
end $$;

-- Un fichaje normal (sin p_tipo) NO ensucia la auditoría.
do $$
declare v_f fichajes; v_n bigint;
begin
  select * into v_f from fichar_con_rostro(
    '[0.404,0.40,0.40]'::jsonb,
    'aaaa0000-0000-0000-0000-0000000000e4', null, null, null);
  select count(*) into v_n from auditoria_acciones
   where entidad_id = v_f.id::text and accion = 'forzar_tipo_fichaje';
  assert v_n = 0, 'una fichada normal no genera auditoría de tipo forzado';
end $$;

-- ============================================================
-- Aislamiento entre empresas
-- ============================================================
select pg_temp.como_rls('aaaa0000-0000-0000-0000-0000000000c5'); -- admin de B

do $$
declare v_fallo boolean := false; v_n bigint;
begin
  -- No puede insertar una marca para un legajo de la empresa A, ni
  -- afirmando la empresa de él ni la propia.
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('aaaa0000-0000-0000-0000-0000000000a1',
            'aaaa0000-0000-0000-0000-0000000000e2',
            'ingreso', now(), 'Cruce de tenant');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'un admin no puede cargar marcas en otra empresa';

  v_fallo := false;
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('aaaa0000-0000-0000-0000-0000000000a2',
            'aaaa0000-0000-0000-0000-0000000000e2',
            'ingreso', now(), 'Legajo de otra empresa');
  exception when others then v_fallo := true; end;
  assert v_fallo,
    'tampoco mezclando su empresa con un legajo ajeno';

  -- Y no ve ninguna marca de la empresa A.
  select count(*) into v_n from fichajes
   where empresa_id = 'aaaa0000-0000-0000-0000-0000000000a1';
  assert v_n = 0, 'las marcas de otra empresa no se leen';

  -- Ni por la función de jornadas, que es security invoker.
  select count(*) into v_n from jornadas_de_empresa(
    'aaaa0000-0000-0000-0000-0000000000a1',
    (now() - interval '30 days')::date, now()::date);
  assert v_n = 0, 'jornadas_de_empresa tampoco cruza el tenant';
end $$;

-- Anular una marca de otra empresa, tampoco. Acá el corte lo pone el RPC
-- (que compara el tenant), no la policy, así que se vuelve a `postgres`
-- para poder leer el id de la marca que se va a intentar anular.
reset role;

do $$
declare v_fallo boolean := false; v_id uuid;
begin
  select id into v_id from fichajes
   where empresa_id = 'aaaa0000-0000-0000-0000-0000000000a1' limit 1;
  begin
    perform anular_fichaje(v_id, 'Intento de cruce');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'no se anula una marca de otra empresa';
end $$;

-- ============================================================
-- Permisos: qué puede y qué no puede un supervisor
--
-- Cargar es aditivo y deja evidencia nueva; anular RESTA horas de un
-- registro que puede terminar en una liquidación, y el supervisor suele
-- ser la contraparte en esa discusión (ver migración 76).
-- ============================================================
select pg_temp.como_rls('aaaa0000-0000-0000-0000-0000000000c4');

do $$
declare v_f fichajes; v_fallo boolean := false; v_id uuid;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
  values ('aaaa0000-0000-0000-0000-0000000000a1',
          'aaaa0000-0000-0000-0000-0000000000e2',
          'ingreso', now() - interval '1 hour', 'Se cayó la tablet')
  returning * into v_f;
  assert v_f.metodo = 'manual', 'todo INSERT directo es carga manual';
  assert v_f.registrado_por_id = 'aaaa0000-0000-0000-0000-0000000000c4',
    'y queda quién la cargó';

  select id into v_id from fichajes
   where empleado_id = 'aaaa0000-0000-0000-0000-0000000000e2'
     and anulado_en is null limit 1;
  begin
    perform anular_fichaje(v_id, 'No me gusta esta marca');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'un supervisor no puede anular fichajes';
end $$;

-- ============================================================
-- El empleado no escribe directo: ficha por el RPC
-- ============================================================
select pg_temp.como_rls('aaaa0000-0000-0000-0000-0000000000c3');

do $$
declare v_fallo boolean := false; v_id uuid;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('aaaa0000-0000-0000-0000-0000000000a1',
            'aaaa0000-0000-0000-0000-0000000000e2',
            'egreso', now(), 'Me la cargo yo');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'un empleado no inserta marcas directo';

  -- Ni por otro empleado con el RPC.
  v_fallo := false;
  begin
    perform fichar_con_rostro(
      '[0.104,0.10,0.10]'::jsonb,
      'aaaa0000-0000-0000-0000-0000000000e1', -34.6, -58.4, null);
  exception when others then v_fallo := true; end;
  assert v_fallo, 'un empleado no ficha por otro';

  -- Ni anular las suyas.
  v_fallo := false;
  select id into v_id from fichajes
   where empleado_id = 'aaaa0000-0000-0000-0000-0000000000e2'
     and anulado_en is null limit 1;
  begin
    perform anular_fichaje(v_id, 'Me arrepentí');
  exception when others then v_fallo := true; end;
  assert v_fallo, 'un empleado no anula ni sus propias marcas';
end $$;

reset role;

rollback;

\echo ''
\echo '  ✓ Fichaje: tiempo, zona, tipo, tenant y permisos — todo pasó'
\echo ''
