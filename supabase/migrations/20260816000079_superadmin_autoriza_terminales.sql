-- El superadmin puede autorizar terminales.
--
-- El problema
-- -----------
-- `autorizar_terminal` (migración 75) exige dos cosas que un superadmin
-- nunca cumple:
--
--   if v_empresa is null or auth_rol() is distinct from 'admin_rrhh'
--
--   * `auth_empresa()` lee `usuarios.empresa_id`, que en un superadmin
--     es NULL: no está atado a ninguna empresa, ése es el punto de ser
--     superadmin.
--   * `auth_rol()` devuelve 'superadmin', que no es 'admin_rrhh'.
--
-- El resultado es un desajuste entre lo que muestra la pantalla y lo que
-- acepta el servidor: en el cliente, `rolEfectivoDe` mapea
-- superadmin + empresa vista → admin_rrhh, así que el botón aparece; el
-- servidor no sabe nada de esa "empresa vista" —es estado del
-- navegador— y rechaza con "Sólo RRHH puede autorizar una tablet".
--
-- Por qué hace falta pasar la empresa
-- -----------------------------------
-- No alcanza con agregar `or es_superadmin()`. Si el superadmin pasara
-- el permiso, la función seguiría sin saber **para qué empresa** crear
-- la terminal, y la insertaría con `empresa_id = null`. Esa terminal no
-- serviría para nada: `terminal_habilitada` la busca por empresa.
--
-- Así que la empresa viaja como parámetro, y **sólo el superadmin puede
-- usarlo**. Para admin_rrhh se ignora por completo: su empresa sigue
-- saliendo de `auth_empresa()`, no de algo que el cliente pueda afirmar.
--
-- Vale aclarar que el resto del circuito de terminales —listar,
-- activar, desactivar, borrar— **ya funcionaba** para el superadmin: las
-- políticas RLS de `terminales` (migración 08) tienen su escape
-- `es_superadmin()`. La única puerta cerrada era el alta, porque el alta
-- no pasa por RLS sino por este RPC.
--
-- Por qué NO se tocó `auth_empresa()`
-- -----------------------------------
-- La alternativa "de fondo" sería que `auth_empresa()` devuelva la
-- empresa operativa del superadmin, y entonces las ~15 funciones que
-- hoy lo excluyen empezarían a funcionar solas. Es la solución correcta
-- a largo plazo, pero `auth_empresa()` aparece en **232 lugares**, casi
-- todos políticas RLS: es el cimiento del aislamiento entre empresas.
-- Cambiarlo es un trabajo con su propia batería de pruebas, no algo para
-- meter junto a un arreglo puntual. Queda anotado como pendiente.
--
-- No toca F-01 (la terminal sigue necesitando su secreto para fichar),
-- ni RLS, ni el actor, ni la auditoría, ni F-02.

drop function if exists public.autorizar_terminal(text);

create or replace function public.autorizar_terminal(
  p_nombre text,
  -- Sólo lo usa el superadmin. Para admin_rrhh se ignora.
  p_empresa_id uuid default null
)
returns table (id uuid, nombre text, secreto text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresa uuid;
  v_id uuid := gen_random_uuid();
  v_secreto text := encode(gen_random_bytes(32), 'hex');
begin
  if es_superadmin() then
    -- El superadmin dice sobre qué empresa opera, porque el servidor no
    -- tiene forma de saberlo: la "empresa vista" vive en el navegador.
    v_empresa := coalesce(p_empresa_id, auth_empresa());
    if v_empresa is null then
      raise exception 'Elegí la empresa para la que autorizás la tablet.'
        using errcode = 'invalid_parameter_value';
    end if;
    -- Que exista, para no dejar terminales colgando de un uuid inventado.
    if not exists (select 1 from empresas e where e.id = v_empresa) then
      raise exception 'Esa empresa no existe.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    -- Todos los demás: su propia empresa, y sólo admin_rrhh.
    --
    -- El parámetro se ignora a propósito. Si se respetara, un admin_rrhh
    -- podría crear una terminal en otra empresa mandando un uuid: sería
    -- un salto de tenant por un campo del request.
    v_empresa := auth_empresa();
    if v_empresa is null or auth_rol() is distinct from 'admin_rrhh' then
      raise exception 'No tenés permiso para autorizar terminales.'
        using errcode = 'insufficient_privilege';
    end if;
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
  'Crea una terminal y devuelve su secreto UNA sola vez. admin_rrhh la '
  'crea en su propia empresa (p_empresa_id se ignora); el superadmin '
  'indica la empresa con p_empresa_id. El secreto no se persiste: sólo '
  'su hash.';

revoke all on function public.autorizar_terminal(text, uuid) from public;
revoke all on function public.autorizar_terminal(text, uuid) from anon;
grant execute on function public.autorizar_terminal(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Lo mismo para el retiro de plantillas
--
-- Misma historia: `es_gestor()` incluye al superadmin, pero
-- `auth_empresa()` le da NULL, así que el guard lo rechazaba igual.
--
-- Y otra vez hay que DROPEAR la firma anterior: agregar un parámetro con
-- `create or replace` deja viva la de dos argumentos como sobrecarga, y
-- PostgREST resuelve por las claves del JSON. Quedaría intacto el camino
-- que no acepta empresa.
-- ---------------------------------------------------------------------
drop function if exists public.retirar_plantillas_faciales(smallint, smallint);

create or replace function public.retirar_plantillas_faciales(
  p_version smallint,
  p_version_vigente smallint default 2,
  p_empresa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_borradas integer;
begin
  if es_superadmin() then
    v_empresa := coalesce(p_empresa_id, auth_empresa());
    if v_empresa is null then
      raise exception 'Elegí la empresa cuyas plantillas se retiran.'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    v_empresa := auth_empresa();
    if v_empresa is null or not es_gestor() then
      raise exception 'Solo RRHH puede retirar plantillas faciales.'
        using errcode = 'insufficient_privilege';
    end if;
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
  'completado el re-enrolamiento. Nunca borra la versión vigente. RRHH '
  'opera sobre su empresa; el superadmin indica cuál con p_empresa_id.';

revoke all on function public.retirar_plantillas_faciales(smallint, smallint, uuid) from public;
revoke all on function public.retirar_plantillas_faciales(smallint, smallint, uuid) from anon;
grant execute on function public.retirar_plantillas_faciales(smallint, smallint, uuid) to authenticated;

notify pgrst, 'reload schema';
