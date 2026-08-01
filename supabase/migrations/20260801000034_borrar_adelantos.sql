-- ============================================================
-- Poder sacar un pedido de adelanto cargado por error.
--
-- Reportado por el cliente: cargó uno de prueba en LAK y quedó
-- pegado. No había forma de borrarlo desde la app y tampoco existía
-- política de DELETE en `adelantos`, así que ni siquiera se podía
-- desde el código.
--
-- Mismo criterio que `ausencias_borrar` (migración 27): sólo el admin
-- de RRHH o el superadmin, y sólo dentro de su empresa. Rechazar sigue
-- siendo lo correcto cuando el pedido existió de verdad, porque deja
-- rastro; borrar es para lo que nunca debió existir.
-- ============================================================

drop policy if exists adelantos_borrar on adelantos;
create policy adelantos_borrar on adelantos for delete
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

notify pgrst, 'reload schema';
