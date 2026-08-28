-- ============================================================
-- D-01: SQL y TypeScript tienen que recibir los mismos inputs.
--
-- Qué pasaba
-- ----------
-- `vacaciones_legales_corridas` aceptaba `p_fecha_baja` con `default null`
-- y el despachador la llamaba sin pasarla:
--
--   return vacaciones_legales_corridas(p_empleado_id, p_fecha_ingreso, p_anio);
--                                                                     ↑ falta
--
-- El cliente sí la pasa (`getSaldoVacaciones` → `fechaBaja: empleado.fechaBaja`).
-- Resultado: para un legajo dado de baja, la pantalla mostraba un cupo y la
-- base calculaba otro. En producción la diferencia iba de 14 a 0 y de 7 a 0
-- sobre nueve legajos.
--
-- La causa estructural, que es lo que se corrige acá
-- --------------------------------------------------
-- No es que alguien se olvidó de un parámetro: es que la firma PERMITÍA
-- olvidarse. Las funciones recibían `p_empleado_id` **y además** campos
-- sueltos del mismo legajo (`p_fecha_ingreso`, `p_fecha_baja`), uno de
-- ellos opcional. Con el id ya adentro, cualquier caller podía mandar un
-- subconjunto de los datos de esa persona y nadie se enteraba.
--
-- Arreglar sólo la llamada dejaría la trampa armada para el próximo
-- caller. Así que se saca la posibilidad: las funciones leen el legajo
-- ellas mismas. `dias_no_computables_art152` ya lo hacía con las
-- ausencias; ahora ingreso y baja salen de la misma fila.
--
-- Qué NO cambia
-- -------------
-- La modalidad de días hábiles: sigue ignorando la baja, con la misma
-- fórmula y el mismo umbral. La única diferencia es de dónde sale la
-- fecha de ingreso, y sale de la misma fila que antes leía el caller.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- El derecho legal del año. Ahora sólo pide a quién y de qué año.
-- ------------------------------------------------------------
create or replace function public.vacaciones_legales_corridas(
  p_empleado_id uuid,
  p_anio int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_anio, 1, 1);
  v_cierre date := make_date(p_anio, 12, 31);
  v_ingreso date;
  v_baja date;
  v_desde date;
  v_hasta date;
  v_del_anio int;
  v_trabajados int;
begin
  -- Los dos extremos del período salen de la MISMA fila, en la misma
  -- consulta. Es lo que hace imposible que uno llegue y el otro no.
  select e.fecha_ingreso, e.fecha_baja
    into v_ingreso, v_baja
    from empleados e
   where e.id = p_empleado_id;

  if v_ingreso is null or v_ingreso > v_cierre then
    return 0;
  end if;

  v_desde := greatest(v_ingreso, v_inicio);
  v_hasta := least(coalesce(v_baja, v_cierre), v_cierre);
  if v_hasta < v_desde then
    return 0;
  end if;

  v_del_anio := dias_habiles_art151(v_inicio, v_cierre);
  v_trabajados := greatest(
    0,
    dias_habiles_art151(v_desde, v_hasta)
      - dias_no_computables_art152(p_empleado_id, p_anio, v_desde, v_hasta)
  );

  -- Art. 151: "la mitad, como mínimo". Se duplica en vez de dividir para
  -- no arrastrar un decimal justo en el borde, que es donde se decide
  -- entre el período completo y el proporcional.
  if v_del_anio > 0 and v_trabajados * 2 >= v_del_anio then
    return tramo_legal_art150(v_ingreso, v_cierre);
  end if;

  -- Art. 153: un día cada veinte de trabajo efectivo, contado "según la
  -- forma prevista en el artículo 151".
  return floor(v_trabajados / 20.0)::int;
end;
$$;

comment on function public.vacaciones_legales_corridas(uuid, int) is
  'Días de vacaciones que corresponden por LEY en un año, en días '
  'corridos (LCT arts. 150 a 153). Lee ingreso y baja del legajo: no '
  'recibe campos sueltos del empleado para que ningún caller pueda '
  'mandar un subconjunto. Espejo de calcularVacacionesLegalesCorridas().';

grant execute on function public.vacaciones_legales_corridas(uuid, int)
  to authenticated;

-- ------------------------------------------------------------
-- El despachador, con el mismo criterio.
-- ------------------------------------------------------------
create or replace function public.dias_vacaciones_corresponden(
  p_empleado_id uuid,
  p_anio int,
  p_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cierre date := make_date(p_anio, 12, 31);
  v_ingreso date;
  v_dias numeric;
  v_anios numeric;
  v_habiles boolean := coalesce((p_config ->> 'vacacionesDiasHabiles')::boolean, false);
  v_escala jsonb := coalesce(p_config -> 'vacacionesEscala', '{}'::jsonb);
begin
  select e.fecha_ingreso into v_ingreso
    from empleados e where e.id = p_empleado_id;

  if v_ingreso is null or v_ingreso > v_cierre then
    return 0;
  end if;

  -- ---- Régimen legal (días corridos) ----
  if not v_habiles then
    return vacaciones_legales_corridas(p_empleado_id, p_anio);
  end if;

  -- ---- Modalidad propia de días hábiles: sin cambios ----
  --
  -- Misma fórmula, mismo umbral, misma escala. No mira la baja, igual que
  -- antes: es la regla de esta modalidad y corregir el régimen legal no
  -- puede moverla.
  v_dias := (v_cierre - v_ingreso);
  v_anios := v_dias / 365.25;

  if v_anios < 0.5 then
    return floor(v_dias / 20)::int;
  end if;
  if v_anios < 5 then
    return coalesce((v_escala ->> 'hasta5')::int, 10);
  end if;
  if v_anios < 10 then
    return coalesce((v_escala ->> 'hasta10')::int, 15);
  end if;
  if v_anios < 20 then
    return coalesce((v_escala ->> 'hasta20')::int, 20);
  end if;
  return coalesce((v_escala ->> 'masDe20')::int, 25);
end;
$$;

comment on function public.dias_vacaciones_corresponden(uuid, int, jsonb) is
  'Días de vacaciones del año según el régimen de la empresa. Lee el '
  'legajo: no recibe campos sueltos del empleado. La modalidad de días '
  'hábiles conserva su regla sin cambios.';

grant execute on function public.dias_vacaciones_corresponden(uuid, int, jsonb)
  to authenticated;

-- ------------------------------------------------------------
-- El caller, a la firma nueva.
-- ------------------------------------------------------------
create or replace function public.saldo_vacaciones_disponible(
  p_empleado_id uuid,
  p_anio int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ingreso date;
  v_empresa uuid;
  v_config jsonb;
  v_habiles boolean;
  v_corresponden int;
  v_ajuste int;
  v_usados int;
  v_pendientes int;
begin
  -- Tenencia. Sólo aplica si hay sesión: sin `auth.uid()` esto corre
  -- desde una migración, un fixture o un job, y ahí no hay empresa contra
  -- la cual comparar.
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

  select e.fecha_ingreso, e.empresa_id, emp.config
    into v_ingreso, v_empresa, v_config
  from empleados e
  join empresas emp on emp.id = e.empresa_id
  where e.id = p_empleado_id;

  if v_ingreso is null then
    return 0;
  end if;

  v_habiles := coalesce((v_config ->> 'vacacionesDiasHabiles')::boolean, false);
  -- Sin campos sueltos del legajo: la función los lee sola.
  v_corresponden := dias_vacaciones_corresponden(p_empleado_id, p_anio, v_config);

  select coalesce(dias, 0) into v_ajuste
    from vacaciones_pendientes
   where empleado_id = p_empleado_id and anio = p_anio;
  v_ajuste := coalesce(v_ajuste, 0);

  select
    coalesce(sum(
      dias_vacaciones_en_anio(a.fecha_desde, a.fecha_hasta, p_anio, v_empresa, v_habiles)
    ) filter (where a.estado = 'aprobada'), 0),
    coalesce(sum(
      dias_vacaciones_en_anio(a.fecha_desde, a.fecha_hasta, p_anio, v_empresa, v_habiles)
    ) filter (where a.estado = 'pendiente'), 0)
  into v_usados, v_pendientes
  from ausencias a
  where a.empleado_id = p_empleado_id
    and a.tipo = 'vacaciones'
    and a.fecha_desde <= make_date(p_anio, 12, 31)
    and a.fecha_hasta >= make_date(p_anio, 1, 1);

  return v_corresponden + v_ajuste - v_usados - v_pendientes;
end;
$$;

comment on function public.saldo_vacaciones_disponible(uuid, int) is
  'Saldo de vacaciones del año. El derecho sale del régimen de la empresa '
  '(legal en días corridos o modalidad de días hábiles).';

revoke all on function public.saldo_vacaciones_disponible(uuid, int) from public;
revoke all on function public.saldo_vacaciones_disponible(uuid, int) from anon;
grant execute on function public.saldo_vacaciones_disponible(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- Las firmas viejas se van.
--
-- Dejarlas vivas sería dejar viva la trampa: son las que aceptan campos
-- sueltos del legajo y permiten mandar un subconjunto. Y con PostgREST,
-- que resuelve por las claves del JSON, una sobrecarga olvidada es un
-- camino alternativo abierto — la misma lección de las migraciones 74,
-- 76 y 77 con `fichar_con_rostro`.
-- ------------------------------------------------------------
drop function if exists public.vacaciones_legales_corridas(uuid, date, int, date);
drop function if exists public.dias_vacaciones_corresponden(uuid, date, int, jsonb);

notify pgrst, 'reload schema';
