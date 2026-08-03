-- ============================================================
-- Fix: "infinite recursion detected in policy for relation
-- documentos_firma".
--
-- La migración 20260727000029 dejó dos policies que se llaman entre sí:
--
--   documentos_firma_select      → consulta documento_firma_destinatarios
--   doc_firma_dest_select        → consulta documentos_firma
--
-- Al leer cualquiera de las dos tablas, Postgres evalúa la policy, que
-- lee la otra tabla, que evalúa su policy, que vuelve a leer la primera.
-- Postgres corta el ciclo con ese error y la sección "A firmar" devuelve
-- 500.
--
-- La salida es la misma que ya usa el resto del esquema: mover el cruce
-- de tablas a funciones `security definer`, que corren con los permisos
-- del dueño y por lo tanto NO vuelven a disparar RLS. Las funciones son
-- deliberadamente chicas y sólo responden preguntas de pertenencia, así
-- que no filtran datos: devuelven un booleano o el empresa_id, nunca
-- filas.
--
-- Idempotente: se puede re-ejecutar.
-- ============================================================

-- ---------- Helpers sin RLS ----------

-- ¿El empleado logueado es destinatario de ese documento?
create or replace function es_destinatario_documento(doc_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from documento_firma_destinatarios dest
    where dest.documento_id = doc_id
      and dest.empleado_id = auth_empleado()
  );
$$;

-- ¿De qué empresa es ese documento? (para las policies de destinatarios)
create or replace function empresa_de_documento_firma(doc_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from documentos_firma where id = doc_id;
$$;

-- ---------- 1. SELECT de documentos_firma ----------
drop policy if exists documentos_firma_select on documentos_firma;
create policy documentos_firma_select on documentos_firma for select
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
    or (
      empresa_id = auth_empresa()
      and es_destinatario_documento(id)
    )
  );

-- ---------- 2. Destinatarios ----------
drop policy if exists doc_firma_dest_select on documento_firma_destinatarios;
create policy doc_firma_dest_select on documento_firma_destinatarios for select
  using (
    es_superadmin()
    or (
      empresa_de_documento_firma(documento_id) = auth_empresa()
      and (es_gestor() or empleado_id = auth_empleado())
    )
  );

drop policy if exists doc_firma_dest_insert on documento_firma_destinatarios;
create policy doc_firma_dest_insert on documento_firma_destinatarios for insert
  with check (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and empresa_de_documento_firma(documento_id) = auth_empresa()
    )
  );

-- Firmar: el empleado sólo su fila; admin puede tocar las de su empresa.
drop policy if exists doc_firma_dest_update on documento_firma_destinatarios;
create policy doc_firma_dest_update on documento_firma_destinatarios for update
  using (
    es_superadmin()
    or (
      empresa_de_documento_firma(documento_id) = auth_empresa()
      and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  )
  with check (
    es_superadmin()
    or (
      empresa_de_documento_firma(documento_id) = auth_empresa()
      and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  );

-- Borrar: sólo admin (el empleado no puede "sacarse" la firma de encima).
drop policy if exists doc_firma_dest_delete on documento_firma_destinatarios;
create policy doc_firma_dest_delete on documento_firma_destinatarios for delete
  using (
    es_superadmin()
    or (
      auth_rol() = 'admin_rrhh'
      and empresa_de_documento_firma(documento_id) = auth_empresa()
    )
  );

-- ---------- 3. Storage ----------
-- Mismo problema en potencia: la policy de storage cruzaba las dos
-- tablas. Se resuelve con el mismo helper.
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
        where df.archivo_url = storage.objects.name
          and es_destinatario_documento(df.id)
      )
    )
  );

notify pgrst, 'reload schema';
