-- Fichaje facial validado en el servidor.
--
-- Qué pasaba antes
-- ----------------
-- Todo el reconocimiento corría en el navegador y el servidor guardaba lo
-- que le mandaran: `confianza`, `geo` y `fuera_de_zona` viajaban ya
-- resueltos desde el cliente y se insertaban tal cual. Eso significaba:
--
--   * Cualquiera con sesión de gestor podía fichar por otra persona con
--     un `curl` mandando `confianza: 1`, sin pasar por la cámara.
--   * `navigator.geolocation` se falsea desde las DevTools, así que
--     "dentro de zona" era una afirmación del cliente, no un hecho.
--   * Para el modo 1:N, la tablet se bajaba los descriptores faciales de
--     **toda** la empresa para comparar en el navegador.
--
-- Para un registro horario que puede terminar en una inspección o un
-- juicio laboral, eso no se sostiene: el dato lo escribía el cliente.
--
-- Qué hace esta migración
-- -----------------------
-- Mueve la decisión al servidor. El cliente manda el descriptor y las
-- coordenadas crudas; la base hace el match, calcula la geocerca y ella
-- misma inserta la fichada. `confianza` y `fuera_de_zona` dejan de ser
-- cosas que el cliente pueda afirmar.
--
-- Lo que esto NO resuelve: el descriptor lo sigue calculando el navegador
-- a partir de la cámara, así que un cliente modificado podría enviar un
-- descriptor inventado. Cortar eso requiere mandar la imagen y calcular
-- el embedding en el servidor — más caro y con más datos biométricos
-- viajando. Se evaluó y se dejó como paso siguiente.

-- ---------------------------------------------------------------------
-- 1. Distancia euclídea entre dos descriptores (128 floats en jsonb)
-- ---------------------------------------------------------------------
create or replace function distancia_descriptores(a jsonb, b jsonb)
returns double precision
language sql
immutable
as $$
  select sqrt(sum(power(x.valor - y.valor, 2)))
  from (
    select ordinalidad, valor::double precision
    from jsonb_array_elements_text(a) with ordinality as t(valor, ordinalidad)
  ) as x(ordinalidad, valor)
  join (
    select ordinalidad, valor::double precision
    from jsonb_array_elements_text(b) with ordinality as t(valor, ordinalidad)
  ) as y(ordinalidad, valor)
    on x.ordinalidad = y.ordinalidad;
$$;

comment on function distancia_descriptores is
  'Distancia euclídea entre dos descriptores faciales. Cuanto menor, más parecidos.';

-- ---------------------------------------------------------------------
-- 2. Distancia en metros entre dos coordenadas (Haversine)
-- ---------------------------------------------------------------------
create or replace function distancia_metros(
  lat_a double precision, lng_a double precision,
  lat_b double precision, lng_b double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat_b - lat_a) / 2), 2)
    + cos(radians(lat_a)) * cos(radians(lat_b))
      * power(sin(radians(lng_b - lng_a) / 2), 2)
  ));
$$;

comment on function distancia_metros is
  'Distancia en metros entre dos puntos (Haversine). Se usa para la geocerca.';

-- ---------------------------------------------------------------------
-- 3. Marca de "esta fichada la validó el servidor"
--
-- Es una variable de sesión que sólo pone la función de abajo, y que dura
-- lo que dura la transacción. El trigger de más abajo la exige para
-- aceptar una fichada facial, así que un insert directo por REST no puede
-- hacerse pasar por una.
-- ---------------------------------------------------------------------
create or replace function exigir_fichaje_facial_validado()
returns trigger
language plpgsql
as $$
begin
  -- El control es sobre **el dato**, no sobre el método.
  --
  -- La primera versión de esto miraba `metodo like 'facial%'`, y dejaba
  -- un agujero: cuando alguien ficha con la cara desde su propio celular
  -- el método es 'celular' o 'remoto', no 'facial_tablet'. Por ahí se
  -- podía seguir insertando `confianza: 1` a mano.
  --
  -- `confianza` y `fuera_de_zona` son conclusiones: "el rostro coincidió
  -- tanto", "estaba dentro de la zona". Nadie más que el servidor puede
  -- afirmarlas, venga con el método que venga.
  if (new.confianza is not null or new.fuera_de_zona is not null)
     and coalesce(current_setting('app.fichaje_validado', true), '') <> 'si'
  then
    raise exception
      'La confianza del rostro y la geocerca las calcula el servidor: usá fichar_con_rostro().'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists exigir_fichaje_facial_validado on fichajes;
create trigger exigir_fichaje_facial_validado
  before insert on fichajes
  for each row
  execute function exigir_fichaje_facial_validado();

-- ---------------------------------------------------------------------
-- 4. La función que ficha
--
-- `security definer` a propósito: necesita leer los descriptores de los
-- empleados de la empresa para comparar, y ése es justamente el dato que
-- no queremos que salga hacia la tablet. Entra el descriptor, sale la
-- fichada; los rostros enrolados nunca cruzan la red.
--
-- `p_empleado_id` distingue los dos modos:
--   * con id  → verificación 1:1 (la persona dice quién es y se confirma)
--   * sin id  → identificación 1:N (la tablet de planta)
-- ---------------------------------------------------------------------
create or replace function fichar_con_rostro(
  p_descriptor jsonb,
  p_metodo text default 'facial_tablet',
  p_empleado_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_tipo text default null
)
-- `setof` y no un `fichajes` a secas: PostgREST devuelve entonces un
-- arreglo, que es lo que `.single()` de supabase-js espera. Con un
-- compuesto suelto el contrato es distinto y el cliente falla al leerlo.
returns setof fichajes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := auth_empresa();
  -- Mismos umbrales que usaba el cliente (src/lib/facial/reconocimiento.ts).
  v_umbral double precision := case when p_empleado_id is null then 0.5 else 0.6 end;
  v_margen constant double precision := 0.05;
  v_mejor record;
  v_segunda double precision;
  v_geocerca jsonb;
  v_fuera boolean := null;
  -- `tipo` y `metodo` son enums en la tabla, no texto: declararlos como
  -- text hace que el insert falle con "column tipo is of type
  -- tipo_fichaje but expression is of type text".
  v_tipo tipo_fichaje;
  v_ultimo tipo_fichaje;
  v_fila fichajes;
begin
  if v_empresa is null then
    raise exception 'Sin empresa activa.' using errcode = 'insufficient_privilege';
  end if;

  if p_descriptor is null or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'Falta el descriptor facial.' using errcode = 'invalid_parameter_value';
  end if;

  -- ---- Match contra los rostros enrolados de la empresa ----
  select e.id,
         distancia_descriptores(e.descriptor_facial, p_descriptor) as dist
    into v_mejor
    from empleados e
   where e.empresa_id = v_empresa
     and e.activo
     and e.descriptor_facial is not null
     -- En 1:1 sólo se compara contra la persona que dice ser.
     and (p_empleado_id is null or e.id = p_empleado_id)
   order by dist asc
   limit 1;

  -- `not found` y no `v_mejor is null`: en un record, `is null` sólo da
  -- verdadero si *todos* los campos son nulos, que acá se cumple por
  -- casualidad. `not found` dice exactamente lo que se quiere preguntar.
  if not found then
    raise exception 'No hay rostros registrados para comparar.'
      using errcode = 'no_data_found';
  end if;

  if v_mejor.dist > v_umbral then
    raise exception 'No reconocimos el rostro.' using errcode = 'no_data_found';
  end if;

  -- En 1:N, si el segundo candidato está muy cerca preferimos no fichar a
  -- fichar a la persona equivocada (hermanos, mala luz).
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

  -- ---- Geocerca, calculada acá y no aceptada del cliente ----
  select config->'geocerca' into v_geocerca
    from empresas where id = v_empresa;

  if v_geocerca is not null and v_geocerca <> 'null'::jsonb
     and p_lat is not null and p_lng is not null then
    v_fuera := distancia_metros(
                 (v_geocerca->>'lat')::double precision,
                 (v_geocerca->>'lng')::double precision,
                 p_lat, p_lng
               ) > (v_geocerca->>'radioM')::double precision;
  end if;

  -- ---- Ingreso o egreso, según la última marca del día ----
  if p_tipo is not null then
    v_tipo := p_tipo::tipo_fichaje;
  else
    select f.tipo into v_ultimo
      from fichajes f
     where f.empleado_id = v_mejor.id
       and f.ts >= date_trunc('day', now())
     order by f.ts desc
     limit 1;
    v_tipo := case when v_ultimo = 'ingreso' then 'egreso' else 'ingreso' end
              ::tipo_fichaje;
  end if;

  -- Habilita el insert para el trigger de más arriba, sólo en esta
  -- transacción y sólo después de haber validado todo.
  perform set_config('app.fichaje_validado', 'si', true);

  insert into fichajes (
    empresa_id, empleado_id, tipo, metodo, confianza, geo, fuera_de_zona
  ) values (
    v_empresa,
    v_mejor.id,
    v_tipo,
    p_metodo::metodo_fichaje,
    -- Confianza derivada de la distancia real, no de lo que diga el cliente.
    greatest(0, least(1, 1 - (v_mejor.dist / v_umbral))),
    case when p_lat is not null and p_lng is not null
         then jsonb_build_object('lat', p_lat, 'lng', p_lng)
         else null end,
    v_fuera
  )
  returning * into v_fila;

  return next v_fila;
  return;
end;
$$;

comment on function fichar_con_rostro is
  'Ficha validando el rostro y la geocerca en el servidor. El cliente manda '
  'el descriptor y las coordenadas crudas; confianza y fuera_de_zona las '
  'calcula esta función. Los descriptores enrolados nunca salen de la base.';

revoke all on function fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) from public;
grant execute on function fichar_con_rostro(jsonb, text, uuid, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------
-- Nota de escala
-- ---------------------------------------------------------------------
-- El match recorre los empleados activos con rostro de la empresa y hace
-- 128 restas por cada uno. Con cientos de personas por empresa es
-- cómodo. Si alguna llega a varios miles y se nota, el paso siguiente es
-- pgvector: `descriptor_facial vector(128)` con un índice ivfflat, que
-- convierte el recorrido en una búsqueda por índice. No se hace ahora
-- para no arrastrar una extensión y una migración de datos por un
-- problema que todavía no existe.
