-- ============================================================
-- El superadmin puede autorizar terminales; nadie puede saltar de
-- empresa por un parámetro.
--
-- Qué protege
-- -----------
-- `autorizar_terminal` exigía `auth_rol() = 'admin_rrhh'` y una empresa
-- no nula. Un superadmin no cumple ninguna de las dos: su rol es
-- 'superadmin' y su `empresa_id` es NULL, porque no está atado a
-- ninguna empresa. El botón aparecía —el cliente mapea superadmin +
-- empresa vista → admin_rrhh— y el servidor rechazaba.
--
-- El arreglo agrega `p_empresa_id`, y acá se fija lo que importa: que
-- **sólo** el superadmin pueda usarlo. Si un admin_rrhh pudiera, un uuid
-- en el request le crearía una terminal en otra empresa — un salto de
-- tenant por un campo del cuerpo.
--
-- Cómo se corre
-- -------------
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/superadmin_terminales.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('5a000000-0000-0000-0000-00000000000a','Super-A','30-sa-1','A','sa@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
 ('5a000000-0000-0000-0000-00000000000b','Super-B','30-sb-1','B','sb@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('5a000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','super@t.test','authenticated','authenticated'),
 ('5a000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','rrhh-a@t.test','authenticated','authenticated'),
 ('5a000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-000000000000','sup-a@t.test','authenticated','authenticated');

-- El superadmin va SIN empresa: es exactamente la condición que rompía.
insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('5a000000-0000-0000-0000-0000000000f1','super@t.test','superadmin','Super', null, null),
 ('5a000000-0000-0000-0000-0000000000f2','rrhh-a@t.test','admin_rrhh','RRHH A','5a000000-0000-0000-0000-00000000000a', null),
 ('5a000000-0000-0000-0000-0000000000f3','sup-a@t.test','supervisor','Sup A','5a000000-0000-0000-0000-00000000000a', null);

-- Rostro enrolado en A: hace falta para el 1:N del superadmin (F-06).
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version, consentimiento_biometrico) values
 ('5a000000-0000-0000-0000-0000000000e1','5a000000-0000-0000-0000-00000000000a',
  'Emp','A','sa-e1','2020-01-01','Op','Prod','planta','[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb),
 ('5a000000-0000-0000-0000-0000000000e2','5a000000-0000-0000-0000-00000000000b',
  'Emp','B','sb-e1','2020-01-01','Op','Prod','planta','[1,1,1]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------
-- 1. El superadmin autoriza una terminal indicando la empresa
-- ---------------------------------------------------------------------
select pg_temp.como('5a000000-0000-0000-0000-0000000000f1');
do $$
declare v_id uuid; v_sec text; v_empresa uuid;
begin
  select id, secreto into v_id, v_sec
    from autorizar_terminal('Tablet del super', '5a000000-0000-0000-0000-00000000000a');

  assert v_id is not null, 'el superadmin tiene que poder autorizar';
  assert v_sec is not null and length(v_sec) = 64,
    'tiene que devolver un secreto de 256 bits en hex';

  select empresa_id into v_empresa from terminales where id = v_id;
  assert v_empresa = '5a000000-0000-0000-0000-00000000000a',
    'la terminal tiene que quedar en la empresa indicada';

  -- Y la credencial tiene que servir de verdad para fichar.
  assert terminal_habilitada(v_id, v_sec, '5a000000-0000-0000-0000-00000000000a'),
    'la terminal recien creada tiene que estar habilitada';
end $$;

-- ---------------------------------------------------------------------
-- 2. Sin empresa, el superadmin recibe un mensaje que dice qué hacer
-- ---------------------------------------------------------------------
-- No se le puede adivinar la empresa: la "empresa vista" vive en el
-- navegador. Mejor un error claro que una terminal huérfana.
do $$
declare ok boolean := false;
begin
  begin
    perform autorizar_terminal('Tablet sin empresa');
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, 'sin empresa tiene que pedirla, no crear una terminal colgada';
end $$;

-- ---------------------------------------------------------------------
-- 3. Una empresa inventada se rechaza
-- ---------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    perform autorizar_terminal('Tablet fantasma',
      '5a000000-0000-0000-0000-0000000000ff');
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, 'una empresa que no existe tiene que rechazarse';
end $$;

-- ---------------------------------------------------------------------
-- 4. admin_rrhh sigue pudiendo, en SU empresa
-- ---------------------------------------------------------------------
select pg_temp.como('5a000000-0000-0000-0000-0000000000f2');
do $$
declare v_id uuid; v_empresa uuid;
begin
  select id into v_id from autorizar_terminal('Tablet de RRHH');
  select empresa_id into v_empresa from terminales where id = v_id;
  assert v_empresa = '5a000000-0000-0000-0000-00000000000a',
    'admin_rrhh crea en su propia empresa';
end $$;

-- ---------------------------------------------------------------------
-- 5. Un admin_rrhh NO puede crear una terminal en otra empresa
-- ---------------------------------------------------------------------
-- El caso que hace que el parámetro nuevo no sea un agujero: se ignora
-- para todo el que no sea superadmin.
do $$
declare v_id uuid; v_empresa uuid;
begin
  select id into v_id
    from autorizar_terminal('Intento cruzado', '5a000000-0000-0000-0000-00000000000b');
  select empresa_id into v_empresa from terminales where id = v_id;
  assert v_empresa = '5a000000-0000-0000-0000-00000000000a',
    format('el p_empresa_id de un admin_rrhh debe ignorarse, quedo en %s', v_empresa);
end $$;

-- ---------------------------------------------------------------------
-- 6. Un supervisor sigue sin poder
-- ---------------------------------------------------------------------
-- Autorizar un dispositivo es el permiso que convierte un equipo en
-- kiosco. No se afloja de paso.
select pg_temp.como('5a000000-0000-0000-0000-0000000000f3');
do $$
declare ok boolean := false;
begin
  begin
    perform autorizar_terminal('Tablet trucha');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'un supervisor no puede autorizar terminales';

  ok := false;
  begin
    perform autorizar_terminal('Tablet trucha', '5a000000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ni pasando la empresa a mano';
end $$;

-- ---------------------------------------------------------------------
-- 7. `retirar_plantillas_faciales` con la misma regla
-- ---------------------------------------------------------------------
select pg_temp.como('5a000000-0000-0000-0000-0000000000f1');
do $$
declare ok boolean := false;
begin
  -- Sin empresa, el superadmin la tiene que pedir.
  begin
    perform retirar_plantillas_faciales(1::smallint);
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, 'el superadmin tiene que indicar la empresa';

  -- Con empresa, funciona aunque no haya nada que retirar.
  --
  -- Se pide una versión que ninguna plantilla usa, y no la 1, porque la
  -- 1 sí existe: es la del rostro enrolado en el fixture, que el caso 9
  -- necesita para el 1:N del superadmin. Pedir la 1 acá retiraba esa
  -- plantilla —devolviendo 1, no 0— y dejaba el caso 9 sin nadie a
  -- quien reconocer.
  assert retirar_plantillas_faciales(
    3::smallint, 2::smallint, '5a000000-0000-0000-0000-00000000000a') = 0,
    'una versión sin plantillas tiene que retirar 0, no fallar';

  -- Y sigue sin poder retirar la versión vigente.
  ok := false;
  begin
    perform retirar_plantillas_faciales(
      2::smallint, 2::smallint, '5a000000-0000-0000-0000-00000000000a');
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, 'no se puede retirar la version con la que se ficha';
end $$;

-- ---------------------------------------------------------------------
-- 8. Una sola firma de cada función
-- ---------------------------------------------------------------------
-- Agregar parámetros con `create or replace` deja la firma vieja viva
-- como sobrecarga, y PostgREST resuelve por las claves del JSON:
-- quedaría abierto el camino anterior.
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'autorizar_terminal';
  assert v_n = 1, format('autorizar_terminal tiene %s firmas', v_n);

  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'retirar_plantillas_faciales';
  assert v_n = 1, format('retirar_plantillas_faciales tiene %s firmas', v_n);
end $$;

-- ---------------------------------------------------------------------
-- 9. F-06: el superadmin ficha en el kiosco con la terminal, no con JWT
-- ---------------------------------------------------------------------
-- `auth_empresa()` le da NULL. Antes el RPC cortaba con "Sin empresa
-- activa" aunque la tablet estuviera autorizada. Ahora el tenant sale
-- de la terminal, y sólo si el secreto coincide.
select pg_temp.como('5a000000-0000-0000-0000-0000000000f1');
do $$
declare
  v_term uuid;
  v_sec text;
  v_f fichajes;
  ok boolean := false;
begin
  select id, secreto into v_term, v_sec
    from autorizar_terminal('Tablet kiosco super', '5a000000-0000-0000-0000-00000000000a');

  -- Sin terminal sigue sin poder: F-01 no se afloja de paso.
  begin
    perform fichar_con_rostro('[0.01,0.01,0.01]'::jsonb);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'el superadmin 1:N sin terminal tiene que fallar';

  -- Con la credencial de A, ficha al enrolado de A.
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, null, null, null, null, v_term, v_sec);
  assert v_f.empleado_id = '5a000000-0000-0000-0000-0000000000e1',
    'tiene que fichar al enrolado de la empresa de la terminal';
  assert v_f.empresa_id = '5a000000-0000-0000-0000-00000000000a',
    'la marca queda en la empresa de la terminal, no en un tenant inventado';
  assert v_f.metodo = 'facial_tablet',
    'el 1:N del superadmin también se registra como facial_tablet';

  -- Secreto malo: mismo mensaje que una tablet desautorizada, no un
  -- oráculo de "esa terminal existe pero el hash no calza".
  ok := false;
  begin
    perform fichar_con_rostro(
      '[0.011,0.01,0.01]'::jsonb, null, null, null, null, v_term, repeat('a', 64));
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'un secreto incorrecto tiene que rechazarse';

  -- Y no puede haber fichado a nadie de B: el secreto de A no abre B.
  assert not exists (
    select 1 from fichajes
     where empleado_id = '5a000000-0000-0000-0000-0000000000e2'
  ), 'el kiosco del superadmin no puede marcar en otra empresa';
end $$;

select 'superadmin_terminales: OK' as resultado;

rollback;
