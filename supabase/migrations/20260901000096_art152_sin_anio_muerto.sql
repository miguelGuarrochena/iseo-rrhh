-- ============================================================
-- F-17: `dias_no_computables_art152` recibía un año que no usaba.
--
-- La función acota las ausencias con `p_desde` / `p_hasta`, que ya vienen
-- recortados al año por el caller. `p_anio` no aparece en el cuerpo: es
-- un parámetro muerto, y un parámetro muerto en una firma de cuatro
-- argumentos es una invitación a llamarla con el año de un lado y el
-- rango de otro. Es la misma clase de trampa que la migración 92 sacó de
-- `vacaciones_legales_corridas`.
--
-- Se recrea sin él y se dropea la firma vieja para que ningún caller
-- —ni PostgREST, que resuelve por nombre de argumento— pueda seguir
-- llamándola.
--
-- No cambia ningún resultado: hoy la lista de tipos no computables está
-- vacía y la función devuelve 0 siempre.
--
-- Idempotente.
-- ============================================================

create or replace function public.dias_no_computables_art152(
  p_empleado_id uuid,
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

comment on function public.dias_no_computables_art152(uuid, date, date) is
  'Días hábiles que NO se computan como trabajados para el art. 151. Hoy '
  'siempre 0: el art. 152 computa todos los tipos que ISEO RH modela.';

-- El único caller, a la firma nueva. Se reescribe entera porque
-- `create or replace` no puede cambiar una llamada del cuerpo.
create or replace function public.vacaciones_legales_corridas(
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
  v_inicio date := make_date(p_anio, 1, 1);
  v_cierre date := make_date(p_anio, 12, 31);
  v_ingreso date;
  v_baja date;
  v_desde date;
  v_hasta date;
  v_del_anio int;
  v_trabajados int;
begin
  -- Los dos extremos del período salen de la MISMA fila, en la misma
  -- consulta. Es lo que hace imposible que uno llegue y el otro no.
  select e.fecha_ingreso, e.fecha_baja
    into v_ingreso, v_baja
    from empleados e
   where e.id = p_empleado_id;

  if v_ingreso is null or v_ingreso > v_cierre then
    return 0;
  end if;

  v_desde := greatest(v_ingreso, v_inicio);
  v_hasta := least(coalesce(v_baja, v_cierre), v_cierre);
  if v_hasta < v_desde then
    return 0;
  end if;

  v_del_anio := dias_habiles_art151(v_inicio, v_cierre);
  v_trabajados := greatest(
    0,
    dias_habiles_art151(v_desde, v_hasta)
      - dias_no_computables_art152(p_empleado_id, v_desde, v_hasta)
  );

  -- Art. 151: "la mitad, como mínimo". Se duplica en vez de dividir para
  -- no arrastrar un decimal justo en el borde, que es donde se decide
  -- entre el período completo y el proporcional.
  if v_del_anio > 0 and v_trabajados * 2 >= v_del_anio then
    return tramo_legal_art150(v_ingreso, v_cierre);
  end if;

  -- Art. 153: un día cada veinte de trabajo efectivo, contado "según la
  -- forma prevista en el artículo 151".
  return floor(v_trabajados / 20.0)::int;
end;
$$;

comment on function public.vacaciones_legales_corridas(uuid, int) is
  'Días de vacaciones que corresponden por LEY en un año, en días '
  'corridos (LCT arts. 150 a 153). Lee ingreso y baja del legajo. '
  'Espejo de calcularVacacionesLegalesCorridas().';

grant execute on function public.vacaciones_legales_corridas(uuid, int)
  to authenticated;

drop function if exists public.dias_no_computables_art152(uuid, int, date, date);

notify pgrst, 'reload schema';
