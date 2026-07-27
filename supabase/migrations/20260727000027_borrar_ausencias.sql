-- ============================================================
-- Poder sacar una ausencia cargada por error.
--
-- No había forma de borrarla desde la app: una carga equivocada quedaba
-- para siempre en el calendario del equipo y descontando días de
-- vacaciones. Tampoco existía una política de DELETE, así que ni siquiera
-- se podía desde el código.
--
-- Sólo el admin de RRHH (o el superadmin), y sólo dentro de su empresa.
-- El empleado no borra: si se arrepiente de una solicitud, se rechaza,
-- que deja rastro. Borrar es para el error de carga.
-- ============================================================

drop policy if exists ausencias_borrar on ausencias;
create policy ausencias_borrar on ausencias for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

notify pgrst, 'reload schema';
