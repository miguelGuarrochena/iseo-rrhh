-- ============================================================
-- Autoservicio del legajo, con aprobación de RRHH.
--
-- Qué hay hoy
-- -----------
-- El empleado ve su legajo en `/app/mi-legajo` y lee: "Si algo no está
-- bien, avisá a RRHH". Ese aviso pasa por fuera de la app —un mensaje,
-- un pasillo— y RRHH lo tipea a mano. Los datos que más cambian
-- (domicilio, teléfono, CBU) son justamente los que más se desactualizan.
--
-- Qué se agrega
-- -------------
-- El empleado **propone** un cambio; RRHH **decide**. Nunca escribe
-- directo sobre su legajo: las policies de `empleados` siguen exactamente
-- como estaban (sólo admin_rrhh y superadmin actualizan), y todo el flujo
-- pasa por funciones que validan de este lado.
--
-- Lo que NO se puede proponer
-- ---------------------------
-- La lista blanca vive en la base, no en el formulario. Quedan afuera:
--
--  - identidad (nombre, apellido, dni, cuil): no es un dato que la
--    persona "actualice", es lo que la identifica en el legajo;
--  - decisiones del empleador (puesto, sector, fecha de ingreso,
--    convenio, modalidad, supervisor, activo, fecha de baja);
--  - lo biométrico y el modo de fichaje: cambiarlo por autoservicio
--    sería poder elegir cómo se controla la propia asistencia.
--
-- Sobre el CBU
-- ------------
-- Se puede proponer, y es de los motivos por los que esto existe. Pero es
-- el campo con el que un cambio indebido hace daño real, así que la
-- resolución la firma un admin de RRHH —no un supervisor— y queda en
-- auditoría con el valor viejo y el nuevo.
--
-- Idempotente.
-- ============================================================

create table if not exists public.solicitudes_datos_legajo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  campo text not null,
  /*
   * Foto del valor al momento de pedir el cambio. Sirve para que quien
   * revisa vea "de qué a qué", y para que se note si el dato ya se
   * modificó por otra vía mientras la solicitud esperaba.
   */
  valor_actual jsonb,
  valor_propuesto jsonb not null,
  comentario text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada', 'anulada')),
  motivo_resolucion text,
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references public.usuarios(id) on delete set null
);

comment on table public.solicitudes_datos_legajo is
  'Cambios de legajo propuestos por el propio empleado, a la espera de '
  'que RRHH los apruebe. Nada de acá modifica `empleados` por sí solo.';
comment on column public.solicitudes_datos_legajo.valor_actual is
  'Cómo estaba el dato cuando se pidió el cambio. Es contexto para quien '
  'revisa, no la fuente de verdad.';

create index if not exists idx_solicitudes_legajo_pendientes
  on public.solicitudes_datos_legajo (empresa_id, estado, creada_en desc);
create index if not exists idx_solicitudes_legajo_empleado
  on public.solicitudes_datos_legajo (empleado_id, creada_en desc);

/*
 * Una sola solicitud pendiente por campo. Sin esto, alguien puede
 * mandar el mismo cambio veinte veces y RRHH ve veinte filas iguales;
 * peor, aprobar dos de campos distintos en orden inesperado.
 */
create unique index if not exists uq_solicitud_legajo_pendiente
  on public.solicitudes_datos_legajo (empleado_id, campo)
  where estado = 'pendiente';

/**
 * Qué campos puede proponer el propio empleado.
 *
 * Está acá y no en el formulario a propósito: si mañana la pantalla
 * manda otro nombre de columna, la base lo rechaza igual.
 */
create or replace function public.campo_de_legajo_autogestionable(p_campo text)
returns boolean
language sql
immutable
as $$
  select p_campo in (
    -- Contacto: lo que efectivamente cambia en la vida de la persona.
    'domicilio', 'telefono', 'email',
    -- Situación personal.
    'estado_civil', 'nivel_estudios',
    'contacto_emergencia', 'grupo_familiar',
    -- Cobro. Ver la nota sobre el CBU en la cabecera.
    'banco', 'cbu'
  );
$$;

comment on function public.campo_de_legajo_autogestionable(text) is
  'Lista blanca de campos de `empleados` que el empleado puede proponer '
  'cambiar. Todo lo demás lo edita únicamente RRHH.';

alter table public.solicitudes_datos_legajo
  drop constraint if exists solicitudes_legajo_campo_permitido;
alter table public.solicitudes_datos_legajo
  add constraint solicitudes_legajo_campo_permitido
  check (campo_de_legajo_autogestionable(campo));

/*
 * Resuelta implica saber cuándo y por quién; pendiente implica que no
 * hay nada de eso todavía. Estados a medias serían un registro que no
 * se puede explicar después.
 */
alter table public.solicitudes_datos_legajo
  drop constraint if exists solicitudes_legajo_resolucion_coherente;
alter table public.solicitudes_datos_legajo
  add constraint solicitudes_legajo_resolucion_coherente
  check (
    (estado = 'pendiente' and resuelta_en is null)
    or (estado <> 'pendiente' and resuelta_en is not null)
  );

alter table public.solicitudes_datos_legajo enable row level security;

/*
 * Lee el dueño de la solicitud y quien la puede resolver. El supervisor
 * queda afuera: acá pasan domicilio y CBU de su equipo, y su rol no
 * incluye editar legajos.
 */
drop policy if exists solicitudes_legajo_select on public.solicitudes_datos_legajo;
create policy solicitudes_legajo_select
  on public.solicitudes_datos_legajo for select
  using (
    es_superadmin()
    or (
      empresa_id = auth_empresa()
      and (
        auth_rol() = 'admin_rrhh'::rol_usuario
        or empleado_id = auth_empleado()
      )
    )
  );

/*
 * Sin policies de insert/update/delete: la tabla se escribe solamente
 * desde las funciones de abajo. Cada una comprueba de nuevo quién es
 * quién, así que ocultar un botón no es parte de la defensa.
 */

/**
 * El empleado propone un cambio sobre su propio legajo.
 */
create or replace function public.solicitar_cambio_de_legajo(
  p_campo text,
  p_valor jsonb,
  p_comentario text default null
)
returns setof public.solicitudes_datos_legajo
security definer
set search_path = public
language plpgsql
as $$
declare
  v_emp uuid := auth_empleado();
  v_empresa uuid := auth_empresa();
  v_actual jsonb;
  v_fila public.solicitudes_datos_legajo;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if v_emp is null then
    raise exception 'Tu cuenta no está vinculada a un legajo';
  end if;
  if not campo_de_legajo_autogestionable(p_campo) then
    raise exception 'CAMPO_NO_AUTOGESTIONABLE: ese dato lo actualiza RRHH';
  end if;
  if p_valor is null or p_valor = 'null'::jsonb then
    raise exception 'Falta el valor propuesto';
  end if;
  /*
   * Vaciar un dato no es autoservicio: dejaría el legajo peor de como
   * estaba y RRHH no tendría contra qué comparar.
   */
  if jsonb_typeof(p_valor) = 'string' and btrim(p_valor #>> '{}') = '' then
    raise exception 'Falta el valor propuesto';
  end if;

  -- Foto del valor de hoy, para que quien revisa vea de qué a qué.
  execute format(
    'select to_jsonb(e.%I) from public.empleados e where e.id = $1 and e.empresa_id = $2',
    p_campo
  ) into v_actual using v_emp, v_empresa;

  if v_actual is null and not exists (
    select 1 from public.empleados e
    where e.id = v_emp and e.empresa_id = v_empresa
  ) then
    raise exception 'Tu legajo no pertenece a la empresa activa';
  end if;

  if v_actual is not distinct from p_valor then
    raise exception 'SIN_CAMBIO: el dato ya figura así en tu legajo';
  end if;

  -- Reemplaza la pendiente del mismo campo en vez de acumular filas:
  -- lo que vale es el último valor que la persona quiso.
  update public.solicitudes_datos_legajo
     set estado = 'anulada',
         resuelta_en = now(),
         motivo_resolucion = 'Reemplazada por una solicitud posterior'
   where empleado_id = v_emp
     and campo = p_campo
     and estado = 'pendiente';

  insert into public.solicitudes_datos_legajo
    (empresa_id, empleado_id, campo, valor_actual, valor_propuesto, comentario)
  values
    (v_empresa, v_emp, p_campo, v_actual, p_valor, nullif(btrim(p_comentario), ''))
  returning * into v_fila;

  return next v_fila;
end;
$$;

/** El empleado se arrepiente antes de que RRHH la mire. */
create or replace function public.anular_solicitud_de_legajo(p_id uuid)
returns setof public.solicitudes_datos_legajo
security definer
set search_path = public
language plpgsql
as $$
declare
  v_emp uuid := auth_empleado();
  v_fila public.solicitudes_datos_legajo;
begin
  if v_emp is null then
    raise exception 'Tu cuenta no está vinculada a un legajo';
  end if;

  update public.solicitudes_datos_legajo s
     set estado = 'anulada',
         resuelta_en = now(),
         resuelta_por = auth.uid()
   where s.id = p_id
     and s.empleado_id = v_emp
     and s.estado = 'pendiente'
  returning * into v_fila;

  -- Ajena, ya resuelta o inexistente: vacío, sin distinguir los casos.
  if not found then
    return;
  end if;
  return next v_fila;
end;
$$;

/**
 * RRHH aprueba o rechaza.
 *
 * Aprobar es lo único que toca `empleados`, y lo hace acá adentro: el
 * cliente no puede aprobar y escribir por separado, ni escribir sin
 * aprobar. Queda auditado en las dos direcciones.
 */
create or replace function public.resolver_solicitud_de_legajo(
  p_id uuid,
  p_aprobar boolean,
  p_motivo text default null
)
returns setof public.solicitudes_datos_legajo
security definer
set search_path = public
language plpgsql
as $$
declare
  v_fila public.solicitudes_datos_legajo;
  v_tipo text;
  v_antes jsonb;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  /*
   * Los mismos que pueden editar un legajo (`empleados_gestion_update`).
   * El supervisor no entra: aprobar un CBU no es supervisión.
   */
  if not (es_superadmin() or auth_rol() = 'admin_rrhh'::rol_usuario) then
    raise exception 'No tenés permiso para resolver solicitudes de legajo';
  end if;

  select * into v_fila
    from public.solicitudes_datos_legajo s
   where s.id = p_id
     and s.estado = 'pendiente'
     and (es_superadmin() or s.empresa_id = auth_empresa())
   for update;

  if not found then
    return;
  end if;

  if not p_aprobar then
    update public.solicitudes_datos_legajo
       set estado = 'rechazada',
           resuelta_en = now(),
           resuelta_por = auth.uid(),
           motivo_resolucion = nullif(btrim(p_motivo), '')
     where id = v_fila.id
    returning * into v_fila;
  else
    -- El campo ya pasó la lista blanca al crearse y la constraint lo
    -- sostiene; se vuelve a mirar antes de armar el SQL dinámico.
    if not campo_de_legajo_autogestionable(v_fila.campo) then
      raise exception 'CAMPO_NO_AUTOGESTIONABLE: %', v_fila.campo;
    end if;

    select format_type(a.atttypid, a.atttypmod) into v_tipo
      from pg_attribute a
     where a.attrelid = 'public.empleados'::regclass
       and a.attname = v_fila.campo
       and a.attnum > 0
       and not a.attisdropped;
    if v_tipo is null then
      raise exception 'El campo % ya no existe en el legajo', v_fila.campo;
    end if;

    execute format(
      'select to_jsonb(e.%I) from public.empleados e where e.id = $1',
      v_fila.campo
    ) into v_antes using v_fila.empleado_id;

    /*
     * `#>> '{}'` devuelve el texto de un jsonb escalar y el JSON
     * serializado de un objeto, así que el mismo cast sirve para text,
     * para los enums y para las columnas jsonb.
     */
    execute format(
      'update public.empleados set %I = ($1 #>> ''{}'')::%s where id = $2',
      v_fila.campo, v_tipo
    ) using v_fila.valor_propuesto, v_fila.empleado_id;

    update public.solicitudes_datos_legajo
       set estado = 'aprobada',
           resuelta_en = now(),
           resuelta_por = auth.uid(),
           motivo_resolucion = nullif(btrim(p_motivo), '')
     where id = v_fila.id
    returning * into v_fila;
  end if;

  select u.nombre_completo into v_actor
    from public.usuarios u where u.id = auth.uid();

  /*
   * La auditoría se escribe acá y no en el cliente: es el registro de
   * quién autorizó tocar un legajo ajeno, y no puede depender de que la
   * app se acuerde de mandarlo.
   */
  insert into public.auditoria_acciones
    (empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (
    v_fila.empresa_id,
    auth.uid(),
    coalesce(v_actor, 'Desconocido'),
    case when p_aprobar then 'aprobar_cambio_legajo' else 'rechazar_cambio_legajo' end,
    'empleado',
    v_fila.empleado_id::text,
    jsonb_build_object(
      'solicitudId', v_fila.id,
      'campo', v_fila.campo,
      'antes', v_antes,
      'despues', case when p_aprobar then v_fila.valor_propuesto else null end,
      'motivo', v_fila.motivo_resolucion
    )
  );

  return next v_fila;
end;
$$;

revoke all on function public.solicitar_cambio_de_legajo(text, jsonb, text) from public, anon;
revoke all on function public.anular_solicitud_de_legajo(uuid) from public, anon;
revoke all on function public.resolver_solicitud_de_legajo(uuid, boolean, text) from public, anon;
grant execute on function public.solicitar_cambio_de_legajo(text, jsonb, text) to authenticated;
grant execute on function public.anular_solicitud_de_legajo(uuid) to authenticated;
grant execute on function public.resolver_solicitud_de_legajo(uuid, boolean, text) to authenticated;

grant select on table public.solicitudes_datos_legajo to authenticated;

notify pgrst, 'reload schema';
