-- ============================================================
-- Jornadas por sesión, con estado (cerrada / en curso) calculado
-- en la base.
--
-- Dos problemas que se resuelven juntos porque son el mismo:
--
-- 1) El filtro "solo jornadas sin cerrar" se aplicaba en el
--    navegador, sobre la página ya traída. Con paginación eso está
--    mal: si la jornada abierta cae en la página 4, el filtro nunca
--    la muestra. El estado tiene que salir de la base para poder
--    filtrar ANTES de paginar.
--
-- 2) Las jornadas se agrupaban por fecha calendario del fichaje. Un
--    turno nocturno (entra 22:00 lunes, sale 06:00 martes) quedaba
--    partido en dos días, y los dos figuraban "sin cerrar": uno con
--    entrada sin salida y el otro con salida sin entrada. Además las
--    horas salían en cero en los dos, porque ninguno tenía el par
--    completo. Para una empresa con turno noche, el módulo entero
--    daba números falsos.
--
-- La solución de fondo es dejar de agrupar por día y agrupar por
-- SESIÓN: una jornada arranca en un ingreso que viene después de un
-- hueco largo, y se extiende hasta el último egreso antes del hueco
-- siguiente. La fecha de la jornada pasa a ser la del ingreso, que es
-- como la nombra cualquiera ("el turno del lunes a la noche").
--
-- Sobre el modelo de datos: NO se agrega una columna `cerrada`
-- guardada. Una jornada no es una fila —es el agrupado de varias
-- marcas de `fichajes`— así que un booleano guardado tendría que
-- vivir en cada marca (grano equivocado) o en una tabla materializada
-- que hay que mantener en cada alta, edición y borrado, más el
-- backfill del histórico. Calculado no se puede desincronizar nunca y
-- no necesita migración de datos. Si algún día `fichajes` llega a
-- decenas de millones de filas, o si la jornada pasa a ser una
-- entidad propia (con aprobación o corrección manual), ahí sí conviene
-- materializarla; hoy sería mantener un derivado a cambio de nada.
-- ============================================================

-- ---------- Parámetros del agrupado ----------

/**
 * Hueco a partir del cual dos marcas pertenecen a jornadas distintas.
 *
 * Seis horas está elegido entre dos cotas reales: el corte más largo
 * DENTRO de una jornada es el almuerzo (una o dos horas), y el
 * descanso más corto ENTRE jornadas son las 12 horas que exige la LCT
 * (art. 197). Cualquier valor entre 3 y 11 da el mismo resultado en la
 * práctica; 6 deja margen para los dos lados.
 */
create or replace function corte_jornada()
returns interval language sql immutable
as $$ select interval '6 hours' $$;

/**
 * Duración máxima plausible de una jornada abierta.
 *
 * Sirve para distinguir a alguien que está trabajando ahora (entró
 * hace tres horas y todavía no salió) de una jornada que quedó mal
 * cargada (entró hace cuatro días). El primero no es un error que haya
 * que corregir; el segundo sí.
 */
create or replace function max_jornada()
returns interval language sql immutable
as $$ select interval '16 hours' $$;

-- ---------- Numeración de sesiones ----------

/**
 * Cada marca del período con el número de jornada al que pertenece.
 *
 * Es la única implementación de la regla de agrupado: tanto el resumen
 * de jornadas como el listado de marcas se apoyan acá. Antes había dos
 * copias de la lógica y redondeaban distinto.
 *
 * Regla: una marca abre jornada nueva si es un ingreso y (es la
 * primera del empleado o pasó `corte_jornada()` desde la marca
 * anterior). Todo lo demás continúa la jornada en curso.
 *
 * Casos que la regla resuelve solos:
 *   - Salida y vuelta del almuerzo: hueco corto, misma jornada.
 *   - Doble toque en la terminal: hueco de segundos, misma jornada.
 *   - Se olvidó de fichar la salida y al otro día entra: hueco largo,
 *     jornada nueva (la anterior queda abierta, que es la verdad).
 *   - Egresos sin ingreso previo: quedan en la jornada 0, sin entrada.
 */
create or replace function marcas_numeradas(
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
      -- `rows` y no el `range` por defecto: con `range`, dos marcas en
      -- el mismo instante se tratan como una sola fila y el número de
      -- jornada saldría mal.
      rows between unbounded preceding and current row
    )::int as nro
  from marcas m
$$;

-- ---------- Jornadas ----------

drop function if exists jornadas_de_empresa(uuid, date, date);

/**
 * Una fila por jornada: entrada, salida, cantidad de marcas y estado.
 *
 * `cerrada` y `en_curso` son columnas calculadas, no guardadas. Como
 * PostgREST permite filtrar sobre el resultado de la función, la
 * pantalla puede pedir `cerrada=false&en_curso=false` y el filtro se
 * aplica en Postgres antes del LIMIT/OFFSET. Eso es lo que arregla el
 * bug original.
 *
 * Se leen 24 horas de más a cada lado del rango para no cortar por la
 * mitad las jornadas que cruzan el borde, y después se descartan las
 * que arrancan fuera: una jornada pertenece al período en el que
 * empezó.
 */
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
      -- Tipo de la ÚLTIMA marca de la jornada. Es lo que define si
      -- cerró: alguien que volvió del almuerzo y no fichó la salida
      -- tiene un ingreso y un egreso, pero la jornada quedó abierta.
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
    -- La jornada se fecha por su ingreso: el turno que entra el lunes
    -- 22:00 y sale el martes 06:00 es "la jornada del lunes".
    (coalesce(a.entrada, a.primera) at time zone zona_empresa())::date as fecha,
    a.entrada,
    a.salida,
    a.marcas,
    a.fuera_de_zona,
    (a.entrada is not null and a.ultimo_tipo = 'egreso') as cerrada,
    (
      a.entrada is not null
      and a.ultimo_tipo <> 'egreso'
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
  'acá para poder filtrar en SQL antes de paginar.';

-- ---------- Marcas sueltas, con el mismo criterio de jornada ----------

/**
 * Fichajes del período, opcionalmente sólo los que pertenecen a una
 * jornada sin cerrar.
 *
 * Es la vista "Movimientos" del historial. El filtro tiene que estar
 * acá y no en el cliente: filtrando después de paginar, una jornada
 * abierta que cae en la página 4 no aparece nunca.
 *
 * `returns setof fichajes` para que PostgREST devuelva exactamente la
 * misma forma que un select sobre la tabla, y para que agregar una
 * columna a `fichajes` no obligue a tocar esta función.
 */
create or replace function fichajes_del_periodo(
  p_empresa_id uuid,
  p_desde date,
  p_hasta date,
  p_empleado_ids uuid[] default null,
  p_solo_abiertas boolean default false
)
returns setof fichajes
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
  estado as (
    select
      n.id,
      -- Estado de la jornada a la que pertenece cada marca. Se calcula
      -- con ventanas sobre el mismo agrupado que usa
      -- `jornadas_de_empresa`, así las dos pantallas no pueden dar
      -- respuestas distintas sobre la misma jornada.
      bool_or(n.tipo = 'ingreso') over jornada as tiene_entrada,
      -- Igual que arriba: cierra si la ÚLTIMA marca es un egreso, no si
      -- hay alguno suelto en el medio.
      last_value(n.tipo) over (
        partition by n.empleado_id, n.nro
        order by n.ts, n.id
        rows between unbounded preceding and unbounded following
      ) = 'egreso' as cierra_con_egreso,
      min(n.ts) filter (where n.tipo = 'ingreso') over jornada as entrada
    from limites l,
      lateral marcas_numeradas(
        p_empresa_id,
        l.lo - interval '1 day',
        l.hi + interval '1 day',
        p_empleado_ids
      ) n
    window jornada as (partition by n.empleado_id, n.nro)
  )
  select f.*
  from fichajes f
  join estado e on e.id = f.id
  cross join limites l
  -- El recorte final es por el rango pedido: el día extra de cada lado
  -- se leyó sólo para clasificar bien las marcas del borde.
  where f.ts >= l.lo
    and f.ts < l.hi
    and (
      not p_solo_abiertas
      or (
        -- Sin cerrar = no tiene entrada, o no terminó con un egreso…
        not (e.tiene_entrada and e.cierra_con_egreso)
        -- …y no es alguien que está trabajando ahora mismo.
        and not (
          e.tiene_entrada
          and not e.cierra_con_egreso
          and now() - e.entrada < max_jornada()
        )
      )
    )
$$;

comment on function fichajes_del_periodo is
  'Marcas del período. Con p_solo_abiertas filtra en SQL las que '
  'pertenecen a una jornada sin cerrar, para que el filtro funcione '
  'con paginación.';

grant execute on function marcas_numeradas(uuid, timestamptz, timestamptz, uuid[])
  to authenticated;
grant execute on function jornadas_de_empresa(uuid, date, date, uuid[])
  to authenticated;
grant execute on function fichajes_del_periodo(uuid, date, date, uuid[], boolean)
  to authenticated;
grant execute on function corte_jornada() to authenticated;
grant execute on function max_jornada() to authenticated;

-- ---------- Índices ----------
--
-- El agrupado recorre `fichajes` por empresa y rango de `ts`, y sólo
-- necesita empleado_id, tipo y fuera_de_zona. Con estas columnas en el
-- índice, el barrido es index-only y no toca la tabla.
--
-- No se indexa la fecha local: `(ts at time zone …)::date` es STABLE y
-- no IMMUTABLE (las reglas de husos cambian), así que Postgres rechaza
-- un índice sobre esa expresión. Por eso todo filtra por `ts`.
create index if not exists fichajes_empresa_ts_jornada_idx
  on fichajes (empresa_id, ts) include (empleado_id, tipo, fuera_de_zona);

notify pgrst, 'reload schema';
