-- ============================================================
-- Migración 101: corte por columna en `empresas`.
--
--   docker exec -i supabase_db_iseo-rrhh psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/columnas_de_iseo.test.sql
--
-- Lo que se prueba es el reparto exacto: qué puede escribir el admin de
-- la empresa (todo lo que Configuración guarda), qué no (lo comercial),
-- qué puede el superadmin, y que nada cruce de una empresa a otra.
--
-- Este archivo reemplaza a `servicios_contratados.test.sql`: la
-- migración 101 absorbió el trigger de `servicios`, así que los dos
-- casos viven acá y no en dos lugares que pueden divergir.
-- ============================================================

\set ON_ERROR_STOP on
begin;

grant usage on schema public to authenticated;
grant select, insert, update on table public.empresas to authenticated;
grant select on table public.usuarios to authenticated;

insert into empresas (
  id, nombre, cuit, razon_social, domicilio, contacto_nombre,
  contacto_email, contacto_telefono, estado, plan, abono_mensual, regimen, config
) values (
  '55555555-5555-5555-5555-555555555551',
  'Autogestión SA', '30-sv-1', 'Autogestión S.A.', 'Calle 1',
  'Ana', 'a@a.com', '11-1111', 'suspendida', 'Básico', 60000,
  'relacion_dependencia',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into empresas (id, nombre, cuit, contacto_nombre, contacto_email, config)
values (
  '55555555-5555-5555-5555-555555555559',
  'Otra SA', '30-sv-9', 'O', 'o@o.com',
  '{"horaEntrada":"08:00","horaSalida":"17:00","toleranciaLlegadaTardeMin":10,
    "diasAvisoVencimiento":30,"metodosFichaje":["celular"]}'::jsonb
);

insert into auth.users (id, instance_id, email, aud, role) values
  ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-000000000000', 'sv-admin@t.test', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555553', '00000000-0000-0000-0000-000000000000', 'sv-super@t.test', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555554', '00000000-0000-0000-0000-000000000000', 'sv-sup@t.test', 'authenticated', 'authenticated');

insert into usuarios (id, email, rol, nombre_completo, empresa_id) values
  ('55555555-5555-5555-5555-555555555552', 'sv-admin@t.test', 'admin_rrhh', 'Admin A',
   '55555555-5555-5555-5555-555555555551'),
  ('55555555-5555-5555-5555-555555555553', 'sv-super@t.test', 'superadmin', 'ISEO', null),
  ('55555555-5555-5555-5555-555555555554', 'sv-sup@t.test', 'supervisor', 'Sup A',
   '55555555-5555-5555-5555-555555555551');

create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_service() returns void
language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

/**
 * Corre un UPDATE y devuelve si entró. No usa `when others then null`
 * suelto: distingue "lo rechazó el trigger" de cualquier otra cosa, para
 * que un test no pase por el motivo equivocado.
 */
create or replace function pg_temp.entra(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return true;
exception
  when raise_exception then
    if sqlerrm like 'Sólo ISEO%' then return false; end if;
    raise;
  when insufficient_privilege then return false;
end;
$$;

-- =====================================================================
-- Por defecto una empresa nueva no tiene servicios contratados
-- =====================================================================
do $$
begin
  if exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555559'
      and servicios is distinct from '{}'::jsonb
  ) then
    raise exception 'FAIL: una empresa nueva no debería tener servicios';
  end if;
end $$;

-- =====================================================================
-- admin_rrhh: SÍ puede lo que guarda Configuración
-- =====================================================================
select pg_temp.as_user('55555555-5555-5555-5555-555555555552');

do $$
declare
  id constant text := '55555555-5555-5555-5555-555555555551';
  permitidas text[] := array[
    'nombre = ''Nuevo nombre''',
    'cuit = ''30-sv-1b''',
    'razon_social = ''Nueva S.A.''',
    'domicilio = ''Calle 2''',
    'contacto_nombre = ''Beto''',
    'contacto_email = ''b@b.com''',
    'contacto_telefono = ''11-2222''',
    'logo_url = ''https://x/logo.png''',
    -- `config` incluye horarios, cargas patronales, vacaciones, resumen
    -- semanal y los módulos que la empresa decide apagar.
    'config = config || ''{"horaEntrada":"09:00"}''::jsonb',
    'config = config || ''{"modulos":{"organigrama":false}}''::jsonb'
  ];
  c text;
begin
  foreach c in array permitidas loop
    if not pg_temp.entra(format('update empresas set %s where id = %L', c, id))
    then
      raise exception 'FAIL: el admin debería poder guardar %', c;
    end if;
  end loop;
end $$;

-- =====================================================================
-- admin_rrhh: NO puede lo comercial
-- =====================================================================
do $$
declare
  id constant text := '55555555-5555-5555-5555-555555555551';
  prohibidas text[] := array[
    -- La peor: `empresaHabilitada()` corta el login contra `estado`,
    -- así que esto era reactivarse una suspensión por falta de pago.
    'estado = ''activa''',
    'abono_mensual = 1',
    'plan = ''Full''',
    'servicios = ''{"asesoria": true}''::jsonb',
    -- Apaga la retención de aportes de ley en el neto que se muestra.
    'regimen = ''simplificado''',
    'creada_en = now() - interval ''5 years'''
  ];
  c text;
begin
  foreach c in array prohibidas loop
    if pg_temp.entra(format('update empresas set %s where id = %L', c, id))
    then
      raise exception 'FAIL: el admin NO debería poder guardar %', c;
    end if;
  end loop;
end $$;

-- Y la fila quedó como estaba en todo lo comercial.
do $$
begin
  if not exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555551'
      and estado = 'suspendida'
      and abono_mensual = 60000
      and plan = 'Básico'
      and regimen = 'relacion_dependencia'
      and servicios = '{}'::jsonb
  ) then
    raise exception 'FAIL: algo comercial cambió pese al rechazo';
  end if;
end $$;

-- Un UPDATE mixto se rechaza ENTERO: no entra "la mitad buena".
do $$
begin
  if pg_temp.entra(
    'update empresas set nombre = ''Mixto'', estado = ''activa''
      where id = ''55555555-5555-5555-5555-555555555551'''
  ) then
    raise exception 'FAIL: un update mixto no debería entrar';
  end if;
  if exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555551' and nombre = 'Mixto'
  ) then
    raise exception 'FAIL: el update mixto dejó a medias el nombre';
  end if;
end $$;

-- Tampoco puede crear empresas.
do $$
begin
  if pg_temp.entra(
    'insert into empresas (nombre, cuit, contacto_nombre, contacto_email)
       values (''Trucha SA'', ''30-tr-1'', ''T'', ''t@t.com'')'
  ) then
    raise exception 'FAIL: el admin no debería poder crear una empresa';
  end if;
end $$;

-- =====================================================================
-- supervisor: no escribe nada de la empresa (ya lo cortaba la policy)
-- =====================================================================
select pg_temp.as_user('55555555-5555-5555-5555-555555555554');

do $$
begin
  update empresas set nombre = 'Sup' where id = '55555555-5555-5555-5555-555555555551';
  if exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555551' and nombre = 'Sup'
  ) then
    raise exception 'FAIL: un supervisor no debería poder editar la empresa';
  end if;
end $$;

-- =====================================================================
-- superadmin: puede todo lo comercial
-- =====================================================================
select pg_temp.as_user('55555555-5555-5555-5555-555555555553');

do $$
begin
  update empresas
     set estado = 'activa',
         abono_mensual = 85000,
         plan = 'Full',
         regimen = 'simplificado',
         servicios = '{"asesoria": true}'::jsonb
   where id = '55555555-5555-5555-5555-555555555551';

  if not exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555551'
      and estado = 'activa'
      and abono_mensual = 85000
      and plan = 'Full'
      and regimen = 'simplificado'
      and (servicios ->> 'asesoria')::boolean is true
  ) then
    raise exception 'FAIL: el superadmin debería poder cambiar lo comercial';
  end if;

  -- Y sacar el servicio.
  update empresas
     set servicios = '{"asesoria": false}'::jsonb
   where id = '55555555-5555-5555-5555-555555555551';
end $$;

-- =====================================================================
-- Aislamiento por tenant
-- =====================================================================
select pg_temp.as_user('55555555-5555-5555-5555-555555555552');

do $$
begin
  -- La RLS no le deja ni ver ni actualizar la fila de la otra empresa:
  -- el UPDATE no afecta nada en vez de fallar.
  update empresas
     set nombre = 'Robada', servicios = '{"asesoria": true}'::jsonb
   where id = '55555555-5555-5555-5555-555555555559';

  if exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555559'
      and (nombre = 'Robada' or servicios is distinct from '{}'::jsonb)
  ) then
    raise exception 'FAIL: cross-tenant: A tocó la fila de B';
  end if;

  -- Tampoco puede leerla.
  if exists (
    select 1 from empresas where id = '55555555-5555-5555-5555-555555555559'
  ) then
    raise exception 'FAIL: cross-tenant: A ve la empresa B';
  end if;
exception
  when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

-- =====================================================================
-- Sin JWT (service role, migraciones, semillas) no se frena
-- =====================================================================
select pg_temp.as_service();

update empresas
   set estado = 'suspendida', abono_mensual = 0,
       servicios = '{"asesoria": true}'::jsonb
 where id = '55555555-5555-5555-5555-555555555559';

do $$
begin
  if not exists (
    select 1 from empresas
    where id = '55555555-5555-5555-5555-555555555559'
      and estado = 'suspendida'
      and (servicios ->> 'asesoria')::boolean is true
  ) then
    raise exception 'FAIL: sin JWT el trigger no debería frenar';
  end if;
  raise notice 'OK: columnas_de_iseo (admin, supervisor, superadmin, tenant, service)';
end $$;

rollback;
