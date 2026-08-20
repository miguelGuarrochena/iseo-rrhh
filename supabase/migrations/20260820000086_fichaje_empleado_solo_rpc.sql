-- El empleado ficha por `fichar_con_rostro`, no por INSERT directo.
--
-- La policy `fichajes_fichar` dejaba `empleado_id = auth_empleado()`.
-- Eso era el hueco: un cliente modificado (o un curl con el JWT) podía
-- insertar un egreso, una hora inventada o el tipo que le conviniera,
-- sin pasar por la cámara ni por `tipo_de_marca_siguiente`.
--
-- El INSERT directo queda para gestores (carga a mano). El empleado
-- sigue pudiendo leer sus marcas; para crearlas usa el RPC, que es
-- security definer y decide el tipo en el servidor.

drop policy if exists fichajes_fichar on public.fichajes;
create policy fichajes_fichar on public.fichajes for insert
  with check (
    es_superadmin()
    or (empresa_id = auth_empresa() and es_gestor())
  );

comment on policy fichajes_fichar on public.fichajes is
  'Sólo gestores y superadmin insertan directo (carga a mano). '
  'El empleado ficha por fichar_con_rostro.';

-- Defensa si alguien afloja la policy: el trigger ya convierte todo
-- INSERT directo en carga manual; ahora además exige ser gestor.
create or replace function public.imponer_actor_fichaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if coalesce(current_setting('app.fichaje_validado', true), '') = 'si' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not es_gestor() then
    raise exception
      'Para fichar usá el reconocimiento facial. No se puede cargar una marca a mano.'
      using errcode = 'insufficient_privilege';
  end if;

  select u.nombre_completo into v_nombre
    from public.usuarios u
   where u.id = auth.uid();

  new.metodo := 'manual'::metodo_fichaje;
  new.registrado_por_id := auth.uid();
  new.registrado_por := coalesce(v_nombre, '');
  new.confianza := null;
  new.fuera_de_zona := null;

  insert into public.auditoria_acciones (
    empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle
  ) values (
    new.empresa_id,
    auth.uid(),
    coalesce(v_nombre, ''),
    'cargar_manual',
    'fichaje',
    new.id::text,
    jsonb_build_object(
      'empleadoId', new.empleado_id,
      'tipo', new.tipo,
      'timestamp', new.ts,
      'metodo', new.metodo,
      'propia', auth_empleado() is not distinct from new.empleado_id
    )
  );

  return new;
end;
$$;

comment on function public.imponer_actor_fichaje() is
  'FIC-001 + F-07: todo INSERT directo es carga manual de un gestor. '
  'El empleado no puede insertar: ficha por fichar_con_rostro.';

notify pgrst, 'reload schema';
