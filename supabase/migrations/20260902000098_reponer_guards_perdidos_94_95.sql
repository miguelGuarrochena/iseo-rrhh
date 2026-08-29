-- ============================================================
-- Repone dos protecciones que las migraciones 94 y 95 se llevaron puestas.
--
-- Por qué esto es una migración nueva y no un arreglo de la 94 y la 95
-- --------------------------------------------------------------------
-- Las dos ya están aplicadas y registradas en producción. Editar el
-- archivo de una migración aplicada no cambia nada: `db push` mira el
-- historial, ve que ya corrió, y no la vuelve a ejecutar. Un arreglo
-- escrito ahí queda vivo sólo en local — y hace algo peor que no existir,
-- porque en local todo pasa y nadie se entera de que producción quedó sin
-- el arreglo.
--
-- Así que las correcciones van acá, con `create or replace`, y quedan
-- aplicadas sin importar qué versión de la 94 y la 95 haya llegado.
--
-- Qué se repone
-- -------------
-- 1. `saldo_licencia_disponible` — el gate de tenencia de la migración
--    61. La 94 reescribió la función entera partiendo del cuerpo de la
--    59, que es anterior, y se perdió: cualquier autenticado podía
--    preguntar el saldo de licencias de un legajo de otra empresa.
--
-- 2. `lock_destinatario_firma` — un documento archivado no se firma. La
--    95 introdujo el archivado y sacó los documentos archivados de la
--    vista del destinatario, pero la fila de
--    `documento_firma_destinatarios` seguía siendo suya y seguía siendo
--    actualizable: alguien con la pantalla abierta cuando RRHH archiva
--    —o con el id a mano— podía firmar algo ya retirado, y esa firma
--    quedaba como constancia de un documento que no circula.
--
-- Qué NO cambia
-- -------------
-- Ningún cálculo. Las dos son restricciones: agregan un caso que se
-- rechaza, no mueven ningún número. Para el llamador legítimo —el propio
-- legajo, el gestor de su empresa, superadmin, y los triggers sin JWT—
-- todo se comporta igual.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Saldo de licencia: gate de tenencia (repone la migración 61).
-- ------------------------------------------------------------
create or replace function public.saldo_licencia_disponible(
  p_empleado_id uuid,
  p_tipo tipo_ausencia,
  p_anio int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_cupo int;
  v_usados int;
begin
  -- Tenencia (migración 61). Va PRIMERO y no se puede perder al
  -- reescribir el cuerpo. Sólo aplica si hay sesión: sin `auth.uid()`
  -- esto corre desde una migración, un fixture o un job, y ahí no hay
  -- empresa contra la cual comparar.
  if auth.uid() is not null and not es_superadmin() then
    if p_empleado_id is null
       or not exists (
         select 1
         from empleados e
         where e.id = p_empleado_id
           and e.empresa_id is not null
           and e.empresa_id = auth_empresa()
       )
    then
      raise exception 'No autorizado a consultar ese saldo';
    end if;
  end if;

  -- Vacaciones tienen su propio saldo (BUG-008).
  if p_tipo = 'vacaciones' then
    return null;
  end if;

  -- Licencias por evento: sin cupo, aunque haya quedado una fila vieja
  -- en `cupos_licencia`. No se borran datos; se dejan de consultar.
  if p_tipo::text = any (tipos_licencia_por_evento()) then
    return null;
  end if;

  select e.empresa_id into v_empresa
  from empleados e
  where e.id = p_empleado_id;

  if v_empresa is null then
    return null;
  end if;

  select c.dias_anuales into v_cupo
  from cupos_licencia c
  where c.empresa_id = v_empresa
    and c.tipo = p_tipo;

  -- Sin fila → sin límite configurado.
  if v_cupo is null then
    return null;
  end if;

  -- Los días se imputan al año al que pertenecen, no al año en que la
  -- licencia empezó (F-06).
  select coalesce(sum(
    dias_corridos_en_anio(a.fecha_desde, a.fecha_hasta, p_anio)
  ), 0)
    into v_usados
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = p_tipo
    and a.estado = 'aprobada'
    and a.fecha_desde <= make_date(p_anio, 12, 31)
    and a.fecha_hasta >= make_date(p_anio, 1, 1);

  return v_cupo - v_usados;
end;
$$;

comment on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) is
  'Disponible = cupo anual − días aprobados que caen en ese año. NULL = '
  'sin cupo configurado o licencia por evento. Tenant: auth_empresa() '
  '(autenticados); superadmin libre; sin JWT sin gate. Espejo de '
  'getSaldosLicencia.';

revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from public;
revoke all on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) from anon;
grant execute on function public.saldo_licencia_disponible(uuid, tipo_ausencia, int) to authenticated;

-- ------------------------------------------------------------
-- 2. Un documento archivado no se firma.
--
-- Va en el trigger y no en la policy para que el mensaje diga qué pasó.
-- ------------------------------------------------------------
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
      if exists (
        select 1 from documentos_firma d
        where d.id = old.documento_id and d.archivado_en is not null
      ) then
        raise exception
          'Este documento se dio de baja y ya no se puede firmar';
      end if;
      new.documento_id := old.documento_id;
      new.empleado_id := old.empleado_id;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.lock_destinatario_firma() is
  'Empleado: sólo no firmado → firmado, una vez, y sólo si el documento '
  'sigue vigente. Reasignar destinatario: admin_rrhh/superadmin.';

notify pgrst, 'reload schema';
