-- ============================================================
-- Fichaje — Bloque 2 (auditoría 2026-08-14)
--
-- FIC-010 (F-03)  El tipo de marca se decide por SESIÓN, no por día
--                 calendario. El turno noche registraba el egreso de
--                 las 06:00 como un ingreso nuevo.
-- FIC-011 (F-02)  `descriptor_facial` deja de salir de la base. La
--                 vista de lectura expone `tiene_rostro` (booleano).
-- FIC-012 (F-04)  La geocerca que se evalúa es la que configura el
--                 producto (`empleados.geocerca`) y sólo aplica al
--                 fichaje 1:1 desde el celular.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- FIC-010. El "día laboral" del RPC tiene que ser el mismo que el
-- del resto de la base.
--
-- Qué pasaba
-- ----------
-- `fichar_con_rostro` decidía ingreso/egreso mirando la última marca
-- **del día calendario local**:
--
--   where f.ts >= inicio_del_dia_en_zona_empresa()
--
-- Para un turno 22:00–06:00 eso da mal, y da mal todos los días:
--
--   lun 22:00  no hay marcas del lunes            → ingreso   ✓
--   mar 06:00  no hay marcas del martes           → ingreso   ✗
--              (la de las 22:00 quedó del otro lado de la medianoche)
--
-- La jornada del lunes queda entonces `ingreso, ingreso`. Y como
-- `jornadas_de_empresa` decide `cerrada` mirando si la ÚLTIMA marca
-- es un egreso, esa jornada no cierra nunca: entrada 22:00, salida
-- NULL, **0 horas**. Una empresa con turno noche liquidaba en cero.
--
-- El problema de fondo es que había dos definiciones de jornada en la
-- misma base: `marcas_numeradas()` agrupa por SESIÓN (una sesión nueva
-- empieza en un ingreso que llega después de `corte_jornada()`), y el
-- RPC agrupaba por día. FIC-003 arregló el huso, pero el huso no era
-- el problema: el problema era el corte.
--
-- Regla nueva:
--
--   última marca es 'ingreso' y pasó menos de max_jornada()  → egreso
--   última marca es 'ingreso' y pasó max_jornada() o más     → ingreso
--       (se olvidó de fichar la salida; la sesión anterior queda
--        abierta, que es la verdad, y ésta abre una nueva)
--   última marca es 'egreso', o no hay ninguna               → ingreso
--
-- Por qué `max_jornada()` (16 h) y no `corte_jornada()` (6 h)
-- ----------------------------------------------------------
-- Es el error en el que cayó la primera versión de esta corrección, y
-- lo encontró el test del turno noche: entre el ingreso de las 22:00 y
-- el egreso de las 06:00 hay **ocho horas**, o sea más que el corte de
-- seis. Usando el corte, la salida del turno noche volvía a salir como
-- un ingreso — el mismo bug con otro disfraz.
--
-- Los dos umbrales contestan preguntas distintas y no son
-- intercambiables:
--
--   corte_jornada()  responde "¿este INGRESO abre una sesión nueva?".
--                    Presupone que ya se sabe que la marca es un
--                    ingreso, así que no sirve para decidir el tipo:
--                    sería circular.
--   max_jornada()    responde "¿hay una sesión abierta todavía?", que
--                    es exactamente la pregunta de acá.
--
-- Y es el mismo umbral con el que `jornadas_de_empresa` calcula
-- `en_curso`. Eso alinea las dos capas: si la jornada figura en curso,
-- la próxima marca la cierra; si ya no, abre una nueva. Una sola
-- definición, que es lo que se buscaba.
--
-- Zona gris conocida: alguien que entra 22:00, se olvida de fichar la
-- salida y vuelve a las 08:00 (10 h) va a registrar un egreso y cerrar
-- una jornada de diez horas, en vez de abrir la del día. No hay forma
-- de distinguir los dos casos con la información disponible, y quedó
-- del lado que coincide con `en_curso`. Se corrige a mano.
--
-- Notar que ya no se filtra por fecha: se mira la última marca sin más.
-- El índice `fichajes_empleado_ts_idx (empleado_id, ts desc)` lo
-- resuelve con un solo salto, así que además es más barato que antes.
--
-- La regla vive en su propia función y no suelta dentro del RPC por dos
-- razones: es LA definición de "cuándo empieza otra jornada" y no debe
-- haber una segunda copia, y con `p_ahora` inyectable se puede probar el
-- turno noche sin depender de la hora a la que corra el test.
-- ------------------------------------------------------------

create or replace function public.tipo_de_marca_siguiente(
  p_empleado_id uuid,
  p_ahora timestamptz default null
)
returns tipo_fichaje
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo tipo_fichaje;
  v_ts timestamptz;
  v_ahora timestamptz := coalesce(p_ahora, clock_timestamp());
begin
  select f.tipo, f.ts
    into v_tipo, v_ts
    from fichajes f
   where f.empleado_id = p_empleado_id
   order by f.ts desc, f.id desc
   limit 1;

  -- Sin marcas previas, o la última fue una salida: esto abre jornada.
  if v_tipo is distinct from 'ingreso' then
    return 'ingreso';
  end if;

  -- Hay un ingreso y la jornada sigue en curso → esta marca la cierra.
  -- Mismo umbral que usa `jornadas_de_empresa` para `en_curso`.
  if v_ahora - v_ts < max_jornada() then
    return 'egreso';
  end if;

  -- Ingreso viejo: se olvidó de fichar la salida. La jornada anterior
  -- queda abierta —que es la verdad, y lo que hay que corregir— y ésta
  -- empieza una nueva.
  return 'ingreso';
end;
$$;

comment on function public.tipo_de_marca_siguiente is
  'Ingreso o egreso que corresponde a la próxima marca de esa persona, '
  'según si hay una jornada en curso (max_jornada()) y no según el día '
  'calendario. Única definición: la comparte fichar_con_rostro.';

-- No se expone: contestaría "¿esta persona está adentro ahora?" para
-- cualquier empleado_id, incluso de otro tenant. Sólo la llama el RPC,
-- que es SECURITY DEFINER.
revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from public;
revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from anon;
revoke all on function public.tipo_de_marca_siguiente(uuid, timestamptz) from authenticated;

create or replace function public.fichar_con_rostro(
  p_descriptor jsonb,
  p_metodo text default 'facial_tablet',
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null
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

  -- FIC-002: en 1:1 el descriptor no autoriza a fichar por otro.
  if p_empleado_id is not null then
    if auth_empleado() is null
       or auth_empleado() is distinct from p_empleado_id then
      raise exception 'Solo podés fichar por vos.'
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

  -- ---- FIC-012. Geocerca: la del empleado, y sólo en 1:1 celular ----
  --
  -- Qué pasaba
  -- ----------
  -- Esto leía `empresas.config->'geocerca'`, una clave que **ninguna
  -- pantalla escribe**: `ConfigEmpresa` ni siquiera la declara. La zona
  -- que el producto sí guarda es `empleados.geocerca`, la que RRHH carga
  -- en la ficha de cada persona (migración 09). Resultado: `v_fuera`
  -- quedaba siempre en null, `fuera_de_zona` no se calculaba nunca y el
  -- cartel "Fuera de zona" de la pantalla no podía encenderse. El
  -- control de zona existía en la interfaz y no en el sistema.
  --
  -- Los tests no lo detectaban porque los fixtures (rpc.test.sql,
  -- concurrencia_fichaje.sh) escriben esa clave a mano: verificaban una
  -- configuración que en producción no existe.
  --
  -- Por qué sólo en 1:1 celular
  -- ---------------------------
  -- En el kiosco la geocerca no mide a la persona: mide a la tablet, que
  -- está fija en la planta. Si el GPS del dispositivo no engancha —lo
  -- normal bajo techo— **todos** los que fichen ahí quedarían marcados
  -- fuera de zona, y ese dato falso viaja hasta la planilla de
  -- liquidación. La garantía de presencia del kiosco es la terminal
  -- vinculada, no el GPS. El modo `remoto` está exento por definición.
  --
  -- El control es por `modo_fichaje` del empleado y no por lo que mande
  -- el cliente: mandar o no coordenadas no puede ser la forma de elegir
  -- si te controlan la zona.
  if p_empleado_id is not null
     and v_mejor.modo_fichaje = 'celular'
     and v_mejor.geocerca is not null
     and v_mejor.geocerca <> 'null'::jsonb
     and p_lat is not null and p_lng is not null then
    -- Radio por defecto igual al que propone la ficha del empleado, para
    -- que una zona a medio cargar no anule el control en silencio.
    v_radio := coalesce((v_mejor.geocerca->>'radioM')::double precision, 150);
    v_fuera := distancia_metros(
                 (v_mejor.geocerca->>'lat')::double precision,
                 (v_mejor.geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > v_radio;
  end if;

  -- FIC-004: serializar por empleado ANTES de leer la última marca.
  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  -- FIC-009: p_tipo sólo para gestores (corrección puntual).
  -- Self-service: alterna según la última marca de la SESIÓN (FIC-010).
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
  'Ficha validando rostro y geocerca en el servidor. 1:1 exige '
  'p_empleado_id = auth_empleado(); rechaza descriptor idéntico reusado; '
  'serializa por empleado; el tipo alterna por SESIÓN (corte_jornada()), '
  'no por día calendario, para que el turno noche cierre bien. La '
  'geocerca es empleados.geocerca y sólo aplica en 1:1 con '
  'modo_fichaje = celular.';

revoke all on function public.fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) from public;
grant execute on function public.fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) to authenticated;

-- ------------------------------------------------------------
-- FIC-011. El descriptor facial deja de salir de la base.
--
-- Qué pasaba
-- ----------
-- `puede_ver_datos_sensibles_empleado()` habilita al propio titular, así
-- que `empleados_lectura` le devolvía a cada empleado su
-- `descriptor_facial` completo. El descriptor es el secreto con el que
-- se autentica el fichaje facial: entregárselo al titular es lo mismo
-- que devolverle su contraseña en texto plano. Con esos 128 números,
-- cualquiera podía fichar desde su casa con un `fetch` —sin cámara y
-- sin prueba de vida— y esquivar el antirreplay cambiando un float en
-- el noveno decimal. Un `admin_rrhh` podía además bajarse los templates
-- de todo el personal.
--
-- Eso contradecía lo que la migración 49 dice de sí misma ("los rostros
-- enrolados nunca cruzan la red") y convertía la marca facial en algo
-- que no prueba presencia.
--
-- Qué se hace
-- -----------
-- La vista deja de exponer la columna y expone en su lugar
-- `tiene_rostro`, que es lo único que la aplicación necesitaba: las tres
-- pantallas que la leían sólo preguntaban `descriptorFacial?.length > 0`
-- para saber si la persona ya está enrolada.
--
-- El descriptor sigue siendo escribible (enrolar) y borrable (derecho
-- ARCO) sobre la tabla base, que ya no tiene SELECT para `authenticated`
-- desde la migración 66. La única lectura queda dentro de
-- `fichar_con_rostro`, que es SECURITY DEFINER y no devuelve el dato.
--
-- `consentimiento_biometrico` se mantiene: es la constancia de que la
-- persona autorizó, no el dato biométrico. Sin ella no se puede
-- acreditar nada ante un reclamo.
-- ------------------------------------------------------------

drop view if exists public.empleados_lectura;
create view public.empleados_lectura
with (security_barrier = true) as
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
  e.sin_usuario
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
  'tiene_rostro (FIC-011).';

grant select on public.empleados_lectura to authenticated;
revoke all on public.empleados_lectura from anon;

notify pgrst, 'reload schema';
