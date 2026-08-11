-- ============================================================
-- BUG-010: enforcement atómico de cupos de licencia
--
-- Reglas descubiertas (NO inventadas):
--   * Tabla cupos_licencia: cupo anual por (empresa, tipo).
--   * getSaldosLicencia: solo cuenta ausencias `aprobada` del
--     empleado en el año de fecha_desde. Pendientes y rechazadas
--     no consumen ni reservan.
--   * Sin fila de cupo → sin límite (tipo libre).
--   * Con fila (aunque dias_anuales = 0) → tope estricto.
--   * Vacaciones siguen en trg_exigir_saldo_vacaciones (BUG-008).
--   * No hay override de gestor documentado para licencias
--     (a diferencia de vacaciones).
--
-- Invariante: sum(días aprobados del tipo/año/empleado) ≤ cupo.
-- Se valida al INSERT con estado=aprobada y al UPDATE → aprobada.
-- ============================================================

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
    return null; -- señal de "no aplica cupo de licencia"
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

  select coalesce(sum(a.dias), 0) into v_usados
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = p_tipo
    and a.estado = 'aprobada'
    and extract(year from a.fecha_desde) = p_anio;

  return v_cupo - v_usados;
end;
$$;

comment on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) is
  'Disponible = cupo anual − aprobadas del año. NULL = sin cupo configurado. Espejo de getSaldosLicencia.';

create or replace function public.exigir_cupo_licencia_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio int;
  v_disponible int;
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

  v_anio := extract(year from new.fecha_desde)::int;
  v_disponible := saldo_licencia_disponible(new.empleado_id, new.tipo, v_anio);

  -- NULL = sin cupo configurado → no limitar.
  if v_disponible is null then
    return new;
  end if;

  if v_dias > v_disponible then
    raise exception
      'No hay días de licencia suficientes para % (pedís %, quedan %)',
      new.tipo, v_dias, greatest(v_disponible, 0);
  end if;

  return new;
end;
$$;

-- Nombre con sufijo _z para correr DESPUÉS de trg_exigir_saldo_vacaciones
-- (orden alfabético de triggers BEFORE INSERT).
drop trigger if exists trg_exigir_cupo_licencia_z on public.ausencias;
create trigger trg_exigir_cupo_licencia_z
  before insert or update on public.ausencias
  for each row execute function public.exigir_cupo_licencia_aprobada();

comment on function public.exigir_cupo_licencia_aprobada() is
  'BUG-010: al aprobar/cargar aprobada, no superar cupos_licencia. Sin fila = libre.';

revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from public;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

notify pgrst, 'reload schema';
