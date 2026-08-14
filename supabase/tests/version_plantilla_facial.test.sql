-- ============================================================
-- Aislamiento de versiones de plantilla facial.
--
-- Qué protege
-- -----------
-- El rediseño del pipeline cambió cómo se calcula el descriptor: ahora
-- el recorte que alimenta al modelo está alineado y antes no. Un
-- descriptor viejo y uno nuevo **de la misma persona** pertenecen a
-- distribuciones distintas, así que compararlos no da "un poco peor":
-- da un número sin sentido, y los dos desenlaces posibles son malos —
-- o la persona no ficha nunca, o ficha otra.
--
-- El filtro vive en `fichar_con_rostro` porque el match vive ahí. Un
-- marcador de versión que existiera sólo en el cliente no impediría
-- nada: el servidor seguiría comparando lo que no debe.
--
-- Estos casos son la prueba de que el filtro **realmente** aísla, no de
-- que exista la columna.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/version_plantilla_facial.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('be000000-0000-0000-0000-000000000001','Ver-A','30-va-1','A','va@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

-- Dos personas. La descriptora de cada una es deliberadamente distinta
-- entre sí para que el margen de 1:N no rechace por ambigüedad, y lo que
-- se mueva en cada caso sea sólo la versión.
--
-- `ana` queda en la versión vieja (1) y `beto` en la nueva (2): es
-- exactamente el estado intermedio de un despliegue real, con parte de
-- la plantilla ya re-enrolada y parte no.
insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version,
  consentimiento_biometrico) values
 ('be000000-0000-0000-0000-0000000000a1','be000000-0000-0000-0000-000000000001',
  'Ana','Vieja','va-e1','2020-01-01','Op','Prod','planta',
  '[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-15","otorgadoPor":"u1"}'::jsonb),
 ('be000000-0000-0000-0000-0000000000b1','be000000-0000-0000-0000-000000000001',
  'Beto','Nuevo','va-e2','2020-01-01','Op','Prod','planta',
  '[9,9,9]'::jsonb, 2,
  '{"aceptado":true,"fecha":"2026-08-15","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('be000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','adm-v@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('be000000-0000-0000-0000-0000000000f1','adm-v@t.test','admin_rrhh','Adm V','be000000-0000-0000-0000-000000000001', null);

create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

select pg_temp.como('be000000-0000-0000-0000-0000000000f1');

create temp table cred (id uuid, secreto text);
insert into cred select id, secreto from autorizar_terminal('Tablet versiones');

-- ---------------------------------------------------------------------
-- 1. Una plantilla nueva NO alcanza a una persona en versión vieja
-- ---------------------------------------------------------------------
-- El caso que rompe un despliegue mal hecho: la terminal ya actualizada
-- se para frente a alguien que todavía no se re-enroló. Tiene que
-- rebotar, no encontrar un match dudoso.
do $$
declare ok boolean := false; v_id uuid; v_sec text;
begin
  select id, secreto into v_id, v_sec from cred;
  begin
    perform fichar_con_rostro(
      '[0,0,0]'::jsonb, null, null, null, null, v_id, v_sec, 2::smallint);
  exception when no_data_found then ok := true;
  end;
  assert ok,
    'Una plantilla v2 identica a la de Ana (v1) NO debe poder ficharla';
end $$;

-- ---------------------------------------------------------------------
-- 2. Una plantilla vieja NO alcanza a una persona ya re-enrolada
-- ---------------------------------------------------------------------
-- El caso simétrico: una pestaña con el JavaScript viejo en cache,
-- después de que RRHH terminó de re-enrolar. También tiene que rebotar.
do $$
declare ok boolean := false; v_id uuid; v_sec text;
begin
  select id, secreto into v_id, v_sec from cred;
  begin
    perform fichar_con_rostro(
      '[9,9,9]'::jsonb, null, null, null, null, v_id, v_sec, 1::smallint);
  exception when no_data_found then ok := true;
  end;
  assert ok,
    'Una plantilla v1 identica a la de Beto (v2) NO debe poder ficharlo';
end $$;

-- ---------------------------------------------------------------------
-- 3. Con la versión correcta sí ficha
-- ---------------------------------------------------------------------
-- Control positivo: sin esto, los dos casos de arriba pasarían aunque el
-- RPC estuviera roto y no fichara nunca a nadie.
do $$
declare v_id uuid; v_sec text; v_emp uuid;
begin
  select id, secreto into v_id, v_sec from cred;
  select empleado_id into v_emp from fichar_con_rostro(
    '[9,9,9]'::jsonb, null, null, null, null, v_id, v_sec, 2::smallint);
  assert v_emp = 'be000000-0000-0000-0000-0000000000b1',
    'Con la version correcta tiene que fichar a Beto';
end $$;

-- ---------------------------------------------------------------------
-- 4. Sin `p_version` se asume 1
-- ---------------------------------------------------------------------
-- Es el default deliberado: durante el despliegue puede quedar una
-- pestaña vieja que llama sin el parámetro, y tiene que conservar su
-- comportamiento de siempre (comparar contra plantillas v1) en vez de
-- caer sobre las nuevas.
do $$
declare v_id uuid; v_sec text; v_emp uuid;
begin
  select id, secreto into v_id, v_sec from cred;
  select empleado_id into v_emp from fichar_con_rostro(
    '[0,0,0]'::jsonb, null, null, null, null, v_id, v_sec);
  assert v_emp = 'be000000-0000-0000-0000-0000000000a1',
    'Sin p_version debe comparar contra la version 1';
end $$;

-- ---------------------------------------------------------------------
-- 5. La coherencia descriptor/versión se exige en la base
-- ---------------------------------------------------------------------
-- Un descriptor sin versión es un descriptor que después nadie sabe con
-- qué comparar. No puede depender de que el cliente se acuerde.
do $$
declare ok boolean := false;
begin
  begin
    update empleados set descriptor_version = null
     where id = 'be000000-0000-0000-0000-0000000000b1';
  exception when check_violation then ok := true;
  end;
  assert ok, 'No debe poder quedar un descriptor sin version';
end $$;

-- ---------------------------------------------------------------------
-- 6. `descriptor_facial` sigue sin salir por la vista (F-02)
-- ---------------------------------------------------------------------
-- La migración toca `empleados_lectura` para agregar la versión. Esto
-- verifica que al hacerlo no se haya colado el descriptor.
do $$
declare v_cols text[];
begin
  select array_agg(column_name::text) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'empleados_lectura';
  assert not ('descriptor_facial' = any(v_cols)),
    'empleados_lectura NO debe exponer descriptor_facial (F-02)';
  assert 'descriptor_version' = any(v_cols),
    'empleados_lectura debe exponer descriptor_version para el seguimiento';
  assert 'tiene_rostro' = any(v_cols),
    'empleados_lectura debe seguir exponiendo tiene_rostro';
end $$;

-- ---------------------------------------------------------------------
-- 7. El retiro de plantillas nunca borra la versión vigente
-- ---------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    perform retirar_plantillas_faciales(2::smallint, 2::smallint);
  exception when invalid_parameter_value then ok := true;
  end;
  assert ok, 'No debe poder retirarse la version con la que se ficha';
end $$;

do $$
declare v_borradas integer;
begin
  v_borradas := retirar_plantillas_faciales(1::smallint, 2::smallint);
  assert v_borradas = 1,
    format('Debia retirar 1 plantilla v1, retiro %s', v_borradas);
  assert (select descriptor_facial is null and descriptor_version is null
            from empleados where id = 'be000000-0000-0000-0000-0000000000a1'),
    'La plantilla v1 tiene que quedar limpia';
  assert (select descriptor_facial is not null
            from empleados where id = 'be000000-0000-0000-0000-0000000000b1'),
    'La plantilla vigente NO se debe tocar';
end $$;

select 'version_plantilla_facial: OK' as resultado;

rollback;
