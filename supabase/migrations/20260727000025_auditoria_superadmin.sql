-- ============================================================
-- Auditoría: que también registre lo que hace el superadmin.
--
-- Misma causa raíz que la migración anterior: la política de INSERT
-- exigía `empresa_id = auth_empresa()`, que para un superadmin es NULL.
-- La diferencia es que este fallo era **silencioso**: `registrarAuditoria`
-- se traga el error a propósito para no romper la acción principal, así
-- que todo lo que el superadmin cargaba en una empresa cliente (fichajes
-- manuales, firmas de recibo, altas) quedaba sin rastro en la auditoría
-- y nadie se enteraba.
-- ============================================================

drop policy if exists auditoria_insert_autenticado on auditoria_acciones;
create policy auditoria_insert_autenticado on auditoria_acciones for insert
  with check (
    actor_id = auth.uid()
    and (es_superadmin() or empresa_id = auth_empresa())
  );

notify pgrst, 'reload schema';
