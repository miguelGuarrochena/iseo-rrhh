-- ============================================================
-- BUG-007 / BUG-008: máquina de estados de ausencias + saldo atómico
--
-- BUG-007
-- -------
-- `ausencias_gestion` permitía cualquier UPDATE. Un gestor podía
-- reabrir (aprobada/rechazada → pendiente), invertir resoluciones o
-- alterar fechas/días/tipo de una ausencia ya resuelta.
--
-- Regla (sin inventar negocio):
--   pendiente → aprobada | rechazada  (sólo campos de resolución)
--   aprobada / rechazada → inmutables por UPDATE
--   DELETE de admin (migración 27) sigue siendo la vía para borrar
--   un alta errónea.
--
-- BUG-008
-- -------
-- El saldo se leía en el cliente y después se hacía INSERT: dos
-- pedidos concurrentes del cupo completo ambos pasaban.
--
-- Solución: BEFORE INSERT toma `SELECT … FOR UPDATE` del legajo,
-- recalcula `dias` en el servidor y, si el actor NO es gestor,
-- exige diasDisponibles >= dias. Los gestores conservan el override
-- (carga manual / adelanto de vacaciones) que ya permitía la UI.
-- ============================================================

-- ---------- Helpers de vacaciones (espejo de src/lib/vacaciones.ts / fechas.ts) ----------

create or replace function public.dias_corridos_entre(p_desde date, p_hasta date)
returns int
language sql
immutable
as $$
  select case
    when p_hasta < p_desde then 0
    else (p_hasta - p_desde) + 1
  end;
$$;

create or replace function public.dias_habiles_entre(
  p_desde date,
  p_hasta date,
  p_empresa uuid
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur date;
  v_n int := 0;
  v_feriado boolean;
begin
  if p_hasta < p_desde then
    return 0;
  end if;
  v_cur := p_desde;
  while v_cur <= p_hasta loop
    if extract(isodow from v_cur) < 6 then
      select exists (
        select 1 from feriados f
        where f.empresa_id = p_empresa
          and f.fecha = v_cur
          and f.no_laborable
      ) into v_feriado;
      if not v_feriado then
        v_n := v_n + 1;
      end if;
    end if;
    v_cur := v_cur + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.dias_vacaciones_corresponden(
  p_fecha_ingreso date,
  p_anio int,
  p_config jsonb
)
returns int
language plpgsql
immutable
as $$
declare
  v_cierre date := make_date(p_anio, 12, 31);
  v_dias_ms numeric;
  v_anios numeric;
  v_habiles boolean := coalesce((p_config ->> 'vacacionesDiasHabiles')::boolean, false);
  v_hasta5 int;
  v_hasta10 int;
  v_hasta20 int;
  v_mas20 int;
  v_escala jsonb := coalesce(p_config -> 'vacacionesEscala', '{}'::jsonb);
begin
  if p_fecha_ingreso is null or p_fecha_ingreso > v_cierre then
    return 0;
  end if;

  if v_habiles then
    v_hasta5 := coalesce((v_escala ->> 'hasta5')::int, 10);
    v_hasta10 := coalesce((v_escala ->> 'hasta10')::int, 15);
    v_hasta20 := coalesce((v_escala ->> 'hasta20')::int, 20);
    v_mas20 := coalesce((v_escala ->> 'masDe20')::int, 25);
  else
    v_hasta5 := 14;
    v_hasta10 := 21;
    v_hasta20 := 28;
    v_mas20 := 35;
  end if;

  v_dias_ms := (v_cierre - p_fecha_ingreso);
  v_anios := v_dias_ms / 365.25;

  if v_anios < 0.5 then
    return floor(v_dias_ms / 20)::int;
  end if;
  if v_anios < 5 then return v_hasta5; end if;
  if v_anios < 10 then return v_hasta10; end if;
  if v_anios < 20 then return v_hasta20; end if;
  return v_mas20;
end;
$$;

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
  v_corresponden int;
  v_ajuste int;
  v_usados int;
  v_pendientes int;
begin
  select e.fecha_ingreso, e.empresa_id, emp.config
    into v_ingreso, v_empresa, v_config
  from empleados e
  join empresas emp on emp.id = e.empresa_id
  where e.id = p_empleado_id;

  if v_ingreso is null then
    return 0;
  end if;

  v_corresponden := dias_vacaciones_corresponden(v_ingreso, p_anio, v_config);

  select coalesce(vp.dias, 0) into v_ajuste
  from vacaciones_pendientes vp
  where vp.empleado_id = p_empleado_id
    and vp.anio = p_anio;
  v_ajuste := coalesce(v_ajuste, 0);

  select
    coalesce(sum(a.dias) filter (where a.estado = 'aprobada'), 0),
    coalesce(sum(a.dias) filter (where a.estado = 'pendiente'), 0)
  into v_usados, v_pendientes
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = 'vacaciones'
    and extract(year from a.fecha_desde) = p_anio;

  return v_corresponden + v_ajuste - v_usados - v_pendientes;
end;
$$;

comment on function public.saldo_vacaciones_disponible(uuid, int) is
  'Disponible = corresponden + arrastre − aprobadas − pendientes (mismo criterio que getSaldoVacaciones).';

-- ---------- BUG-007: máquina de estados ----------

create or replace function public.lock_ausencia_maquina_estados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mantenimiento sin JWT (service role / SQL editor).
  if auth.uid() is null then
    return new;
  end if;

  -- Ya resuelta: inmutable por UPDATE (borrar es DELETE de admin).
  if old.estado in ('aprobada', 'rechazada') then
    raise exception
      'No se puede modificar una ausencia ya resuelta (estado %)',
      old.estado;
  end if;

  -- Desde pendiente: sólo aprobar o rechazar.
  if old.estado = 'pendiente' then
    if new.estado not in ('aprobada', 'rechazada') then
      raise exception
        'Desde pendiente sólo se puede pasar a aprobada o rechazada';
    end if;

    if new.empleado_id is distinct from old.empleado_id
       or new.empresa_id is distinct from old.empresa_id
       or new.tipo is distinct from old.tipo
       or new.fecha_desde is distinct from old.fecha_desde
       or new.fecha_hasta is distinct from old.fecha_hasta
       or new.dias is distinct from old.dias
       or new.adjuntos is distinct from old.adjuntos
       or new.comentario_empleado is distinct from old.comentario_empleado
       or new.creada_en is distinct from old.creada_en
    then
      raise exception
        'Al resolver una ausencia no se pueden cambiar los datos de la solicitud';
    end if;

    if new.resuelta_en is null then
      raise exception 'La resolución debe registrar fecha';
    end if;

    return new;
  end if;

  raise exception 'Transición de estado no permitida';
end;
$$;

drop trigger if exists trg_lock_ausencia_maquina_estados on public.ausencias;
create trigger trg_lock_ausencia_maquina_estados
  before update on public.ausencias
  for each row execute function public.lock_ausencia_maquina_estados();

comment on function public.lock_ausencia_maquina_estados() is
  'Máquina de estados: pendiente→aprobada|rechazada; resueltas inmutables.';

-- ---------- BUG-008: saldo atómico al insertar vacaciones ----------

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
  v_disponible int;
begin
  -- Semillas / service role.
  if auth.uid() is null then
    return new;
  end if;

  -- Recalcular días en el servidor (el cliente no es autoridad).
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

  -- Override de gestores (mismo criterio que la UI de RRHH).
  if new.tipo <> 'vacaciones' or es_gestor() or es_superadmin() then
    return new;
  end if;

  -- Serializa pedidos del mismo legajo en la transacción.
  perform 1 from empleados e where e.id = new.empleado_id for update;
  if not found then
    raise exception 'El colaborador no existe';
  end if;

  v_anio := extract(year from new.fecha_desde)::int;
  v_disponible := saldo_vacaciones_disponible(new.empleado_id, v_anio);

  if new.dias > v_disponible then
    raise exception
      'No hay días de vacaciones suficientes (pedís %, quedan %)',
      new.dias, v_disponible;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_exigir_saldo_vacaciones on public.ausencias;
create trigger trg_exigir_saldo_vacaciones
  before insert on public.ausencias
  for each row execute function public.exigir_saldo_vacaciones_al_insertar();

comment on function public.exigir_saldo_vacaciones_al_insertar() is
  'Empleado: vacaciones atómicas con lock del legajo. Gestor: override permitido.';

-- Lectura del saldo desde el cliente (opcional; no es la autoridad de escritura).
revoke all on function public.saldo_vacaciones_disponible(uuid, int) from public;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;

notify pgrst, 'reload schema';
