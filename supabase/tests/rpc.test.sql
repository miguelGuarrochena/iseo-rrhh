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
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values ('11111111-1111-1111-1111-111111111111', 'Test SA', '30-1-9', 'A', 'a@a.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"],
    "geocerca":{"lat":-34.6,"lng":-58.4,"radioM":100}}'::jsonb);

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
update empleados
   set descriptor_facial = '[0,0,0]'::jsonb,
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

-- Supervisor fichando por sí mismo: no fuerza manual.
set request.jwt.claims =
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
do $$
declare v_f fichajes; v_aud int;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, metodo, registrado_por)
  values ('11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',
          'ingreso', 'celular', 'FRAUDE')
  returning * into v_f;
  assert v_f.metodo = 'celular', 'self-service del supervisor conserva el metodo';
  assert v_f.registrado_por is null, 'self-service limpia registrado_por del cliente';
  assert v_f.registrado_por_id is null;
  select count(*) into v_aud from auditoria_acciones
   where entidad = 'fichaje' and entidad_id = v_f.id::text;
  assert v_aud = 0, 'self-service no genera auditoría de carga manual';
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
set request.jwt.claims =
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, 'facial_tablet', null, -34.6, -58.4, null);
  assert v_f.tipo = 'ingreso', 'la primera marca del día es un ingreso';
  assert v_f.empleado_id = '22222222-2222-2222-2222-222222222222',
    'tiene que reconocer a la persona correcta';
  assert v_f.fuera_de_zona = false, 'en el centro de la geocerca está dentro';
  assert round(v_f.confianza::numeric, 2) = 0.97,
    'la confianza la calcula el servidor a partir de la distancia real';
  assert v_f.metodo = 'facial_tablet',
    'el camino RPC no se convierte en manual aunque el JWT sea de otro rol';

  -- Descriptor distinto (no replay) → egreso.
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.011]'::jsonb, 'facial_tablet', null, -34.6, -58.4, null);
  assert v_f.tipo = 'egreso', 'la segunda marca del día alterna a egreso';

  select * into v_f from fichar_con_rostro(
    '[0.01,0.011,0.01]'::jsonb, 'facial_tablet', null, -33.6, -58.4, null);
  assert v_f.fuera_de_zona = true, 'a 111 km tiene que dar fuera de zona';
end $$;

-- FIC-002 antirreplay: el mismo descriptor exacto se rechaza.
do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro(
      '[0.01,0.01,0.01]'::jsonb, 'facial_tablet', null, -34.6, -58.4, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'reutilizar el mismo descriptor exacto tiene que fallar';
end $$;

-- FIC-009: p_tipo del cliente se ignora en self-service.
-- Última marca es ingreso (la tercera del bloque anterior) → debe ser egreso
-- aunque mande p_tipo='ingreso'.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.011,0.01,0.01]'::jsonb, 'celular',
    '22222222-2222-2222-2222-222222222222', -34.6, -58.4, 'ingreso');
  assert v_f.tipo = 'egreso',
    'self-service ignora p_tipo=ingreso cuando ya hay un ingreso abierto';
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
    perform fichar_con_rostro('[9,9,9]'::jsonb, 'facial_tablet', null, null, null, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'un rostro que no coincide tiene que ser rechazado';
end $$;

do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro('[]'::jsonb, 'facial_tablet', null, null, null, null);
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
      '[0.01,0.01,0.012]'::jsonb, 'celular',
      '55555555-5555-5555-5555-555555555555', -34.6, -58.4, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo, 'empleado A no puede usar p_empleado_id de B';
end $$;

-- Dos rostros casi idénticos en 1:N: mejor no fichar que fichar al que no es.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, descriptor_facial, consentimiento_biometrico)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
  'Beto', 'Gomez', '222', '2020-01-01', 'Op', 'Prod', '[0.02,0.02,0.02]'::jsonb,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

do $$
declare v_fallo boolean := false;
begin
  begin
    perform fichar_con_rostro('[0.015,0.015,0.015]'::jsonb, 'facial_tablet',
      null, -34.6, -58.4, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo,
    'con dos rostros demasiado parecidos tiene que negarse a elegir';
end $$;

-- 1:1 del titular: el margen no aplica.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro('[0.012,0.01,0.01]'::jsonb, 'celular',
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
  select * into v_f from fichar_con_rostro(
    '[0.01,0.012,0.01]'::jsonb, 'facial_tablet', null, -34.6, -58.4, null);
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
