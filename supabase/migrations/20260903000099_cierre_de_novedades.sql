-- ============================================================
-- Cierre de novedades del mes.
--
-- Qué resuelve: hasta acá la app guardaba las novedades (altas, bajas,
-- licencias, extras aprobadas, adelantos, cambios de sueldo) pero no
-- tenía el acto de "el mes está revisado y va al contador". Ese acto se
-- hacía en un Excel aparte y la app quedaba como registro paralelo.
--
-- Qué NO es: no es una liquidación. Acá no se calcula ningún sueldo. Se
-- guarda un estado por (empresa, período) y quién lo cambió.
--
-- Autoridad en la base, no en la UI:
--   * La tabla sólo tiene policy de SELECT. No hay INSERT ni UPDATE
--     directos: todo pasa por los RPC de abajo, que validan rol y
--     tenant. Esconder el botón no alcanza.
--   * Cerrar y reabrir son de `admin_rrhh` (o del superadmin de ISEO
--     operando sobre un cliente). Un supervisor no cierra el mes.
--   * La auditoría se escribe dentro del RPC y no desde el navegador:
--     es la parte que no puede faltar si mañana hay que explicar por
--     qué un período se reabrió.
--   * Con el período cerrado, `remuneraciones` y `adelantos` de ese mes
--     quedan bloqueados por trigger. Es el "no se toca sin querer".
--
-- Idempotente.
-- ============================================================

-- ---------- Tabla ----------

create table if not exists cierres_periodo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  -- YYYY-MM, igual que `remuneraciones.periodo` y `recibos.periodo`.
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'cerrado')),
  -- Claves de categoría que RRHH ya revisó. Es un tilde de trabajo, no
  -- un permiso: no habilita ni bloquea nada, sólo deja ver qué queda.
  categorias_revisadas jsonb not null default '[]'::jsonb,
  notas text,
  cerrado_por uuid references usuarios (id) on delete set null,
  cerrado_en timestamptz,
  reabierto_por uuid references usuarios (id) on delete set null,
  reabierto_en timestamptz,
  motivo_reapertura text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (empresa_id, periodo)
);

comment on table cierres_periodo is
  'Un renglón por empresa y período: si el mes está abierto o cerrado, '
  'quién lo cerró y quién lo reabrió. No guarda importes.';

create index if not exists cierres_periodo_empresa_idx
  on cierres_periodo (empresa_id, periodo desc);

alter table cierres_periodo enable row level security;

-- Lectura: los gestores de la empresa y el superadmin. El empleado no:
-- el estado del cierre es información de administración.
drop policy if exists cierres_select on cierres_periodo;
create policy cierres_select on cierres_periodo for select
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );

-- Sin policies de INSERT/UPDATE/DELETE a propósito: se escribe sólo por
-- los RPC de abajo, que son SECURITY DEFINER y validan rol y tenant.

-- ---------- Guardas comunes ----------

/**
 * ¿Quién está llamando y puede cerrar el mes de esta empresa?
 *
 * Mismo criterio que el resto de los RPC sensibles (migración 61): el
 * superadmin de ISEO opera sobre cualquier cliente; el resto sólo sobre
 * su propia empresa, y sólo con rol admin_rrhh.
 *
 * Fail-closed: sin sesión no se pasa. A diferencia de los triggers de
 * saldo, acá no hay ningún caso legítimo de script o semilla que tenga
 * que cerrar un período.
 */
create or replace function public.assert_puede_cerrar_periodo(
  p_empresa_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if p_empresa_id is null then
    raise exception 'Falta la empresa';
  end if;
  if es_superadmin() then
    return;
  end if;
  if auth_rol() is distinct from 'admin_rrhh'
     or auth_empresa() is distinct from p_empresa_id then
    raise exception 'No autorizado a cerrar el período de esa empresa';
  end if;
end;
$$;

-- Sólo la llaman los RPC de abajo, que corren como definer. Se le saca
-- el EXECUTE que Postgres le da a PUBLIC al crear la función (ver la
-- migración 97: revocar de PUBLIC no alcanza si alguien la expone
-- después, así que se nombra rol por rol).
revoke all on function public.assert_puede_cerrar_periodo(uuid) from public;
revoke all on function public.assert_puede_cerrar_periodo(uuid) from anon;
revoke all on function public.assert_puede_cerrar_periodo(uuid) from authenticated;

/**
 * El período tiene que existir de verdad: formato correcto, no futuro y
 * no anterior a que existiera el trabajo registrado tal como lo entiende
 * esta app.
 *
 * El piso no es cosmético. Sin él, `marcar_categoria_revisada` acepta
 * '0001-01' y cualquier admin puede sembrar su propio tenant de filas
 * para períodos que nunca existieron, tildando categorías de meses
 * imaginarios. No es una filtración —es basura en la propia empresa—
 * pero una comparación de strings la evita entera.
 *
 * `set search_path = public` aunque sea SECURITY INVOKER: acá adentro se
 * llama a `zona_empresa()` sin calificar, y toda función de esta base
 * fija su search_path. Que ésta fuera la excepción era esperar a que
 * alguien la llamara desde un contexto con otro search_path.
 */
create or replace function public.assert_periodo_valido(p_periodo text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Período inválido (se espera YYYY-MM)';
  end if;
  if p_periodo < '2000-01' then
    raise exception 'Período fuera de rango: %', p_periodo;
  end if;
  -- El mes de negocio, no el del servidor: en Vercel el proceso corre en
  -- UTC y el 31 a las 21:30 de Buenos Aires ya sería el mes siguiente.
  if p_periodo > to_char(
       (now() at time zone zona_empresa()), 'YYYY-MM'
     ) then
    raise exception 'Todavía no se puede cerrar un período futuro';
  end if;
end;
$$;

revoke all on function public.assert_periodo_valido(text) from public;
revoke all on function public.assert_periodo_valido(text) from anon;
revoke all on function public.assert_periodo_valido(text) from authenticated;

/**
 * Auditoría del cierre, escrita acá y no en el navegador.
 *
 * `registrarAuditoria` del cliente se traga los errores a propósito para
 * no romper la acción principal. Para esto no alcanza: si mañana hay que
 * explicar por qué un período se reabrió, el registro tiene que existir
 * sí o sí. Es la misma tabla y el mismo formato que el resto.
 */
create or replace function public.auditar_cierre(
  p_empresa_id uuid,
  p_accion text,
  p_periodo text,
  p_detalle jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  select coalesce(u.nombre_completo, '')
    into v_nombre
  from usuarios u
  where u.id = auth.uid();

  insert into auditoria_acciones
    (empresa_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values
    (p_empresa_id, auth.uid(), coalesce(v_nombre, ''), p_accion,
     'cierre_periodo', p_periodo, coalesce(p_detalle, '{}'::jsonb));
end;
$$;

-- Ésta es la más sensible de las tres: con EXECUTE, cualquiera con
-- sesión podría escribir renglones de auditoría a nombre de otro. Sólo
-- la llaman `cerrar_periodo` y `reabrir_periodo`, que corren como definer.
revoke all on function public.auditar_cierre(uuid, text, text, jsonb) from public;
revoke all on function public.auditar_cierre(uuid, text, text, jsonb) from anon;
revoke all on function public.auditar_cierre(uuid, text, text, jsonb) from authenticated;

-- ---------- RPCs ----------

/**
 * Cierra el período.
 *
 * Si ya estaba cerrado falla en vez de volver a cerrarlo: "cerrado dos
 * veces" no existe como hecho, y dejarlo pasar duplicaría el renglón de
 * auditoría y pisaría quién lo cerró de verdad.
 */
create or replace function public.cerrar_periodo(
  p_empresa_id uuid,
  p_periodo text,
  p_notas text default null
)
returns cierres_periodo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cierres_periodo;
begin
  perform assert_puede_cerrar_periodo(p_empresa_id);
  perform assert_periodo_valido(p_periodo);

  select * into v_fila
  from cierres_periodo
  where empresa_id = p_empresa_id and periodo = p_periodo
  for update;

  if found and v_fila.estado = 'cerrado' then
    raise exception 'El período % ya está cerrado', p_periodo;
  end if;

  insert into cierres_periodo as c
    (empresa_id, periodo, estado, notas, cerrado_por, cerrado_en,
     actualizado_en)
  values
    (p_empresa_id, p_periodo, 'cerrado', p_notas, auth.uid(), now(), now())
  on conflict (empresa_id, periodo) do update
    set estado = 'cerrado',
        notas = coalesce(excluded.notas, c.notas),
        cerrado_por = auth.uid(),
        cerrado_en = now(),
        actualizado_en = now()
  returning * into v_fila;

  perform auditar_cierre(
    p_empresa_id, 'cerrar', p_periodo,
    jsonb_build_object('notas', p_notas)
  );

  return v_fila;
end;
$$;

comment on function public.cerrar_periodo(uuid, text, text) is
  'Marca el período como cerrado. Sólo admin_rrhh de la empresa (o el '
  'superadmin). Deja rastro en auditoria_acciones.';

/**
 * Reabre el período. Exige motivo: reabrir un mes ya informado al
 * contador es una excepción, y sin el porqué la auditoría no sirve de
 * nada tres meses después.
 */
create or replace function public.reabrir_periodo(
  p_empresa_id uuid,
  p_periodo text,
  p_motivo text
)
returns cierres_periodo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cierres_periodo;
begin
  perform assert_puede_cerrar_periodo(p_empresa_id);
  perform assert_periodo_valido(p_periodo);

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Para reabrir un período hay que decir por qué';
  end if;

  update cierres_periodo
     set estado = 'abierto',
         reabierto_por = auth.uid(),
         reabierto_en = now(),
         motivo_reapertura = btrim(p_motivo),
         actualizado_en = now()
   where empresa_id = p_empresa_id
     and periodo = p_periodo
     and estado = 'cerrado'
  returning * into v_fila;

  if not found then
    raise exception 'El período % no está cerrado', p_periodo;
  end if;

  perform auditar_cierre(
    p_empresa_id, 'reabrir', p_periodo,
    jsonb_build_object('motivo', btrim(p_motivo))
  );

  return v_fila;
end;
$$;

comment on function public.reabrir_periodo(uuid, text, text) is
  'Vuelve a abrir un período cerrado. Exige motivo y queda auditado.';

/**
 * Tilda o destilda una categoría revisada.
 *
 * Es el avance del trabajo de RRHH, no un permiso: no habilita ni
 * bloquea nada. Por eso no se audita (sería ruido) pero sí se valida
 * tenant y rol, y no se deja tocar un período ya cerrado.
 */
create or replace function public.marcar_categoria_revisada(
  p_empresa_id uuid,
  p_periodo text,
  p_categoria text,
  p_revisada boolean
)
returns cierres_periodo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cierres_periodo;
  v_actual jsonb;
begin
  perform assert_puede_cerrar_periodo(p_empresa_id);
  perform assert_periodo_valido(p_periodo);

  if p_categoria is null or btrim(p_categoria) = '' then
    raise exception 'Falta la categoría';
  end if;

  select * into v_fila
  from cierres_periodo
  where empresa_id = p_empresa_id and periodo = p_periodo
  for update;

  if found and v_fila.estado = 'cerrado' then
    raise exception 'El período % está cerrado', p_periodo;
  end if;

  v_actual := coalesce(v_fila.categorias_revisadas, '[]'::jsonb);

  if p_revisada then
    if not (v_actual ? p_categoria) then
      v_actual := v_actual || to_jsonb(p_categoria);
    end if;
  else
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_actual
    from jsonb_array_elements_text(v_actual) as t(x)
    where x <> p_categoria;
  end if;

  insert into cierres_periodo as c
    (empresa_id, periodo, estado, categorias_revisadas, actualizado_en)
  values
    (p_empresa_id, p_periodo, 'abierto', v_actual, now())
  on conflict (empresa_id, periodo) do update
    set categorias_revisadas = v_actual,
        actualizado_en = now()
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke all on function public.cerrar_periodo(uuid, text, text) from public;
revoke all on function public.cerrar_periodo(uuid, text, text) from anon;
grant execute on function public.cerrar_periodo(uuid, text, text) to authenticated;

revoke all on function public.reabrir_periodo(uuid, text, text) from public;
revoke all on function public.reabrir_periodo(uuid, text, text) from anon;
grant execute on function public.reabrir_periodo(uuid, text, text) to authenticated;

revoke all on function public.marcar_categoria_revisada(uuid, text, text, boolean) from public;
revoke all on function public.marcar_categoria_revisada(uuid, text, text, boolean) from anon;
grant execute on function public.marcar_categoria_revisada(uuid, text, text, boolean) to authenticated;

-- ---------- El período cerrado no se toca sin querer ----------

/**
 * ¿Está cerrado ese mes para esa empresa?
 *
 * Se usa desde triggers, así que es SECURITY DEFINER: el trigger tiene
 * que poder mirar el cierre aunque el rol que escribe no lo vea.
 */
create or replace function public.periodo_cerrado(
  p_empresa_id uuid,
  p_periodo text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cierres_periodo
    where empresa_id = p_empresa_id
      and periodo = p_periodo
      and estado = 'cerrado'
  );
$$;

-- La usa el trigger, que corre como definer. La app lee el estado del
-- período de la tabla (con RLS), así que nadie necesita esta función
-- desde afuera.
revoke all on function public.periodo_cerrado(uuid, text) from public;
revoke all on function public.periodo_cerrado(uuid, text) from anon;
revoke all on function public.periodo_cerrado(uuid, text) from authenticated;

/**
 * Freno de las tablas que están keyeadas por período.
 *
 * Alcance deliberadamente chico: `remuneraciones` y `adelantos` son las
 * únicas dos cuyo `periodo` dice sin ambigüedad a qué mes pertenece la
 * fila. Las ausencias cruzan meses y los fichajes se siguen marcando
 * todos los días: bloquearlos por un cierre rompería el trabajo normal
 * en vez de protegerlo.
 *
 * Sin JWT (service role, migraciones, scripts) no se frena: mismo
 * criterio que los demás triggers de la base. El cierre protege del
 * error humano en la app, no del mantenimiento.
 */
create or replace function public.trg_bloquear_periodo_cerrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_periodo text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- Al mover una fila de período hay que mirar los dos: sacarla de un
  -- mes cerrado también es modificar ese mes.
  if tg_op in ('INSERT', 'UPDATE') then
    v_empresa := new.empresa_id;
    v_periodo := new.periodo;
    if v_periodo is not null and periodo_cerrado(v_empresa, v_periodo) then
      raise exception 'PERIODO_CERRADO: el período % está cerrado', v_periodo;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_empresa := old.empresa_id;
    v_periodo := old.periodo;
    if v_periodo is not null and periodo_cerrado(v_empresa, v_periodo) then
      raise exception 'PERIODO_CERRADO: el período % está cerrado', v_periodo;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists bloquear_periodo_cerrado on remuneraciones;
create trigger bloquear_periodo_cerrado
  before insert or update or delete on remuneraciones
  for each row execute function trg_bloquear_periodo_cerrado();

drop trigger if exists bloquear_periodo_cerrado on adelantos;
create trigger bloquear_periodo_cerrado
  before insert or update or delete on adelantos
  for each row execute function trg_bloquear_periodo_cerrado();

notify pgrst, 'reload schema';
