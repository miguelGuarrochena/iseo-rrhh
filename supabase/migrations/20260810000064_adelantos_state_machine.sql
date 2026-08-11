-- ============================================================
-- Migración 64: máquina de estados de adelantos
--
-- Producto (resolverAdelanto): sólo pendiente → aprobado|rechazado,
-- con resuelto_en y periodo (si aprueba). No hay cancelación de
-- empleado. DELETE admin es borrado de error, no transición.
--
-- Cierra FRT-11b / O1: admin no puede reabrir rechazado→aprobado.
-- Espejo de lock_ausencia_maquina_estados (mig 58).
-- Idempotente.
-- ============================================================

create or replace function public.lock_adelanto_maquina_estados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mantenimiento sin JWT (service role / SQL editor).
  if auth.uid() is null then
    return new;
  end if;

  -- Ya resuelto: inmutable por UPDATE (borrar es DELETE de admin).
  if old.estado in ('aprobado', 'rechazado') then
    raise exception
      'No se puede modificar un adelanto ya resuelto (estado %)',
      old.estado;
  end if;

  -- Desde pendiente: sólo aprobar o rechazar.
  if old.estado = 'pendiente' then
    if new.estado not in ('aprobado', 'rechazado') then
      raise exception
        'Desde pendiente sólo se puede pasar a aprobado o rechazado';
    end if;

    if new.empleado_id is distinct from old.empleado_id
       or new.empresa_id is distinct from old.empresa_id
       or new.monto is distinct from old.monto
       or new.motivo is distinct from old.motivo
       or new.creado_en is distinct from old.creado_en
    then
      raise exception
        'Al resolver un adelanto no se pueden cambiar los datos del pedido';
    end if;

    if new.resuelto_en is null then
      raise exception 'La resolución debe registrar fecha';
    end if;

    -- Aprobado exige período de descuento (contrato de resolverAdelanto).
    if new.estado = 'aprobado' and (new.periodo is null or btrim(new.periodo) = '') then
      raise exception 'Un adelanto aprobado debe tener período de descuento';
    end if;

    -- Rechazado no lleva período.
    if new.estado = 'rechazado' and new.periodo is not null then
      raise exception 'Un adelanto rechazado no debe tener período';
    end if;

    return new;
  end if;

  raise exception 'Transición de estado de adelanto no permitida';
end;
$$;

drop trigger if exists trg_lock_adelanto_maquina_estados on public.adelantos;
create trigger trg_lock_adelanto_maquina_estados
  before update on public.adelantos
  for each row execute function public.lock_adelanto_maquina_estados();

comment on function public.lock_adelanto_maquina_estados() is
  'Máquina de estados: pendiente→aprobado|rechazado; resueltos inmutables. DELETE admin aparte.';

notify pgrst, 'reload schema';
