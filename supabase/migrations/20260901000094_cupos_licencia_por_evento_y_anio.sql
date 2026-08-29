-- ============================================================
-- L-02 y F-06: cómo se controla el cupo de una licencia.
--
-- L-02 — licencias por hecho generador
-- ------------------------------------
-- `fallecimiento` y `casamiento` estaban en la lista de tipos con cupo
-- anual, y el art. 158 no los da por año: los da por cada hecho que los
-- genera. Con el cupo "correcto" de tres días de fallecimiento, el
-- segundo duelo del año quedaba rechazado por el trigger — y este
-- trigger, a diferencia del de vacaciones, no tiene override de gestor,
-- así que tampoco RRHH podía cargarlo.
--
-- Se resuelve donde corresponde: la lista de tipos por evento vive en una
-- función, `saldo_licencia_disponible` devuelve NULL para ellos (que es
-- la señal de "sin cupo" que el trigger ya entendía) y el trigger los
-- saltea. Así una fila vieja de `cupos_licencia` sobre uno de estos tipos
-- deja de tener efecto sin necesidad de tocar datos.
--
-- F-06 — el año al que se imputan los días
-- ----------------------------------------
-- El saldo contaba `sum(dias)` de las ausencias cuyo `fecha_desde` caía
-- en el año, o sea el rango entero al año en que empezó. Una licencia del
-- 28/12 al 06/01 consumía diez días del año que termina y ninguno del que
-- empieza. Es el mismo BUG-012 que la migración 68 arregló en vacaciones
-- y que había quedado vivo en licencias; se resuelve con la misma forma:
-- contar los días del rango que pertenecen a cada año, y revisar cada año
-- que el rango toca.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Días corridos de un rango que caen dentro de un año calendario.
-- Espejo de `diasCorridosEnAnio` en el cliente.
-- ------------------------------------------------------------
create or replace function public.dias_corridos_en_anio(
  p_desde date,
  p_hasta date,
  p_anio int
)
returns int
language sql
immutable
as $$
  select dias_corridos_entre(
    greatest(p_desde, make_date(p_anio, 1, 1)),
    least(p_hasta, make_date(p_anio, 12, 31))
  );
$$;

comment on function public.dias_corridos_en_anio(date, date, int) is
  'Días corridos de un rango que pertenecen al año p_anio. Espejo de '
  'diasCorridosEnAnio() en el cliente.';

grant execute on function public.dias_corridos_en_anio(date, date, int)
  to authenticated;

-- ------------------------------------------------------------
-- Licencias que la ley otorga POR EVENTO, no por año.
--
-- Art. 158: diez días corridos por matrimonio, tres por fallecimiento de
-- cónyuge/hijos/padres, uno por fallecimiento de hermano, dos por
-- nacimiento de hijo — cada vez que el hecho ocurre. Maternidad
-- (art. 177) y excedencia (art. 183) tienen su propia duración legal y
-- tampoco son un saldo que se consuma.
--
-- El único inciso del 158 con tope anual es el e), exámenes, que sigue
-- siendo configurable. Los tipos convencionales —mudanza, estudio,
-- especial— también, porque su tope lo decide el convenio.
--
-- Un solo lugar donde nombrarlos, igual que
-- `tipos_ausencia_no_computables_art152`. Espejo de
-- `TIPOS_LICENCIA_POR_EVENTO` en el cliente.
-- ------------------------------------------------------------
create or replace function public.tipos_licencia_por_evento()
returns text[]
language sql
immutable
as $$
  select array['fallecimiento', 'casamiento', 'nacimiento',
               'maternidad', 'excedencia']::text[]
$$;

comment on function public.tipos_licencia_por_evento() is
  'Licencias que la ley otorga por hecho generador (arts. 158, 177, 183 '
  'LCT). Nunca tienen cupo anual.';

grant execute on function public.tipos_licencia_por_evento() to authenticated;

-- ------------------------------------------------------------
-- Saldo del cupo. NULL = no aplica cupo.
-- ------------------------------------------------------------
create or replace function public.saldo_licencia_disponible(
  p_empleado_id uuid,
  p_tipo tipo_ausencia,
  p_anio int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_cupo int;
  v_usados int;
begin
  -- Vacaciones tienen su propio saldo (BUG-008).
  if p_tipo = 'vacaciones' then
    return null;
  end if;

  -- Licencias por evento: sin cupo, aunque haya quedado una fila vieja
  -- en `cupos_licencia`. No se borran datos; se dejan de consultar.
  if p_tipo::text = any (tipos_licencia_por_evento()) then
    return null;
  end if;

  select e.empresa_id into v_empresa
  from empleados e
  where e.id = p_empleado_id;

  if v_empresa is null then
    return null;
  end if;

  select c.dias_anuales into v_cupo
  from cupos_licencia c
  where c.empresa_id = v_empresa
    and c.tipo = p_tipo;

  -- Sin fila → sin límite configurado.
  if v_cupo is null then
    return null;
  end if;

  -- Los días se imputan al año al que pertenecen, no al año en que la
  -- licencia empezó (F-06).
  select coalesce(sum(
    dias_corridos_en_anio(a.fecha_desde, a.fecha_hasta, p_anio)
  ), 0)
    into v_usados
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = p_tipo
    and a.estado = 'aprobada'
    and a.fecha_desde <= make_date(p_anio, 12, 31)
    and a.fecha_hasta >= make_date(p_anio, 1, 1);

  return v_cupo - v_usados;
end;
$$;

comment on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) is
  'Disponible = cupo anual − días aprobados que caen en ese año. NULL = '
  'sin cupo configurado o licencia por evento. Espejo de getSaldosLicencia.';

revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from public;
revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from anon;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

-- ------------------------------------------------------------
-- El trigger: un año por vez, igual que el de vacaciones.
-- ------------------------------------------------------------
create or replace function public.exigir_cupo_licencia_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio int;
  v_anio_fin int;
  v_disponible int;
  v_pedidos int;
  v_dias int;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Solo cuando el resultado es aprobada (consumo real).
  if tg_op = 'INSERT' then
    if new.estado is distinct from 'aprobada' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.estado is distinct from 'aprobada' then
      return new;
    end if;
    -- Ya estaba aprobada: la máquina de estados la vuelve inmutable;
    -- no revalidamos.
    if old.estado = 'aprobada' then
      return new;
    end if;
  end if;

  if new.tipo = 'vacaciones' then
    return new;
  end if;

  -- Licencia por evento: no hay cupo que revisar.
  if new.tipo::text = any (tipos_licencia_por_evento()) then
    return new;
  end if;

  -- Serializa por legajo (misma técnica que vacaciones).
  perform 1 from empleados e where e.id = new.empleado_id for update;
  if not found then
    raise exception 'El colaborador no existe';
  end if;

  -- Días: el trigger de vacaciones ya recalcula en INSERT; en UPDATE
  -- los días de la solicitud son inmutables. Por seguridad, para
  -- tipos no-vacaciones usamos corridos (misma regla que diasAusencia).
  if tg_op = 'INSERT' and new.tipo <> 'vacaciones' then
    v_dias := dias_corridos_entre(new.fecha_desde, new.fecha_hasta);
    new.dias := v_dias;
  else
    v_dias := new.dias;
  end if;

  if v_dias is null or v_dias < 1 then
    raise exception 'El período de ausencia debe tener al menos un día';
  end if;

  -- Cada año que el rango toca se compara contra el cupo de ESE año.
  v_anio := extract(year from new.fecha_desde)::int;
  v_anio_fin := extract(year from new.fecha_hasta)::int;
  while v_anio <= v_anio_fin loop
    v_pedidos := dias_corridos_en_anio(
      new.fecha_desde, new.fecha_hasta, v_anio
    );
    if v_pedidos > 0 then
      v_disponible := saldo_licencia_disponible(
        new.empleado_id, new.tipo, v_anio
      );
      -- NULL = sin cupo configurado → no limitar.
      if v_disponible is not null and v_pedidos > v_disponible then
        raise exception
          'No hay días de licencia suficientes para % en % (pedís %, quedan %)',
          new.tipo, v_anio, v_pedidos, greatest(v_disponible, 0);
      end if;
    end if;
    v_anio := v_anio + 1;
  end loop;

  return new;
end;
$$;

comment on function public.exigir_cupo_licencia_aprobada() is
  'Al aprobar/cargar aprobada, no superar cupos_licencia. Sin fila = '
  'libre; licencias por evento, siempre libres. Un año por vez (F-06).';

notify pgrst, 'reload schema';
