-- ============================================================
-- Migration 69: re-assert empleados PII column grants (idempotent)
--
-- Defense in depth if a test/script re-GRANTed table SELECT on
-- `empleados` (would re-open cbu / descriptor_facial). Safe to re-run.
-- ============================================================

revoke select on table public.empleados from anon;
revoke select on table public.empleados from authenticated;

grant select (
  id, empresa_id, nombre, apellido, dni, cuil, fecha_nacimiento, estado_civil,
  nivel_estudios, domicilio, telefono, email, contacto_emergencia, grupo_familiar,
  foto_url, fecha_ingreso, puesto, sector, supervisor_id, modalidad_contratacion,
  fecha_fin_contrato, modalidad_pago, banco, obra_social, art, activo, fecha_baja,
  motivo_baja, checklist_alta, creado_en, modo_fichaje, geocerca, convenio,
  numero_legajo, sin_usuario
) on table public.empleados to authenticated;

grant insert, update, delete on table public.empleados to authenticated;
grant select on public.empleados_lectura to authenticated;
revoke all on public.empleados_lectura from anon;

notify pgrst, 'reload schema';
