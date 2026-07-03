-- ============================================================
-- Alta automática de perfiles: cuando alguien acepta la invitación
-- (se crea en auth.users), se genera su fila en public.usuarios con
-- la empresa, rol y empleado que viajan en la metadata de la invitación.
-- ============================================================

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.usuarios (id, email, rol, empresa_id, empleado_id, nombre_completo)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', '')::rol_usuario, 'empleado'),
    nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid,
    nullif(new.raw_user_meta_data ->> 'empleado_id', '')::uuid,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre_completo', ''), new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger crear_perfil_al_registrarse
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();
