-- Pruebas de las funciones y triggers de la base.
--
-- Por qué existe este archivo
-- ---------------------------
-- El CI corría typecheck, lint, tests y build, y las cuatro cosas daban
-- verde con un RPC roto: la lógica en SQL no la toca ningún test de Jest.
-- Un bug de tipos en `fichar_con_rostro` —una variable `text` contra una
-- columna enum— llegó a `main` y habría dejado el fichaje facial sin
-- funcionar, porque una migración se **aplica** sin validar el cuerpo de
-- sus funciones plpgsql: el error aparece recién en la primera llamada.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rpc.test.sql
--
-- Cualquier `assert` que falle corta con error y devuelve exit code ≠ 0.

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------
-- Sin `config.geocerca` a propósito (FIC-012). Ese fixture era el que
-- tapaba el bug F-04: el RPC leía `empresas.config->'geocerca'`, una
-- clave que ninguna pantalla escribe —`ConfigEmpresa` ni siquiera la
-- declara—, así que en producción la geocerca no se evaluaba nunca. El
-- test la insertaba a mano y daba verde sobre una configuración
-- inexistente. La zona real es `empleados.geocerca`.
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values ('11111111-1111-1111-1111-111111111111', 'Test SA', '30-1-9', 'A', 'a@a.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'Ana', 'Perez', '111', '2020-01-01', 'Op', 'Prod');

insert into auth.users (id, instance_id, email, aud, role)
values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
        'rrhh@test.com', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
values ('33333333-3333-3333-3333-333333333333', 'rrhh@test.com', 'admin_rrhh', 'RRHH',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- ---------------------------------------------------------------------
-- Distancias
-- ---------------------------------------------------------------------
do $$
begin
  assert distancia_descriptores('[1,2,3]'::jsonb, '[1,2,3]'::jsonb) = 0,
    'dos descriptores iguales deben dar distancia 0';
  assert round(distancia_descriptores('[3,4,5]'::jsonb, '[0,0,0]'::jsonb)::numeric, 4)
    = 7.0711, 'sqrt(9+16+25) debe ser 7.0711';
  assert round(distancia_metros(-34.6, -58.4, -34.6, -58.4)::numeric, 1) = 0.0,
    'el mismo punto debe dar 0 metros';
  assert round(distancia_metros(-34.6, -58.4, -33.6, -58.4)::numeric, -2) = 111200,
    'un grado de latitud son ~111 km';
end $$;

-- ---------------------------------------------------------------------
-- Consentimiento biométrico (migración 48)
-- ---------------------------------------------------------------------
do $$
declare v_fallo boolean := false;
begin
  begin
    update empleados set descriptor_facial = '[1,2,3]'::jsonb
     where id = '22222222-2222-2222-2222-222222222222';
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'guardar un rostro sin consentimiento tiene que fallar';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    update empleados
       set descriptor_facial = '[1,2,3]'::jsonb,
           consentimiento_biometrico = '{"aceptado":true}'::jsonb
     where id = '22222222-2222-2222-2222-222222222222';
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'el consentimiento sin fecha tiene que fallar';
end $$;

-- Enrolamiento válido: deja el rostro [0,0,0] listo para los tests del RPC.
-- La versión va junto con el descriptor: desde la migración 77 la base no
-- deja que quede uno sin el otro, porque un descriptor sin versión es un
-- descriptor que después nadie sabe con qué comparar.
update empleados
   set descriptor_facial = '[0,0,0]'::jsonb,
       descriptor_version = 1,
       consentimiento_biometrico =
         '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb
 where id = '22222222-2222-2222-2222-222222222222';

do $$
begin
  assert (select descriptor_facial from empleados
           where id = '22222222-2222-2222-2222-222222222222') is not null,
    'con consentimiento completo el rostro tiene que guardarse';
end $$;

-- Borrar siempre se puede (derecho ARCO), y editar otros campos también.
do $$
begin
  update empleados set telefono = '123'
   where id = '22222222-2222-2222-2222-222222222222';
  assert true;
end $$;

-- ---------------------------------------------------------------------
-- Guardia de fichajes (migración 49)
-- ---------------------------------------------------------------------
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, metodo, confianza)
    values ('11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222', 'ingreso', 'celular', 1);
  exception when others then v_fallo := true;
  end;
  assert v_fallo,
    'nadie puede afirmar una confianza de rostro por insert directo';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, metodo, fuera_de_zona)
    values ('11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222', 'ingreso', 'celular', false);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'nadie puede afirmar la geocerca por insert directo';
end $$;

-- El fichaje manual legítimo no lleva ninguno de los dos y debe pasar.
-- Sin JWT: auth.uid() es null y el trigger de actor no interviene.
insert into fichajes (empresa_id, empleado_id, tipo, metodo)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'ingreso', 'manual');
delete from fichajes where empresa_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- FIC-003: el "hoy" laboral usa zona_empresa(), no el TZ de sesión
-- ---------------------------------------------------------------------
do $$
declare
  v_ingreso timestamptz := '2026-07-06T11:00:00+00'::timestamptz;
  v_salida  timestamptz := '2026-07-07T00:30:00+00'::timestamptz;
  v_inicio_art timestamptz;
  v_inicio_utc timestamptz;
begin
  perform set_config('timezone', 'UTC', true);

  assert (v_ingreso at time zone zona_empresa())::date
       = (v_salida  at time zone zona_empresa())::date,
    'ambos timestamps son el mismo día laboral en Argentina';

  -- Lógica vieja (rota): medianoche UTC del "now" de la salida excluye
  -- el ingreso de la mañana.
  v_inicio_utc := date_trunc('day', v_salida);
  assert v_ingreso < v_inicio_utc,
    'sanity: date_trunc UTC partiría el día laboral';

  -- Lógica nueva (zona_empresa): el inicio del día ART incluye el ingreso.
  v_inicio_art := (
    ((v_salida at time zone zona_empresa())::date)::timestamp
    at time zone zona_empresa()
  );
  assert v_ingreso >= v_inicio_art,
    'el ingreso de las 08:00 ART cae dentro del día laboral de la salida 21:30';
end $$;

-- ---------------------------------------------------------------------
-- FIC-001: carga de terceros queda como manual + auditoría atómica
-- ---------------------------------------------------------------------
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111',
        'Carlos', 'Ruiz', '333', '2021-01-01', 'Sup', 'Admin');

insert into auth.users (id, instance_id, email, aud, role)
values
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'sup@test.com', 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'emp@test.com', 'authenticated', 'authenticated');

-- Un legajo = un usuario (mig 54). El admin_rrhh del fixture ya tenía a
-- Ana: se la desvincula antes de darle el legajo al empleado de prueba.
update usuarios
   set empleado_id = null
 where id = '33333333-3333-3333-3333-333333333333';

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
values
  ('66666666-6666-6666-6666-666666666666', 'sup@test.com', 'supervisor', 'Supervisor Test',
   '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'),
  ('77777777-7777-7777-7777-777777777777', 'emp@test.com', 'empleado', 'Ana Empleada',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Supervisor cargándose una marca a sí mismo por INSERT directo.
--
-- Este bloque cambió con F-07. Antes afirmaba que el camino self-service
-- "conserva el método" del cliente, y ésa era justamente la debilidad:
-- un INSERT directo nunca pasó por una cámara ni por la validación del
-- RPC, así que declararse `celular` (o `facial_tablet`) era una
-- afirmación del cliente sobre cómo se registró la marca. Ahora todo
-- INSERT directo es una carga a mano, la haga quien la haga y sea para
-- quien sea, y queda auditada.
set request.jwt.claims =
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
do $$
declare v_f fichajes; v_aud auditoria_acciones;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, metodo, registrado_por)
  values ('11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',
          'ingreso', 'celular', 'FRAUDE')
  returning * into v_f;
  assert v_f.metodo = 'manual',
    'un INSERT directo es carga manual aunque sea para uno mismo';
  assert v_f.registrado_por_id = '66666666-6666-6666-6666-666666666666',
    'el actor lo impone la base, no el cliente';
  assert v_f.registrado_por = 'Supervisor Test',
    'y el nombre sale de la tabla usuarios, no del payload ("FRAUDE")';

  select * into v_aud from auditoria_acciones
   where entidad = 'fichaje' and entidad_id = v_f.id::text;
  assert found, 'cargarse una marca a sí mismo también se audita';
  assert (v_aud.detalle->>'propia')::boolean,
    'la auditoría distingue la carga propia de la de un tercero';
end $$;

-- Supervisor → otro empleado: fuerza manual + auditoría (aunque mande celular).
do $$
declare v_f fichajes; v_aud auditoria_acciones;
begin
  insert into fichajes (
    empresa_id, empleado_id, tipo, metodo, ts, registrado_por
  ) values (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'ingreso', 'celular', '2026-08-03T11:00:00Z', 'CEO Falso'
  ) returning * into v_f;

  assert v_f.metodo = 'manual', 'carga de terceros no puede pasar por celular';
  assert v_f.registrado_por_id = '66666666-6666-6666-6666-666666666666',
    'registrado_por_id es auth.uid()';
  assert v_f.registrado_por = 'Supervisor Test',
    'registrado_por sale del perfil, no del cliente';
  assert v_f.ts = '2026-08-03T11:00:00Z'::timestamptz,
    'el gestor puede seguir cargando histórico';

  select * into v_aud from auditoria_acciones
   where entidad = 'fichaje' and entidad_id = v_f.id::text;
  assert found, 'la auditoría se escribe en la misma transacción';
  assert v_aud.accion = 'cargar_manual';
  assert v_aud.actor_id = '66666666-6666-6666-6666-666666666666';
end $$;

-- Admin RRHH → otro empleado (Carlos): misma regla.
set request.jwt.claims =
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_f fichajes;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, metodo)
  values ('11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',
          'egreso', 'remoto')
  returning * into v_f;
  assert v_f.metodo = 'manual';
  assert v_f.registrado_por_id = '33333333-3333-3333-3333-333333333333';
  assert v_f.registrado_por = 'RRHH';
end $$;

-- Empleado → otro empleado: RLS lo bloquea (no llega al trigger).
set request.jwt.claims =
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
do $$
declare v_fallo boolean := false;
begin
  begin
    set local role authenticated;
    insert into fichajes (empresa_id, empleado_id, tipo, metodo)
    values ('11111111-1111-1111-1111-111111111111',
            '55555555-5555-5555-5555-555555555555',
            'ingreso', 'celular');
  exception when others then
    v_fallo := true;
  end;
  reset role;
  assert v_fallo, 'un empleado no puede insertar fichajes de otro';
end $$;

delete from auditoria_acciones where empresa_id = '11111111-1111-1111-1111-111111111111';
delete from fichajes where empresa_id = '11111111-1111-1111-1111-111111111111';
delete from fichajes_descriptor_usado;

-- ---------------------------------------------------------------------
-- fichar_con_rostro (Bloque 1: titularidad, antirreplay, alternancia)
--
-- Cada llamada usa un descriptor *cercano pero distinto*: dos capturas
-- reales nunca son bit a bit idénticas; el antirreplay sólo corta replay.
-- ---------------------------------------------------------------------
-- La zona de trabajo vive en la ficha de la persona, no en la empresa.
update empleados
   set modo_fichaje = 'celular',
       geocerca = '{"lat":-34.6,"lng":-58.4,"radioM":100}'::jsonb
 where id = '22222222-2222-2222-2222-222222222222';

-- F-01: el 1:N necesita una terminal vinculada. Se autoriza una acá y se
-- guardan sus credenciales para las llamadas de kiosco de este archivo.
-- La matriz completa de casos de terminal está en
-- `terminal_vinculada.test.sql`; acá sólo se usa una válida para poder
-- seguir probando lo demás.
set request.jwt.claims =
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
create temp table term_rpc as select * from autorizar_terminal('Tablet tests');

-- El kiosco corre con JWT de gestor (antes este bloque usaba el del
-- empleado: desde F-01 el 1:N exige gestor + terminal).
set request.jwt.claims =
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

do $$
declare
  v_f fichajes;
  v_t uuid := (select id from term_rpc);
  v_s text := (select secreto from term_rpc);
begin
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, null, -34.6, -58.4, null, v_t, v_s);
  assert v_f.tipo = 'ingreso', 'la primera marca del día es un ingreso';
  assert v_f.empleado_id = '22222222-2222-2222-2222-222222222222',
    'tiene que reconocer a la persona correcta';
  -- FIC-012: en 1:N no se evalúa la zona aunque lleguen coordenadas. La
  -- tablet está fija en la planta: su GPS no dice nada de quién ficha, y
  -- cuando no engancha marcaría fuera de zona a todo el turno.
  assert v_f.fuera_de_zona is null,
    'el kiosco no evalúa geocerca ni aunque el cliente mande coordenadas';
  assert round(v_f.confianza::numeric, 2) = 0.97,
    'la confianza la calcula el servidor a partir de la distancia real';
  assert v_f.metodo = 'facial_tablet',
    'el camino RPC no se convierte en manual aunque el JWT sea de otro rol';

  -- Para alternar de verdad hay que simular que ya se fue de la tablet.
  update fichajes set ts = ts - interval '3 minutes' where id = v_f.id;

  -- Descriptor distinto (no replay) → egreso.
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.011]'::jsonb, null, -34.6, -58.4, null, v_t, v_s);
  assert v_f.tipo = 'egreso', 'la segunda marca alterna a egreso';

  update fichajes set ts = ts - interval '3 minutes' where id = v_f.id;

  -- Tercera marca, lejísimos: el kiosco sigue sin opinar sobre la zona.
  select * into v_f from fichar_con_rostro(
    '[0.01,0.011,0.01]'::jsonb, null, -33.6, -58.4, null, v_t, v_s);
  assert v_f.tipo = 'ingreso', 'la tercera marca vuelve a ingreso';
  assert v_f.fuera_de_zona is null,
    'a 111 km de la planta el kiosco tampoco marca fuera de zona';

  update fichajes set ts = ts - interval '3 minutes' where id = v_f.id;
end $$;

-- FIC-002 antirreplay: el mismo descriptor exacto se rechaza, con la
-- misma terminal válida (lo corta el replay, no la credencial).
do $$
declare
  v_fallo boolean := false;
  v_t uuid := (select id from term_rpc);
  v_s text := (select secreto from term_rpc);
begin
  begin
    perform fichar_con_rostro(
      '[0.01,0.01,0.01]'::jsonb, null, -34.6, -58.4, null, v_t, v_s);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'reutilizar el mismo descriptor exacto tiene que fallar';
end $$;

-- Y el JWT del EMPLEADO, con la misma terminal válida, no puede usar 1:N.
set request.jwt.claims =
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
do $$
declare
  v_fallo boolean := false;
  v_t uuid := (select id from term_rpc);
  v_s text := (select secreto from term_rpc);
begin
  begin
    perform fichar_con_rostro(
      '[0.031,0.01,0.01]'::jsonb, null, null, null, null, v_t, v_s);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un empleado no puede fichar 1:N ni con la terminal buena';
end $$;

-- FIC-009: p_tipo del cliente se ignora en self-service.
-- Última marca es ingreso (la tercera del bloque anterior) → debe ser egreso
-- aunque mande p_tipo='ingreso'.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.011,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -34.6, -58.4, 'ingreso');
  assert v_f.tipo = 'egreso',
    'self-service ignora p_tipo=ingreso cuando ya hay un ingreso abierto';
end $$;

-- ---------------------------------------------------------------------
-- FIC-012: la geocerca es la del EMPLEADO y sólo aplica en 1:1 celular
--
-- Estos bloques van después de FIC-009 a propósito: cada llamada agrega
-- una marca y corre la alternancia, así que insertarlos más arriba
-- rompería las aserciones de ingreso/egreso del bloque anterior.
-- ---------------------------------------------------------------------
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.013,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -34.6, -58.4, null);
  assert v_f.fuera_de_zona = false,
    'en el centro de su geocerca, el fichaje por celular está dentro';

  select * into v_f from fichar_con_rostro(
    '[0.014,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -33.6, -58.4, null);
  assert v_f.fuera_de_zona = true, 'a 111 km tiene que dar fuera de zona';
end $$;

-- El modo remoto está exento por definición: ficha desde donde sea.
do $$
declare v_f fichajes;
begin
  update empleados set modo_fichaje = 'remoto'
   where id = '22222222-2222-2222-2222-222222222222';

  select * into v_f from fichar_con_rostro(
    '[0.015,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -33.6, -58.4, null);
  assert v_f.fuera_de_zona is null,
    'en modo remoto la zona no se evalúa aunque lleguen coordenadas';

  update empleados set modo_fichaje = 'celular'
   where id = '22222222-2222-2222-2222-222222222222';
end $$;

-- Sin zona cargada, `null` y no `false`: "no sé" no es "estaba dentro".
do $$
declare v_f fichajes;
begin
  update empleados set geocerca = null
   where id = '22222222-2222-2222-2222-222222222222';

  select * into v_f from fichar_con_rostro(
    '[0.016,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -33.6, -58.4, null);
  assert v_f.fuera_de_zona is null,
    'sin geocerca configurada no se puede afirmar nada sobre la zona';

  update empleados
     set geocerca = '{"lat":-34.6,"lng":-58.4,"radioM":100}'::jsonb
   where id = '22222222-2222-2222-2222-222222222222';
end $$;

-- ---------------------------------------------------------------------
-- FIC-010: el tipo alterna por SESIÓN, no por día calendario
--
-- Es el bug que dejaba el turno noche en cero horas todos los días:
-- alguien entra 22:00 y sale 06:00, y como la salida cae en otro día
-- calendario el RPC no veía el ingreso y registraba OTRO ingreso. La
-- jornada quedaba `ingreso, ingreso`, nunca cerraba, y
-- `jornadas_de_empresa` le daba entrada sin salida: 0 horas.
--
-- `tipo_de_marca_siguiente` recibe el "ahora" por parámetro justamente
-- para esto: el caso del turno noche sólo se puede montar fijando la
-- hora, y si dependiera de `clock_timestamp()` el test pasaría o fallaría
-- según a qué hora del día corra el CI.
--
-- Se usa un empleado limpio para no arrastrar las marcas de arriba.
-- ---------------------------------------------------------------------
set request.jwt.claims =
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version, consentimiento_biometrico)
values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
  'Noc', 'Turno', '999', '2020-01-01', 'Op', 'Prod', 'planta',
  '[0.5,0.5,0.5]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

-- Turno 22:00 → 06:00 del día siguiente, con horas fijas.
do $$
declare
  v_entrada timestamptz :=
    ('2026-08-10 22:00'::timestamp at time zone zona_empresa());
  v_salida timestamptz :=
    ('2026-08-11 06:00'::timestamp at time zone zona_empresa());
  v_j record;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111',
          '99999999-9999-9999-9999-999999999999',
          'ingreso', v_entrada, 'facial_tablet');

  -- El corazón del bug: a las 06:00 la marca de las 22:00 está del otro
  -- lado de la medianoche. La regla vieja no la veía y devolvía otro
  -- 'ingreso'; la jornada quedaba `ingreso, ingreso` y nunca cerraba.
  assert tipo_de_marca_siguiente(
           '99999999-9999-9999-9999-999999999999', v_salida) = 'egreso',
    'el egreso del turno noche NO puede registrarse como un ingreso nuevo';

  -- Con el tipo correcto, la jornada cierra: es lo que importa liquidar.
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111',
          '99999999-9999-9999-9999-999999999999',
          'egreso', v_salida, 'facial_tablet');

  select * into v_j
    from jornadas_de_empresa(
      '11111111-1111-1111-1111-111111111111',
      '2026-08-10'::date, '2026-08-11'::date,
      array['99999999-9999-9999-9999-999999999999']::uuid[]);
  assert v_j.cerrada, 'la jornada nocturna tiene que quedar cerrada';
  assert v_j.salida is not null, 'y con salida, para que las horas no den 0';
  assert v_j.fecha = '2026-08-10'::date,
    'la jornada se fecha por el ingreso, no por el día en que se salió';

  delete from fichajes
   where empleado_id = '99999999-9999-9999-9999-999999999999';
end $$;

-- La regla, caso por caso, sin depender del reloj.
do $$
declare
  v_ahora timestamptz := ('2026-08-11 06:00'::timestamp at time zone zona_empresa());
  v_emp uuid := '99999999-9999-9999-9999-999999999999';
begin
  -- Sin ninguna marca: abre jornada.
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'ingreso',
    'la primera marca de la vida de una persona es un ingreso';

  -- Ingreso hace 3 h (mismo turno, vuelta del almuerzo): alterna.
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'ingreso', v_ahora - interval '3 hours', 'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'egreso',
    'con un ingreso de hace 3 h, la marca siguiente es el egreso';

  -- Egreso reciente: la próxima vuelve a ser ingreso.
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'egreso', v_ahora - interval '10 minutes', 'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'ingreso',
    'después de un egreso siempre viene un ingreso';

  delete from fichajes where empleado_id = v_emp;

  -- Un turno noche completo (8 h entre marcas) sigue siendo UNA sesión.
  -- Es más que `corte_jornada()`, y por eso el umbral acá no puede ser
  -- ése: la primera versión de la corrección usó el corte y volvió a
  -- registrar la salida del turno noche como un ingreso.
  delete from fichajes where empleado_id = v_emp;
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'ingreso', v_ahora - interval '8 hours', 'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'egreso',
    'ocho horas después del ingreso sigue siendo la misma jornada';

  -- Ingreso de hace 30 h: se olvidó de fichar la salida. Esta marca NO
  -- es su egreso —sería una jornada de 30 horas— sino el ingreso de una
  -- sesión nueva. La anterior queda abierta, que es lo que hay que
  -- corregir a mano.
  delete from fichajes where empleado_id = v_emp;
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'ingreso', v_ahora - interval '30 hours', 'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'ingreso',
    'un ingreso viejo abre sesión nueva, no cierra la de hace 30 h';

  -- El borde es `max_jornada()`, el mismo con el que jornadas_de_empresa
  -- decide `en_curso`: si la jornada figura en curso, esta marca la
  -- cierra; si ya no, abre otra.
  delete from fichajes where empleado_id = v_emp;
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'ingreso', v_ahora - max_jornada(), 'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'ingreso',
    'exactamente en el máximo de jornada ya es otra sesión';

  delete from fichajes where empleado_id = v_emp;
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111', v_emp,
          'ingreso', v_ahora - max_jornada() + interval '1 minute',
          'facial_tablet');
  assert tipo_de_marca_siguiente(v_emp, v_ahora) = 'egreso',
    'un minuto antes del máximo, la jornada sigue en curso';

  delete from fichajes where empleado_id = v_emp;
end $$;

-- Y el RPC usa esa misma regla, no una copia.
do $$
declare v_f fichajes;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, metodo)
  values ('11111111-1111-1111-1111-111111111111',
          '99999999-9999-9999-9999-999999999999',
          'ingreso', clock_timestamp() - interval '2 hours', 'facial_tablet');

  select * into v_f from fichar_con_rostro(
    '[0.5,0.5,0.501]'::jsonb, null, null, null, null,
    (select id from term_rpc), (select secreto from term_rpc));
  assert v_f.empleado_id = '99999999-9999-9999-9999-999999999999',
    'tiene que reconocer al del turno noche';
  assert v_f.tipo = 'egreso',
    'fichar_con_rostro tiene que delegar en tipo_de_marca_siguiente';
end $$;

delete from fichajes where empleado_id = '99999999-9999-9999-9999-999999999999';
delete from empleados where id = '99999999-9999-9999-9999-999999999999';

-- ---------------------------------------------------------------------
-- FIC-011: el descriptor facial no sale de la base
--
-- Era el secreto con el que se autentica el fichaje facial y la vista se
-- lo devolvía al propio titular (y a admin_rrhh, todos los del tenant).
-- Con esos 128 números se ficha por REST desde cualquier lado, sin
-- cámara y sin prueba de vida, esquivando el antirreplay con cambiarle
-- un decimal.
-- ---------------------------------------------------------------------
do $$
begin
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'empleados_lectura'
       and column_name = 'descriptor_facial'
  ), 'empleados_lectura no puede exponer descriptor_facial a nadie';

  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'empleados_lectura'
       and column_name = 'tiene_rostro'
  ), 'la app necesita saber si está enrolada: tiene_rostro';

  -- La tabla base tampoco: el SELECT de `authenticated` se revocó en la
  -- migración 66 y se re-otorgó por columnas, sin la biométrica.
  assert not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public'
       and table_name = 'empleados'
       and column_name = 'descriptor_facial'
       and grantee = 'authenticated'
       and privilege_type = 'SELECT'
  ), 'authenticated no puede tener SELECT sobre empleados.descriptor_facial';
end $$;

-- El titular ve que está enrolado, pero no con qué.
set request.jwt.claims =
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
do $$
declare v_tiene boolean;
begin
  select tiene_rostro into v_tiene
    from empleados_lectura
   where id = '22222222-2222-2222-2222-222222222222';
  assert v_tiene, 'el titular tiene que ver que su rostro está registrado';
end $$;

-- Sin fichaje previo de otro empleado + p_tipo=egreso no fabrica salida.
-- (Carlos no tiene marcas hoy; como empleado de Ana no puede 1:1 por Carlos.
--  Probamos con gestor forzando p_tipo sobre alguien sin marcas vía insert
--  ya cubierto; acá: Ana con día limpio simulado no aplica. Ver abajo
--  el caso gestor.)

do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro('[9,9,9]'::jsonb, null, null, null, null,
      (select id from term_rpc), (select secreto from term_rpc));
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un rostro que no coincide tiene que ser rechazado';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro('[]'::jsonb, null, null, null, null,
      (select id from term_rpc), (select secreto from term_rpc));
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un descriptor vacío tiene que ser rechazado';
end $$;

-- FIC-002: empleado A no puede fichar 1:1 como B aunque mande su id.
do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro(
      '[0.01,0.01,0.012]'::jsonb,
      '55555555-5555-5555-5555-555555555555', -34.6, -58.4, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado A no puede usar p_empleado_id de B';
end $$;

-- Dos rostros casi idénticos en 1:N: mejor no fichar que fichar al que no es.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, descriptor_facial, descriptor_version, consentimiento_biometrico)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
  'Beto', 'Gomez', '222', '2020-01-01', 'Op', 'Prod', '[0.02,0.02,0.02]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro('[0.015,0.015,0.015]'::jsonb,
      null, -34.6, -58.4, null,
      (select id from term_rpc), (select secreto from term_rpc));
  exception when others then v_fallo := true;
  end;
  assert v_fallo,
    'con dos rostros demasiado parecidos tiene que negarse a elegir';
end $$;

-- 1:1 del titular: el margen no aplica.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro('[0.012,0.01,0.01]'::jsonb,
    '22222222-2222-2222-2222-222222222222', -34.6, -58.4, null);
  assert v_f.empleado_id = '22222222-2222-2222-2222-222222222222',
    'en 1:1 se verifica contra la persona indicada';
end $$;

-- Modo 1:N sigue funcionando (JWT de gestor/tablet, p_empleado_id null).
-- Quitamos a Beto del margen y fichamos a Ana con descriptor fresco.
delete from empleados where id = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims =
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
do $$
declare v_f fichajes;
begin
  update fichajes
     set ts = ts - interval '3 minutes'
   where empleado_id = '22222222-2222-2222-2222-222222222222';

  select * into v_f from fichar_con_rostro(
    '[0.01,0.012,0.01]'::jsonb, null, -34.6, -58.4, null,
    (select id from term_rpc), (select secreto from term_rpc));
  assert v_f.empleado_id = '22222222-2222-2222-2222-222222222222',
    '1:N con JWT de gestor sigue identificando a la persona';
  assert v_f.metodo = 'facial_tablet',
    'kiosco no se convierte en manual (app.fichaje_validado)';
end $$;

-- ---------------------------------------------------------------------
-- crear_documento_firma: atomicidad (migración 53)
-- ---------------------------------------------------------------------
do $$
declare v_fallo boolean := false; v_docs int;
begin
  begin
    perform crear_documento_firma('Reglamento', 'd', 'p.pdf',
      array['22222222-2222-2222-2222-222222222222',
            '99999999-9999-9999-9999-999999999999']::uuid[]);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un destinatario inexistente tiene que hacer fallar todo';
  select count(*) into v_docs from documentos_firma;
  assert v_docs = 0,
    'si falla el destinatario no puede quedar un documento sin nadie que firme';
end $$;

do $$
declare v_docs int; v_dest int;
begin
  perform crear_documento_firma('Reglamento', 'd', 'p.pdf',
    array['22222222-2222-2222-2222-222222222222']::uuid[]);
  select count(*) into v_docs from documentos_firma;
  select count(*) into v_dest from documento_firma_destinatarios;
  assert v_docs = 1 and v_dest = 1,
    'el caso válido crea el documento y su destinatario';
end $$;

-- ---------------------------------------------------------------------
-- Constraints e índices (migraciones 51 y 52)
-- ---------------------------------------------------------------------
do $$
declare v_fallo boolean := false;
begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values ('11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222', '2026-08', -1, 0);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un sueldo negativo tiene que ser rechazado';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    insert into remuneraciones (empresa_id, empleado_id, periodo, monto_bruto, monto_neto)
    values ('11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222', '2026-13', 1, 1);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un período con mes 13 tiene que ser rechazado';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    delete from empresas where id = '11111111-1111-1111-1111-111111111111';
  exception when others then v_fallo := true;
  end;
  assert v_fallo,
    'borrar una empresa sin declarar la intención tiene que fallar';
end $$;

do $$
declare v_faltan text;
begin
  select string_agg(i, ', ') into v_faltan
  from unnest(array[
    'recibos_empresa_periodo_idx', 'remuneraciones_empresa_periodo_idx',
    'turnos_empresa_fecha_idx', 'comunicacion_mensajes_hilo_idx',
    'doc_firma_dest_empleado_idx', 'comunicaciones_empresa_idx',
    'documentos_firma_empresa_idx', 'adelantos_empresa_idx']) as i
  where not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = i);
  assert v_faltan is null, 'faltan índices: ' || coalesce(v_faltan, '');
end $$;

-- ---------------------------------------------------------------------
-- crear_perfil_usuario: qué invitaciones generan perfil y cuáles no
--
-- Este bloque fija el contrato que rompió el alta del equipo de ISEO.
-- La migración 33 hizo que el trigger **ignore** `rol: superadmin` en la
-- metadata —bien: si no, cualquiera se haría superadmin por invitación—
-- pero `/api/equipo-iseo` seguía esperando que el trigger le creara el
-- perfil. Resultado: cuenta en auth.users, nada en public.usuarios, y la
-- persona entrando a un "tu cuenta no tiene un perfil asignado".
--
-- Si alguien vuelve a hacer que el trigger cree superadmins, este test
-- falla y hay que mirar de nuevo la escalada de privilegios.
-- ---------------------------------------------------------------------
do $$
begin
  insert into auth.users (id, instance_id, email, aud, role, invited_at,
    raw_user_meta_data)
  values ('aaaaaaaa-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000000', 'emp@t.com', 'authenticated',
    'authenticated', now(),
    '{"rol":"empleado","empresa_id":"11111111-1111-1111-1111-111111111111",
      "nombre_completo":"Emp"}'::jsonb);

  assert exists (select 1 from usuarios
                  where id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
    'una invitación normal con empresa sí tiene que crear el perfil';
end $$;

do $$
begin
  insert into auth.users (id, instance_id, email, aud, role, invited_at,
    raw_user_meta_data)
  values ('aaaaaaaa-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-000000000000', 'super@iseo.com', 'authenticated',
    'authenticated', now(),
    '{"rol":"superadmin","empresa_id":"","nombre_completo":"Pablo"}'::jsonb);

  assert not exists (select 1 from usuarios
                      where id = 'aaaaaaaa-0000-0000-0000-00000000000b'),
    'el trigger NO debe crear superadmins desde metadata (escalada de '
    'privilegios). El perfil lo crea /api/equipo-iseo con la clave de '
    'servicio, después de verificar que quien invita ya es superadmin.';
end $$;

do $$
begin
  -- Alta sin invitación (signup abierto): tampoco crea perfil.
  insert into auth.users (id, instance_id, email, aud, role, raw_user_meta_data)
  values ('aaaaaaaa-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-000000000000', 'suelto@t.com', 'authenticated',
    'authenticated',
    '{"rol":"admin_rrhh","empresa_id":"11111111-1111-1111-1111-111111111111"}'::jsonb);

  assert not exists (select 1 from usuarios
                      where id = 'aaaaaaaa-0000-0000-0000-00000000000c'),
    'un alta sin invited_at no puede auto-asignarse empresa ni rol';
end $$;

rollback;

\echo ''
\echo '  ✓ Todas las pruebas de SQL pasaron'
\echo ''
