-- ============================================================
-- Recibos: los ve RRHH, y cada persona los suyos.
--
-- Había una inconsistencia de privacidad. `remuneraciones` estaba
-- restringida a `admin_rrhh`, pero `recibos` usaba `es_gestor()`, que
-- incluye a los supervisores. Resultado: un supervisor no veía la grilla
-- de sueldos, pero podía abrir y descargar el recibo de cualquiera de la
-- empresa —con el sueldo impreso adentro—. La puerta de atrás daba al
-- mismo dato que la de adelante.
--
-- Ahora el criterio es el mismo en los dos lados: el detalle salarial es
-- de RRHH. El supervisor sigue viendo **sus propios** recibos, porque
-- entra por la rama de "empleado dueño" que ya existía: es una persona
-- que cobra, como cualquier otra.
--
-- Idempotente: se puede re-ejecutar.
-- ============================================================

-- ---------- 1. Quién ve qué recibo ----------
drop policy if exists recibos_select on recibos;
create policy recibos_select on recibos for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (
        auth_rol() = 'admin_rrhh'
        or (
          -- El dueño, sólo el vigente y una vez que lo firmó el empleador.
          empleado_id = auth_empleado()
          and firmado_empleador_en is not null
          and archivado_en is null
        )
      )
    )
  );

-- ---------- 2. Quién baja qué PDF ----------
-- La rama del dueño se resuelve sola contra `recibos`: esa subconsulta
-- pasa por la política de arriba, así que nadie llega a un PDF cuyo
-- recibo no puede ver.
drop policy if exists storage_select_recibos on storage.objects;
create policy storage_select_recibos on storage.objects for select
  using (
    bucket_id = 'recibos-pdf'
    and (
      es_superadmin()
      or (
        auth_rol() = 'admin_rrhh'
        and name like auth_empresa()::text || '/%'
      )
      or exists (
        select 1
        from recibos r
        where r.archivo_url = storage.objects.name
          and r.empleado_id = auth_empleado()
      )
    )
  );

-- ---------- 3. Mismo criterio para el costo de monotributo ----------
-- `facturas_mono_select` usaba `es_gestor()` y quedaba con el mismo
-- agujero: es lo que cobra un contratado, o sea el mismo dato que
-- acabamos de cerrar por el lado del recibo. Si esto se deja como
-- estaba, la inconsistencia vuelve por otra puerta.
drop policy if exists facturas_mono_select on facturas_monotributo;
create policy facturas_mono_select on facturas_monotributo for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (auth_rol() = 'admin_rrhh' or empleado_id = auth_empleado())
    )
  );

notify pgrst, 'reload schema';
