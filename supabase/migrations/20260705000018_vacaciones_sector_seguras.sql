-- ============================================================
-- Vacaciones aprobadas del sector para empleados
-- Devuelve solo campos mínimos para planificar vacaciones.
-- No expone comentarios, adjuntos, resolución ni legajos completos.
-- ============================================================

create or replace function public.vacaciones_aprobadas_mi_sector()
returns table (
  id uuid,
  empleado_id uuid,
  empleado_nombre text,
  empleado_apellido text,
  tipo tipo_ausencia,
  fecha_desde date,
  fecha_hasta date,
  dias int,
  estado estado_ausencia,
  creada_en timestamptz
)
language sql stable security definer set search_path = public
as $$
  with empleado_actual as (
    select e.empresa_id, e.sector
    from empleados e
    where e.id = auth_empleado()
      and e.empresa_id = auth_empresa()
      and e.activo = true
  )
  select
    a.id,
    a.empleado_id,
    e.nombre as empleado_nombre,
    e.apellido as empleado_apellido,
    a.tipo,
    a.fecha_desde,
    a.fecha_hasta,
    a.dias,
    a.estado,
    a.creada_en
  from ausencias a
  join empleados e on e.id = a.empleado_id
  join empleado_actual actual
    on actual.empresa_id = a.empresa_id
   and actual.sector = e.sector
  where a.tipo = 'vacaciones'
    and a.estado = 'aprobada'
    and e.activo = true
  order by a.fecha_desde asc;
$$;

revoke all on function public.vacaciones_aprobadas_mi_sector() from public;
grant execute on function public.vacaciones_aprobadas_mi_sector() to authenticated;
