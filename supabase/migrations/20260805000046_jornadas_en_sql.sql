-- ============================================================
-- Jornadas calculadas en la base, no en el navegador.
--
-- Hasta acá, el historial de fichadas y el resumen de control se
-- bajaban TODAS las marcas del período al cliente y las agrupaban
-- ahí. Con 10 empleados no se nota; con 300 y un mes de rango son
-- ~18.000 filas viajando por la red para terminar en 300 filas de
-- tabla. Peor: el `select` se cortaba en 1000 filas sin avisar, así
-- que el resumen y el Excel salían incompletos en silencio.
--
-- Esta función hace el colapso del lado del servidor: devuelve una
-- fila por empleado y día, que es la unidad con la que razona la app
-- ("entró a las 7, salió a las 16, trabajó 9 horas").
--
-- La definición de entrada/salida es la misma que ya usaba el
-- TypeScript, y es deliberada: la ENTRADA es el primer ingreso del
-- día y la SALIDA el último egreso. En planta la gente ficha al salir
-- a almorzar y al volver; tomar el primer egreso daría una jornada de
-- cuatro horas.
-- ============================================================

-- Zona de la empresa. Los fichajes se guardan en timestamptz (UTC) y
-- el día hay que cortarlo en hora local: un egreso a las 21:30 de
-- Buenos Aires es 00:30 UTC del día siguiente, y agrupando por UTC esa
-- jornada se partía en dos.
--
-- Está fijo porque toda la app es argentina (LCT, CUIL, AFIP). Si
-- algún día hay un cliente en otro huso, esto pasa a ser una columna
-- de `empresas` y un parámetro más.
create or replace function zona_empresa()
returns text
language sql
immutable
as $$ select 'America/Argentina/Buenos_Aires'::text $$;

create or replace function jornadas_de_empresa(
  p_empresa_id uuid,
  p_desde date,
  p_hasta date
)
returns table (
  empleado_id uuid,
  fecha date,
  entrada timestamptz,
  salida timestamptz,
  marcas int,
  fuera_de_zona boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    f.empleado_id,
    (f.ts at time zone zona_empresa())::date as fecha,
    min(f.ts) filter (where f.tipo = 'ingreso') as entrada,
    max(f.ts) filter (where f.tipo = 'egreso') as salida,
    count(*)::int as marcas,
    bool_or(coalesce(f.fuera_de_zona, false)) as fuera_de_zona
  from fichajes f
  where f.empresa_id = p_empresa_id
    -- Se filtra por `ts` (la columna, no una expresión) para poder usar
    -- el índice `fichajes_empresa_ts_idx`. Los límites se convierten una
    -- sola vez desde la fecha local: medianoche del primer día hasta
    -- medianoche del día siguiente al último, para que `hasta` entre
    -- completo. Filtrar por la expresión `(ts at time zone ...)::date`
    -- daría el mismo resultado pero forzaría un scan de todos los
    -- fichajes de la empresa.
    and f.ts >= (p_desde::timestamp at time zone zona_empresa())
    and f.ts < ((p_hasta + 1)::timestamp at time zone zona_empresa())
  group by 1, 2
  order by 2, 1;
$$;

comment on function jornadas_de_empresa is
  'Una fila por empleado y día: primer ingreso, último egreso y cantidad '
  'de marcas. Reemplaza el agrupado que hacía el navegador sobre todas '
  'las marcas del período.';

-- `security invoker` (el default, explícito acá para que se lea): la
-- función corre con los permisos de quien la llama, así que la RLS de
-- `fichajes` se sigue aplicando y nadie ve las jornadas de otra empresa
-- aunque pase un uuid ajeno. Con `security definer` habría que validar
-- la empresa a mano y sería un agujero esperando.
grant execute on function jornadas_de_empresa(uuid, date, date) to authenticated;

-- ---------- Índices ----------
--
-- No se indexa `(ts at time zone ...)::date`: esa expresión es STABLE y
-- no IMMUTABLE (las reglas de husos horarios cambian), así que Postgres
-- rechaza el índice. Por eso la función filtra por `ts` directamente y
-- alcanza con el índice que ya existe, `fichajes_empresa_ts_idx`.

-- El historial pagina por `ts` y necesita un orden TOTAL: sin `id` de
-- desempate, dos fichajes en el mismo instante pueden repetirse o
-- saltearse entre página y página.
create index if not exists fichajes_empresa_ts_id_idx
  on fichajes (empresa_id, ts desc, id desc);

-- Las ausencias del historial se piden por rango solapado
-- (fecha_desde <= hasta and fecha_hasta >= desde), no completas.
create index if not exists ausencias_empresa_rango_idx
  on ausencias (empresa_id, fecha_desde, fecha_hasta);

notify pgrst, 'reload schema';
