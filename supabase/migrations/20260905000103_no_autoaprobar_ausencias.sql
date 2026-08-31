-- ============================================================
-- Nadie resuelve su propia ausencia.
--
-- Qué pasaba
-- ----------
-- La máquina de estados de la migración 58 controla QUÉ transiciones son
-- válidas (pendiente → aprobada|rechazada, resueltas inmutables) pero no
-- QUIÉN las hace. Un supervisor con un legajo asociado podía aprobar su
-- propio pedido de vacaciones: la policy `ausencias_gestion` sólo mira
-- que sea gestor de la empresa, y `es_gestor()` incluye a `supervisor`.
--
-- No hacía falta ni tocar la UI: un PATCH a PostgREST sobre su propia
-- fila alcanzaba. Es el caso clásico de control que sólo existía como
-- botón escondido.
--
-- Qué se hace
-- -----------
-- Un trigger BEFORE UPDATE que rechaza la resolución cuando quien la
-- firma es el titular de la ausencia. Va por trigger y no por policy
-- porque hay que comparar la fila vieja con el actor, y una policy de
-- UPDATE no puede expresar "el que resuelve no puede ser el de la fila"
-- sin repetir el join en `using` y `with check`.
--
-- Quién sí puede: cualquier otro gestor de la empresa —otro supervisor,
-- el admin_rrhh— y el superadmin de ISEO. La regla es sobre la persona,
-- no sobre el rol: un admin_rrhh tampoco se aprueba las propias.
--
-- Qué NO cambia
-- -------------
-- Pedir la ausencia, verla, borrarla mientras está pendiente: igual.
-- Sólo se toca el paso de pendiente a resuelta.
--
-- Sin JWT (service role, semillas, scripts) no se frena: mismo criterio
-- que el resto de los triggers de la base.
--
-- Idempotente.
-- ============================================================

create or replace function public.trg_no_autoaprobar_ausencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado_del_actor uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Sólo interesa el paso a resuelta: el resto de los updates ya los
  -- gobierna `lock_ausencia_maquina_estados`.
  if old.estado is distinct from 'pendiente'
     or new.estado not in ('aprobada', 'rechazada') then
    return new;
  end if;

  v_empleado_del_actor := auth_empleado();

  if v_empleado_del_actor is not null
     and v_empleado_del_actor = old.empleado_id then
    raise exception
      'AUSENCIA_PROPIA: no podés resolver tu propia ausencia. Tiene que aprobarla otra persona.';
  end if;

  return new;
end;
$$;

comment on function public.trg_no_autoaprobar_ausencia() is
  'Nadie aprueba ni rechaza su propia ausencia, sea supervisor o admin. '
  'La regla es sobre la persona, no sobre el rol.';

drop trigger if exists no_autoaprobar_ausencia on public.ausencias;
/*
 * Corre ANTES que la máquina de estados (los triggers BEFORE del mismo
 * evento se disparan por orden alfabético de nombre y "no_autoaprobar"
 * < "trg_lock"). Da igual cuál corra primero —los dos rechazan— pero así
 * el mensaje que ve quien lo intenta es el que explica el porqué.
 */
create trigger no_autoaprobar_ausencia
  before update on public.ausencias
  for each row execute function public.trg_no_autoaprobar_ausencia();

notify pgrst, 'reload schema';
