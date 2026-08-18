-- ============================================================
-- Comunicaciones: que el "sin leer" diga la verdad.
--
-- El badge del menú cuenta las conversaciones cuya `actualizado_en` es
-- posterior a la marca de lectura del usuario. La idea estaba bien; la
-- implementación tenía tres agujeros, y los tres los sufre el usuario
-- como "me aparece un 1 y no hay nada nuevo" o al revés.
--
-- 1. `actualizado_en` lo escribía el navegador con SU reloj, mientras
--    que la fila nace con `now()` del servidor. Con el reloj de la
--    máquina unos segundos atrasado —cosa habitual— la marca de lectura
--    quedaba ANTES de la última actividad y la conversación seguía
--    figurando sin leer para siempre. Ahora las dos fechas las pone el
--    servidor: se comparan peras con peras.
--
-- 2. Responder no bumpeaba `actualizado_en` cuando el que respondía era
--    el colaborador: el UPDATE sobre `comunicaciones` sólo lo permite la
--    policy a los gestores, así que afectaba cero filas y nadie miraba
--    el error. Resultado: la respuesta del colaborador NO le encendía el
--    "sin leer" a RRHH. Ahora lo hace un trigger disparado por el
--    mensaje, que corre con permisos propios y no depende de quién
--    escriba.
--
-- 3. Cerrar una conversación bumpeaba `actualizado_en` sin dejar marca
--    de lectura para quien cerraba: apenas cerrabas el tema, te volvía a
--    aparecer como no leído. Es exactamente el "1" fantasma reportado.
--    El bump se queda (al colaborador le corresponde enterarse de que le
--    cerraron el tema), pero ahora el cliente marca leído después.
--
-- Además, la campanita: sus avisos no sabían de qué conversación
-- hablaban, así que sólo se apagaban al desplegar la campana. Con
-- `referencia_id` el aviso queda atado a la conversación y se apaga solo
-- cuando esa conversación se lee.
-- ============================================================

-- ---------- 1. El aviso sabe de qué habla ----------

alter table notificaciones
  add column if not exists referencia_id uuid;

comment on column notificaciones.referencia_id is
  'Registro al que se refiere el aviso (para apagarlo cuando se lee ese registro). Sin FK a propósito: la tabla apunta a entidades distintas según el tipo.';

-- Los avisos viejos quedan sin referencia: se siguen apagando al abrir
-- la campana, como hasta ahora. No hay nada que rellenar.
create index if not exists notificaciones_referencia_idx
  on notificaciones (usuario_id, tipo, referencia_id)
  where leida = false;

-- ---------- 2. La última actividad la fecha el servidor ----------

create or replace function public.comunicacion_fechar_actividad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Cualquier cambio sobre la conversación (hoy sólo el estado) es
  -- actividad. No se le cree la fecha al cliente: su reloj puede estar
  -- corrido y de ahí salían los "sin leer" que no se iban.
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_comunicacion_fechar_actividad on comunicaciones;
create trigger trg_comunicacion_fechar_actividad
  before update on comunicaciones
  for each row execute function public.comunicacion_fechar_actividad();

create or replace function public.comunicacion_tocar_por_mensaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `security definer` es el punto: el colaborador puede insertar el
  -- mensaje pero no puede actualizar la conversación, y sin esto su
  -- respuesta no le encendía el "sin leer" a nadie.
  update comunicaciones
     set estado = case when estado = 'abierta' then 'en_curso' else estado end,
         actualizado_en = now()
   where id = new.comunicacion_id;
  return new;
end;
$$;

drop trigger if exists trg_comunicacion_tocar_por_mensaje on comunicacion_mensajes;
create trigger trg_comunicacion_tocar_por_mensaje
  after insert on comunicacion_mensajes
  for each row execute function public.comunicacion_tocar_por_mensaje();

-- ---------- 3. Marcar leído, con la misma fuente de tiempo ----------

create or replace function public.comunicacion_marcar_leida(
  p_comunicacion_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  -- `security definer` saltea RLS, así que el acceso se comprueba acá a
  -- mano y con la misma regla que la policy de lectura. Sin esto se
  -- podrían sembrar marcas sobre conversaciones ajenas.
  if not exists (
    select 1
    from comunicaciones c
    where c.id = p_comunicacion_id
      and (
        es_superadmin()
        or (
          c.empresa_id = auth_empresa()
          and (es_gestor() or c.empleado_id = auth_empleado())
        )
      )
  ) then
    raise exception 'Sin acceso a la comunicación.';
  end if;

  insert into comunicacion_lecturas (comunicacion_id, usuario_id, leido_en)
  values (p_comunicacion_id, v_uid, now())
  on conflict (comunicacion_id, usuario_id)
  do update set leido_en = now();

  -- Leer la conversación apaga el aviso de la campanita que la traía.
  -- Antes había que desplegar la campana para eso: veías el mensaje y el
  -- numerito seguía ahí.
  update notificaciones
     set leida = true
   where usuario_id = v_uid
     and tipo = 'comunicacion'
     and referencia_id = p_comunicacion_id
     and leida = false;
end;
$$;

revoke all on function public.comunicacion_marcar_leida(uuid) from public;
grant execute on function public.comunicacion_marcar_leida(uuid) to authenticated;

-- ---------- 4. Poder avisarle a RRHH ----------
--
-- Los avisos a los gestores salían de leer `usuarios` desde el
-- navegador, y la policy de esa tabla deja que el colaborador vea una
-- sola fila: la suya. O sea que la consulta devolvía vacío y el aviso
-- no se mandaba a nadie. Todo lo que abre o responde un colaborador
-- —consultas, ausencias, adelantos— llegaba a RRHH sólo si RRHH entraba
-- a mirar por las suyas.
--
-- Devuelve ids, nada más: no expone mail, nombre ni rol de nadie.

create or replace function public.gestores_de_empresa(
  p_empresa_id uuid default null
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from usuarios u
  where u.rol in ('admin_rrhh', 'supervisor')
    -- El parámetro sólo lo respeta para el equipo de ISEO, que opera
    -- adentro de una empresa que no es la suya. Para el resto manda su
    -- propia empresa y el parámetro se ignora: si no, cualquiera pediría
    -- los gestores de una empresa ajena.
    and u.empresa_id = case
          when es_superadmin() then p_empresa_id
          else auth_empresa()
        end;
$$;

revoke all on function public.gestores_de_empresa(uuid) from public;
grant execute on function public.gestores_de_empresa(uuid) to authenticated;

notify pgrst, 'reload schema';
