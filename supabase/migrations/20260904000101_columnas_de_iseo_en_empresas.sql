-- ============================================================
-- P0: el admin de una empresa podía editar las columnas comerciales
-- de su propia empresa, incluida `estado`.
--
-- Qué pasaba
-- ----------
-- La policy `empresas_update_admin` (esquema inicial) dice:
--
--   for update using (auth_rol() = 'admin_rrhh' and id = auth_empresa())
--   with check (id = auth_empresa())
--
-- Es una policy de FILA: autoriza a actualizar esa fila, sin decir nada
-- sobre qué columnas. Cuando se escribió, `empresas` tenía sólo datos
-- del cliente. Después se le fueron sumando columnas que son de ISEO
-- —`abono_mensual` (mig. 11), `plan` (mig. 13), `regimen` (mig. 44),
-- `servicios` (mig. 100)— y ninguna quedó protegida.
--
-- Con un PATCH a PostgREST y la clave publishable (que viaja en el
-- bundle del cliente), un admin_rrhh podía:
--
--   PATCH /rest/v1/empresas?id=eq.<la suya>  {"estado":"activa"}
--
-- y **reactivar su propia empresa suspendida**. `estado` no es un dato
-- decorativo: `empresaHabilitada()` corta el login contra él, así que es
-- exactamente la palanca con la que ISEO suspende por falta de pago.
-- Con el mismo mecanismo podía bajarse el `abono_mensual` (que es lo que
-- lee el cron de facturación), cambiarse el `plan`, o pasarse a régimen
-- `simplificado` —que apaga la retención de aportes de ley en el neto
-- que muestra Remuneraciones.
--
-- Verificado en la base, no deducido: los cinco updates entraban.
--
-- Qué se hace
-- -----------
-- No se toca la policy: sigue siendo verdad que el admin administra la
-- fila de su empresa. Lo que falta es el corte por COLUMNA, y eso en
-- Postgres no lo puede expresar una policy (el `with check` sólo ve la
-- fila nueva, no la vieja). Va por trigger, que es el mismo mecanismo
-- que ya usa la base para invariantes de este tipo (mig. 63) y el que
-- introdujo la mig. 100 para `servicios`.
--
-- Este trigger REEMPLAZA al de la migración 100: hacía exactamente esto
-- para una sola columna. Dejar los dos sería revisar `servicios` dos
-- veces y tener el criterio escrito en dos lugares.
--
-- Qué NO cambia
-- -------------
-- Configuración (`/app/configuracion`) es el único lugar donde un
-- admin_rrhh escribe su empresa, y guarda: nombre, CUIT, razón social,
-- domicilio, contacto (nombre, email, teléfono), logo y `config`
-- —horarios, tolerancia, cargas patronales, vacaciones, resumen semanal
-- y los módulos que la empresa decide apagar—. Todo eso sigue igual.
--
-- Sin JWT (service role, migraciones, semillas, scripts) no se frena:
-- mismo criterio que el resto de los triggers de la base. El freno es
-- contra el uso de la app, no contra el mantenimiento.
--
-- Idempotente.
-- ============================================================

/**
 * Las columnas de `empresas` que son de ISEO y no del cliente.
 *
 * `id` y `creada_en` están por identidad e historia: no hay ningún flujo
 * que las escriba, y que cambien sería peor que cualquiera de las otras.
 */
create or replace function public.trg_empresas_columnas_de_iseo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  /*
   * El `::text` de cada append no es decorativo: `text[] || 'literal'`
   * con el literal sin tipo resuelve el operador como array||array e
   * intenta parsear 'estado' como un array, que revienta con "malformed
   * array literal". Con el cast, el operador que elige es
   * anyarray||anyelement, que es el que corresponde.
   */
  v_cambiadas text[] := '{}';
begin
  -- Sin sesión: mantenimiento. Pasa.
  if auth.uid() is null then
    return new;
  end if;

  if es_superadmin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- La policy `empresas_superadmin` ya lo impide; esto lo dice con un
    -- mensaje que se entiende en vez de un error de RLS.
    raise exception 'Sólo ISEO puede dar de alta una empresa';
  end if;

  -- Comerciales: definen qué contrató y si sigue habilitada.
  if new.estado is distinct from old.estado then
    v_cambiadas := v_cambiadas || 'estado'::text;
  end if;
  if new.abono_mensual is distinct from old.abono_mensual then
    v_cambiadas := v_cambiadas || 'abono_mensual'::text;
  end if;
  if new.plan is distinct from old.plan then
    v_cambiadas := v_cambiadas || 'plan'::text;
  end if;
  if new.servicios is distinct from old.servicios then
    v_cambiadas := v_cambiadas || 'servicios'::text;
  end if;
  -- El régimen decide si se retienen aportes de ley: cambia el neto que
  -- la app muestra y lo que se le informa al contador.
  if new.regimen is distinct from old.regimen then
    v_cambiadas := v_cambiadas || 'regimen'::text;
  end if;
  -- Identidad e historia.
  if new.id is distinct from old.id then
    v_cambiadas := v_cambiadas || 'id'::text;
  end if;
  if new.creada_en is distinct from old.creada_en then
    v_cambiadas := v_cambiadas || 'creada_en'::text;
  end if;

  if array_length(v_cambiadas, 1) > 0 then
    raise exception
      'Sólo ISEO puede cambiar % de una empresa',
      array_to_string(v_cambiadas, ', ');
  end if;

  return new;
end;
$$;

comment on function public.trg_empresas_columnas_de_iseo() is
  'Corte por columna sobre empresas: estado, abono_mensual, plan, '
  'servicios, regimen, id y creada_en son de ISEO. El resto (nombre, '
  'CUIT, razón social, domicilio, contacto, logo y config) lo sigue '
  'administrando el admin_rrhh desde Configuración.';

-- Reemplaza al de la migración 100, que hacía lo mismo sólo para
-- `servicios`. Se dropea el trigger y su función para no dejar dos
-- criterios conviviendo.
drop trigger if exists solo_superadmin_cambia_servicios on empresas;
drop function if exists public.trg_servicios_solo_superadmin();

drop trigger if exists columnas_de_iseo on empresas;
create trigger columnas_de_iseo
  before insert or update on empresas
  for each row execute function trg_empresas_columnas_de_iseo();

notify pgrst, 'reload schema';
