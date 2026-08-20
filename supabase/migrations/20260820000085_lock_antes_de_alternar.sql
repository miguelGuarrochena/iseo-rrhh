-- El lock de la persona tiene que tomarse ANTES de mirar la última
-- marca y de decidir ingreso/egreso. Si dos reconocimientos de la
-- misma cara llegan a la vez, el primero inserta; el segundo, con el
-- lock, ve esa marca de hace milisegundos y la pausa la devuelve.
-- Antes el lock iba después: los dos pasaban la pausa vacía y el
-- segundo salía como egreso.
--
-- La pausa de 3 minutos sigue siendo sólo anti-rebote del kiosco
-- (1:N): no decide el tipo. El tipo lo sigue poniendo
-- `tipo_de_marca_siguiente`. El 1:1 no tiene esta pausa: dos RPC del
-- celular se serializan con el lock y alternan (FIC-004).
--
-- No cambia la firma.

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
  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  if p_empleado_id is not null then
    -- ---- 1:1 (celular / empleado). No necesita terminal. ----
    if v_empresa is null then
      raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
    end if;

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

    if p_terminal_id is null or p_terminal_secreto is null then
      raise exception
        'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
        using errcode = 'insufficient_privilege';
    end if;

    if v_empresa is null then
      -- F-06: el superadmin no tiene `usuarios.empresa_id`. El tenant
      -- lo dice la terminal, y sólo si el secreto coincide en la misma
      -- consulta. Distinguir "esa tablet no existe" de "el secreto no
      -- calza" convertiría a este RPC en un oráculo; por eso el
      -- mensaje es el mismo.
      if not es_superadmin() then
        raise exception 'Sin empresa activa.'
          using errcode = 'insufficient_privilege';
      end if;

      select t.empresa_id
        into v_empresa
        from terminales t
       where t.id = p_terminal_id
         and t.activa
         and t.secreto_hash is not null
         and t.secreto_hash = hash_secreto_terminal(p_terminal_id, p_terminal_secreto);

      if v_empresa is null then
        raise exception
          'Esta tablet no está autorizada para fichar. Pedile a RRHH que la vuelva a autorizar.'
          using errcode = 'insufficient_privilege';
      end if;
    elsif not terminal_habilitada(p_terminal_id, p_terminal_secreto, v_empresa) then
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

  -- Misma persona, dos requests a la vez: el segundo espera y ve la
  -- marca que acaba de entrar. Sin esto, el tipo se decide dos veces
  -- sobre "no hay marca" y sale un ingreso y un egreso. El lock va
  -- ANTES de la pausa y de tipo_de_marca_siguiente.
  perform pg_advisory_xact_lock(hashtextextended(v_mejor.id::text, 0));

  -- Anti-rebote del kiosco (1:N). No decide si es entrada o salida: si
  -- ya hay una marca de hace menos de 3 minutos, es el mismo evento.
  -- El 1:1 no tiene esta pausa: dos RPC del celular se serializan con
  -- el lock y alternan (FIC-004).
  if p_empleado_id is null then
    select f.*
      into v_fila
      from fichajes f
     where f.empleado_id = v_mejor.id
       and f.anulado_en is null
       and f.ts > clock_timestamp() - interval '3 minutes'
     order by f.ts desc, f.id desc
     limit 1;

    if found then
      return next v_fila;
      return;
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
  '(F-01); si el actor es superadmin y no tiene empresa propia, el '
  'tenant es el de la terminal (F-06). 1:1 exige ser el titular. El '
  'lock de la persona va antes de la pausa y de tipo_de_marca_siguiente. '
  'La pausa de 3 minutos es anti-rebote del 1:N: no decide ingreso ni egreso.';

notify pgrst, 'reload schema';
