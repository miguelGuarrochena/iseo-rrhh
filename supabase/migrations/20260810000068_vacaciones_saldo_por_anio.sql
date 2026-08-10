-- ============================================================
-- Migration 68: BUG-012 — vacation days attributed per calendar year
--
-- Previously saldo_vacaciones_disponible counted full `ausencias.dias`
-- for any row whose fecha_desde fell in year Y, so a range 28/12–10/01
-- consumed only Y's balance for all days (including January).
--
-- Fix: count only the days of each absence that fall inside year Y
-- (same corridos/hábil rule as insert). Employee insert checks each
-- overlapped year independently against that year's saldo.
-- ============================================================

create or replace function public.dias_vacaciones_en_anio(
  p_desde date,
  p_hasta date,
  p_anio int,
  p_empresa uuid,
  p_habiles boolean
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date;
  v_fin date;
  v_year_start date := make_date(p_anio, 1, 1);
  v_year_end date := make_date(p_anio, 12, 31);
begin
  if p_hasta < p_desde then
    return 0;
  end if;
  v_ini := greatest(p_desde, v_year_start);
  v_fin := least(p_hasta, v_year_end);
  if v_fin < v_ini then
    return 0;
  end if;
  if p_habiles then
    return dias_habiles_entre(v_ini, v_fin, p_empresa);
  end if;
  return dias_corridos_entre(v_ini, v_fin);
end;
$$;

comment on function public.dias_vacaciones_en_anio(date, date, int, uuid, boolean) is
  'Days of a vacation range that fall inside calendar year p_anio.';

revoke all on function public.dias_vacaciones_en_anio(date, date, int, uuid, boolean) from public;
revoke all on function public.dias_vacaciones_en_anio(date, date, int, uuid, boolean) from anon;
grant execute on function public.dias_vacaciones_en_anio(date, date, int, uuid, boolean) to authenticated;

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
  v_corresponden := dias_vacaciones_corresponden(v_ingreso, p_anio, v_config);

  select coalesce(vp.dias, 0) into v_ajuste
  from vacaciones_pendientes vp
  where vp.empleado_id = p_empleado_id
    and vp.anio = p_anio;
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

create or replace function public.exigir_saldo_vacaciones_al_insertar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_habiles boolean;
  v_anio int;
  v_anio_fin int;
  v_disponible int;
  v_pedidos int;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.fecha_hasta < new.fecha_desde then
    raise exception 'La fecha hasta no puede ser anterior a la fecha desde';
  end if;

  select config into v_config from empresas where id = new.empresa_id;
  v_habiles := coalesce((v_config ->> 'vacacionesDiasHabiles')::boolean, false);

  if new.tipo = 'vacaciones' and v_habiles then
    new.dias := dias_habiles_entre(new.fecha_desde, new.fecha_hasta, new.empresa_id);
  else
    new.dias := dias_corridos_entre(new.fecha_desde, new.fecha_hasta);
  end if;

  if new.dias < 1 then
    raise exception 'El período de ausencia debe tener al menos un día';
  end if;

  if new.tipo <> 'vacaciones' or es_gestor() or es_superadmin() then
    return new;
  end if;

  perform 1 from empleados e where e.id = new.empleado_id for update;
  if not found then
    raise exception 'El colaborador no existe';
  end if;

  -- Check each calendar year the range touches (BUG-012).
  v_anio := extract(year from new.fecha_desde)::int;
  v_anio_fin := extract(year from new.fecha_hasta)::int;
  while v_anio <= v_anio_fin loop
    v_pedidos := dias_vacaciones_en_anio(
      new.fecha_desde, new.fecha_hasta, v_anio, new.empresa_id, v_habiles
    );
    if v_pedidos > 0 then
      v_disponible := saldo_vacaciones_disponible(new.empleado_id, v_anio);
      if v_pedidos > v_disponible then
        raise exception
          'No hay días de vacaciones suficientes en % (pedís %, quedan %)',
          v_anio, v_pedidos, v_disponible;
      end if;
    end if;
    v_anio := v_anio + 1;
  end loop;

  return new;
end;
$$;

comment on function public.exigir_saldo_vacaciones_al_insertar() is
  'Employee vacations: per-year balance check (BUG-012). Gestor override allowed.';

notify pgrst, 'reload schema';
