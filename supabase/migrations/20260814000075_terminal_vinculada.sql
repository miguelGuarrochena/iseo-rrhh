-- ============================================================
-- Fichaje — F-01: la terminal se vincula en el servidor
--
-- Qué pasaba
-- ----------
-- El fichaje 1:N (kiosco / Modo planta) no exigía NADA sobre quién
-- llamaba. `fichar_con_rostro` con `p_empleado_id = null` fichaba a
-- quien matcheara el descriptor, para cualquier usuario `authenticated`
-- del tenant. FIC-002 había cerrado el 1:1 (sólo podés fichar por vos)
-- pero dejó el 1:N abierto.
--
-- La única barrera era el frontend:
--
--   localStorage.iseo_terminal_id   ← "este dispositivo es una terminal"
--   localStorage.iseo_kiosco_activo ← "está en modo planta"
--
-- Las dos las escribe cualquiera desde la consola del navegador, y de
-- todas formas no hacía falta: bastaba un POST directo a PostgREST.
--
-- Peor todavía: como el RPC pone `app.fichaje_validado = 'si'`, el
-- trigger `imponer_actor_fichaje` se saltea y la marca NO queda como
-- carga manual ni genera auditoría. O sea que un fichaje fabricado
-- aparecía en la planilla de liquidación como un fichaje facial
-- legítimo, con método `facial_tablet` y ~97 % de confianza.
--
-- Qué hace esta migración
-- -----------------------
-- Cada terminal pasa a tener un secreto de 256 bits que genera el
-- servidor y del que sólo se guarda el hash. El camino 1:N exige, en la
-- misma transacción y contra la base:
--
--   * que quien llama sea gestor del tenant,
--   * que venga un par (terminal, secreto) válido,
--   * que esa terminal sea de la MISMA empresa que el JWT,
--   * y que esté activa.
--
-- El camino 1:1 (celular / empleado) no cambia: no necesita terminal.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas en `terminales`
--
-- Se reutiliza la tabla que ya existía (migración 08) en vez de crear
-- una nueva: ya tiene `empresa_id`, RLS por tenant y la administra
-- `admin_rrhh`. Lo único que le faltaba era la credencial y el estado.
-- ------------------------------------------------------------
alter table public.terminales
  add column if not exists activa boolean not null default true,
  add column if not exists secreto_hash text,
  add column if not exists secreto_creado_en timestamptz;

comment on column public.terminales.activa is
  'Terminal habilitada para fichar 1:N. Desactivarla corta el kiosco sin '
  'perder el histórico de la terminal.';
comment on column public.terminales.secreto_hash is
  'SHA-256 de (id || ":" || secreto). El secreto en claro se entrega una '
  'sola vez, al autorizar el dispositivo, y no se guarda en ningún lado.';

-- Índice del camino caliente: cada fichada del kiosco busca por
-- (id, empresa_id) y sólo si está activa.
create index if not exists terminales_activas_idx
  on public.terminales (empresa_id, id)
  where activa;

-- ------------------------------------------------------------
-- 2. El secreto no se lee ni se escribe por PostgREST
--
-- Mismo patrón que la migración 66 usó para el CBU y la biometría: se
-- revoca el SELECT de tabla y se re-otorga por columnas, dejando afuera
-- `secreto_hash`. Sin esto, `select *` sobre `terminales` devolvería el
-- hash a cualquier gestor del tenant.
--
-- INSERT se revoca del todo: las terminales se crean únicamente por
-- `autorizar_terminal()`, que es lo que garantiza que toda terminal
-- nazca con un secreto. Una fila insertada a mano quedaría con
-- `secreto_hash` nulo y no podría fichar igual, pero mejor que ni
-- exista el camino.
--
-- UPDATE queda acotado por columnas a `nombre` y `activa`: si un
-- `admin_rrhh` pudiera escribir `secreto_hash` directamente, podría
-- fijarle a una terminal un secreto elegido por él. No es una escalada
-- (ya puede autorizar terminales), pero deja de ser posible del todo.
-- ------------------------------------------------------------
revoke select on table public.terminales from anon;
revoke select on table public.terminales from authenticated;
revoke insert, update, delete on table public.terminales from anon;
revoke insert, update, delete on table public.terminales from authenticated;

grant select (id, empresa_id, nombre, creado_en, activa, secreto_creado_en)
  on table public.terminales to authenticated;
grant update (nombre, activa) on table public.terminales to authenticated;
grant delete on table public.terminales to authenticated;

-- ------------------------------------------------------------
-- 3. Hash del secreto
--
-- SHA-256 y no bcrypt a propósito. bcrypt existe para estirar secretos
-- de baja entropía (contraseñas humanas); acá el secreto son 256 bits
-- de `gen_random_bytes`, así que no hay diccionario que recorrer y el
-- costo por intento no agrega seguridad. Sí agregaría latencia: bcrypt
-- son ~100 ms por verificación, y esto corre en cada fichada de una
-- fila de gente esperando frente a la tablet.
--
-- El id de la terminal entra en el hash para que el digest quede atado
-- a su fila: un hash copiado a otra terminal no valida.
--
-- pgcrypto vive en el esquema `extensions` en Supabase; el search_path
-- lo incluye para no depender de dónde esté instalado.
-- ------------------------------------------------------------
create or replace function public.hash_secreto_terminal(
  p_terminal_id uuid,
  p_secreto text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    digest(p_terminal_id::text || ':' || coalesce(p_secreto, ''), 'sha256'),
    'hex'
  );
$$;

revoke all on function public.hash_secreto_terminal(uuid, text) from public;
revoke all on function public.hash_secreto_terminal(uuid, text) from anon;
revoke all on function public.hash_secreto_terminal(uuid, text) from authenticated;

-- ------------------------------------------------------------
-- 4. Autorizar una terminal (único camino de alta)
--
-- Devuelve el secreto en claro UNA sola vez. No se guarda: si se pierde,
-- hay que volver a autorizar el dispositivo.
--
-- SECURITY DEFINER porque escribe `secreto_hash`, columna que ni
-- `admin_rrhh` tiene permiso de escribir directamente. La autorización
-- se comprueba adentro, no se hereda del DEFINER.
-- ------------------------------------------------------------
create or replace function public.autorizar_terminal(p_nombre text)
returns table (id uuid, nombre text, secreto text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresa uuid := auth_empresa();
  v_id uuid := gen_random_uuid();
  v_secreto text := encode(gen_random_bytes(32), 'hex');
begin
  -- Sólo admin_rrhh de la empresa. Un supervisor puede VER las
  -- terminales pero no crear una: autorizar un dispositivo es
  -- exactamente el permiso que convierte un equipo en kiosco.
  if v_empresa is null or auth_rol() is distinct from 'admin_rrhh' then
    raise exception 'No tenés permiso para autorizar terminales.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'La terminal necesita un nombre.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into terminales (
    id, empresa_id, nombre, activa, secreto_hash, secreto_creado_en
  ) values (
    v_id,
    v_empresa,
    btrim(p_nombre),
    true,
    hash_secreto_terminal(v_id, v_secreto),
    now()
  );

  insert into auditoria_acciones (
    empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle
  )
  select
    v_empresa, auth.uid(), coalesce(u.nombre_completo, ''),
    'autorizar', 'terminal', v_id::text,
    -- El secreto NO va a la auditoría. Sólo que se autorizó y cuál.
    jsonb_build_object('nombre', btrim(p_nombre))
  from usuarios u where u.id = auth.uid();

  return query select v_id, btrim(p_nombre), v_secreto;
end;
$$;

comment on function public.autorizar_terminal is
  'Crea una terminal y devuelve su secreto UNA sola vez. Sólo admin_rrhh '
  'de la empresa. El secreto no se persiste: sólo su hash.';

revoke all on function public.autorizar_terminal(text) from public;
revoke all on function public.autorizar_terminal(text) from anon;
grant execute on function public.autorizar_terminal(text) to authenticated;

-- ------------------------------------------------------------
-- 5. Validación de la credencial de terminal
--
-- Una sola consulta: id + empresa + activa + hash, todo junto. Que la
-- comprobación de tenant esté en el mismo WHERE y no en un `if` aparte
-- es deliberado — no hay ventana entre "encontré la terminal" y
-- "verifiqué de quién es".
--
-- Devuelve boolean y no el motivo: distinguir "esa terminal no existe"
-- de "el secreto no coincide" convierte al RPC en un oráculo para
-- enumerar terminales. El llamador da un único mensaje.
--
-- Sobre la comparación del digest: no es constante en tiempo, y no hace
-- falta que lo sea. Lo que se compara es el SHA-256 de un secreto de
-- 256 bits; conocer cuántos caracteres del hash coinciden no acerca a
-- nadie al secreto, porque habría que invertir el digest para
-- aprovecharlo.
-- ------------------------------------------------------------
create or replace function public.terminal_habilitada(
  p_terminal_id uuid,
  p_secreto text,
  p_empresa_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from terminales t
     where t.id = p_terminal_id
       and t.empresa_id = p_empresa_id
       and t.activa
       and t.secreto_hash is not null
       and t.secreto_hash = hash_secreto_terminal(p_terminal_id, p_secreto)
  );
$$;

comment on function public.terminal_habilitada is
  'Valida el par (terminal, secreto) contra la empresa dada. Devuelve '
  'sólo true/false para no servir de oráculo de enumeración.';

revoke all on function public.terminal_habilitada(uuid, text, uuid) from public;
revoke all on function public.terminal_habilitada(uuid, text, uuid) from anon;
revoke all on function public.terminal_habilitada(uuid, text, uuid) from authenticated;

-- ------------------------------------------------------------
-- 6. `fichar_con_rostro` con credencial de terminal en el camino 1:N
--
-- OJO con el `create or replace`: agregar parámetros CAMBIA la firma, y
-- Postgres crearía una sobrecarga en vez de reemplazar. La versión de 6
-- argumentos seguiría existiendo —y seguiría permitiendo 1:N sin
-- terminal— porque PostgREST resuelve por las claves del JSON que le
-- mandan. Hay que dropearla explícitamente.
-- ------------------------------------------------------------
drop function if exists public.fichar_con_rostro(
  jsonb, text, uuid, double precision, double precision, text
);

create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_metodo text default 'facial_tablet',
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null,
  p_terminal_id uuid default null,
  p_terminal_secreto text default null
)
returns setof fichajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := auth_empresa();
  v_umbral double precision := case when p_empleado_id is null then 0.5 else 0.6 end;
  v_margen constant double precision := 0.05;
  v_mejor record;
  v_segunda double precision;
  v_radio double precision;
  v_fuera boolean := null;
  v_tipo tipo_fichaje;
  v_fila fichajes;
  v_hash text;
begin
  if v_empresa is null then
    raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
  end if;

  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  if p_empleado_id is not null then
    -- ---- 1:1 (celular / empleado). No necesita terminal. ----
    -- FIC-002: el descriptor no autoriza a fichar por otro.
    if auth_empleado() is null
       or auth_empleado() is distinct from p_empleado_id then
      raise exception 'Solo podés fichar por vos.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- ---- 1:N (kiosco). Exige gestor + terminal vinculada. ----
    --
    -- Los dos controles son necesarios y ninguno alcanza solo:
    --
    --   * Sin el de rol, un empleado que copie el secreto de la tablet
    --     ficharía por cualquiera desde su celular.
    --   * Sin el de terminal, cualquier supervisor ficharía por
    --     cualquiera desde su casa — que es justamente F-01.
    if not es_gestor() then
      raise exception 'El fichaje en planta se hace desde la terminal.'
        using errcode = 'insufficient_privilege';
    end if;

    if p_terminal_id is null or p_terminal_secreto is null
       or not terminal_habilitada(p_terminal_id, p_terminal_secreto, v_empresa)
    then
      -- Un solo mensaje para "no existe", "no es de tu empresa",
      -- "está desactivada" y "el secreto no coincide": distinguirlos
      -- permitiría enumerar terminales ajenas.
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- ---- Match contra los rostros enrolados de la empresa ----
  select e.id,
         e.modo_fichaje,
         e.geocerca,
         distancia_descriptores(e.descriptor_facial, p_descriptor) as dist
    into v_mejor
    from empleados e
   where e.empresa_id = v_empresa
     and e.activo
     and e.descriptor_facial is not null
     and (p_empleado_id is null or e.id = p_empleado_id)
   order by dist asc
   limit 1;

  if not found then
    raise exception 'No hay rostros registrados para comparar.'
      using errcode = 'no_data_found';
  end if;

  if v_mejor.dist > v_umbral then
    raise exception 'No reconocimos el rostro.' using errcode = 'no_data_found';
  end if;

  if p_empleado_id is null then
    select distancia_descriptores(e.descriptor_facial, p_descriptor)
      into v_segunda
      from empleados e
     where e.empresa_id = v_empresa
       and e.activo
       and e.descriptor_facial is not null
       and e.id <> v_mejor.id
     order by 1 asc
     limit 1;

    if v_segunda is not null and (v_segunda - v_mejor.dist) < v_margen then
      raise exception 'Hay dos rostros parecidos: fichá eligiendo tu nombre.'
        using errcode = 'no_data_found';
    end if;
  end if;

  -- FIC-002 antirreplay: mismo descriptor exacto ya usado por esa persona.
  v_hash := hash_descriptor_facial(p_descriptor);
  if exists (
    select 1
      from fichajes_descriptor_usado u
     where u.empleado_id = v_mejor.id
       and u.descriptor_hash = v_hash
  ) then
    raise exception 'Ese reconocimiento ya se usó. Acercate de nuevo a la cámara.'
      using errcode = 'unique_violation';
  end if;

  -- FIC-012: geocerca del empleado, sólo en 1:1 con modo celular.
  if p_empleado_id is not null
     and v_mejor.modo_fichaje = 'celular'
     and v_mejor.geocerca is not null
     and v_mejor.geocerca <> 'null'::jsonb
     and p_lat is not null and p_lng is not null then
    v_radio := coalesce((v_mejor.geocerca->>'radioM')::double precision, 150);
    v_fuera := distancia_metros(
                 (v_mejor.geocerca->>'lat')::double precision,
                 (v_mejor.geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > v_radio;
  end if;

  -- FIC-004: serializar por empleado ANTES de leer la última marca.
  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  -- FIC-009 / FIC-010.
  if p_tipo is not null and (es_gestor() or es_superadmin()) then
    v_tipo := p_tipo::tipo_fichaje;
  else
    v_tipo := tipo_de_marca_siguiente(v_mejor.id, clock_timestamp());
  end if;

  perform set_config('app.fichaje_validado', 'si', true);

  insert into fichajes (
    empresa_id, empleado_id, tipo, ts, metodo, confianza, geo, fuera_de_zona
  ) values (
    v_empresa,
    v_mejor.id,
    v_tipo,
    clock_timestamp(),
    p_metodo::metodo_fichaje,
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  insert into fichajes_descriptor_usado (empleado_id, descriptor_hash)
  values (v_mejor.id, v_hash);

  return next v_fila;
  return;
end;
$$;

comment on function public.fichar_con_rostro is
  'Ficha validando rostro, terminal y geocerca en el servidor. 1:N exige '
  'gestor + par (terminal, secreto) activo del mismo tenant (F-01); 1:1 '
  'exige p_empleado_id = auth_empleado() y no usa terminal. El tipo '
  'alterna por sesión (max_jornada()).';

revoke all on function public.fichar_con_rostro(
  jsonb, text, uuid, double precision, double precision, text, uuid, text
) from public;
revoke all on function public.fichar_con_rostro(
  jsonb, text, uuid, double precision, double precision, text, uuid, text
) from anon;
grant execute on function public.fichar_con_rostro(
  jsonb, text, uuid, double precision, double precision, text, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- 7. Terminales que ya existían
--
-- Se quedan sin `secreto_hash`, así que `terminal_habilitada` las
-- rechaza y el kiosco de esos dispositivos deja de fichar hasta que
-- RRHH los vuelva a autorizar. Es a propósito: no hay forma de
-- inventarle un secreto a un dispositivo que nunca lo recibió, y
-- dejarlas pasar sería mantener abierto justamente lo que se cierra.
--
-- El fichaje 1:1 desde el celular no se ve afectado, y la carga manual
-- sigue disponible como respaldo mientras se re-autorizan las tablets.
-- ------------------------------------------------------------

notify pgrst, 'reload schema';
