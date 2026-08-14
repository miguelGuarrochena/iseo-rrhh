-- ============================================================
-- El fichaje no guarda fotografías, venga por donde venga.
--
-- Por qué este archivo existe
-- ---------------------------
-- Cortar el cableado de la aplicación no alcanza. La política de INSERT
-- de `fichajes` deja que un empleado inserte su propia marca y su
-- `with check` no dice nada de `foto_url`, así que un cliente modificado
-- —o un `curl` con un token válido— podía escribir ahí una `data:` URL
-- con una cara adentro.
--
-- Estos casos prueban que el trigger cierra **todos** los caminos, no
-- sólo el de la app. Es la diferencia entre "no guardamos fotos" como
-- convención y como control.
--
-- Cómo se corre
-- -------------
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/fichaje_sin_fotografia.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('fa000000-0000-0000-0000-000000000001','SinFoto','30-sf-1','A','sf@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version,
  consentimiento_biometrico) values
 ('fa000000-0000-0000-0000-0000000000e1','fa000000-0000-0000-0000-000000000001',
  'Sin','Foto','sf-e1','2020-01-01','Op','Prod','planta',
  '[0,0,0]'::jsonb, 2,
  '{"aceptado":true,"fecha":"2026-08-15","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('fa000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','sf-adm@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('fa000000-0000-0000-0000-0000000000f1','sf-adm@t.test','admin_rrhh','Adm SF','fa000000-0000-0000-0000-000000000001', null);

-- ---------------------------------------------------------------------
-- 1. INSERT directo con foto: la columna queda en null
-- ---------------------------------------------------------------------
-- Es el camino de PostgREST, el que la aplicación no controla.
do $$
declare v_foto text;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, metodo, foto_url)
  values ('fa000000-0000-0000-0000-000000000001',
          'fa000000-0000-0000-0000-0000000000e1',
          'ingreso', 'celular',
          'data:image/jpeg;base64,UNROSTRO')
  returning foto_url into v_foto;

  assert v_foto is null,
    format('El INSERT no debia guardar la foto, guardo: %s', v_foto);
end $$;

-- ---------------------------------------------------------------------
-- 2. Por UPDATE ni siquiera se llega: los fichajes no se editan
-- ---------------------------------------------------------------------
-- Defensa en profundidad, y esta capa es anterior y más fuerte que el
-- trigger nuevo: `proteger_update_fichaje` rechaza **cualquier** UPDATE
-- sobre la tabla, no sólo el de la foto. La única corrección posible es
-- anular la marca, que deja la fila intacta para la auditoría (F-12).
--
-- Se afirma el rechazo y no "la foto quedó en null" porque es lo que de
-- verdad pasa: si algún día se aflojara esa protección, este caso lo
-- avisaría en vez de seguir pasando por el motivo equivocado.
do $$
declare v_id uuid; ok boolean := false;
begin
  select id into v_id from fichajes
   where empleado_id = 'fa000000-0000-0000-0000-0000000000e1' limit 1;

  begin
    update fichajes set foto_url = 'https://algun-bucket/rostro.jpg'
     where id = v_id;
  exception when others then
    ok := true;
  end;

  assert ok, 'un UPDATE sobre fichajes tiene que ser rechazado';
  assert (select foto_url is null from fichajes where id = v_id),
    'la foto no debe haber quedado guardada';
end $$;

-- ---------------------------------------------------------------------
-- 3. El camino del RPC tampoco escribe foto
-- ---------------------------------------------------------------------
-- `fichar_con_rostro` no inserta `foto_url`, pero conviene fijarlo: es
-- el camino por el que pasa el 100 % del fichaje facial.
select set_config('request.jwt.claims',
  '{"sub":"fa000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

create temp table cred as
  select id, secreto from autorizar_terminal('Tablet sin foto');

do $$
declare v_id uuid; v_sec text; v_fichaje fichajes;
begin
  select id, secreto into v_id, v_sec from cred;
  select * into v_fichaje from fichar_con_rostro(
    '[0,0,0]'::jsonb, null, null, null, null, v_id, v_sec, 2::smallint);

  assert v_fichaje.foto_url is null,
    'fichar_con_rostro no debe guardar ninguna foto';
  -- Control de cordura: que efectivamente haya fichado.
  assert v_fichaje.empleado_id = 'fa000000-0000-0000-0000-0000000000e1',
    'el RPC tenia que fichar a la persona enrolada';
end $$;

-- ---------------------------------------------------------------------
-- 4. El trigger existe y cubre INSERT y UPDATE
-- ---------------------------------------------------------------------
-- Sin esto, alguien podría borrar el trigger y los casos de arriba
-- seguirían pasando si además se quitara la columna del insert.
do $$
declare v_def text;
begin
  select pg_get_triggerdef(oid) into v_def
    from pg_trigger
   where tgrelid = 'public.fichajes'::regclass
     and tgname = 'trg_fichaje_sin_fotografia';

  assert v_def is not null, 'falta el trigger trg_fichaje_sin_fotografia';
  assert v_def like '%BEFORE INSERT OR UPDATE%',
    format('el trigger tiene que cubrir INSERT y UPDATE, es: %s', v_def);
end $$;

-- ---------------------------------------------------------------------
-- 5. No se rompió nada de lo que sí tiene que guardarse
-- ---------------------------------------------------------------------
-- El trigger toca una sola columna. Este caso está para que, si alguien
-- lo amplía de más, se entere acá.
do $$
declare v_fichaje fichajes;
begin
  select * into v_fichaje from fichajes
   where empleado_id = 'fa000000-0000-0000-0000-0000000000e1'
   order by ts desc limit 1;

  assert v_fichaje.confianza is not null, 'la confianza tiene que seguir guardandose';
  assert v_fichaje.metodo = 'facial_tablet', 'el metodo tiene que seguir derivandose';
  assert v_fichaje.ts is not null, 'el timestamp tiene que seguir guardandose';
end $$;

select 'fichaje_sin_fotografia: OK' as resultado;

rollback;
