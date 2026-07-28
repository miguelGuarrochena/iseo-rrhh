-- ============================================================
-- Seguridad (auditoría jul 2026)
--
-- 1) Trigger de alta: no confiar en metadata de signup público.
--    Solo invitaciones (invited_at) pueden traer rol/empresa.
--    Nunca crear superadmin desde metadata.
-- 2) Impedir que admin_rrhh se auto-asigne rol=superadmin vía UPDATE.
-- 3) Mensajes de comunicación: autor_id = auth.uid().
-- 4) Firma destinatarios: el empleado no puede cambiar documento/empleado
--    ni re-firmar / borrar firmado_en.
-- ============================================================

-- ---------- 1. Alta de perfil: solo desde invitación ----------
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
begin
  -- Signup abierto / alta manual sin invite: no auto-asignar tenant ni rol.
  -- El superadmin se crea solo por SQL (soporte), nunca por metadata.
  if new.invited_at is null then
    return new;
  end if;

  v_rol := coalesce(
    nullif(new.raw_user_meta_data ->> 'rol', '')::rol_usuario,
    'empleado'
  );
  if v_rol = 'superadmin' then
    return new;
  end if;
  if v_rol not in ('admin_rrhh', 'supervisor', 'empleado') then
    v_rol := 'empleado';
  end if;

  v_empresa := nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid;
  if v_empresa is null then
    return new;
  end if;

  insert into public.usuarios (id, email, rol, empresa_id, empleado_id, nombre_completo)
  values (
    new.id,
    new.email,
    v_rol,
    v_empresa,
    nullif(new.raw_user_meta_data ->> 'empleado_id', '')::uuid,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre_completo', ''), new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- 2. Bloquear escalada de privilegios en usuarios ----------
create or replace function public.prevenir_escalada_rol_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin JWT (SQL editor / service role): mantenimiento permitido.
  -- Con sesión de cliente: solo un superadmin puede crear/tocar superadmins.
  if auth.uid() is null then
    return new;
  end if;

  if new.rol = 'superadmin' and (tg_op = 'INSERT' or old.rol is distinct from 'superadmin') then
    if not es_superadmin() then
      raise exception 'No se puede asignar el rol superadmin';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.rol = 'superadmin' and not es_superadmin() then
    raise exception 'No se puede modificar un usuario superadmin';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevenir_escalada_rol on public.usuarios;
create trigger trg_prevenir_escalada_rol
  before insert or update on public.usuarios
  for each row execute function public.prevenir_escalada_rol_usuario();

-- ---------- 3. Mensajes: no impersonar autor ----------
drop policy if exists comunicacion_mensajes_insert on comunicacion_mensajes;
create policy comunicacion_mensajes_insert on comunicacion_mensajes for insert
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from comunicaciones c
      where c.id = comunicacion_id
        and (
          es_superadmin()
          or (
            c.empresa_id = auth_empresa()
            and (es_gestor() or c.empleado_id = auth_empleado())
          )
        )
    )
  );

-- ---------- 4. Destinatarios firma: claves inmutables + una sola firma ----------
create or replace function public.lock_destinatario_firma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.documento_id is distinct from old.documento_id
       or new.empleado_id is distinct from old.empleado_id then
      if not (
        es_superadmin()
        or auth_rol() = 'admin_rrhh'
      ) then
        raise exception 'No se puede reasignar el destinatario de firma';
      end if;
    end if;

    -- Empleado: solo puede pasar de no firmado → firmado (una vez).
    if auth_empleado() is not null
       and old.empleado_id = auth_empleado()
       and auth_rol() = 'empleado' then
      if old.firmado_en is not null then
        raise exception 'El documento ya fue firmado';
      end if;
      if new.firmado_en is null then
        raise exception 'La firma debe registrar fecha';
      end if;
      new.documento_id := old.documento_id;
      new.empleado_id := old.empleado_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_destinatario_firma on public.documento_firma_destinatarios;
create trigger trg_lock_destinatario_firma
  before update on public.documento_firma_destinatarios
  for each row execute function public.lock_destinatario_firma();

notify pgrst, 'reload schema';
