-- Versionado de la plantilla facial.
--
-- Por qué esta migración existe
-- -----------------------------
-- El pipeline facial se rehízo. El cambio de fondo es que ahora el
-- recorte que alimenta al modelo está **alineado** (rotación, escala y
-- traslación canónicas), y antes no lo estaba: se recortaba la caja de
-- los landmarks con un 20 % de margen y se estiraba.
--
-- Eso significa que un descriptor viejo y uno nuevo de **la misma
-- persona** son puntos de dos distribuciones distintas. Compararlos no
-- da "un poco peor": da un número sin sentido. Los dos resultados
-- posibles son igual de malos:
--
--   * falso rechazo permanente — la persona no puede fichar nunca y
--     nadie entiende por qué, porque "el sistema anda" para el resto;
--   * falso positivo — la distancia cae por casualidad dentro del
--     umbral y se registra la asistencia de otra persona.
--
-- Por qué no alcanza con marcar la versión en el cliente
-- ------------------------------------------------------
-- Porque el match no ocurre en el cliente: ocurre acá, dentro de
-- `fichar_con_rostro`, que es `security definer` justamente para que los
-- descriptores enrolados no salgan de la base. Un marcador que viva sólo
-- en el navegador no puede impedir que el servidor compare dos
-- plantillas incompatibles. La única forma de que sea **imposible** es
-- que el filtro esté en la consulta que elige contra quién comparar.
--
-- Qué NO hace esta migración
-- --------------------------
-- No borra ni convierte ningún descriptor existente. Convertirlos es
-- imposible —haría falta la foto original, que nunca se guardó, y por
-- diseño no se guarda— así que la única salida es re-enrolar. Los
-- descriptores viejos quedan donde están, marcados como versión 1, hasta
-- que RRHH termine el re-enrolamiento y decida retirarlos.
--
-- No toca F-01 (gestor + terminal vinculada en 1:N), ni el secreto de
-- terminal, ni RLS, ni el actor del fichaje, ni la auditoría, ni F-02
-- (`descriptor_facial` no sale de la base). La firma cambia sólo por el
-- parámetro nuevo.

-- ---------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------
alter table public.empleados
  add column if not exists descriptor_version smallint;

comment on column public.empleados.descriptor_version is
  'Versión del pipeline que generó descriptor_facial. 1 = pipeline previo '
  'al rediseño (sin alineamiento canónico); 2 = pipeline actual. NULL se '
  'lee como 1. Plantillas de versiones distintas NO son comparables.';

-- A los que ya tienen rostro se les pone la versión 1 explícita.
--
-- Se hace ahora y no se deja en NULL porque un NULL es ambiguo: no
-- distingue "viene del pipeline viejo" de "alguien agregó la columna y
-- todavía no la llenó". Con el valor puesto, cualquier consulta de
-- seguimiento del re-enrolamiento cuenta bien desde el primer día.
update public.empleados
   set descriptor_version = 1
 where descriptor_facial is not null
   and descriptor_version is null;

-- La coherencia se exige en la base y no sólo en el cliente: un
-- descriptor sin versión es un descriptor que después nadie sabe con qué
-- comparar.
alter table public.empleados
  drop constraint if exists empleados_descriptor_version_coherente;
alter table public.empleados
  add constraint empleados_descriptor_version_coherente
  check (
    (descriptor_facial is null and descriptor_version is null)
    or (descriptor_facial is not null and descriptor_version is not null)
  );

-- ---------------------------------------------------------------------
-- 2. Seguimiento del re-enrolamiento
--
-- `empleados_lectura` es la vista por la que PostgREST lee empleados, y
-- la que deliberadamente **no** expone `descriptor_facial` (F-02). Se le
-- agrega la versión, que es un entero de un dígito y no dice nada del
-- rostro de nadie: es metadato de despliegue, no biometría. Sin esto,
-- RRHH no tiene forma de saber a quién le falta re-enrolar y el
-- despliegue se hace a ciegas.
-- ---------------------------------------------------------------------
-- La lista de columnas es la de la vista vigente (migración 74) con
-- `descriptor_version` agregada al lado de `tiene_rostro`. El orden y
-- los nombres tienen que coincidir con los que ya existen: un
-- `create or replace view` sólo admite agregar columnas al final del
-- conjunto previo, y cualquier diferencia en las anteriores lo rechaza.
create or replace view public.empleados_lectura as
select
  e.id,
  e.empresa_id,
  e.nombre,
  e.apellido,
  e.dni,
  e.cuil,
  e.fecha_nacimiento,
  e.estado_civil,
  e.nivel_estudios,
  e.domicilio,
  e.telefono,
  e.email,
  e.contacto_emergencia,
  e.grupo_familiar,
  e.foto_url,
  e.fecha_ingreso,
  e.puesto,
  e.sector,
  e.supervisor_id,
  e.modalidad_contratacion,
  e.fecha_fin_contrato,
  e.modalidad_pago,
  e.banco,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.cbu
    else null
  end as cbu,
  e.obra_social,
  e.art,
  e.activo,
  e.fecha_baja,
  e.motivo_baja,
  e.checklist_alta,
  e.creado_en,
  -- El descriptor NO se expone a nadie, ni al titular ni a admin_rrhh.
  -- Sólo si la persona está enrolada o no.
  (e.descriptor_facial is not null) as tiene_rostro,
  case
    when puede_ver_datos_sensibles_empleado(e.id) then e.consentimiento_biometrico
    else null
  end as consentimiento_biometrico,
  e.modo_fichaje,
  e.geocerca,
  e.convenio,
  e.numero_legajo,
  e.sin_usuario,
  -- Metadato de despliegue: con qué pipeline se generó la plantilla.
  -- Va al final porque `create or replace view` no deja intercalar
  -- columnas nuevas entre las que ya existen.
  e.descriptor_version
from public.empleados e
where
  es_superadmin()
  or (
    e.empresa_id = auth_empresa()
    and (e.id = auth_empleado() or es_gestor())
  );

comment on view public.empleados_lectura is
  'Read path for PostgREST: same row visibility as empleados_select; CBU '
  'redacted for supervisors. descriptor_facial is never exposed — only '
  'tiene_rostro (FIC-011) and descriptor_version (deployment metadata).';

grant select on public.empleados_lectura to authenticated;
revoke all on public.empleados_lectura from anon;

-- ---------------------------------------------------------------------
-- 3. `fichar_con_rostro` con filtro de versión
--
-- Hay que DROPEAR la firma anterior, no sólo reemplazarla. Un
-- `create or replace` con un parámetro nuevo deja la vieja viva como
-- sobrecarga, y PostgREST resuelve por las claves del JSON: quedaría
-- intacto el camino que compara sin filtrar por versión, que es
-- exactamente el que esta migración viene a cerrar. Es la misma trampa
-- que documentaron las migraciones 74 y 76.
-- ---------------------------------------------------------------------
drop function if exists public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text
);

create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null,
  p_terminal_id uuid default null,
  p_terminal_secreto text default null,
  -- Por defecto 1, no 2, y es a propósito: durante el despliegue puede
  -- quedar una pestaña con el JavaScript viejo en cache, que llama sin
  -- este parámetro. Con el default en 1 esa pestaña sigue comparando
  -- contra plantillas viejas —su comportamiento de siempre— en vez de
  -- compararse contra las nuevas, que es justo lo que hay que impedir.
  p_version smallint default 1
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
  v_metodo metodo_fichaje;
  v_fila fichajes;
  v_hash text;
  v_version smallint := coalesce(p_version, 1);
begin
  if v_empresa is null then
    raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
  end if;

  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  if p_empleado_id is not null then
    -- ---- 1:1 (celular / empleado). No necesita terminal. ----
    if auth_empleado() is null
       or auth_empleado() is distinct from p_empleado_id then
      raise exception 'Solo podés fichar por vos.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- ---- 1:N (kiosco). F-01: gestor + terminal vinculada. ----
    if not es_gestor() then
      raise exception 'El fichaje en planta se hace desde la terminal.'
        using errcode = 'insufficient_privilege';
    end if;

    if p_terminal_id is null or p_terminal_secreto is null
       or not terminal_habilitada(p_terminal_id, p_terminal_secreto, v_empresa)
    then
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- El filtro de versión va en el WHERE, no en un chequeo posterior.
  --
  -- Si se comparara primero y se validara después, la comparación con la
  -- plantilla incompatible ya habría ocurrido y podría haber ganado el
  -- `order by dist` por encima de la correcta. Filtrando acá, una
  -- plantilla de otra versión sencillamente no existe para esta llamada.
  select e.id,
         e.modo_fichaje,
         e.geocerca,
         distancia_descriptores(e.descriptor_facial, p_descriptor) as dist
    into v_mejor
    from empleados e
   where e.empresa_id = v_empresa
     and e.activo
     and e.descriptor_facial is not null
     and coalesce(e.descriptor_version, 1) = v_version
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
       and coalesce(e.descriptor_version, 1) = v_version
       and e.id <> v_mejor.id
     order by 1 asc
     limit 1;

    if v_segunda is not null and (v_segunda - v_mejor.dist) < v_margen then
      raise exception 'Hay dos rostros parecidos: fichá eligiendo tu nombre.'
        using errcode = 'no_data_found';
    end if;
  end if;

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

  -- F-07: el método sale del camino recorrido, no de un parámetro.
  if p_empleado_id is null then
    v_metodo := 'facial_tablet'::metodo_fichaje;
  elsif v_mejor.modo_fichaje = 'remoto' then
    v_metodo := 'remoto'::metodo_fichaje;
  else
    v_metodo := 'celular'::metodo_fichaje;
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

  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

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
    v_metodo,
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  -- Se apaga el permiso apenas se usó (ver migración 76).
  perform set_config('app.fichaje_validado', '', true);

  insert into fichajes_descriptor_usado (empleado_id, descriptor_hash)
  values (v_mejor.id, v_hash);

  return next v_fila;
  return;
end;
$$;

comment on function public.fichar_con_rostro is
  'Ficha validando rostro, terminal y geocerca en el servidor. Compara '
  'SOLO contra plantillas de la misma descriptor_version: las de '
  'pipelines distintos no son comparables y mezclarlas produce falsos '
  'rechazos permanentes o falsos positivos. El método lo deriva la base '
  'del camino usado (F-07). 1:N exige gestor + terminal vinculada '
  '(F-01); 1:1 exige ser el titular.';

revoke all on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text, smallint
) from public;
revoke all on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text, smallint
) from anon;
grant execute on function public.fichar_con_rostro(
  jsonb, uuid, double precision, double precision, text, uuid, text, smallint
) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Retiro de las plantillas viejas
--
-- Se deja como función y no como un `update` suelto para que el paso
-- final del despliegue sea una operación con nombre, auditable y
-- reversible sólo por re-enrolamiento. No se ejecuta acá: la corre RRHH
-- cuando el tablero muestra que ya no queda nadie en versión 1.
--
-- Sólo borra plantillas **de la versión indicada**, y nunca la última
-- versión activa: retirar la versión con la que se está fichando dejaría
-- a toda la empresa sin poder marcar.
-- ---------------------------------------------------------------------
create or replace function public.retirar_plantillas_faciales(
  p_version smallint,
  p_version_vigente smallint default 2
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := auth_empresa();
  v_borradas integer;
begin
  if v_empresa is null or not es_gestor() then
    raise exception 'Solo RRHH puede retirar plantillas faciales.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_version is null or p_version = p_version_vigente then
    raise exception 'No se puede retirar la versión con la que se está fichando.'
      using errcode = 'invalid_parameter_value';
  end if;

  update empleados
     set descriptor_facial = null,
         descriptor_version = null,
         consentimiento_biometrico = null
   where empresa_id = v_empresa
     and descriptor_facial is not null
     and coalesce(descriptor_version, 1) = p_version;

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

comment on function public.retirar_plantillas_faciales is
  'Borra las plantillas faciales de una versión anterior, una vez '
  'completado el re-enrolamiento. Nunca borra la versión vigente. Se '
  'ejecuta a mano como paso final del despliegue, no automáticamente: '
  'una plantilla borrada sólo se recupera volviendo a enrolar a la '
  'persona.';

revoke all on function public.retirar_plantillas_faciales(smallint, smallint) from public;
revoke all on function public.retirar_plantillas_faciales(smallint, smallint) from anon;
grant execute on function public.retirar_plantillas_faciales(smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
