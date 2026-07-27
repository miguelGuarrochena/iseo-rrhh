-- ============================================================
-- Fix: cerrar/actualizar comunicaciones como superadmin.
-- USING ya permitía es_superadmin(), pero WITH CHECK exigía
-- empresa_id = auth_empresa() (NULL para superadmin) → RLS error.
-- ============================================================

drop policy if exists comunicaciones_update on comunicaciones;
create policy comunicaciones_update on comunicaciones for update
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and es_gestor())
  )
  with check (
    es_superadmin()
    or empresa_id = auth_empresa()
  );

notify pgrst, 'reload schema';
