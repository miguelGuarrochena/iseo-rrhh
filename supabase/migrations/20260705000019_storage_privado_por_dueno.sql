-- ============================================================
-- Storage: acceso por dueño para documentos y recibos
-- Mantiene logos públicos y fotos visibles dentro del tenant.
-- Documentos/recibos solo los ve el empleado dueño o gestores.
-- ============================================================

drop policy if exists storage_select on storage.objects;
drop policy if exists storage_insert on storage.objects;
drop policy if exists storage_delete on storage.objects;
drop policy if exists storage_update on storage.objects;

create policy storage_select_logos on storage.objects for select
  using (bucket_id = 'logos');

create policy storage_select_fotos on storage.objects for select
  using (
    bucket_id = 'fotos'
    and (
      es_superadmin()
      or name like auth_empresa()::text || '/%'
    )
  );

create policy storage_select_documentos on storage.objects for select
  using (
    bucket_id = 'documentos'
    and (
      es_superadmin()
      or (es_gestor() and name like auth_empresa()::text || '/%')
      or exists (
        select 1
        from documentos_legajo d
        where d.archivo_url = storage.objects.name
          and d.empleado_id = auth_empleado()
      )
    )
  );

create policy storage_select_recibos on storage.objects for select
  using (
    bucket_id = 'recibos-pdf'
    and (
      es_superadmin()
      or (es_gestor() and name like auth_empresa()::text || '/%')
      or exists (
        select 1
        from recibos r
        where r.archivo_url = storage.objects.name
          and r.empleado_id = auth_empleado()
      )
    )
  );

create policy storage_insert_gestores on storage.objects for insert
  with check (
    bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
    and (
      es_superadmin()
      or (auth_rol() = 'admin_rrhh' and name like auth_empresa()::text || '/%')
    )
  );

create policy storage_update_gestores on storage.objects for update
  using (
    bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
    and (
      es_superadmin()
      or (auth_rol() = 'admin_rrhh' and name like auth_empresa()::text || '/%')
    )
  )
  with check (
    bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
    and (
      es_superadmin()
      or (auth_rol() = 'admin_rrhh' and name like auth_empresa()::text || '/%')
    )
  );

create policy storage_delete_gestores on storage.objects for delete
  using (
    bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
    and (
      es_superadmin()
      or (auth_rol() = 'admin_rrhh' and name like auth_empresa()::text || '/%')
    )
  );
