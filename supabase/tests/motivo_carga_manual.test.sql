-- ============================================================
-- Motivo obligatorio en la carga manual (migración 87).
--
-- Anular una marca exige motivo desde F-12; crearla a mano no exigía
-- nada. Estos casos fijan la regla del lado de la base, que es donde
-- tiene que valer: el campo del formulario lo saltea cualquiera que
-- hable PostgREST directo.
--
-- Cómo se corre
-- -------------
--   supabase start && supabase db reset
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/motivo_carga_manual.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config) values
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1','Mot-A','30-mot-1','A','mot@t.test',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,"diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso,
  puesto, sector, modo_fichaje, descriptor_facial, descriptor_version, consentimiento_biometrico) values
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1','c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1',
  'Emp','Uno','mot-e1','2020-01-01','Op','Prod','celular','[0,0,0]'::jsonb, 1,
  '{"aceptado":true,"fecha":"2026-08-07","otorgadoPor":"u1"}'::jsonb);

insert into auth.users (id, instance_id, email, aud, role) values
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c1','00000000-0000-0000-0000-000000000000','mot-adm@t.test','authenticated','authenticated'),
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c2','00000000-0000-0000-0000-000000000000','mot-emp@t.test','authenticated','authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id) values
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c1','mot-adm@t.test','admin_rrhh','Adm Mot','c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1', null),
 ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c2','mot-emp@t.test','empleado','Emp Mot','c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1','c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1');

create function pg_temp.como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- ============================================================
-- La carga manual sin motivo no entra
-- ============================================================
select pg_temp.como('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c1');

do $$
declare v_bloqueado boolean := false;
begin
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts)
    values ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1',
            'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1','ingreso', now());
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'una carga manual sin motivo tiene que ser rechazada';

  -- Un motivo de espacios no es un motivo.
  v_bloqueado := false;
  begin
    insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
    values ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1',
            'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1','ingreso', now(), '    ');
  exception when others then v_bloqueado := true; end;
  assert v_bloqueado, 'un motivo en blanco no cuenta como motivo';
end $$;

-- ============================================================
-- Con motivo entra, queda normalizado y auditado
-- ============================================================
do $$
declare
  v_f fichajes;
  v_detalle jsonb;
begin
  insert into fichajes (empresa_id, empleado_id, tipo, ts, motivo)
  values ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0a1',
          'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1','ingreso', now(),
          '  Se cayó la tablet  ')
  returning * into v_f;

  assert v_f.motivo = 'Se cayó la tablet',
    'el motivo se guarda sin los espacios de los bordes';
  assert v_f.metodo = 'manual', 'todo INSERT directo es carga manual';
  assert v_f.registrado_por_id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c1',
    'queda quién la cargó';

  select detalle into v_detalle from auditoria_acciones
   where entidad = 'fichaje' and entidad_id = v_f.id::text
     and accion = 'cargar_manual';
  assert v_detalle ->> 'motivo' = 'Se cayó la tablet',
    'el motivo también va a la auditoría';
end $$;

-- ============================================================
-- El fichaje del empleado no pide motivo: no hay nada que explicar,
-- la hora la puso el reloj y el rostro lo validó el servidor.
-- ============================================================
select pg_temp.como('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c2');

do $$
declare v_f fichajes;
begin
  select * into v_f from fichar_con_rostro(
    '[0.01,0.01,0.01]'::jsonb, 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0e1');
  assert v_f.motivo is null, 'el fichaje por RPC no lleva motivo';
  assert v_f.metodo <> 'manual', 'el fichaje por RPC no es carga manual';
end $$;

rollback;

\echo ''
\echo '  ✓ Motivo obligatorio en carga manual — todo pasó'
\echo ''
