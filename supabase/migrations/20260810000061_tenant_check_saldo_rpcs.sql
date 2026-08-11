-- ============================================================
-- Migración 61: tenant check en RPCs de saldo (IDOR cross-tenant)
--
-- `saldo_vacaciones_disponible` / `saldo_licencia_disponible` son
-- SECURITY DEFINER (las usan triggers de BUG-008/010). Antes aceptaban
-- cualquier `p_empleado_id` → un JWT de empresa A leía saldos de B
-- (FRT-5 / J1 / J2).
--
-- Autoridad del tenant: auth_empresa() + empleados.empresa_id.
-- No hay parámetro p_empresa_id (no se introduce).
--
-- Fail-closed para callers autenticados (mismo mensaje si el legajo
-- no existe o es de otro tenant → sin oracle de existencia).
-- Sin JWT (service role / SQL / semillas): se conserva el cálculo
-- completo — mismo patrón que exigir_* triggers.
-- Superadmin: puede consultar cualquier legajo (plataforma).
-- admin_rrhh: limitado a su empresa (no es superadmin).
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

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
  -- Gate de tenant (fail-closed). No filtrar existencia cross-tenant.
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
    -- Sin JWT ya pasó el gate; legajo inexistente → 0 (contrato histórico).
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
  'Disponible = corresponden + arrastre − aprobadas − pendientes. Callers autenticados: sólo legajos de auth_empresa(); superadmin libre; sin JWT (service) sin gate.';

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
  'Cupo − aprobadas del año. NULL = sin cupo. Tenant: auth_empresa() (autenticados); superadmin libre; sin JWT sin gate.';

-- Permisos: mismos que mig 58/59 (sin EXECUTE para anon/public).
revoke all on function public.saldo_vacaciones_disponible(uuid, int) from public;
revoke all on function public.saldo_vacaciones_disponible(uuid, int) from anon;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;

revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from public;
revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from anon;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

notify pgrst, 'reload schema';
