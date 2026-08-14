-- ============================================================
-- Fichaje — F-07 (método derivado) y F-12 (anulación auditable)
--
-- F-07  El método deja de ser un string del request y pasa a ser una
--       consecuencia del camino usado.
-- F-12  Los fichajes se anulan, no se editan ni se borran. La anulación
--       exige motivo, deja actor y sale de todos los cálculos.
--
-- Idempotente.
-- ============================================================

-- ============================================================
-- PARTE 1 — F-07: el método lo decide la base
--
-- Qué pasaba
-- ----------
-- `metodo` es la columna que dice CÓMO se registró una marca, y es lo
-- que se lee cuando alguien discute una jornada: "reconocimiento
-- facial en la terminal" no vale lo mismo que "carga a mano de RRHH".
-- Hasta acá esa columna la escribía el cliente, por dos caminos:
--
--   1. `fichar_con_rostro(p_metodo => ...)`. El parámetro entraba con
--      un cast directo al enum. Un kiosco podía declarar `manual`, y un
--      celular podía declarar `facial_tablet`.
--
--   2. INSERT directo por PostgREST. El trigger `imponer_actor_fichaje`
--      forzaba `manual` sólo cuando el actor NO era el titular; en el
--      camino self-service hacía `return new` temprano y conservaba lo
--      que mandara el cliente. O sea que un empleado podía POSTear
--      `{"metodo":"facial_tablet"}` y fabricarse una marca con cara de
--      fichaje en la terminal, sin haber pasado por ninguna cámara.
--
-- Cómo queda
-- ----------
-- El método es una función del camino, no un dato de entrada:
--
--   1:N por terminal vinculada          → facial_tablet
--   1:1 self-service, modo_fichaje remoto → remoto
--   1:1 self-service, resto              → celular
--   cualquier INSERT directo             → manual
--
-- `p_metodo` desaparece de la firma: no hay string que manipular.
-- ============================================================

-- ---------- 1a. Todo INSERT directo es una carga a mano ----------
--
-- El cambio respecto de la versión anterior: ya no se distingue si el
-- actor es o no el titular. Un INSERT por REST nunca pasó por una
-- cámara ni por la validación del RPC, así que es una carga manual,
-- la haga quien la haga. Que un gestor se cargue su propia marca a
-- mano es exactamente eso: una carga manual, y ahora queda registrada
-- como tal en vez de conservar el `celular` que dijera el cliente.
create or replace function public.imponer_actor_fichaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  -- Camino RPC (`fichar_con_rostro`): ahí el método ya lo puso el
  -- servidor a partir del camino real. No se toca.
  if coalesce(current_setting('app.fichaje_validado', true), '') = 'si' then
    return new;
  end if;

  -- Sin sesión: migraciones, fixtures y mantenimiento.
  if auth.uid() is null then
    return new;
  end if;

  select u.nombre_completo into v_nombre
    from public.usuarios u
   where u.id = auth.uid();

  -- F-07: el método no lo elige el cliente.
  new.metodo := 'manual'::metodo_fichaje;
  new.registrado_por_id := auth.uid();
  new.registrado_por := coalesce(v_nombre, '');
  -- Y no hubo rostro ni geocerca que validar.
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
      'metodo', new.metodo,
      -- Distingue la carga para un tercero de la carga para uno mismo:
      -- las dos son manuales, pero no son el mismo hecho.
      'propia', auth_empleado() is not distinct from new.empleado_id
    )
  );

  return new;
end;
$$;

comment on function public.imponer_actor_fichaje() is
  'FIC-001 + F-07: todo INSERT directo es carga manual. Fija metodo, '
  'registrado_por_id = auth.uid(), limpia confianza/geocerca y audita en '
  'la misma transacción.';

-- ============================================================
-- PARTE 2 — F-12: anulación auditable
--
-- Qué pasaba
-- ----------
-- `fichajes` era append-only por omisión: no hay policy de UPDATE ni de
-- DELETE, así que por PostgREST no se podía tocar nada. Bien para la
-- integridad, pero no había NINGUNA forma correcta de corregir una
-- marca equivocada o duplicada. La única salida real era un UPDATE con
-- `service_role` desde la consola de Supabase: sin motivo, sin actor y
-- sin rastro.
--
-- Cómo queda
-- ----------
-- Se anula, no se edita ni se borra. La fila sigue existiendo con todos
-- sus datos originales y suma tres columnas que dicen quién la anuló,
-- cuándo y por qué. Las marcas anuladas salen de `marcas_numeradas`,
-- que es el único origen de jornadas y de la vista de movimientos, así
-- que desaparecen de jornadas, resumen, Excel y liquidación sin que
-- haya que acordarse de filtrarlas en cada consulta.
--
-- Quién puede anular: admin_rrhh y superadmin. NO el supervisor.
-- El razonamiento está en el comentario de `anular_fichaje`.
-- ============================================================

alter table public.fichajes
  add column if not exists anulado_en timestamptz,
  add column if not exists anulado_por uuid
    references public.usuarios (id) on delete set null,
  add column if not exists anulado_motivo text;

comment on column public.fichajes.anulado_en is
  'Cuándo se anuló. Null = marca vigente. La fila nunca se borra.';
comment on column public.fichajes.anulado_por is
  'Usuario que anuló. Lo impone anular_fichaje(); el cliente no puede afirmarlo.';
comment on column public.fichajes.anulado_motivo is
  'Por qué se anuló. Obligatorio: una anulación sin motivo no sirve para auditar.';

-- Las tres van juntas o ninguna, y el motivo no puede ser vacío. Es la
-- red de seguridad por si alguna vez se escribe fuera del RPC (por
-- ejemplo con service_role): una anulación a medias no puede existir.
alter table public.fichajes
  drop constraint if exists fichajes_anulacion_completa;
alter table public.fichajes
  add constraint fichajes_anulacion_completa check (
    (anulado_en is null and anulado_por is null and anulado_motivo is null)
    or (anulado_en is not null and anulado_por is not null
        and btrim(coalesce(anulado_motivo, '')) <> '')
  ) not valid;

-- Las consultas de jornadas recorren por (empresa, ts) y ahora además
-- descartan anuladas. El índice parcial deja fuera las anuladas, que
-- son la excepción, y mantiene el barrido index-only.
create index if not exists fichajes_vigentes_idx
  on public.fichajes (empresa_id, ts)
  include (empleado_id, tipo, fuera_de_zona)
  where anulado_en is null;

-- ---------- 2a. UPDATE: sólo la anulación, y sólo por el RPC ----------
--
-- No hay policy de UPDATE, así que por PostgREST esto ya era imposible.
-- El trigger cubre lo que la policy no: service_role, un job, o una
-- policy que alguien agregue mañana sin pensar en esto. Si el UPDATE no
-- viene de `anular_fichaje`, se rechaza; y si viene, sólo pueden haber
-- cambiado las tres columnas de anulación.
create or replace function public.proteger_update_fichaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.fichaje_anulacion', true), '') <> 'si' then
    raise exception
      'Los fichajes no se editan. Para corregir una marca, anulala con anular_fichaje().'
      using errcode = 'insufficient_privilege';
  end if;

  if row(new.id, new.empresa_id, new.empleado_id, new.tipo, new.ts,
         new.metodo, new.confianza, new.geo, new.fuera_de_zona,
         new.registrado_por, new.registrado_por_id, new.foto_url,
         new.dispositivo_id)
     is distinct from
     row(old.id, old.empresa_id, old.empleado_id, old.tipo, old.ts,
         old.metodo, old.confianza, old.geo, old.fuera_de_zona,
         old.registrado_por, old.registrado_por_id, old.foto_url,
         old.dispositivo_id)
  then
    raise exception 'La anulación no puede cambiar los datos del fichaje.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Anular es definitivo: des-anular sería justamente la edición
  -- silenciosa que esto viene a impedir. Si la anulación fue un error,
  -- se carga la marca de nuevo a mano, que deja su propio rastro.
  if old.anulado_en is not null then
    raise exception 'Ese fichaje ya estaba anulado.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_update_fichaje on public.fichajes;
create trigger trg_proteger_update_fichaje
  before update on public.fichajes
  for each row execute function public.proteger_update_fichaje();

-- ---------- 2b. El RPC de anulación ----------
--
-- Quién puede: admin_rrhh de la empresa y superadmin. El supervisor NO.
--
-- Es tentador dárselo al supervisor porque ya puede cargar fichajes a
-- mano, pero las dos operaciones no son simétricas. Cargar una marca es
-- aditivo y deja evidencia nueva; anular una marca RESTA horas de un
-- registro que puede terminar en una liquidación o en un reclamo. Y el
-- supervisor suele ser la contraparte directa en una discusión sobre
-- horas trabajadas, así que darle la capacidad de borrar tiempo del
-- registro de su propio equipo es exactamente el conflicto de interés
-- que la auditoría tendría que evitar.
--
-- Además es lo que ya hizo este repo dos veces con las operaciones que
-- tocan plata: la migración 32 sacó los recibos de `es_gestor()` para
-- dejarlos en admin_rrhh, y la 50 hizo lo mismo con los adelantos.
create or replace function public.anular_fichaje(
  p_fichaje_id uuid,
  p_motivo text
)
returns setof fichajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := auth_empresa();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_f fichajes;
  v_nombre text;
begin
  if v_motivo = '' then
    raise exception 'Hay que decir por qué se anula el fichaje.'
      using errcode = 'invalid_parameter_value';
  end if;

  if not (es_superadmin() or auth_rol() = 'admin_rrhh') then
    raise exception 'No tenés permiso para anular fichajes.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_f from fichajes f where f.id = p_fichaje_id;
  if not found then
    raise exception 'Ese fichaje no existe.' using errcode = 'no_data_found';
  end if;

  -- Tenencia: un admin_rrhh sólo anula en su empresa. El superadmin
  -- puede en cualquiera (soporte), y queda auditado igual.
  if not es_superadmin() and v_f.empresa_id is distinct from v_empresa then
    raise exception 'Ese fichaje no es de tu empresa.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_f.anulado_en is not null then
    raise exception 'Ese fichaje ya estaba anulado.'
      using errcode = 'unique_violation';
  end if;

  -- Mismo lock que toma `fichar_con_rostro`: anular la última marca
  -- cambia qué corresponde fichar después. Sin esto, una anulación
  -- concurrente con una fichada podría dejar dos ingresos seguidos,
  -- porque `tipo_de_marca_siguiente` habría leído la marca que la otra
  -- transacción estaba anulando.
  perform pg_advisory_xact_lock(hashtextextended(v_f.empleado_id::text, 0));

  select u.nombre_completo into v_nombre from usuarios u where u.id = auth.uid();

  perform set_config('app.fichaje_anulacion', 'si', true);

  update fichajes
     set anulado_en = now(),
         anulado_por = auth.uid(),
         anulado_motivo = v_motivo
   where id = p_fichaje_id
  returning * into v_f;

  -- Igual que con `app.fichaje_validado`: el permiso se apaga apenas se
  -- usó, así no queda habilitado el UPDATE para el resto de la
  -- transacción.
  perform set_config('app.fichaje_anulacion', '', true);

  insert into auditoria_acciones (
    empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle
  ) values (
    v_f.empresa_id,
    auth.uid(),
    coalesce(v_nombre, ''),
    'anular',
    'fichaje',
    v_f.id::text,
    -- Se guarda el contenido de la marca anulada: si mañana se discute,
    -- la auditoría tiene que poder mostrar QUÉ se sacó del registro sin
    -- depender de que la fila siga siendo legible.
    jsonb_build_object(
      'empleadoId', v_f.empleado_id,
      'tipo', v_f.tipo,
      'timestamp', v_f.ts,
      'metodo', v_f.metodo,
      'motivo', v_motivo
    )
  );

  return next v_f;
  return;
end;
$$;

comment on function public.anular_fichaje is
  'Anula un fichaje dejando la fila intacta: marca anulado_en/por/motivo, '
  'exige motivo y audita. Sólo admin_rrhh de la empresa o superadmin. '
  'Toma el mismo advisory lock que fichar_con_rostro.';

revoke all on function public.anular_fichaje(uuid, text) from public;
revoke all on function public.anular_fichaje(uuid, text) from anon;
grant execute on function public.anular_fichaje(uuid, text) to authenticated;

-- ---------- 2c. Las anuladas salen de todos los cálculos ----------
--
-- El filtro va en `marcas_numeradas` y en ningún otro lado: es el único
-- origen de `jornadas_de_empresa` y de `fichajes_del_periodo`, así que
-- con esto quedan afuera de jornadas, resumen, Excel y liquidación de
-- una sola vez. Filtrar en cada consulta sería garantizar que alguna se
-- olvide.
create or replace function public.marcas_numeradas(
  p_empresa_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_empleado_ids uuid[] default null
)
returns table (
  id uuid,
  empleado_id uuid,
  ts timestamptz,
  tipo tipo_fichaje,
  fuera_de_zona boolean,
  nro int
)
language sql
stable
security invoker
set search_path = public
as $$
  with marcas as (
    select
      f.id,
      f.empleado_id,
      f.ts,
      f.tipo,
      coalesce(f.fuera_de_zona, false) as fuera_de_zona,
      lag(f.ts) over (
        partition by f.empleado_id order by f.ts, f.id
      ) as ts_previo
    from fichajes f
    where f.empresa_id = p_empresa_id
      and f.ts >= p_desde
      and f.ts < p_hasta
      -- F-12: una marca anulada no ocurrió a los efectos del cálculo.
      -- Sigue estando en la tabla para la auditoría.
      and f.anulado_en is null
      and (p_empleado_ids is null or f.empleado_id = any (p_empleado_ids))
  )
  select
    m.id,
    m.empleado_id,
    m.ts,
    m.tipo,
    m.fuera_de_zona,
    sum(
      case
        when m.tipo = 'ingreso'
             and (m.ts_previo is null or m.ts - m.ts_previo >= corte_jornada())
        then 1 else 0
      end
    ) over (
      partition by m.empleado_id order by m.ts, m.id
      rows between unbounded preceding and current row
    )::int as nro
  from marcas m
$$;

-- Y la alternancia tampoco puede mirar una marca anulada: si se anula
-- el último ingreso, la próxima marca tiene que volver a ser un ingreso
-- y no un egreso que cerraría una jornada que ya no existe.
create or replace function public.tipo_de_marca_siguiente(
  p_empleado_id uuid,
  p_ahora timestamptz default null
)
returns tipo_fichaje
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo tipo_fichaje;
  v_ts timestamptz;
  v_ahora timestamptz := coalesce(p_ahora, clock_timestamp());
begin
  select f.tipo, f.ts
    into v_tipo, v_ts
    from fichajes f
   where f.empleado_id = p_empleado_id
     and f.anulado_en is null
   order by f.ts desc, f.id desc
   limit 1;

  if v_tipo is distinct from 'ingreso' then
    return 'ingreso';
  end if;

  if v_ahora - v_ts < max_jornada() then
    return 'egreso';
  end if;

  return 'ingreso';
end;
$$;

-- ============================================================
-- PARTE 3 — `fichar_con_rostro` sin `p_metodo`
--
-- Otra vez: hay que DROPEAR la firma anterior. Un `create or replace`
-- con menos parámetros deja la vieja viva como sobrecarga, y PostgREST
-- resuelve por las claves del JSON: quedaría intacto el camino que
-- acepta `p_metodo` del cliente.
-- ============================================================
drop function if exists public.fichar_con_rostro(
  jsonb, text, uuid, double precision, double precision, text, uuid, text
);

create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null,
  p_terminal_id uuid default null,
  p_terminal_secreto text default null
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
  v_radio double precision;
  v_fuera boolean := null;
  v_tipo tipo_fichaje;
  v_metodo metodo_fichaje;
  v_fila fichajes;
  v_hash text;
begin
  if v_empresa is null then
    raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
  end if;

  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  if p_empleado_id is not null then
    -- ---- 1:1 (celular / empleado). No necesita terminal. ----
    if auth_empleado() is null
       or auth_empleado() is distinct from p_empleado_id then
      raise exception 'Solo podés fichar por vos.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- ---- 1:N (kiosco). F-01: gestor + terminal vinculada. ----
    if not es_gestor() then
      raise exception 'El fichaje en planta se hace desde la terminal.'
        using errcode = 'insufficient_privilege';
    end if;

    if p_terminal_id is null or p_terminal_secreto is null
       or not terminal_habilitada(p_terminal_id, p_terminal_secreto, v_empresa)
    then
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  select e.id,
         e.modo_fichaje,
         e.geocerca,
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

  -- F-07: el método sale del camino recorrido, no de un parámetro.
  --
  --   1:N  → sólo se llega hasta acá con una terminal vinculada válida,
  --          así que la marca es de la tablet de planta.
  --   1:1  → es la persona con su propio dispositivo. Si su modo es
  --          remoto la marca es `remoto` (ficha desde donde sea y no se
  --          le controla zona); en cualquier otro caso, `celular`.
  --
  -- El modo sale de `empleados.modo_fichaje`, que es dato del servidor.
  if p_empleado_id is null then
    v_metodo := 'facial_tablet'::metodo_fichaje;
  elsif v_mejor.modo_fichaje = 'remoto' then
    v_metodo := 'remoto'::metodo_fichaje;
  else
    v_metodo := 'celular'::metodo_fichaje;
  end if;

  -- FIC-012: geocerca del empleado, sólo en 1:1 con modo celular.
  if p_empleado_id is not null
     and v_mejor.modo_fichaje = 'celular'
     and v_mejor.geocerca is not null
     and v_mejor.geocerca <> 'null'::jsonb
     and p_lat is not null and p_lng is not null then
    v_radio := coalesce((v_mejor.geocerca->>'radioM')::double precision, 150);
    v_fuera := distancia_metros(
                 (v_mejor.geocerca->>'lat')::double precision,
                 (v_mejor.geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > v_radio;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  if p_tipo is not null and (es_gestor() or es_superadmin()) then
    v_tipo := p_tipo::tipo_fichaje;
  else
    v_tipo := tipo_de_marca_siguiente(v_mejor.id, clock_timestamp());
  end if;

  perform set_config('app.fichaje_validado', 'si', true);

  insert into fichajes (
    empresa_id, empleado_id, tipo, ts, metodo, confianza, geo, fuera_de_zona
  ) values (
    v_empresa,
    v_mejor.id,
    v_tipo,
    clock_timestamp(),
    v_metodo,
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  -- Se apaga el permiso apenas se usó.
  --
  -- `set_config(..., true)` dura toda la transacción, no la sentencia.
  -- Como nunca se apagaba, cualquier INSERT directo posterior dentro de
  -- la MISMA transacción pasaba por "validado por el servidor": se
  -- salteaba `imponer_actor_fichaje` (o sea el método lo volvía a elegir
  -- el cliente) y también `exigir_fichaje_facial_validado` (o sea se
  -- podía afirmar confianza y geocerca a mano).
  --
  -- Por PostgREST cada request es su propia transacción, así que no era
  -- explotable desde la API; pero es un permiso encendido esperando que
  -- alguien agrupe dos operaciones. Lo encontró el test de F-07.
  perform set_config('app.fichaje_validado', '', true);

  insert into fichajes_descriptor_usado (empleado_id, descriptor_hash)
  values (v_mejor.id, v_hash);

  return next v_fila;
  return;
end;
$$;

comment on function public.fichar_con_rostro is
  'Ficha validando rostro, terminal y geocerca en el servidor. El método '
  'lo deriva la base del camino usado (F-07): 1:N por terminal → '
  'facial_tablet; 1:1 → remoto o celular según modo_fichaje. 1:N exige '
  'gestor + terminal vinculada (F-01); 1:1 exige ser el titular.';

revoke all on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text
) from public;
revoke all on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text
) from anon;
grant execute on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text
) to authenticated;

notify pgrst, 'reload schema';
