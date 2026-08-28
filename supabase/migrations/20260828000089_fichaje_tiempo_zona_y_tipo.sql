-- ============================================================
-- Fichaje — integridad de tiempo, zona y tipo
--
-- A04  Ninguna marca puede nacer en el futuro, venga por donde venga.
-- A06  La geocerca pasa de "se anota si estabas afuera" a "no se ficha
--      si no estás adentro", incluida la falta de coordenadas.
-- A07  `p_tipo` deja de aceptarse cuando alguien ficha por sí mismo, y
--      cuando se usa queda auditado.
--
-- Las tres son la misma clase de problema: una regla que la interfaz
-- decía cumplir y la base no exigía. Idempotente.
-- ============================================================

-- ============================================================
-- PARTE 1 — A04: no se ficha en el futuro
--
-- Qué pasaba
-- ----------
-- La única validación de "no se puede cargar un fichaje futuro" vivía en
-- el modal de carga manual. En la base no había nada: `fichajes.ts` no
-- tiene CHECK, y `lock_fichaje_ts_empleado()` sólo pisa el timestamp
-- cuando el actor NO es gestor. O sea que un `POST` a PostgREST con el
-- JWT de cualquier gestor —o un año mal tipeado que la pantalla no
-- atajara— entraba sin resistencia.
--
-- Por qué importa más de lo que parece
-- ------------------------------------
-- No es un dato feo y nada más. `tipo_de_marca_siguiente()` ordena por
-- `ts desc`, así que una marca del año que viene pasa a ser "la última"
-- hasta que llegue esa fecha: la alternancia ingreso/egreso queda
-- congelada. Y la pausa anti-rebote del kiosco pregunta
-- `f.ts > ahora - interval '3 minutes'`, condición que una marca futura
-- cumple siempre, así que el RPC devuelve esa misma fila una y otra vez
-- y esa persona no puede volver a fichar en la tablet. La única salida
-- es anular la marca, que sólo puede admin_rrhh.
--
-- Contra qué reloj
-- ----------------
-- Contra `reloj_fichaje()` y no contra `clock_timestamp()`. Es el reloj
-- del subsistema de fichaje (migración 88): en producción devuelve
-- siempre la hora real, y sólo una sesión de superusuario —psql, o sea
-- los tests— puede moverlo. Comparar contra `clock_timestamp()` haría
-- que un test que adelanta el reloj para simular el paso del tiempo
-- viera rechazadas sus propias marcas.
--
-- El margen
-- ---------
-- Cinco minutos. Los relojes de las tablets de planta se desajustan, y
-- rechazar una fichada real por noventa segundos de deriva sería peor
-- que el problema que esto resuelve. Cinco minutos no alcanzan para
-- ninguna de las consecuencias de arriba.
-- ============================================================

create or replace function public.margen_reloj_fichaje()
returns interval language sql immutable
as $$ select interval '5 minutes' $$;

comment on function public.margen_reloj_fichaje() is
  'Cuánto se le tolera a un reloj desajustado antes de considerar que '
  'una marca viene del futuro.';

grant execute on function public.margen_reloj_fichaje() to authenticated;

create or replace function public.rechazar_fichaje_futuro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ts > reloj_fichaje() + margen_reloj_fichaje() then
    raise exception
      'No se puede registrar un fichaje con fecha futura.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.rechazar_fichaje_futuro() is
  'A04: ninguna marca nace en el futuro. Corre después de '
  'lock_fichaje_ts_empleado (orden alfabético de triggers) para ver el '
  'ts definitivo, no el que afirmó el cliente.';

-- El nombre importa: los triggers BEFORE INSERT corren en orden
-- alfabético, y éste tiene que ver el `ts` YA pisado por
-- `trg_lock_fichaje_ts_empleado` ("l" < "r"). Al revés validaría un
-- valor que después se reemplaza.
drop trigger if exists trg_rechazar_fichaje_futuro on public.fichajes;
create trigger trg_rechazar_fichaje_futuro
  before insert on public.fichajes
  for each row execute function public.rechazar_fichaje_futuro();

-- ============================================================
-- PARTE 2 — A06: la geocerca rechaza, no anota
--
-- Qué pasaba
-- ----------
-- El RPC evaluaba la zona SÓLO si llegaban `p_lat` y `p_lng`, y cuando
-- no llegaban dejaba `fuera_de_zona` en null y guardaba la marca igual.
-- `obtenerUbicacion()` en el cliente es best-effort: si la persona
-- deniega el permiso devuelve `undefined` y el fichaje seguía adelante.
--
-- O sea que el control de zona era opcional para el controlado. Y peor:
-- la pantalla sólo pinta el cartel cuando `fuera_de_zona` es true, así
-- que "no dio ubicación" y "estaba adentro" se veían idénticos, incluso
-- en la planilla que va a liquidación.
--
-- Regla nueva
-- -----------
--   sin geocerca configurada          → permitir
--   geocerca + adentro                → permitir
--   geocerca + afuera                 → RECHAZAR
--   geocerca + sin coordenadas        → RECHAZAR
--
-- El alcance no cambia (FIC-012): sólo 1:1 con `modo_fichaje = 'celular'`.
-- En el kiosco la geocerca mide a la tablet, que está atornillada en la
-- planta, y bajo techo el GPS no engancha: exigirla dejaría a todo el
-- turno sin poder fichar. El modo `remoto` está exento por definición.
--
-- Dos mensajes distintos y no uno: "activá la ubicación" y "estás fuera
-- de tu zona" piden cosas diferentes a quien está parado frente al
-- teléfono, y un texto genérico lo deja sin saber qué hacer.
-- ============================================================

-- ============================================================
-- PARTE 3 — A07: `p_tipo` no sirve para fichar por uno mismo
--
-- Qué pasaba
-- ----------
-- `if p_tipo is not null and (es_gestor() or es_superadmin())` no
-- distinguía el camino 1:N del 1:1. `p_tipo` se abrió (FIC-009) para
-- correcciones puntuales en el kiosco, pero tal como estaba, un gestor
-- con legajo propio podía usarlo fichando POR SÍ MISMO: encadenar dos
-- ingresos salteándose `tipo_de_marca_siguiente()`, fabricar secuencias
-- imposibles o estirar su propia jornada.
--
-- Es el mismo conflicto de interés que la migración 76 usa para NO
-- dejar anular a los supervisores, sólo que del lado de sumar horas.
--
-- Y encima no quedaba rastro: `fichar_con_rostro` no escribe en
-- `auditoria_acciones` en ningún caso, así que la única operación
-- privilegiada del camino facial era la única sin auditoría — al revés
-- que la carga manual, que `imponer_actor_fichaje` audita siempre.
--
-- Cómo queda: `p_tipo` sólo en 1:N (`p_empleado_id is null`), y cuando
-- se usa se audita. En 1:1 el tipo lo decide siempre el servidor.
-- ============================================================

create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null,
  p_terminal_id uuid default null,
  p_terminal_secreto text default null,
  p_version smallint default 1
)
returns setof fichajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := reloj_fichaje();
  v_empresa uuid := auth_empresa();
  v_umbral double precision := case when p_empleado_id is null then 0.5 else 0.6 end;
  v_margen constant double precision := 0.05;
  v_mejor record;
  v_segunda double precision;
  v_radio double precision;
  v_fuera boolean := null;
  v_con_geocerca boolean := false;
  v_tipo tipo_fichaje;
  v_tipo_forzado boolean := false;
  v_metodo metodo_fichaje;
  v_fila fichajes;
  v_hash text;
  v_version smallint := coalesce(p_version, 1);
  v_nombre text;
begin
  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  if p_empleado_id is not null then
    -- ---- 1:1 (celular / empleado). No necesita terminal. ----
    if v_empresa is null then
      raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
    end if;

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

    if p_terminal_id is null or p_terminal_secreto is null then
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;

    if v_empresa is null then
      -- F-06: el superadmin no tiene `usuarios.empresa_id`. El tenant lo
      -- dice la terminal, y sólo si el secreto coincide en la misma
      -- consulta. Mismo mensaje para "no existe" y "no calza": si no,
      -- este RPC sería un oráculo de enumeración.
      if not es_superadmin() then
        raise exception 'Sin empresa activa.'
          using errcode = 'insufficient_privilege';
      end if;

      select t.empresa_id
        into v_empresa
        from terminales t
       where t.id = p_terminal_id
         and t.activa
         and t.secreto_hash is not null
         and t.secreto_hash = hash_secreto_terminal(p_terminal_id, p_terminal_secreto);

      if v_empresa is null then
        raise exception
          'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
          using errcode = 'insufficient_privilege';
      end if;
    elsif not terminal_habilitada(p_terminal_id, p_terminal_secreto, v_empresa) then
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- El filtro de versión va en el WHERE y no en un chequeo posterior: si
  -- se comparara primero y se validara después, la plantilla incompatible
  -- ya habría competido por el `order by dist` con la correcta.
  select e.id,
         e.modo_fichaje,
         e.geocerca,
         distancia_descriptores(e.descriptor_facial, p_descriptor) as dist
    into v_mejor
    from empleados e
   where e.empresa_id = v_empresa
     and e.activo
     and e.descriptor_facial is not null
     and coalesce(e.descriptor_version, 1) = v_version
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
       and coalesce(e.descriptor_version, 1) = v_version
       and e.id <> v_mejor.id
     order by 1 asc
     limit 1;

    if v_segunda is not null and (v_segunda - v_mejor.dist) < v_margen then
      raise exception 'Hay dos rostros parecidos: fichá eligiendo tu nombre.'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- ---- A06. Geocerca: ahora corta, no anota ----
  --
  -- Va ANTES del lock y del insert a propósito: es una precondición de
  -- la fichada, no una etiqueta que se le cuelga después.
  v_con_geocerca :=
    p_empleado_id is not null
    and v_mejor.modo_fichaje = 'celular'
    and v_mejor.geocerca is not null
    and v_mejor.geocerca <> 'null'::jsonb
    and (v_mejor.geocerca->>'lat') is not null
    and (v_mejor.geocerca->>'lng') is not null;

  if v_con_geocerca then
    if p_lat is null or p_lng is null then
      -- Sin coordenadas no se puede afirmar que estaba en su zona, y una
      -- marca que no prueba nada no puede valer lo mismo que una que sí.
      -- Que el cliente "no haya podido" pedir la ubicación no puede ser
      -- la forma de esquivar el control.
      raise exception
        'No podemos verificar tu ubicación. Activá el permiso de ubicación para fichar.'
        using errcode = 'insufficient_privilege';
    end if;

    -- Radio por defecto igual al que propone la ficha del empleado, para
    -- que una zona a medio cargar no anule el control en silencio.
    v_radio := coalesce((v_mejor.geocerca->>'radioM')::double precision, 150);
    v_fuera := distancia_metros(
                 (v_mejor.geocerca->>'lat')::double precision,
                 (v_mejor.geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > v_radio;

    if v_fuera then
      raise exception
        'Estás fuera de tu zona de trabajo. Acercate al lugar donde te toca fichar.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Misma persona, dos requests a la vez: el segundo espera y ve la marca
  -- que acaba de entrar. Sin esto el tipo se decide dos veces sobre "no
  -- hay marca" y salen un ingreso y un egreso. El lock va ANTES de la
  -- pausa y de tipo_de_marca_siguiente.
  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  -- Anti-rebote del kiosco (1:N). No decide si es entrada o salida: si ya
  -- hay una marca de hace menos de 3 minutos, es el mismo evento.
  if p_empleado_id is null then
    select f.*
      into v_fila
      from fichajes f
     where f.empleado_id = v_mejor.id
       and f.anulado_en is null
       -- A04: y no del futuro. Una marca futura cumple "hace menos de
       -- tres minutos" para siempre, así que sin esta condición dejaba a
       -- esa persona sin poder volver a fichar en la tablet. El trigger
       -- ya impide crearlas; esto cubre las que puedan haber quedado en
       -- la tabla de antes.
       and f.ts <= v_ahora
       and f.ts > v_ahora - interval '3 minutes'
     order by f.ts desc, f.id desc
     limit 1;

    if found then
      return next v_fila;
      return;
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
  if p_empleado_id is null then
    v_metodo := 'facial_tablet'::metodo_fichaje;
  elsif v_mejor.modo_fichaje = 'remoto' then
    v_metodo := 'remoto'::metodo_fichaje;
  else
    v_metodo := 'celular'::metodo_fichaje;
  end if;

  -- ---- A07. `p_tipo`: sólo 1:N, y auditado ----
  --
  -- `p_empleado_id is null` es la condición nueva. En 1:1 la persona es
  -- el titular de la marca, así que dejarle elegir el tipo es dejarle
  -- editar su propio registro de horas.
  if p_tipo is not null
     and p_empleado_id is null
     and (es_gestor() or es_superadmin()) then
    v_tipo := p_tipo::tipo_fichaje;
    v_tipo_forzado := true;
  else
    v_tipo := tipo_de_marca_siguiente(v_mejor.id, v_ahora);
  end if;

  perform set_config('app.fichaje_validado', 'si', true);

  insert into fichajes (
    empresa_id, empleado_id, tipo, ts, metodo, confianza, geo, fuera_de_zona
  ) values (
    v_empresa,
    v_mejor.id,
    v_tipo,
    v_ahora,
    v_metodo,
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  -- Se apaga el permiso apenas se usó (ver migración 76).
  perform set_config('app.fichaje_validado', '', true);

  insert into fichajes_descriptor_usado (empleado_id, descriptor_hash)
  values (v_mejor.id, v_hash);

  -- A07: la única operación privilegiada de este camino deja rastro.
  -- Forzar el tipo es sobrescribir lo que el servidor había calculado, y
  -- eso no puede pasar sin que quede quién lo hizo y sobre quién.
  if v_tipo_forzado then
    select u.nombre_completo into v_nombre from usuarios u where u.id = auth.uid();
    insert into auditoria_acciones (
      empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle
    ) values (
      v_fila.empresa_id,
      auth.uid(),
      coalesce(v_nombre, ''),
      'forzar_tipo_fichaje',
      'fichaje',
      v_fila.id::text,
      jsonb_build_object(
        'empleadoId', v_fila.empleado_id,
        'tipoForzado', v_fila.tipo,
        'tipoQueCorrespondia', tipo_de_marca_siguiente(v_mejor.id, v_ahora),
        'timestamp', v_fila.ts,
        'metodo', v_fila.metodo
      )
    );
  end if;

  return next v_fila;
  return;
end;
$$;

comment on function public.fichar_con_rostro is
  'Ficha validando rostro, terminal, zona y tipo en el servidor. Compara '
  'SOLO contra plantillas de la misma descriptor_version. El método lo '
  'deriva la base del camino usado (F-07). 1:N exige gestor + terminal '
  'vinculada (F-01); si el actor es superadmin sin empresa propia, el '
  'tenant es el de la terminal (F-06). 1:1 exige ser el titular. '
  'A06: con geocerca configurada, fichar exige coordenadas y estar '
  'dentro; sin coordenadas o fuera de zona se rechaza. '
  'A07: p_tipo sólo se acepta en 1:N y queda auditado; en 1:1 el tipo lo '
  'decide tipo_de_marca_siguiente(). '
  'A04: ninguna marca puede nacer en el futuro (trg_rechazar_fichaje_futuro).';

notify pgrst, 'reload schema';

-- ============================================================
-- PARTE 4 — A04 (cont.): las marcas futuras que ya estuvieran cargadas
-- tampoco pueden describir el presente.
--
-- El trigger de la Parte 1 impide crear nuevas, pero no dice nada de las
-- que puedan haber quedado en la tabla de antes de esta migración. No se
-- borran ni se anulan —eso sería decidir por RRHH sobre datos reales—:
-- simplemente dejan de contar como "la última marca" para decidir qué
-- toca fichar ahora. Siguen visibles en el historial, que es donde
-- alguien las va a ver y corregir.
--
-- Sin esto, una marca del año que viene se ordenaba primera en el
-- `order by ts desc` y devolvía 'egreso' para siempre.
-- ============================================================

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
     -- A04: sólo lo que ya pasó decide qué toca ahora.
     and f.ts <= v_ahora + margen_reloj_fichaje()
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

comment on function public.tipo_de_marca_siguiente is
  'Ingreso o egreso que corresponde a la próxima marca de esa persona, '
  'según si hay una jornada en curso (max_jornada()) y no según el día '
  'calendario. Ignora anuladas (F-12) y futuras (A04). Única definición: '
  'la comparte fichar_con_rostro.';

revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from public;
revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from anon;
revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from authenticated;

-- ------------------------------------------------------------
-- Y lo mismo para `en_curso`: una jornada que empieza en el futuro daba
-- `now() - entrada` negativo, o sea menor que `max_jornada()`, y salía
-- como "alguien trabajando ahora mismo" en el tablero y en el filtro de
-- incidencias. Es el espejo exacto de la cota inferior que se agregó en
-- `armarJornadas` del lado del cliente.
--
-- Sólo cambia esa expresión; el resto del cuerpo es el de la migración 47.
-- ------------------------------------------------------------

create or replace function jornadas_de_empresa(
  p_empresa_id uuid,
  p_desde date,
  p_hasta date,
  p_empleado_ids uuid[] default null
)
returns table (
  empleado_id uuid,
  fecha date,
  entrada timestamptz,
  salida timestamptz,
  marcas int,
  fuera_de_zona boolean,
  cerrada boolean,
  en_curso boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (p_desde::timestamp at time zone zona_empresa()) as lo,
      ((p_hasta + 1)::timestamp at time zone zona_empresa()) as hi
  ),
  agrupadas as (
    select
      n.empleado_id,
      n.nro,
      min(n.ts) filter (where n.tipo = 'ingreso') as entrada,
      max(n.ts) filter (where n.tipo = 'egreso') as salida,
      min(n.ts) as primera,
      (array_agg(n.tipo order by n.ts desc, n.id desc))[1] as ultimo_tipo,
      count(*)::int as marcas,
      bool_or(n.fuera_de_zona) as fuera_de_zona
    from limites l,
      lateral marcas_numeradas(
        p_empresa_id,
        l.lo - interval '1 day',
        l.hi + interval '1 day',
        p_empleado_ids
      ) n
    group by 1, 2
  )
  select
    a.empleado_id,
    (coalesce(a.entrada, a.primera) at time zone zona_empresa())::date as fecha,
    a.entrada,
    a.salida,
    a.marcas,
    a.fuera_de_zona,
    (a.entrada is not null and a.ultimo_tipo = 'egreso') as cerrada,
    (
      a.entrada is not null
      and a.ultimo_tipo <> 'egreso'
      -- A04: cota inferior. Una jornada que todavía no empezó no es
      -- alguien que está adentro trabajando.
      and a.entrada <= now() + margen_reloj_fichaje()
      and now() - a.entrada < max_jornada()
    ) as en_curso
  from agrupadas a, limites l
  where coalesce(a.entrada, a.primera) >= l.lo
    and coalesce(a.entrada, a.primera) < l.hi
  order by 2, 1
$$;

comment on function jornadas_de_empresa is
  'Una fila por jornada (sesión de trabajo), no por día calendario, con '
  'entrada, salida, marcas y estado. `cerrada` y `en_curso` se calculan '
  'acá para poder filtrar en SQL antes de paginar. `en_curso` exige que '
  'la entrada ya haya ocurrido (A04).';

grant execute on function jornadas_de_empresa(uuid, date, date, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
