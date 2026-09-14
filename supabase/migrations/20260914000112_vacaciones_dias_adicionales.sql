-- ============================================================
-- Días adicionales de vacaciones por convenio, a nivel empresa.
--
-- Se suman a lo que ya corresponde por antigüedad (LCT corridos o
-- escala de hábiles). Cero o ausente = sin extra. No son días
-- arrastrados: esos siguen en vacaciones_pendientes.
--
-- Espejo de `diasAdicionalesDe` + `diasVacacionesCorresponden` en TS.
-- ============================================================

create or replace function public.dias_vacaciones_corresponden(
  p_empleado_id uuid,
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
  v_ingreso date;
  v_dias numeric;
  v_anios numeric;
  v_habiles boolean := coalesce((p_config ->> 'vacacionesDiasHabiles')::boolean, false);
  v_escala jsonb := coalesce(p_config -> 'vacacionesEscala', '{}'::jsonb);
  v_adicionales int := greatest(
    0,
    coalesce((p_config ->> 'vacacionesDiasAdicionales')::int, 0)
  );
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
      raise exception 'No autorizado a consultar ese legajo';
    end if;
  end if;

  select e.fecha_ingreso into v_ingreso
    from empleados e where e.id = p_empleado_id;

  if v_ingreso is null or v_ingreso > v_cierre then
    return 0;
  end if;

  if not v_habiles then
    return vacaciones_legales_corridas(p_empleado_id, p_anio) + v_adicionales;
  end if;

  v_dias := (v_cierre - v_ingreso);
  v_anios := v_dias / 365.25;

  if v_anios < 0.5 then
    return floor(v_dias / 20)::int + v_adicionales;
  end if;
  if v_anios < 5 then
    return coalesce((v_escala ->> 'hasta5')::int, 10) + v_adicionales;
  end if;
  if v_anios < 10 then
    return coalesce((v_escala ->> 'hasta10')::int, 15) + v_adicionales;
  end if;
  if v_anios < 20 then
    return coalesce((v_escala ->> 'hasta20')::int, 20) + v_adicionales;
  end if;
  return coalesce((v_escala ->> 'masDe20')::int, 25) + v_adicionales;
end;
$$;

comment on function public.dias_vacaciones_corresponden(uuid, int, jsonb) is
  'Días de vacaciones del año según el régimen de la empresa, más '
  'vacacionesDiasAdicionales de convenio (0 si no está). Lee el legajo. '
  'Tenant: auth_empresa() (autenticados); superadmin libre; sin JWT sin '
  'gate. Espejo de diasVacacionesCorresponden().';

revoke all on function public.dias_vacaciones_corresponden(uuid, int, jsonb) from public;
revoke all on function public.dias_vacaciones_corresponden(uuid, int, jsonb) from anon;
grant execute on function public.dias_vacaciones_corresponden(uuid, int, jsonb) to authenticated;

notify pgrst, 'reload schema';
