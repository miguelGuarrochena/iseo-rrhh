-- ============================================================
-- F-01: el fichaje 1:N sólo funciona desde una terminal vinculada.
--
-- Por qué este archivo existe aparte de rpc.test.sql
-- --------------------------------------------------
-- F-01 no es un bug de una función: es una regla de autorización con
-- muchas formas de fallar (terminal ajena, desactivada, secreto malo,
-- rol equivocado, sin terminal). Agrupadas acá se leen como lo que son
-- —la matriz de acceso del kiosco— y cualquiera que toque
-- `fichar_con_rostro` ve de una qué tiene que seguir valiendo.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/terminal_vinculada.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------
-- Fixtures: dos empresas, para poder probar el cruce de tenant.
-- ---------------------------------------------------------------------
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('7e111111-1111-1111-1111-111111111111','Term-A','30-ta-1','A','ta@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('7e222222-2222-2222-2222-222222222222','Term-B','30-tb-1','B','tb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

-- Empleados con rostro enrolado. Los descriptores están lejos entre sí
-- para que el margen de 1:N no rechace por ambigüedad.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version, consentimiento_biometrico) values
 ('7e111111-1111-1111-1111-1111111111e1','7e111111-1111-1111-1111-111111111111',
  'Emp','A','ta-e1','2020-01-01','Op','Prod','planta','[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('7e222222-2222-2222-2222-2222222222e1','7e222222-2222-2222-2222-222222222222',
  'Emp','B','tb-e1','2020-01-01','Op','Prod','planta','[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('7e111111-1111-1111-1111-1111111111a1','00000000-0000-0000-0000-000000000000','adm-a@t.test','authenticated','authenticated'),
 ('7e111111-1111-1111-1111-1111111111b1','00000000-0000-0000-0000-000000000000','sup-a@t.test','authenticated','authenticated'),
 ('7e111111-1111-1111-1111-1111111111c1','00000000-0000-0000-0000-000000000000','emp-a@t.test','authenticated','authenticated'),
 ('7e222222-2222-2222-2222-2222222222a1','00000000-0000-0000-0000-000000000000','adm-b@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('7e111111-1111-1111-1111-1111111111a1','adm-a@t.test','admin_rrhh','Adm A','7e111111-1111-1111-1111-111111111111', null),
 ('7e111111-1111-1111-1111-1111111111b1','sup-a@t.test','supervisor','Sup A','7e111111-1111-1111-1111-111111111111', null),
 ('7e111111-1111-1111-1111-1111111111c1','emp-a@t.test','empleado','Emp A','7e111111-1111-1111-1111-111111111111','7e111111-1111-1111-1111-1111111111e1'),
 ('7e222222-2222-2222-2222-2222222222a1','adm-b@t.test','admin_rrhh','Adm B','7e222222-2222-2222-2222-222222222222', null);

create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Guardar los secretos que devuelve el RPC para usarlos abajo.
create temp table cred (etiqueta text primary key, id uuid, secreto text);

-- ---------------------------------------------------------------------
-- Alta de terminales
-- ---------------------------------------------------------------------

-- Un supervisor NO puede autorizar una terminal: es el permiso que
-- convierte un dispositivo en kiosco.
select pg_temp.como('7e111111-1111-1111-1111-1111111111b1');
do $$
declare ok boolean := false;
begin
  begin
    perform autorizar_terminal('Tablet trucha');
  exception when others then ok := true;
  end;
  assert ok, 'un supervisor no puede autorizar terminales';
end $$;

-- Un empleado, menos todavía.
select pg_temp.como('7e111111-1111-1111-1111-1111111111c1');
do $$
declare ok boolean := false;
begin
  begin
    perform autorizar_terminal('Mi celular');
  exception when others then ok := true;
  end;
  assert ok, 'un empleado no puede convertir su equipo en terminal';
end $$;

-- El admin de A autoriza dos: una que va a quedar activa y otra que se
-- va a desactivar.
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
insert into cred (etiqueta, id, secreto)
select 'A_ok', id, secreto from autorizar_terminal('Tablet planta A');
insert into cred (etiqueta, id, secreto)
select 'A_off', id, secreto from autorizar_terminal('Tablet depósito A');

-- El admin de B autoriza la suya.
select pg_temp.como('7e222222-2222-2222-2222-2222222222a1');
insert into cred (etiqueta, id, secreto)
select 'B_ok', id, secreto from autorizar_terminal('Tablet planta B');

-- Forma del secreto: 256 bits en hex, distinto en cada alta.
do $$
declare v_a text; v_b text;
begin
  select secreto into v_a from cred where etiqueta = 'A_ok';
  select secreto into v_b from cred where etiqueta = 'A_off';
  assert length(v_a) = 64, 'el secreto tiene que ser de 32 bytes (64 hex)';
  assert v_a ~ '^[0-9a-f]{64}$', 'el secreto tiene que ser hex';
  assert v_a <> v_b, 'dos terminales no pueden compartir secreto';
end $$;

-- CASO 12: el secreto no aparece en ninguna lectura normal.
do $$
declare ok boolean := false; v_hash text;
begin
  -- La columna existe, pero `authenticated` no tiene SELECT sobre ella.
  assert not exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='terminales'
       and column_name='secreto_hash'
       and grantee='authenticated' and privilege_type='SELECT'
  ), 'authenticated no puede leer terminales.secreto_hash';

  -- Ni escribirla: si no, un admin le fijaría un secreto conocido.
  assert not exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='terminales'
       and column_name='secreto_hash'
       and grantee='authenticated' and privilege_type='UPDATE'
  ), 'authenticated no puede escribir terminales.secreto_hash';

  -- Y el secreto en claro no quedó guardado en ningún lado.
  select secreto_hash into v_hash from terminales
   where id = (select id from cred where etiqueta='A_ok');
  assert v_hash is not null, 'la terminal tiene que tener hash';
  assert v_hash <> (select secreto from cred where etiqueta='A_ok'),
    'no se guarda el secreto en claro, se guarda su hash';
  assert v_hash = hash_secreto_terminal(
      (select id from cred where etiqueta='A_ok'),
      (select secreto from cred where etiqueta='A_ok')),
    'el hash guardado tiene que ser el del secreto entregado';

  -- Tampoco se filtró por la auditoría del alta.
  assert not exists (
    select 1 from auditoria_acciones a
     where a.entidad = 'terminal'
       and a.detalle::text like '%' || (select secreto from cred where etiqueta='A_ok') || '%'
  ), 'el secreto no puede aparecer en la auditoría';
  ok := true;
  assert ok;
end $$;

-- Desactivar la segunda terminal de A (camino que usa la pantalla).
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
update terminales set activa = false
 where id = (select id from cred where etiqueta = 'A_off');

-- ---------------------------------------------------------------------
-- Matriz de acceso al 1:N
--
-- `fichar` corre la llamada y devuelve 'OK' o el SQLSTATE, así cada
-- caso se lee en una línea.
-- ---------------------------------------------------------------------
create function pg_temp.fichar(
  p_desc jsonb, p_term uuid, p_secreto text
) returns text language plpgsql as $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    p_desc, null, null, null, null, p_term, p_secreto);
  return 'OK';
exception when others then
  return sqlstate;
end;
$$;

-- CASO 1: terminal válida + secreto válido + gestor autorizado → PASS.
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.01,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        (select secreto from cred where etiqueta='A_ok'));
  assert r = 'OK', 'terminal válida + gestor tiene que poder fichar, dio ' || r;
  assert exists (
    select 1 from fichajes
     where empleado_id = '7e111111-1111-1111-1111-1111111111e1'
       and metodo = 'facial_tablet'
  ), 'la marca del kiosco se registra como facial_tablet';
end $$;

-- CASO 2: secreto incorrecto → FAIL.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.011,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        repeat('a', 64));
  assert r = '42501', 'secreto incorrecto tiene que ser rechazado, dio ' || r;
end $$;

-- Y el secreto de OTRA terminal tampoco sirve: el hash está atado al id.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.012,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        (select secreto from cred where etiqueta='A_off'));
  assert r = '42501',
    'el secreto de otra terminal no puede validar, dio ' || r;
end $$;

-- CASO 3: terminal inexistente → FAIL.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.013,0.01,0.01]'::jsonb,
        '7e999999-9999-9999-9999-999999999999'::uuid,
        (select secreto from cred where etiqueta='A_ok'));
  assert r = '42501', 'una terminal inexistente tiene que fallar, dio ' || r;
end $$;

-- CASO 4: terminal desactivada → FAIL (con su secreto correcto).
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.014,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_off'),
        (select secreto from cred where etiqueta='A_off'));
  assert r = '42501', 'una terminal desactivada tiene que fallar, dio ' || r;
end $$;

-- CASO 5 y 11: terminal de OTRA empresa → FAIL, aunque el secreto sea
-- el correcto de esa terminal. Es el cruce de tenant.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.015,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='B_ok'),
        (select secreto from cred where etiqueta='B_ok'));
  assert r = '42501',
    'un gestor de A no puede usar la terminal de B, dio ' || r;
end $$;

-- Y al revés: el admin de B con la terminal de A tampoco.
select pg_temp.como('7e222222-2222-2222-2222-2222222222a1');
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.016,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        (select secreto from cred where etiqueta='A_ok'));
  assert r = '42501',
    'un gestor de B no puede usar la terminal de A, dio ' || r;
end $$;

-- Nadie de B fichó a nadie de A ni viceversa.
do $$
begin
  assert not exists (
    select 1 from fichajes
     where empleado_id = '7e222222-2222-2222-2222-2222222222e1'
  ), 'ninguna de las llamadas cruzadas puede haber registrado nada en B';
end $$;

-- CASO 6: usuario sin permisos de gestor → FAIL, incluso con la
-- credencial correcta de la tablet. Es la defensa contra el empleado
-- que copia el secreto del dispositivo compartido.
select pg_temp.como('7e111111-1111-1111-1111-1111111111c1');
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.017,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        (select secreto from cred where etiqueta='A_ok'));
  assert r = '42501',
    'un empleado con el secreto de la tablet igual no puede usar 1:N, dio ' || r;
end $$;

-- CASO 7: p_terminal_id manipulado (id de A_ok con secreto inventado, y
-- un uuid cualquiera con el secreto real) → FAIL en los dos sentidos.
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.018,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'), 'no-soy-el-secreto');
  assert r = '42501', 'id real + secreto falso tiene que fallar, dio ' || r;

  r := pg_temp.fichar('[0.019,0.01,0.01]'::jsonb,
        gen_random_uuid(), (select secreto from cred where etiqueta='A_ok'));
  assert r = '42501', 'id falso + secreto real tiene que fallar, dio ' || r;
end $$;

-- CASO 8: 1:N sin terminal → FAIL. Es exactamente el agujero F-01:
-- antes de esta migración, esta llamada fichaba.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.02,0.01,0.01]'::jsonb, null, null);
  assert r = '42501', '1:N sin terminal tiene que fallar, dio ' || r;
end $$;

-- Sólo el id, sin secreto.
do $$
declare r text;
begin
  r := pg_temp.fichar('[0.021,0.01,0.01]'::jsonb,
        (select id from cred where etiqueta='A_ok'), null);
  assert r = '42501', '1:N con id pero sin secreto tiene que fallar, dio ' || r;
end $$;

-- Ninguno de los rechazos dejó marcas: seis intentos fallidos y sigue
-- estando sólo la del CASO 1.
do $$
declare v_n int;
begin
  select count(*) into v_n from fichajes
   where empleado_id = '7e111111-1111-1111-1111-1111111111e1';
  assert v_n = 1,
    'los rechazos no pueden dejar fichajes; hay ' || v_n;
end $$;

-- CASO 9: el flujo 1:1 del empleado sigue funcionando sin terminal.
select pg_temp.como('7e111111-1111-1111-1111-1111111111c1');
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.005,0.005,0.005]'::jsonb, '7e111111-1111-1111-1111-1111111111e1');
  assert v_f.empleado_id = '7e111111-1111-1111-1111-1111111111e1',
    'el 1:1 no puede haberse roto: no usa terminal';
  assert v_f.tipo = 'egreso', 'alterna sobre la marca del kiosco';
end $$;

-- CASO 10 y 13: el gestor puede seguir usando su terminal, y repetir
-- una llamada válida se rige sólo por las reglas de fichaje que ya
-- existían — el antirreplay del descriptor y la alternancia.
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
do $$
declare r text; v_f fichajes;
begin
  -- Descriptor nuevo → entra, y alterna sobre la marca anterior.
  select * into v_f from fichar_con_rostro(
    '[0.006,0.005,0.005]'::jsonb, null, null, null, null,
    (select id from cred where etiqueta='A_ok'),
    (select secreto from cred where etiqueta='A_ok'));
  assert v_f.tipo = 'ingreso', 'la terminal válida sigue alternando bien';

  -- Mismo descriptor otra vez → lo corta el antirreplay (FIC-002), no
  -- la terminal: la credencial es válida en las dos llamadas.
  r := pg_temp.fichar('[0.006,0.005,0.005]'::jsonb,
        (select id from cred where etiqueta='A_ok'),
        (select secreto from cred where etiqueta='A_ok'));
  assert r = '23505',
    'repetir el descriptor lo corta el antirreplay, no la terminal; dio ' || r;
end $$;

-- ---------------------------------------------------------------------
-- La versión vieja de 6 argumentos no puede seguir existiendo: PostgREST
-- resuelve por las claves del JSON, así que una sobrecarga sin
-- p_terminal_id sería el agujero F-01 intacto por otra puerta.
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fichar_con_rostro';
  assert v_n = 1,
    'tiene que haber UNA sola fichar_con_rostro; hay ' || v_n;

  assert (
    select pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fichar_con_rostro'
    -- Comodín al final: desde la migración 77 la firma sigue con
    -- `p_version smallint`. Lo que este caso cuida es que la terminal
    -- siga siendo obligatoria en la única firma existente, no el largo
    -- exacto de la lista de parámetros.
  ) like '%p_terminal_id uuid, p_terminal_secreto text%',
    'la única firma tiene que ser la que exige terminal';
end $$;

-- ---------------------------------------------------------------------
-- Lo mismo, pero asumiendo de verdad el rol `authenticated`.
--
-- Todo lo de arriba corre como `postgres`, que es superusuario y saltea
-- los GRANT: un test que sólo consulte `information_schema` verifica lo
-- que dice el catálogo, no lo que pasa cuando entra una petición real.
-- Esto es el camino del atacante — PostgREST cambia al rol
-- `authenticated` y desde ahí manda SQL.
-- ---------------------------------------------------------------------
select pg_temp.como('7e111111-1111-1111-1111-1111111111a1');
do $$
declare
  v_t uuid;
  v_s text;
  v_bloqueado boolean;
begin
  -- Los valores se leen ANTES de bajar de rol: si no, un fallo al leer
  -- la tabla temporal se confundiría con el rechazo que se quiere medir.
  select id, secreto into v_t, v_s from cred where etiqueta = 'A_ok';

  execute 'set local role authenticated';

  -- `select *` sobre terminales ya no funciona: hay una columna que este
  -- rol no puede leer. Por eso el cliente pide columnas explícitas.
  v_bloqueado := false;
  begin perform * from terminales;
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'select * sobre terminales tiene que estar bloqueado';

  -- Las columnas que sí necesita la pantalla siguen disponibles.
  v_bloqueado := false;
  begin perform id, nombre, activa from terminales;
  exception when others then v_bloqueado := true; end;
  assert not v_bloqueado, 'las columnas no sensibles tienen que poder leerse';

  -- El hash, no.
  v_bloqueado := false;
  begin perform secreto_hash from terminales;
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'authenticated no puede leer el hash del secreto';

  -- Ni crear terminales por fuera del RPC: si pudiera, existiría una
  -- terminal sin credencial y sin auditoría de alta.
  v_bloqueado := false;
  begin
    insert into terminales (empresa_id, nombre)
    values ('7e111111-1111-1111-1111-111111111111', 'Trucha');
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'no se pueden insertar terminales directamente';

  -- Ni fijarle a una terminal un secreto elegido por el atacante, que
  -- sería la forma obvia de saltear todo lo demás.
  v_bloqueado := false;
  begin update terminales set secreto_hash = 'elegido-por-mi';
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'no se puede escribir secreto_hash';

  -- Y las dos funciones de credencial no se pueden invocar: una diría
  -- si un secreto es válido (oráculo), la otra permitiría fabricar el
  -- hash de un secreto elegido.
  v_bloqueado := false;
  begin perform terminal_habilitada(v_t, v_s, '7e111111-1111-1111-1111-111111111111');
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'terminal_habilitada no puede llamarse desde authenticated';

  v_bloqueado := false;
  begin perform hash_secreto_terminal(v_t, v_s);
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'hash_secreto_terminal no puede llamarse desde authenticated';

  execute 'reset role';
end $$;

-- Y las funciones de credencial no están expuestas por PostgREST.
do $$
begin
  assert not has_function_privilege('authenticated',
    'public.terminal_habilitada(uuid, text, uuid)', 'EXECUTE'),
    'terminal_habilitada no se expone: sería un oráculo de secretos';
  assert not has_function_privilege('authenticated',
    'public.hash_secreto_terminal(uuid, text)', 'EXECUTE'),
    'hash_secreto_terminal no se expone';
  assert has_function_privilege('authenticated',
    'public.autorizar_terminal(text)', 'EXECUTE'),
    'autorizar_terminal sí se expone (la autorización la hace adentro)';
end $$;

rollback;

\echo ''
\echo '  ✓ F-01: terminal vinculada — todos los casos pasaron'
\echo ''
