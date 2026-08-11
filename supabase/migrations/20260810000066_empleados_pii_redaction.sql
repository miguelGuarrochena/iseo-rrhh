-- ============================================================
-- Migration 66: redact sensitive employee fields for non-admin
--
-- Postgres RLS is row-level only. Supervisors could SELECT peer `cbu`
-- and `descriptor_facial` via PostgREST (FRT-3 / RT-011).
--
-- Approach:
--   1. View `empleados_lectura` (owner rights + security_barrier) that
--      mirrors empleados_select visibility and nulls sensitive columns
--      unless admin_rrhh / superadmin / self.
--   2. REVOKE table SELECT from authenticated/anon; GRANT view SELECT.
--   3. Keep INSERT/UPDATE/DELETE on the base table (mutations).
--   4. Column-level REVOKE on sensitive cols as defense in depth for
--      any remaining table SELECT grants.
-- Idempotent.
-- ============================================================

create or replace function public.puede_ver_datos_sensibles_empleado(
  p_empleado_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    es_superadmin()
    or auth_rol() = 'admin_rrhh'
    or (
      auth_empleado() is not null
      and auth_empleado() = p_empleado_id
    );
$$;

comment on function public.puede_ver_datos_sensibles_empleado(uuid) is
  'CBU / biometrics: admin_rrhh, superadmin, or the employee themselves.';

revoke all on function public.puede_ver_datos_sensibles_empleado(uuid) from public;
revoke all on function public.puede_ver_datos_sensibles_empleado(uuid) from anon;
grant execute on function public.puede_ver_datos_sensibles_empleado(uuid) to authenticated;

drop view if exists public.empleados_lectura;
create view public.empleados_lectura
with (security_barrier = true) as
select
  e.id,
  e.empresa_id,
  e.nombre,
  e.apellido,
  e.dni,
  e.cuil,
  e.fecha_nacimiento,
  e.estado_civil,
  e.nivel_estudios,
  e.domicilio,
  e.telefono,
  e.email,
  e.contacto_emergencia,
  e.grupo_familiar,
  e.foto_url,
  e.fecha_ingreso,
  e.puesto,
  e.sector,
  e.supervisor_id,
  e.modalidad_contratacion,
  e.fecha_fin_contrato,
  e.modalidad_pago,
  e.banco,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.cbu
    else null
  end as cbu,
  e.obra_social,
  e.art,
  e.activo,
  e.fecha_baja,
  e.motivo_baja,
  e.checklist_alta,
  e.creado_en,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.descriptor_facial
    else null
  end as descriptor_facial,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.consentimiento_biometrico
    else null
  end as consentimiento_biometrico,
  e.modo_fichaje,
  e.geocerca,
  e.convenio,
  e.numero_legajo,
  e.sin_usuario
from public.empleados e
where
  es_superadmin()
  or (
    e.empresa_id = auth_empresa()
    and (es_gestor() or e.id = auth_empleado())
  );

comment on view public.empleados_lectura is
  'Read path for PostgREST: same row visibility as empleados_select; CBU/biometrics redacted for supervisors.';

grant select on public.empleados_lectura to authenticated;
revoke all on public.empleados_lectura from anon;

-- Table SELECT: authenticated must not read sensitive columns (or full *).
revoke select on table public.empleados from anon;
revoke select on table public.empleados from authenticated;

-- Re-grant non-sensitive columns needed for RLS UPDATE/USING and FKs.
grant select (
  id, empresa_id, nombre, apellido, dni, cuil, fecha_nacimiento, estado_civil,
  nivel_estudios, domicilio, telefono, email, contacto_emergencia, grupo_familiar,
  foto_url, fecha_ingreso, puesto, sector, supervisor_id, modalidad_contratacion,
  fecha_fin_contrato, modalidad_pago, banco, obra_social, art, activo, fecha_baja,
  motivo_baja, checklist_alta, creado_en, modo_fichaje, geocerca, convenio,
  numero_legajo, sin_usuario
) on table public.empleados to authenticated;

-- Mutations stay on the table (policies from mig 60).
grant insert, update, delete on table public.empleados to authenticated;

notify pgrst, 'reload schema';
