-- ============================================================
-- RLS + Storage: firma de recibos (BUG-005 / BUG-006)
--
--   docker exec -i supabase_db_<proyecto> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_firma_recibos.test.sql
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.recibos to authenticated;
grant select on table public.empleados to authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.empresas to authenticated;
grant select on table public.documentos_legajo to authenticated;
grant select on table public.documentos_firma to authenticated;
grant select on table public.documento_firma_destinatarios to authenticated;
grant select on table storage.objects to authenticated;

-- Empresas A / B
insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Empresa A', '30-a-1', 'A', 'a@a.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Empresa B', '30-b-1', 'B', 'b@b.com',
   '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
     "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb);

insert into empleados (id, empresa_id, nombre, apellido, dni, fecha_ingreso, puesto, sector)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Ana', 'A', '501', '2021-01-01', 'Op', 'Prod'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Beto', 'B', '502', '2021-01-01', 'Op', 'Prod'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Admin', 'A', '503', '2020-01-01', 'RRHH', 'Admin');

insert into auth.users (id, instance_id, email, aud, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '00000000-0000-0000-0000-000000000000',
   'ana@firma.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '00000000-0000-0000-0000-000000000000',
   'beto@firma.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '00000000-0000-0000-0000-000000000000',
   'admin@firma.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id, empleado_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'ana@firma.test', 'empleado', 'Ana A',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'beto@firma.test', 'empleado', 'Beto B',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'admin@firma.test', 'admin_rrhh', 'Admin A',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3');

insert into recibos (
  id, empresa_id, empleado_id, periodo, tipo, archivo_url,
  estado_firma, firmado_empleador_en
) values
  ('3a1beb13-9ca0-434f-929f-9505396e2d02',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   '2026-08', 'mensual',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2/2026-08-mensual.pdf',
   'pendiente', now()),
  ('ea3d6fbf-4e13-4e58-a3eb-456af5d1b96d',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   '2026-08', 'mensual',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2/2026-08-mensual.pdf',
   'pendiente', now());

insert into storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version)
values
  ('381be93a-4f2c-4e77-b828-6167b61619d3', 'recibos-pdf',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2/2026-08-mensual.pdf',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', now(), now(), now(), '{}'::jsonb, '1'),
  ('eeb8b794-8b6b-46ac-9745-fe1ccb1e9119', 'recibos-pdf',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2/2026-08-mensual.pdf',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', now(), now(), now(), '{}'::jsonb, '1');

create function pg_temp.como(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid);

-- ---------- BUG-005: UPDATE ilegal (sin policy → 0 filas) ----------
update recibos
   set archivo_url = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2/2026-08-mensual.pdf'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';

do $$
begin
  assert (
    select archivo_url from recibos
    where id = '3a1beb13-9ca0-434f-929f-9505396e2d02'
  ) like 'aaaaaaaa%',
    'empleado no puede cambiar archivo_url';
end $$;

update recibos set empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set empleado_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set periodo = '2099-01'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set tipo = 'sac'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set firmado_empleador_en = null
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set archivado_en = now()
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
update recibos set estado_firma = 'firmado', firmado_en = now()
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';

do $$
declare r recibos;
begin
  select * into r from recibos where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';
  assert r.empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'empresa_id intacta';
  assert r.empleado_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'empleado_id intacta';
  assert r.periodo = '2026-08', 'periodo intacto';
  assert r.tipo = 'mensual', 'tipo intacto';
  assert r.firmado_empleador_en is not null, 'publicación intacta';
  assert r.archivado_en is null, 'no archivado';
  assert r.estado_firma = 'pendiente', 'firma directa denegada (usar RPC)';
end $$;

-- No ve recibo B
do $$
begin
  assert (
    select count(*) from recibos where id = 'ea3d6fbf-4e13-4e58-a3eb-456af5d1b96d'
  ) = 0, 'empleado A no ve recibo B';
end $$;

-- Storage propio OK / B denegado
do $$
begin
  assert (
    select count(*) from storage.objects
    where name like 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/%'
  ) = 1, 've su PDF';
  assert (
    select count(*) from storage.objects
    where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/%'
  ) = 0, 'no ve PDF B';
end $$;

-- ---------- Firma legítima ----------
do $$
declare v_r recibos;
begin
  select * into v_r from firmar_recibo('3a1beb13-9ca0-434f-929f-9505396e2d02');
  assert found, 'RPC devuelve el recibo';
  assert v_r.estado_firma = 'firmado', 'queda firmado';
  assert v_r.firmado_en is not null, 'tiene firmado_en';
  assert v_r.archivo_url like 'aaaaaaaa%', 'no toca archivo_url';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from firmar_recibo('3a1beb13-9ca0-434f-929f-9505396e2d02');
  assert v_n = 0, 'one-shot: segunda firma vacía';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from firmar_recibo('ea3d6fbf-4e13-4e58-a3eb-456af5d1b96d');
  assert v_n = 0, 'no firma recibo de otra empresa';
end $$;

-- ---------- BUG-006 profundidad: archivo_url envenenado (como service) ----------
reset role;
-- Limpiar JWT de la sesión: si queda el del empleado, el trigger lo trata
-- como no-admin y bloquea el UPDATE de mantenimiento.
select set_config('request.jwt.claims', '', true);
update recibos
   set archivo_url = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2/2026-08-mensual.pdf'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';

set local role authenticated;
select pg_temp.como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid);

do $$
begin
  assert (
    select count(*) from storage.objects
    where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2/2026-08-mensual.pdf'
  ) = 0,
    'con archivo_url apuntando a B, storage sigue denegando PDF B';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
update recibos
   set archivo_url = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2/2026-08-mensual.pdf'
 where id = '3a1beb13-9ca0-434f-929f-9505396e2d02';

-- ---------- RRHH publica ----------
set local role authenticated;
select pg_temp.como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid);

insert into recibos (
  id, empresa_id, empleado_id, periodo, tipo, archivo_url, estado_firma
) values (
  'c3c506d7-6e52-4bd7-acd2-b02fa94873f5',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  '2026-09', 'mensual',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2/2026-09-mensual.pdf',
  'pendiente'
);

update recibos
   set firmado_empleador_en = now()
 where id = 'c3c506d7-6e52-4bd7-acd2-b02fa94873f5';

do $$
begin
  assert (
    select firmado_empleador_en is not null
    from recibos where id = 'c3c506d7-6e52-4bd7-acd2-b02fa94873f5'
  ), 'RRHH puede publicar';
end $$;

reset role;
rollback;
