-- ============================================================
-- Migration 111: `config.modulos` es de ISEO, no del cliente.
--
-- Qué pasaba
-- ----------
-- La migración 101 puso el corte por columna sobre `empresas` —`estado`,
-- `abono_mensual`, `plan`, `servicios`, `regimen`, `id`, `creada_en`— y
-- dejó `config` afuera, porque `config` es lo que el admin_rrhh
-- administra desde Configuración: horarios, tolerancia, cargas
-- patronales, escala de vacaciones, resumen semanal.
--
-- Pero adentro de ese mismo JSONB vive `modulos`, que NO es del cliente:
-- define qué secciones ve la empresa y es el alcance de lo contratado.
-- La pantalla de Configuración lo muestra de sólo lectura (chips) y los
-- interruptores reales están en Empresas → Módulos, que sólo abre el
-- superadmin. Esconder el control no alcanza: la policy
-- `empresas_update_admin` es de FILA, así que con la clave publishable
-- —que viaja en el bundle del cliente— un admin_rrhh podía hacer
--
--   PATCH /rest/v1/empresas?id=eq.<la suya>
--   {"config": {..., "modulos": {"reportes": true}}}
--
-- y prenderse una sección que ISEO le había apagado.
--
-- Qué se hace
-- -----------
-- Se reemplaza `trg_empresas_columnas_de_iseo` agregando una comparación
-- más: la clave `modulos` de `config`. El resto de `config` queda como
-- estaba y el admin_rrhh lo sigue guardando sin restricciones.
--
-- El `coalesce(... , '{}'::jsonb)` no es cosmético: para los módulos, la
-- clave ausente y el objeto vacío significan lo mismo (todo encendido).
-- Sin él, guardar Configuración en una empresa cuyo `config` no tiene
-- `modulos` fallaría según cómo el cliente serialice el objeto, que es
-- exactamente el tipo de rechazo que nadie sabe explicar.
--
-- La comparación de jsonb es semántica, no textual: el orden de las
-- claves no cuenta, así que un round-trip del mismo objeto pasa.
--
-- Qué NO cambia
-- -------------
--   * `actualizarConfigEmpresa` (Configuración del cliente) devuelve
--     `modulos` tal como lo leyó, así que sigue funcionando igual.
--   * `actualizarModulosEmpresa` (Empresas → Módulos) la ejecuta el
--     superadmin, que sale por el `return new` de arriba.
--   * Sin JWT (service role, migraciones, semillas) no se frena: mismo
--     criterio que el resto de los triggers de la base.
--
-- Idempotente. No toca datos: sólo redefine la función del trigger.
-- ============================================================

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
  /*
   * Las secciones habilitadas. Van adentro de `config`, que por lo demás
   * es del cliente, así que el corte es por clave y no por columna.
   * Ausente y `{}` son el mismo estado (todo encendido): se normalizan
   * para no rechazar un guardado que en realidad no cambia nada.
   */
  if coalesce(new.config -> 'modulos', '{}'::jsonb)
     is distinct from coalesce(old.config -> 'modulos', '{}'::jsonb) then
    v_cambiadas := v_cambiadas || 'las secciones activas'::text;
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
  'servicios, regimen, id y creada_en son de ISEO, y también la clave '
  'config.modulos (las secciones activas). El resto de config (horarios, '
  'tolerancia, cargas, vacaciones, resumen semanal) y los datos del '
  'cliente los sigue administrando el admin_rrhh desde Configuración.';

-- El trigger ya existe desde la migración 101 y apunta a esta misma
-- función; se recrea igual por si esa migración no llegó a correr.
drop trigger if exists columnas_de_iseo on empresas;
create trigger columnas_de_iseo
  before insert or update on empresas
  for each row execute function trg_empresas_columnas_de_iseo();

notify pgrst, 'reload schema';
