-- ============================================================
-- Vacaciones legales — LCT arts. 150 a 153, en días corridos.
--
-- Esta migración corrige SOLAMENTE el régimen legal. La modalidad propia
-- de ISEO RH basada en días hábiles queda exactamente como estaba: mismo
-- umbral, misma fórmula, mismos números.
--
-- Por qué hay que tocar la base y no alcanza con el cliente
-- --------------------------------------------------------
-- `exigir_saldo_vacaciones_al_insertar` (migración 68) rechaza una
-- solicitud si pide más días de los que quedan, y ese saldo sale de
-- `dias_vacaciones_corresponden`. Si la base y el cliente no calculan lo
-- mismo, la pantalla ofrece días que el trigger después rechaza — o al
-- revés, deja pasar más de los que corresponden.
--
-- Qué estaba mal en el régimen legal
-- ----------------------------------
-- 1. El requisito del art. 151 se resolvía con `v_anios < 0.5`, o sea
--    "medio año de calendario". La ley dice otra cosa: haber prestado
--    servicios la mitad, como mínimo, de los DÍAS HÁBILES del año.
-- 2. Los tramos del art. 150 usaban `< 5`, `< 10`, `< 20`. La ley dice
--    "hasta" cinco años, no "menos de": quien cumple la antigüedad
--    exacta el 31/12 está todavía en el tramo de abajo.
-- 3. El proporcional del art. 153 se calculaba sobre días de calendario.
--    El artículo manda contarlos "según la forma prevista en el artículo
--    151", que son días hábiles computables.
--
-- Dos "días hábiles" que no son lo mismo
-- -------------------------------------
-- El art. 151 mide el REQUISITO en días hábiles; el art. 150 mide la
-- DURACIÓN en días corridos. Y ninguno de los dos es la modalidad de
-- días hábiles de ISEO RH, que es un esquema más generoso que algunas
-- empresas acuerdan. Son tres cosas distintas y acá quedan separadas.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Art. 151: días hábiles a los efectos del requisito.
--
-- Lunes a viernes, con los FERIADOS ADENTRO: en un feriado el trabajador
-- normalmente debería prestar servicios y es la ley la que lo libera, así
-- que no es un día que él haya dejado de trabajar.
--
-- Es deliberadamente distinta de `dias_habiles_entre`, que sí descuenta
-- feriados porque responde otra pregunta —cuántos días de vacaciones
-- consume un período en la modalidad de hábiles—. Dos preguntas, dos
-- funciones.
-- ------------------------------------------------------------
create or replace function public.dias_habiles_art151(
  p_desde date,
  p_hasta date
)
returns int
language sql
immutable
as $$
  select case
    when p_hasta < p_desde then 0
    else (
      select count(*)::int
        from generate_series(p_desde, p_hasta, interval '1 day') d
       where extract(isodow from d) < 6
    )
  end;
$$;

comment on function public.dias_habiles_art151(date, date) is
  'Días hábiles a los efectos del art. 151 LCT: lunes a viernes, con los '
  'feriados incluidos. No confundir con dias_habiles_entre(), que los '
  'descuenta porque cuenta consumo de vacaciones en días hábiles.';

grant execute on function public.dias_habiles_art151(date, date) to authenticated;

-- ------------------------------------------------------------
-- Art. 152: qué ausencias NO se computan como trabajadas.
--
-- Hoy: NINGUNA, y no por olvido.
--
-- El artículo manda computar como trabajados los días de licencia legal o
-- convencional, enfermedad inculpable, infortunio de trabajo "y otras
-- causas no imputables al trabajador". O sea que lo que hay que enumerar
-- son las EXCEPCIONES. Repasando el enum `tipo_ausencia` —vacaciones,
-- enfermedad, estudio, mudanza, fallecimiento, especial, casamiento,
-- donación de sangre, exámenes, home office y las tres parciales de
-- entrada/salida— todos son licencia legal o convencional, o directamente
-- días trabajados. Ninguno le es imputable al trabajador.
--
-- La excepción típica sería la licencia sin goce de sueldo, que se otorga
-- a pedido de la persona. ISEO RH no la modela: no está en el enum.
--
-- La función existe igual, con la lista vacía, para que el día que se
-- agregue un tipo así haya un solo lugar donde nombrarlo — acá y en
-- `AUSENCIAS_NO_COMPUTABLES_ART_152` del cliente.
-- ------------------------------------------------------------
create or replace function public.tipos_ausencia_no_computables_art152()
returns text[]
language sql
immutable
as $$ select array[]::text[] $$;

comment on function public.tipos_ausencia_no_computables_art152() is
  'Tipos de ausencia que NO se computan como trabajados (art. 152 LCT). '
  'Hoy vacío: todos los tipos que modela ISEO RH son computables.';

create or replace function public.dias_no_computables_art152(
  p_empleado_id uuid,
  p_anio int,
  p_desde date,
  p_hasta date
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    dias_habiles_art151(
      greatest(a.fecha_desde, p_desde),
      least(a.fecha_hasta, p_hasta)
    )
  ), 0)::int
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.estado = 'aprobada'
    and a.tipo::text = any (tipos_ausencia_no_computables_art152())
    and a.fecha_desde <= p_hasta
    and a.fecha_hasta >= p_desde;
$$;

comment on function public.dias_no_computables_art152(uuid, int, date, date) is
  'Días hábiles que NO se computan como trabajados para el art. 151. Hoy '
  'siempre 0: el art. 152 computa todos los tipos que ISEO RH modela.';

-- ------------------------------------------------------------
-- Art. 150: el tramo por antigüedad al cierre.
--
-- Los cortes son "más de N años", no "N o más". Para distinguir cinco
-- años exactos de cinco años y un día se mira si el aniversario ya quedó
-- ATRÁS al cierre; `age()` o una resta de años no alcanzan.
--
-- `+ n years` sobre un 29 de febrero da el 28 en los años no bisiestos,
-- que adelanta el aniversario un día y puede correr a alguien de tramo.
-- Por eso se corrige al 1 de marzo, igual que `aniversarioDe` en el
-- cliente (criterio del art. 25 del Código Civil).
-- ------------------------------------------------------------
create or replace function public.aniversario_de(
  p_fecha date,
  p_anios int
)
returns date
language sql
immutable
as $$
  select case
    when extract(month from p_fecha) = 2
     and extract(day from p_fecha) = 29
     and extract(day from (p_fecha + make_interval(years => p_anios))) = 28
    then (p_fecha + make_interval(years => p_anios))::date + 1
    else (p_fecha + make_interval(years => p_anios))::date
  end;
$$;

comment on function public.aniversario_de(date, int) is
  'La fecha en la que se cumplen N años desde una fecha civil. El 29 de '
  'febrero cae el 1 de marzo los años no bisiestos (art. 25 CCyC).';

create or replace function public.tramo_legal_art150(
  p_fecha_ingreso date,
  p_cierre date
)
returns int
language sql
immutable
as $$
  select case
    when aniversario_de(p_fecha_ingreso, 5)  >= p_cierre then 14
    when aniversario_de(p_fecha_ingreso, 10) >= p_cierre then 21
    when aniversario_de(p_fecha_ingreso, 20) >= p_cierre then 28
    else 35
  end;
$$;

comment on function public.tramo_legal_art150(date, date) is
  'Días corridos del art. 150 LCT según la antigüedad al cierre: hasta 5 '
  'años → 14, más de 5 y hasta 10 → 21, más de 10 y hasta 20 → 28, más de '
  '20 → 35. Los cortes son "hasta N", no "menos de N".';

grant execute on function public.tramo_legal_art150(date, date) to authenticated;

-- ------------------------------------------------------------
-- El derecho legal del año, completo.
-- ------------------------------------------------------------
create or replace function public.vacaciones_legales_corridas(
  p_empleado_id uuid,
  p_fecha_ingreso date,
  p_anio int,
  p_fecha_baja date default null
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_anio, 1, 1);
  v_cierre date := make_date(p_anio, 12, 31);
  v_desde date;
  v_hasta date;
  v_del_anio int;
  v_trabajados int;
begin
  if p_fecha_ingreso is null or p_fecha_ingreso > v_cierre then
    return 0;
  end if;

  v_desde := greatest(p_fecha_ingreso, v_inicio);
  v_hasta := least(coalesce(p_fecha_baja, v_cierre), v_cierre);
  if v_hasta < v_desde then
    return 0;
  end if;

  v_del_anio := dias_habiles_art151(v_inicio, v_cierre);
  v_trabajados := greatest(
    0,
    dias_habiles_art151(v_desde, v_hasta)
      - dias_no_computables_art152(p_empleado_id, p_anio, v_desde, v_hasta)
  );

  -- Art. 151: "la mitad, como mínimo". Se duplica en vez de dividir para
  -- no arrastrar un decimal justo en el borde, que es donde se decide
  -- entre el período completo y el proporcional.
  if v_del_anio > 0 and v_trabajados * 2 >= v_del_anio then
    return tramo_legal_art150(p_fecha_ingreso, v_cierre);
  end if;

  -- Art. 153: un día cada veinte de trabajo efectivo, contado "según la
  -- forma prevista en el artículo 151".
  return floor(v_trabajados / 20.0)::int;
end;
$$;

comment on function public.vacaciones_legales_corridas(uuid, date, int, date) is
  'Días de vacaciones que corresponden por LEY en un año, en días '
  'corridos (LCT arts. 150 a 153). Espejo de '
  'calcularVacacionesLegalesCorridas() en el cliente.';

grant execute on function public.vacaciones_legales_corridas(uuid, date, int, date)
  to authenticated;

-- ------------------------------------------------------------
-- El despachador: cada régimen por su camino.
--
-- La firma cambia —necesita el empleado para las ausencias del art. 152—
-- así que la vieja se DROPEA. Un `create or replace` con un parámetro
-- nuevo dejaría las dos vivas como sobrecarga y los RPC de saldo
-- seguirían resolviendo a la de tres argumentos, que es justo la que esta
-- migración viene a reemplazar. Es la misma trampa que documentaron las
-- migraciones 74, 76 y 77 con `fichar_con_rostro`.
--
-- La rama de días hábiles queda IDÉNTICA a la anterior: mismo umbral por
-- división, mismo proporcional sobre días de calendario, misma escala
-- configurable. No se toca.
-- ------------------------------------------------------------
create or replace function public.dias_vacaciones_corresponden(
  p_empleado_id uuid,
  p_fecha_ingreso date,
  p_anio int,
  p_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cierre date := make_date(p_anio, 12, 31);
  v_dias numeric;
  v_anios numeric;
  v_habiles boolean := coalesce((p_config ->> 'vacacionesDiasHabiles')::boolean, false);
  v_escala jsonb := coalesce(p_config -> 'vacacionesEscala', '{}'::jsonb);
begin
  if p_fecha_ingreso is null or p_fecha_ingreso > v_cierre then
    return 0;
  end if;

  -- ---- Régimen legal (días corridos) ----
  if not v_habiles then
    return vacaciones_legales_corridas(p_empleado_id, p_fecha_ingreso, p_anio);
  end if;

  -- ---- Modalidad propia de días hábiles: sin cambios ----
  v_dias := (v_cierre - p_fecha_ingreso);
  v_anios := v_dias / 365.25;

  if v_anios < 0.5 then
    return floor(v_dias / 20)::int;
  end if;
  if v_anios < 5 then
    return coalesce((v_escala ->> 'hasta5')::int, 10);
  end if;
  if v_anios < 10 then
    return coalesce((v_escala ->> 'hasta10')::int, 15);
  end if;
  if v_anios < 20 then
    return coalesce((v_escala ->> 'hasta20')::int, 20);
  end if;
  return coalesce((v_escala ->> 'masDe20')::int, 25);
end;
$$;

comment on function public.dias_vacaciones_corresponden(uuid, date, int, jsonb) is
  'Días de vacaciones del año según el régimen de la empresa: legal en '
  'días corridos (arts. 150-153) o la modalidad propia de días hábiles, '
  'que conserva su regla sin cambios.';

grant execute on function public.dias_vacaciones_corresponden(uuid, date, int, jsonb)
  to authenticated;

-- Los dos RPC de saldo pasan a la firma nueva. Se reescriben enteros
-- porque `create or replace` no puede cambiar el cuerpo de una llamada.
create or replace function public.saldo_vacaciones_disponible(
  p_empleado_id uuid,
  p_anio int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ingreso date;
  v_empresa uuid;
  v_config jsonb;
  v_habiles boolean;
  v_corresponden int;
  v_ajuste int;
  v_usados int;
  v_pendientes int;
begin
  -- Tenencia, igual que en la migración 68 y con la misma guarda: sólo
  -- aplica si hay sesión. Sin `auth.uid()` esto corre desde una
  -- migración, un fixture o un job, y ahí no hay empresa contra la cual
  -- comparar. Reescribir la función sin esta condición rompía el script
  -- de concurrencia, que corre como `postgres` sin JWT.
  if auth.uid() is not null and not es_superadmin() then
    if p_empleado_id is null
       or not exists (
         select 1
         from empleados e
         where e.id = p_empleado_id
           and e.empresa_id is not null
           and e.empresa_id = auth_empresa()
       )
    then
      raise exception 'No autorizado a consultar ese saldo';
    end if;
  end if;

  select e.fecha_ingreso, e.empresa_id, emp.config
    into v_ingreso, v_empresa, v_config
  from empleados e
  join empresas emp on emp.id = e.empresa_id
  where e.id = p_empleado_id;

  if v_ingreso is null then
    return 0;
  end if;

  v_habiles := coalesce((v_config ->> 'vacacionesDiasHabiles')::boolean, false);
  v_corresponden := dias_vacaciones_corresponden(
    p_empleado_id, v_ingreso, p_anio, v_config
  );

  select coalesce(dias, 0) into v_ajuste
    from vacaciones_pendientes
   where empleado_id = p_empleado_id and anio = p_anio;
  v_ajuste := coalesce(v_ajuste, 0);

  select
    coalesce(sum(
      dias_vacaciones_en_anio(a.fecha_desde, a.fecha_hasta, p_anio, v_empresa, v_habiles)
    ) filter (where a.estado = 'aprobada'), 0),
    coalesce(sum(
      dias_vacaciones_en_anio(a.fecha_desde, a.fecha_hasta, p_anio, v_empresa, v_habiles)
    ) filter (where a.estado = 'pendiente'), 0)
  into v_usados, v_pendientes
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = 'vacaciones'
    and a.fecha_desde <= make_date(p_anio, 12, 31)
    and a.fecha_hasta >= make_date(p_anio, 1, 1);

  return v_corresponden + v_ajuste - v_usados - v_pendientes;
end;
$$;

comment on function public.saldo_vacaciones_disponible(uuid, int) is
  'Saldo de vacaciones del año. El derecho sale del régimen de la empresa '
  '(legal en días corridos o modalidad de días hábiles).';

revoke all on function public.saldo_vacaciones_disponible(uuid, int) from public;
revoke all on function public.saldo_vacaciones_disponible(uuid, int) from anon;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;

-- La firma de tres argumentos se va: dejarla viva sería dejar viva la
-- regla vieja para cualquiera que la llame.
drop function if exists public.dias_vacaciones_corresponden(date, int, jsonb);

notify pgrst, 'reload schema';
