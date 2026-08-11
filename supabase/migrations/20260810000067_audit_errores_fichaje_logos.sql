-- ============================================================
-- Migration 67: audit + errores_app integrity; dias_habiles tenant;
-- employee fichaje timestamp; logos SELECT scoped.
-- ============================================================

-- ---------- 67a. Auditoría: no forge actor / free-form INSERT spam ----------
-- Direct INSERT kept but actor_id must be auth.uid() and actor_nombre must
-- match the caller's profile (blocks FRT-9a "CEO" forgery).
drop policy if exists auditoria_insert_autenticado on auditoria_acciones;
create policy auditoria_insert_autenticado on auditoria_acciones for insert
  with check (
    actor_id = auth.uid()
    and (
      es_superadmin()
      or empresa_id = auth_empresa()
    )
    and exists (
      select 1
      from usuarios u
      where u.id = auth.uid()
        and u.nombre_completo = actor_nombre
    )
  );

-- ---------- 67b. errores_app: empresa_id must match caller tenant ----------
drop policy if exists errores_app_insert on errores_app;
create policy errores_app_insert on errores_app for insert
  with check (
    auth.uid() is not null
    and usuario_id = auth.uid()
    and (
      empresa_id is null
      or empresa_id = auth_empresa()
      or es_superadmin()
    )
  );

-- ---------- 67c. dias_habiles_entre: no cross-tenant calendar oracle ----------
create or replace function public.dias_habiles_entre(
  p_desde date,
  p_hasta date,
  p_empresa uuid
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur date;
  v_n int := 0;
  v_feriado boolean;
begin
  -- Authenticated callers: only own tenant (or superadmin). Triggers with
  -- JWT already pass the row's empresa_id = auth_empresa() for same-tenant.
  if auth.uid() is not null and not es_superadmin() then
    if p_empresa is null or p_empresa is distinct from auth_empresa() then
      raise exception 'No autorizado a consultar calendarios de otra empresa';
    end if;
  end if;

  if p_hasta < p_desde then
    return 0;
  end if;
  v_cur := p_desde;
  while v_cur <= p_hasta loop
    if extract(isodow from v_cur) < 6 then
      select exists (
        select 1 from feriados f
        where f.empresa_id = p_empresa
          and f.fecha = v_cur
          and f.no_laborable
      ) into v_feriado;
      if not v_feriado then
        v_n := v_n + 1;
      end if;
    end if;
    v_cur := v_cur + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.dias_habiles_entre(date, date, uuid) from public;
revoke all on function public.dias_habiles_entre(date, date, uuid) from anon;
grant execute on function public.dias_habiles_entre(date, date, uuid) to authenticated;

-- ---------- 67d. fichajes.ts: employees cannot forge historical clocks ----------
-- Gestors/admins may backdate (manual corrections). Employees: server clock.
create or replace function public.lock_fichaje_ts_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if es_superadmin() or es_gestor() then
    return new;
  end if;
  -- Self-service clock-in: ignore client timestamp.
  new.ts := now();
  return new;
end;
$$;

drop trigger if exists trg_lock_fichaje_ts_empleado on public.fichajes;
create trigger trg_lock_fichaje_ts_empleado
  before insert on public.fichajes
  for each row execute function public.lock_fichaje_ts_empleado();

comment on function public.lock_fichaje_ts_empleado() is
  'Employee INSERT: force ts=now(). Gestor/admin may supply historical ts.';

-- ---------- 67e. logos: tenant-scoped (or public logo paths under own id) ----------
drop policy if exists storage_select_logos on storage.objects;
create policy storage_select_logos on storage.objects for select
  using (
    bucket_id = 'logos'
    and (
      es_superadmin()
      or (
        auth_empresa() is not null
        and name like auth_empresa()::text || '/%'
      )
    )
  );

notify pgrst, 'reload schema';
