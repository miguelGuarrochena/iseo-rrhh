-- ============================================================
-- Fichaje — Bloque 1 (auditoría técnica)
--
-- FIC-001  Actor real en cargas de terceros + auditoría atómica
-- FIC-002  Titularidad 1:1 del RPC + antirreplay de descriptor
-- FIC-003  "Hoy" con zona_empresa() (no timezone de sesión)
-- FIC-004  Serialización por empleado (advisory xact lock)
-- FIC-009  p_tipo ignorado en self-service
--
-- No se agrega UNIQUE (empleado_id, tipo, minuto): bloquearía
-- correcciones manuales legítimas y dobles marcas administrativas
-- en el mismo minuto. La race se corta con el lock.
-- Idempotente.
-- ============================================================

-- ---------- FIC-001a. Columna de identidad del actor ----------
alter table public.fichajes
  add column if not exists registrado_por_id uuid
    references public.usuarios (id) on delete set null;

comment on column public.fichajes.registrado_por_id is
  'Usuario autenticado que cargó el fichaje a mano. Lo impone la base; '
  'el cliente no puede afirmarlo.';

create index if not exists fichajes_registrado_por_id_idx
  on public.fichajes (registrado_por_id)
  where registrado_por_id is not null;

-- ---------- FIC-001b. Trigger: imponer actor / auditoría ----------
--
-- Camino RPC (`app.fichaje_validado = 'si'`): no tocar. En kiosco el JWT
-- es del gestor pero la persona fichada es otra; forzar `manual` ahí
-- convertiría todo el Modo planta en carga a mano.
--
-- Insert directo (REST / ficharAhora) cuando el actor no es el titular:
-- fuerza metodo=manual, rellena registrado_por(_id) desde auth.uid() y
-- escribe auditoría en la misma transacción.
create or replace function public.imponer_actor_fichaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if coalesce(current_setting('app.fichaje_validado', true), '') = 'si' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- Self-service: el cliente no puede firmar la marca como "cargada por".
  if auth_empleado() is not distinct from new.empleado_id then
    new.registrado_por := null;
    new.registrado_por_id := null;
    return new;
  end if;

  -- Carga de terceros (gestor / admin / superadmin sin legajo propio).
  select u.nombre_completo into v_nombre
    from public.usuarios u
   where u.id = auth.uid();

  new.metodo := 'manual'::metodo_fichaje;
  new.registrado_por_id := auth.uid();
  new.registrado_por := coalesce(v_nombre, '');
  -- Sin confianza/geocerca afirmadas por el cliente en carga manual.
  new.confianza := null;
  new.fuera_de_zona := null;

  insert into public.auditoria_acciones (
    empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle
  ) values (
    new.empresa_id,
    auth.uid(),
    coalesce(v_nombre, ''),
    'cargar_manual',
    'fichaje',
    new.id::text,
    jsonb_build_object(
      'empleadoId', new.empleado_id,
      'tipo', new.tipo,
      'timestamp', new.ts,
      'metodo', new.metodo
    )
  );

  return new;
end;
$$;

comment on function public.imponer_actor_fichaje() is
  'FIC-001: si el actor no es el titular (y no viene del RPC facial), '
  'fuerza metodo=manual, fija registrado_por_id=auth.uid() y audita '
  'en la misma transacción.';

drop trigger if exists trg_imponer_actor_fichaje on public.fichajes;
-- Nombre que corre después de exigir_fichaje_facial_validado (orden
-- alfabético de triggers BEFORE INSERT) y antes de trg_lock_*.
create trigger trg_imponer_actor_fichaje
  before insert on public.fichajes
  for each row execute function public.imponer_actor_fichaje();

-- ---------- FIC-002a. Antirreplay: hashes de descriptores usados ----------
create table if not exists public.fichajes_descriptor_usado (
  id bigserial primary key,
  empleado_id uuid not null references public.empleados (id) on delete cascade,
  descriptor_hash text not null,
  usado_en timestamptz not null default now(),
  unique (empleado_id, descriptor_hash)
);

comment on table public.fichajes_descriptor_usado is
  'Hashes de descriptores ya usados al fichar. Un descriptor bit a bit '
  'idéntico (replay) se rechaza. Dos capturas reales nunca coinciden.';

create index if not exists fichajes_descriptor_usado_emp_idx
  on public.fichajes_descriptor_usado (empleado_id, usado_en desc);

alter table public.fichajes_descriptor_usado enable row level security;
-- Sin policies: nadie la lee/escribe por PostgREST. Sólo el RPC DEFINER.

revoke all on table public.fichajes_descriptor_usado from public;
revoke all on table public.fichajes_descriptor_usado from anon;
revoke all on table public.fichajes_descriptor_usado from authenticated;

-- jsonb::text es canónico en Postgres para el mismo valor jsonb.
-- Dos payloads idénticos → mismo hash; dos floats distintos → distinto.
create or replace function public.hash_descriptor_facial(p jsonb)
returns text
language sql
immutable
as $$
  select md5(coalesce(p::text, ''));
$$;

revoke all on function public.hash_descriptor_facial(jsonb) from public;
revoke all on function public.hash_descriptor_facial(jsonb) from anon;

-- ---------- FIC-002/003/004/009. Reescribir fichar_con_rostro ----------
create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_metodo text default 'facial_tablet',
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null
)
returns setof fichajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := auth_empresa();
  v_umbral double precision := case when p_empleado_id is null then 0.5 else 0.6 end;
  v_margen constant double precision := 0.05;
  v_mejor record;
  v_segunda double precision;
  v_geocerca jsonb;
  v_fuera boolean := null;
  v_tipo tipo_fichaje;
  v_ultimo tipo_fichaje;
  v_fila fichajes;
  v_hash text;
  v_inicio_dia timestamptz;
begin
  if v_empresa is null then
    raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
  end if;

  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  -- FIC-002: en 1:1 el descriptor no autoriza a fichar por otro.
  if p_empleado_id is not null then
    if auth_empleado() is null
       or auth_empleado() is distinct from p_empleado_id then
      raise exception 'Solo podés fichar por vos.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- ---- Match contra los rostros enrolados de la empresa ----
  select e.id,
         distancia_descriptores(e.descriptor_facial, p_descriptor) as dist
    into v_mejor
    from empleados e
   where e.empresa_id = v_empresa
     and e.activo
     and e.descriptor_facial is not null
     and (p_empleado_id is null or e.id = p_empleado_id)
   order by dist asc
   limit 1;

  if not found then
    raise exception 'No hay rostros registrados para comparar.'
      using errcode = 'no_data_found';
  end if;

  if v_mejor.dist > v_umbral then
    raise exception 'No reconocimos el rostro.' using errcode = 'no_data_found';
  end if;

  if p_empleado_id is null then
    select distancia_descriptores(e.descriptor_facial, p_descriptor)
      into v_segunda
      from empleados e
     where e.empresa_id = v_empresa
       and e.activo
       and e.descriptor_facial is not null
       and e.id <> v_mejor.id
     order by 1 asc
     limit 1;

    if v_segunda is not null and (v_segunda - v_mejor.dist) < v_margen then
      raise exception 'Hay dos rostros parecidos: fichá eligiendo tu nombre.'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- FIC-002 antirreplay: mismo descriptor exacto ya usado por esa persona.
  v_hash := hash_descriptor_facial(p_descriptor);
  if exists (
    select 1
      from fichajes_descriptor_usado u
     where u.empleado_id = v_mejor.id
       and u.descriptor_hash = v_hash
  ) then
    raise exception 'Ese reconocimiento ya se usó. Acercate de nuevo a la cámara.'
      using errcode = 'unique_violation';
  end if;

  -- ---- Geocerca (sin cambios de contrato en este bloque) ----
  select config->'geocerca' into v_geocerca
    from empresas where id = v_empresa;

  if v_geocerca is not null and v_geocerca <> 'null'::jsonb
     and p_lat is not null and p_lng is not null then
    v_fuera := distancia_metros(
                 (v_geocerca->>'lat')::double precision,
                 (v_geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > (v_geocerca->>'radioM')::double precision;
  end if;

  -- FIC-004: serializar por empleado ANTES de leer el último tipo.
  -- hashtextextended da un bigint estable; dos empleados no se bloquean.
  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  -- FIC-003: inicio del día laboral en zona_empresa(), no UTC de sesión.
  v_inicio_dia := (
    ((now() at time zone zona_empresa())::date)::timestamp
    at time zone zona_empresa()
  );

  -- FIC-009: p_tipo sólo para gestores (carga facial forzada / rare).
  -- Self-service siempre alterna según la última marca del día local.
  if p_tipo is not null and (es_gestor() or es_superadmin()) then
    v_tipo := p_tipo::tipo_fichaje;
  else
    select f.tipo into v_ultimo
      from fichajes f
     where f.empleado_id = v_mejor.id
       and f.ts >= v_inicio_dia
     order by f.ts desc, f.id desc
     limit 1;
    v_tipo := case when v_ultimo = 'ingreso' then 'egreso' else 'ingreso' end
              ::tipo_fichaje;
  end if;

  perform set_config('app.fichaje_validado', 'si', true);

  insert into fichajes (
    empresa_id, empleado_id, tipo, ts, metodo, confianza, geo, fuera_de_zona
  ) values (
    v_empresa,
    v_mejor.id,
    v_tipo,
    -- clock_timestamp: ver comentario al final de esta migración.
    clock_timestamp(),
    p_metodo::metodo_fichaje,
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  insert into fichajes_descriptor_usado (empleado_id, descriptor_hash)
  values (v_mejor.id, v_hash);

  return next v_fila;
  return;
end;
$$;

comment on function public.fichar_con_rostro is
  'Ficha validando rostro y geocerca en el servidor. 1:1 exige '
  'p_empleado_id = auth_empleado(); rechaza descriptor idéntico reusado; '
  'serializa por empleado; calcula el tipo con zona_empresa().';

revoke all on function public.fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) from public;
grant execute on function public.fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) to authenticated;

-- ---------- Reloj de marcas: clock_timestamp, no now() ----------
--
-- `now()` / `transaction_timestamp()` es fijo durante toda la
-- transacción. Varias llamadas a fichar_con_rostro en el mismo
-- BEGIN (tests, o un cliente que las agrupe) quedaban con el mismo
-- `ts`; el ORDER BY ts,id ya no reflejaba el orden real y la
-- alternancia ingreso/egreso se rompía. `clock_timestamp()` avanza.
create or replace function public.lock_fichaje_ts_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if es_superadmin() or es_gestor() then
    return new;
  end if;
  new.ts := clock_timestamp();
  return new;
end;
$$;

comment on function public.lock_fichaje_ts_empleado() is
  'Employee INSERT: force ts=clock_timestamp(). Gestor/admin may supply historical ts.';

-- El RPC también fija el reloj explícitamente (cubre el camino
-- SECURITY DEFINER donde el trigger igual aplica, y documenta la intención).
-- Se hace en el INSERT de más arriba vía la columna default + trigger;
-- no hace falta tocar de nuevo el cuerpo si el trigger ya usa clock.

notify pgrst, 'reload schema';
