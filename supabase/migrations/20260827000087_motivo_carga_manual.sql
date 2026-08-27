-- ============================================================
-- Motivo obligatorio en la carga manual de fichajes.
--
-- Qué pasaba
-- ----------
-- Anular una marca exige motivo desde F-12 (`anular_fichaje` lo valida
-- y lo guarda en `anulado_motivo`). Crear una a mano no exigía nada:
-- quedaba `registrado_por`, o sea QUIÉN, pero nunca POR QUÉ.
--
-- La asimetría iba justo para el lado equivocado. Borrar una marca real
-- deja rastro de la razón; inventar una que nunca existió no dejaba
-- ninguna. Y la carga manual es el único camino por el que entra una
-- marca sin rostro, sin geocerca y con la hora que escriba quien la
-- carga: es exactamente donde más hace falta poder reconstruir después
-- qué pasó ese día.
--
-- Cómo queda
-- ----------
-- `fichajes.motivo` guarda la razón. No se valida con un CHECK de tabla
-- porque no todas las filas son cargas manuales: las del RPC
-- `fichar_con_rostro` no tienen por qué tener motivo, y las que ya
-- existen tampoco. La regla es "si es carga manual, tiene motivo", y
-- quien sabe si es carga manual es el trigger — es el mismo que ya
-- decide `metodo := 'manual'`.
--
-- Se valida en el trigger y no en el cliente por lo mismo que el resto
-- de FIC-001: un campo obligatorio en un formulario lo saltea cualquiera
-- que hable PostgREST directo.
-- ============================================================

alter table public.fichajes
  add column if not exists motivo text;

comment on column public.fichajes.motivo is
  'Por qué se cargó esta marca a mano. Obligatorio en carga manual: una '
  'marca inventada sin razón no se puede auditar. Null en las del RPC.';

create or replace function public.imponer_actor_fichaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_motivo text;
begin
  if coalesce(current_setting('app.fichaje_validado', true), '') = 'si' then
    return new;
  end if;

  -- Sin sesión: migraciones, fixtures y mantenimiento. No se les exige
  -- motivo porque no son alguien cargando una marca por una razón.
  if auth.uid() is null then
    return new;
  end if;

  if not es_gestor() then
    raise exception
      'Para fichar usá el reconocimiento facial. No se puede cargar una marca a mano.'
      using errcode = 'insufficient_privilege';
  end if;

  v_motivo := btrim(coalesce(new.motivo, ''));
  if v_motivo = '' then
    raise exception
      'Decí por qué cargás esta marca a mano: sin motivo no se puede auditar después.'
      using errcode = 'check_violation';
  end if;

  select u.nombre_completo into v_nombre
    from public.usuarios u
   where u.id = auth.uid();

  new.metodo := 'manual'::metodo_fichaje;
  new.motivo := v_motivo;
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
      'motivo', v_motivo,
      'propia', auth_empleado() is not distinct from new.empleado_id
    )
  );

  return new;
end;
$$;

comment on function public.imponer_actor_fichaje() is
  'FIC-001 + F-07: todo INSERT directo es carga manual de un gestor. '
  'Fija metodo y actor, exige motivo y audita en la misma transacción. '
  'El empleado no puede insertar: ficha por fichar_con_rostro.';

notify pgrst, 'reload schema';
