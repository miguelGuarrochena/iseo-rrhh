-- ============================================================
-- Storage: adjuntos de ausencias (certificados médicos)
--
-- Dos agujeros que dejaban el certificado inutilizable:
--
-- 1) SUBIR. `storage_insert_gestores` sólo dejaba escribir a
--    superadmin y admin_rrhh. Pero el certificado lo adjunta el
--    propio colaborador cuando pide la licencia, y también lo puede
--    cargar un supervisor por él. Los dos chocaban contra la política
--    y la solicitud entera fallaba con "new row violates row-level
--    security policy" — ni siquiera se guardaba la ausencia, porque el
--    archivo se sube antes del insert.
--
-- 2) LEER. `storage_select_documentos` contempla el legajo y los
--    documentos a firmar, pero no las ausencias: sus adjuntos viven en
--    `ausencias.adjuntos` (jsonb). El botón "Certificado" que ve el
--    colaborador en su propia solicitud no abría nada.
--
-- El alcance se mantiene tan chico como se pueda: el colaborador sólo
-- escribe dentro de su propia carpeta (<empresa>/<empleado>/…) y sólo
-- en el bucket de documentos. Nada de recibos, fotos ni logos.
--
-- Idempotente: se puede re-ejecutar.
-- ============================================================

-- ---------- 1. INSERT por rol ----------
drop policy if exists storage_insert_gestores on storage.objects;
create policy storage_insert_gestores on storage.objects for insert
  with check (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
      and name like auth_empresa()::text || '/%'
    )
    or (
      -- El supervisor carga ausencias de su equipo, con certificado.
      -- No toca logos ni recibos.
      auth_rol() = 'supervisor'
      and bucket_id = 'documentos'
      and name like auth_empresa()::text || '/%'
    )
    or (
      -- El colaborador, sólo su propia carpeta.
      auth_rol() = 'empleado'
      and bucket_id = 'documentos'
      and auth_empleado() is not null
      and name like
        auth_empresa()::text || '/' || auth_empleado()::text || '/%'
    )
  );

-- ---------- 2. SELECT: sumar los adjuntos de ausencias ----------
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
      or exists (
        -- Certificado que la propia persona adjuntó a su ausencia.
        select 1
        from ausencias a
        where a.empleado_id = auth_empleado()
          and a.adjuntos ? storage.objects.name
      )
    )
  );

-- ---------- 3. UPDATE: mismo criterio que el insert ----------
-- El upload de la app va con upsert:true, así que sin UPDATE una
-- resubida sobre el mismo path también fallaba.
drop policy if exists storage_update_gestores on storage.objects;
create policy storage_update_gestores on storage.objects for update
  using (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
      and name like auth_empresa()::text || '/%'
    )
    or (
      auth_rol() = 'supervisor'
      and bucket_id = 'documentos'
      and name like auth_empresa()::text || '/%'
    )
    or (
      auth_rol() = 'empleado'
      and bucket_id = 'documentos'
      and auth_empleado() is not null
      and name like
        auth_empresa()::text || '/' || auth_empleado()::text || '/%'
    )
  )
  with check (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and bucket_id in ('logos', 'fotos', 'documentos', 'recibos-pdf')
      and name like auth_empresa()::text || '/%'
    )
    or (
      auth_rol() = 'supervisor'
      and bucket_id = 'documentos'
      and name like auth_empresa()::text || '/%'
    )
    or (
      auth_rol() = 'empleado'
      and bucket_id = 'documentos'
      and auth_empleado() is not null
      and name like
        auth_empresa()::text || '/' || auth_empleado()::text || '/%'
    )
  );

notify pgrst, 'reload schema';
