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
insert into fichajes (empresa_id, empleado_id, tipo, metodo)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'ingreso', 'manual');
delete from fichajes where empresa_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- fichar_con_rostro
--
-- El caso que el CI no tenía: esto es lo que falla si una variable no
-- coincide con el tipo de su columna.
-- ---------------------------------------------------------------------
set request.jwt.claims =
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

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

  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, 'facial_tablet', null, -34.6, -58.4, null);
  assert v_f.tipo = 'egreso', 'la segunda marca del día alterna a egreso';

  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, 'facial_tablet', null, -33.6, -58.4, null);
  assert v_f.fuera_de_zona = true, 'a 111 km tiene que dar fuera de zona';
end $$;

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
    perform fichar_con_rostro('[0.01,0.01,0.01]'::jsonb, 'facial_tablet',
      null, -34.6, -58.4, null);
  exception when others then v_fallo := true;
  end;
  assert v_fallo,
    'con dos rostros demasiado parecidos tiene que negarse a elegir';
end $$;

-- Con el id explícito (1:1) el margen no aplica.
do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro('[0.01,0.01,0.01]'::jsonb, 'celular',
    '22222222-2222-2222-2222-222222222222', -34.6, -58.4, null);
  assert v_f.empleado_id = '22222222-2222-2222-2222-222222222222',
    'en 1:1 se verifica contra la persona indicada';
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

rollback;

\echo ''
\echo '  ✓ Todas las pruebas de SQL pasaron'
\echo ''
