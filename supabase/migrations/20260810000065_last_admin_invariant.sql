-- ============================================================
-- Migración 65: no dejar una empresa sin admin_rrhh
--
-- Cierra FRT-10 / RT-008: el último admin_rrhh podía autodemocionarse
-- o moverse de empresa vía PostgREST.
--
-- Cubre:
--   - rol admin_rrhh → otro rol
--   - cambio de empresa_id que saque al último admin del tenant
--   - DELETE del último admin (si la policy lo permite)
-- Idempotente.
-- ============================================================

create or replace function public.assert_no_dejar_sin_admin_rrhh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_otros int;
begin
  -- Semillas / service sin JWT: onboarding inicial puede crear el
  -- primer admin; no bloqueamos mantenimiento de plataforma.
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.rol is distinct from 'admin_rrhh' or old.empresa_id is null then
      return old;
    end if;
    v_empresa := old.empresa_id;
    select count(*) into v_otros
    from usuarios u
    where u.empresa_id = v_empresa
      and u.rol = 'admin_rrhh'
      and u.id is distinct from old.id;
    if v_otros = 0 then
      raise exception
        'No se puede dejar la empresa sin un administrador de RRHH';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.rol is distinct from 'admin_rrhh' or old.empresa_id is null then
    return new;
  end if;

  -- ¿Deja de ser admin_rrhh de old.empresa_id?
  if new.rol is distinct from 'admin_rrhh'
     or new.empresa_id is distinct from old.empresa_id
  then
    v_empresa := old.empresa_id;
    select count(*) into v_otros
    from usuarios u
    where u.empresa_id = v_empresa
      and u.rol = 'admin_rrhh'
      and u.id is distinct from old.id;
    if v_otros = 0 then
      raise exception
        'No se puede dejar la empresa sin un administrador de RRHH';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assert_no_dejar_sin_admin_rrhh on public.usuarios;
create trigger trg_assert_no_dejar_sin_admin_rrhh
  before update or delete on public.usuarios
  for each row execute function public.assert_no_dejar_sin_admin_rrhh();

comment on function public.assert_no_dejar_sin_admin_rrhh() is
  'Impide demote/mover/borrar el último admin_rrhh de una empresa (JWT presente).';

notify pgrst, 'reload schema';
