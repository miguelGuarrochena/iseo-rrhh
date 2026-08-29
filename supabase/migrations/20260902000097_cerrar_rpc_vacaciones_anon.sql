-- ============================================================
-- P0: los RPC de vacaciones eran consultables SIN SESIÓN.
--
-- Qué pasaba
-- ----------
-- `vacaciones_legales_corridas`, `dias_vacaciones_corresponden` y
-- `dias_no_computables_art152` son `security definer` —tienen que serlo,
-- porque leen `empleados` y `ausencias` salteando RLS— y nunca se les
-- revocó el EXECUTE que Postgres le da a PUBLIC al crear una función. Las
-- migraciones 91 y 92 agregaron `grant … to authenticated`, que suma un
-- permiso pero no saca el de PUBLIC.
--
-- Con PUBLIC adentro, el rol `anon` las tiene. Y `anon` es la clave que
-- viaja en el bundle del cliente, así que cualquiera con esa clave y un
-- UUID de legajo podía preguntar por PostgREST:
--
--   POST /rest/v1/rpc/vacaciones_legales_corridas
--        {"p_empleado_id": "<legajo de otra empresa>", "p_anio": 2026}
--   → 35
--
-- Ese 35 dice que la persona tiene más de veinte años de antigüedad. Y
-- como un UUID inexistente devuelve 0 y uno real devuelve un número, la
-- función además sirve de oráculo para confirmar qué legajos existen.
--
-- La protección estaba un nivel más arriba: `saldo_vacaciones_disponible`
-- sí tiene el gate de tenencia de la migración 61. Pero las funciones que
-- llama por dentro quedaron expuestas por separado, y PostgREST publica
-- cada una como su propio endpoint.
--
-- Qué se hace
-- -----------
--   1. Se saca el EXECUTE de PUBLIC y de `anon` en las tres.
--   2. Se les agrega el mismo gate de tenencia que ya usa
--      `saldo_vacaciones_disponible`, para que un autenticado tampoco
--      pueda preguntar por un legajo de otra empresa. Defensa en
--      profundidad: revocar y además guardar.
--   3. `dias_no_computables_art152` queda sin EXECUTE para
--      `authenticated`: no la llama nadie desde el cliente y sólo la usa
--      `vacaciones_legales_corridas`, que corre como definer y por lo
--      tanto no necesita el permiso del que llama.
--
-- Qué NO cambia
-- -------------
-- Ningún resultado. Para los llamadores legítimos —el empleado sobre su
-- propio legajo, el gestor sobre su empresa, superadmin, y los triggers
-- que corren sin JWT— el gate pasa igual que en `saldo_vacaciones_dispo-
-- nible`. La modalidad de días hábiles tampoco se toca.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El derecho legal del año, con gate de tenencia.
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
  -- Tenencia, igual que `saldo_vacaciones_disponible` (migración 61).
  -- Sólo aplica si hay sesión: sin `auth.uid()` esto corre desde una
  -- migración, un fixture o un job, y ahí no hay empresa contra la cual
  -- comparar.
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
      raise exception 'No autorizado a consultar ese legajo';
    end if;
  end if;

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
      - dias_no_computables_art152(p_empleado_id, v_desde, v_hasta)
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
  'corridos (LCT arts. 150 a 153). Lee ingreso y baja del legajo. '
  'Tenant: auth_empresa() (autenticados); superadmin libre; sin JWT sin '
  'gate. Espejo de calcularVacacionesLegalesCorridas().';

-- ------------------------------------------------------------
-- 2. El despachador, con el mismo gate.
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
  -- Mismo gate. Acá importa el doble, porque `p_config` viene del que
  -- llama: sin esto, un extraño elegía el legajo Y la escala.
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
      raise exception 'No autorizado a consultar ese legajo';
    end if;
  end if;

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
  -- antes: es la regla de esta modalidad y cerrar un permiso no puede
  -- moverla.
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
  'legajo. Tenant: auth_empresa() (autenticados); superadmin libre; sin '
  'JWT sin gate. La modalidad de días hábiles conserva su regla.';

-- ------------------------------------------------------------
-- 3. Permisos: nada de PUBLIC ni de anon.
--
-- `revoke … from public` es lo que faltaba en 91 y 92: el grant a
-- `authenticated` sumaba, no reemplazaba.
-- ------------------------------------------------------------
revoke all on function public.vacaciones_legales_corridas(uuid, int) from public;
revoke all on function public.vacaciones_legales_corridas(uuid, int) from anon;
grant execute on function public.vacaciones_legales_corridas(uuid, int) to authenticated;

revoke all on function public.dias_vacaciones_corresponden(uuid, int, jsonb) from public;
revoke all on function public.dias_vacaciones_corresponden(uuid, int, jsonb) from anon;
grant execute on function public.dias_vacaciones_corresponden(uuid, int, jsonb) to authenticated;

-- Ésta no la llama nadie desde afuera: queda interna. La usa
-- `vacaciones_legales_corridas`, que corre como definer.
revoke all on function public.dias_no_computables_art152(uuid, date, date) from public;
revoke all on function public.dias_no_computables_art152(uuid, date, date) from anon;
revoke all on function public.dias_no_computables_art152(uuid, date, date) from authenticated;

-- Las auxiliares de fechas no leen ninguna tabla —son aritmética de
-- calendario— así que pueden quedar donde están. Se revoca igual el
-- PUBLIC de las que nombran un legajo o una empresa, para que la
-- superficie de PostgREST sea la que alguien decidió y no la que quedó.
revoke all on function public.tipos_ausencia_no_computables_art152() from public;
revoke all on function public.tipos_ausencia_no_computables_art152() from anon;
grant execute on function public.tipos_ausencia_no_computables_art152() to authenticated;

notify pgrst, 'reload schema';
