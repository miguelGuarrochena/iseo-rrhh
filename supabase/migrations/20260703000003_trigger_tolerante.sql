-- ============================================================
-- Fix: el trigger de alta solo crea el perfil cuando la invitación
-- trae empresa (o es superadmin). Un usuario creado a mano desde el
-- dashboard, sin metadata, ya no rompe el alta: su perfil se crea
-- después por SQL o por una invitación de la app.
-- ============================================================

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
begin
  v_rol := coalesce(nullif(new.raw_user_meta_data ->> 'rol', '')::rol_usuario, 'empleado');
  v_empresa := nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid;

  -- Sin empresa y sin ser superadmin no hay perfil válido: no hacer nada.
  if v_rol <> 'superadmin' and v_empresa is null then
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
