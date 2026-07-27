-- ============================================================
-- Seguridad: documentos a firmar
-- 1) Empleado solo ve docs asignados (no todos los de la empresa).
-- 2) Destinatarios: INSERT/DELETE solo admin; UPDATE firma propia.
-- 3) Storage: el empleado puede bajar el PDF si es destinatario.
-- Idempotente: se puede re-ejecutar si falló a medias.
-- ============================================================

-- ---------- 1. SELECT de documentos_firma ----------
drop policy if exists documentos_firma_select on documentos_firma;
create policy documentos_firma_select on documentos_firma for select
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
    or (
      empresa_id = auth_empresa()
      and exists (
        select 1
        from documento_firma_destinatarios dest
        where dest.documento_id = documentos_firma.id
          and dest.empleado_id = auth_empleado()
      )
    )
  );

-- ---------- 2. Destinatarios: policies separadas ----------
drop policy if exists doc_firma_dest_gestion on documento_firma_destinatarios;
drop policy if exists doc_firma_dest_select on documento_firma_destinatarios;
drop policy if exists doc_firma_dest_insert on documento_firma_destinatarios;
drop policy if exists doc_firma_dest_update on documento_firma_destinatarios;
drop policy if exists doc_firma_dest_delete on documento_firma_destinatarios;

-- Ver: gestores todos de la empresa; empleado solo los suyos.
create policy doc_firma_dest_select on documento_firma_destinatarios for select
  using (
    es_superadmin()
    or exists (
      select 1 from documentos_firma d
      where d.id = documento_id
        and d.empresa_id = auth_empresa()
        and (es_gestor() or empleado_id = auth_empleado())
    )
  );

-- Crear destinatarios: solo admin RRHH / superadmin.
create policy doc_firma_dest_insert on documento_firma_destinatarios for insert
  with check (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
  );

-- Firmar: el empleado solo su fila; admin puede tocar las de su empresa.
create policy doc_firma_dest_update on documento_firma_destinatarios for update
  using (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
    or (
      empleado_id = auth_empleado()
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
  )
  with check (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
    or (
      empleado_id = auth_empleado()
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
  );

-- Borrar destinatarios: solo admin (el empleado no puede "sacarse" la firma).
create policy doc_firma_dest_delete on documento_firma_destinatarios for delete
  using (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and exists (
        select 1 from documentos_firma d
        where d.id = documento_id
          and d.empresa_id = auth_empresa()
      )
    )
  );

-- ---------- 3. Storage: PDF de firma visible para el destinatario ----------
drop policy if exists storage_select_documentos on storage.objects;
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
      or exists (
        select 1
        from documentos_firma df
        join documento_firma_destinatarios dest
          on dest.documento_id = df.id
        where df.archivo_url = storage.objects.name
          and dest.empleado_id = auth_empleado()
      )
    )
  );

notify pgrst, 'reload schema';
