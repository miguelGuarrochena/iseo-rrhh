-- ============================================================
-- BUG-005 / BUG-006: firma de recibo y storage multi-tenant
--
-- BUG-005
-- -------
-- `recibos_firma` permitía UPDATE al dueño con WITH CHECK sólo sobre
-- `empleado_id`. Un empleado podía cambiar `archivo_url`, anular la
-- publicación del empleador, forjar `firmado_en`, mover `empresa_id`,
-- etc. RLS no expresa "sólo estas dos columnas".
--
-- Solución (alineada a `fichar_con_rostro` / `lock_destinatario_firma`):
--   1. Quitar la policy de UPDATE del empleado.
--   2. RPC `firmar_recibo(id)` SECURITY DEFINER que sólo escribe
--      `estado_firma` + `firmado_en` tras validar dueño, tenant,
--      publicación y one-shot (pendiente → firmado).
--   3. Trigger que, si alguien no-admin llega a un UPDATE, bloquea
--      cualquier cambio que no sea esa transición de firma.
--
-- BUG-006
-- -------
-- `storage_select_recibos` daba SELECT si existía un recibo con
-- `archivo_url = name` y `empleado_id = auth_empleado()`, sin exigir
-- que el path ni la fila fueran del mismo tenant. Tras manipular
-- `archivo_url` (BUG-005) se leía el PDF de otra empresa.
--
-- Defensa en profundidad aunque BUG-005 ya impida el UPDATE:
--   - `r.empresa_id = auth_empresa()`
--   - path con prefijo `r.empresa_id/`
--   - recibo publicado y vigente (mismo criterio que recibos_select)
-- ============================================================

-- ---------- 1. El empleado ya no actualiza recibos por REST ----------
drop policy if exists recibos_firma on recibos;

-- ---------- 2. Trigger: columnas inmutables para no-admin ----------
create or replace function public.lock_recibo_firma_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- RRHH / plataforma: gestión completa (carga, publicar, archivar).
  if es_superadmin() or auth_rol() = 'admin_rrhh' then
    return new;
  end if;

  -- Sin JWT (service role / SQL editor): mantenimiento.
  if auth.uid() is null then
    return new;
  end if;

  -- Única mutación legítima fuera de RRHH: firmar (one-shot).
  if old.estado_firma = 'pendiente'
     and new.estado_firma = 'firmado'
     and old.firmado_en is null
     and new.firmado_en is not null
     and new.archivo_url is not distinct from old.archivo_url
     and new.empresa_id is not distinct from old.empresa_id
     and new.empleado_id is not distinct from old.empleado_id
     and new.periodo is not distinct from old.periodo
     and new.tipo is not distinct from old.tipo
     and new.firmado_empleador_en is not distinct from old.firmado_empleador_en
     and new.archivado_en is not distinct from old.archivado_en
     and new.rectifica_a is not distinct from old.rectifica_a
  then
    return new;
  end if;

  raise exception
    'No se pueden modificar campos del recibo fuera de la firma del colaborador';
end;
$$;

drop trigger if exists trg_lock_recibo_firma_empleado on public.recibos;
create trigger trg_lock_recibo_firma_empleado
  before update on public.recibos
  for each row execute function public.lock_recibo_firma_empleado();

comment on function public.lock_recibo_firma_empleado() is
  'Impide que un no-admin altere archivo_url/tenant/periodo/etc. Sólo permite pendiente→firmado.';

-- ---------- 3. RPC de firma (única vía del empleado) ----------
create or replace function public.firmar_recibo(p_recibo_id uuid)
returns setof public.recibos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth_empleado();
  v_empresa uuid := auth_empresa();
  v_recibo public.recibos;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if v_emp is null then
    raise exception 'Tu cuenta no está vinculada a un legajo';
  end if;
  if v_empresa is null then
    raise exception 'Sin empresa activa';
  end if;

  update public.recibos r
     set estado_firma = 'firmado',
         firmado_en = now()
   where r.id = p_recibo_id
     and r.empleado_id = v_emp
     and r.empresa_id = v_empresa
     and r.firmado_empleador_en is not null
     and r.archivado_en is null
     and r.estado_firma = 'pendiente'
  returning * into v_recibo;

  if not found then
    -- Ya firmado, ajeno, no publicado o inexistente: vacío (como el
    -- update filtrado que hacía el cliente).
    return;
  end if;

  return next v_recibo;
end;
$$;

comment on function public.firmar_recibo(uuid) is
  'Firma one-shot del recibo propio. Sólo toca estado_firma y firmado_en.';

revoke all on function public.firmar_recibo(uuid) from public;
grant execute on function public.firmar_recibo(uuid) to authenticated;

-- ---------- 4. Storage: tenant + recibo propio publicado ----------
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
        from public.recibos r
        where r.archivo_url = storage.objects.name
          and r.empleado_id = auth_empleado()
          and r.empresa_id = auth_empresa()
          and r.firmado_empleador_en is not null
          and r.archivado_en is null
          -- Defensa aunque archivo_url apunte fuera del tenant.
          and storage.objects.name like r.empresa_id::text || '/%'
      )
    )
  );

notify pgrst, 'reload schema';
