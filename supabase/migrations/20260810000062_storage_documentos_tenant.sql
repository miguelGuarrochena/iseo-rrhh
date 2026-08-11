-- ============================================================
-- Migración 62: Storage documentos — no confiar en archivo_url solo
--
-- `storage_select_documentos` daba SELECT si existía una fila en
-- `documentos_legajo` / `documentos_firma` con `archivo_url = name`,
-- sin exigir que el path ni la fila fueran del tenant del caller.
-- Tras envenenar `archivo_url` (o con un path conocido de otro tenant)
-- se leía el PDF ajeno (FRT-6 / A5 / RT-006).
--
-- Defensa (espejo mig 57 recibos):
--   - gestor: prefijo auth_empresa()/
--   - dueño legajo: empresa_id = auth_empresa() + path prefijo empresa
--   - destinatario firma: idem
--   - adjuntos ausencia: propio legajo + tenant + path prefijo
-- Idempotente.
-- ============================================================

drop policy if exists storage_select_documentos on storage.objects;
create policy storage_select_documentos on storage.objects for select
  using (
    bucket_id = 'documentos'
    and (
      es_superadmin()
      or (
        es_gestor()
        and name like auth_empresa()::text || '/%'
      )
      or exists (
        select 1
        from documentos_legajo d
        where d.archivo_url = storage.objects.name
          and d.empleado_id = auth_empleado()
          and d.empresa_id = auth_empresa()
          and storage.objects.name like d.empresa_id::text || '/%'
      )
      or exists (
        select 1
        from documentos_firma df
        where df.archivo_url = storage.objects.name
          and es_destinatario_documento(df.id)
          and df.empresa_id = auth_empresa()
          and storage.objects.name like df.empresa_id::text || '/%'
      )
      or exists (
        -- Certificados adjuntos a ausencias propias (mig 31, endurecido).
        select 1
        from ausencias a
        where a.empleado_id = auth_empleado()
          and a.empresa_id = auth_empresa()
          and a.adjuntos ? storage.objects.name
          and storage.objects.name like a.empresa_id::text || '/%'
      )
    )
  );

notify pgrst, 'reload schema';
