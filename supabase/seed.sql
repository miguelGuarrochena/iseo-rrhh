-- ============================================================
-- Grants de plataforma para la base LOCAL.
--
-- Por qué hace falta
-- ------------------
-- En el proyecto hosteado, Supabase le da a `authenticated` y
-- `service_role` los privilegios de tabla del esquema `public` cuando se
-- crea el proyecto; las policies de RLS son las que después deciden qué
-- fila ve cada uno. Las migraciones de este repo nunca otorgan esos
-- privilegios, justamente porque allá ya están.
--
-- En local, `supabase db reset` recrea la base y las tablas nacen de las
-- migraciones, sin esos grants. El resultado es una base donde
-- `authenticated` no puede leer NADA, y eso no se nota enseguida: los
-- tests de RLS que hacen `set role authenticated` y esperan un rechazo
-- pasan igual, pero pasan por falta de permisos y no porque la policy
-- esté haciendo su trabajo. Un test que pasa por la razón equivocada es
-- peor que uno que falla.
--
-- Qué NO hace
-- -----------
-- No inventa un modelo de permisos paralelo. Otorga lo mismo que la
-- plataforma y después devuelve el control a las migraciones que
-- restringen a propósito, sin copiarles las reglas:
--
--   * `empleados`                  → migraciones 66 y 69
--   * `terminales`                 → migración 75
--   * `fichajes_descriptor_usado`  → migración 73
--
-- A esas tres no se les toca el lado de `authenticated`: conservan los
-- privilegios que les dejó su migración.
--
-- `anon` no entra en el reparto
-- -----------------------------
-- En este repo `anon` no tiene acceso a datos de negocio: no hay un solo
-- `grant ... to anon` en las migraciones y sí decenas de `revoke ... from
-- anon`. La app nunca habla como `anon`; todo entra por `authenticated` o
-- por un RPC `security definer`.
--
-- Antes esto acá era sólo un `assert`: se daba por hecho que la imagen no
-- le otorgaba nada a `anon` y se verificaba. Eso convertía al seed en
-- rehén de la imagen de Postgres, porque el default ACL del esquema
-- `public` cambió entre versiones:
--
--   owner            default ACL para anon
--   ---------------  ---------------------------------------------
--   supabase_admin   arwdDxtm  (todo, incluido SELECT)
--   postgres         Dxtm      (sin SELECT/INSERT/UPDATE/DELETE)
--
-- Las tablas de `public` las crea `postgres` al aplicar las migraciones,
-- así que hoy `anon` queda sin SELECT y el assert pasa. En las imágenes
-- donde el default ACL de `postgres` todavía otorgaba todo, `anon` nacía
-- con SELECT sobre cada tabla y el mismo assert cortaba el arranque con
-- `SQLSTATE P0004: anon no lee datos de negocio` — sin que nada del repo
-- hubiera cambiado.
--
-- Un guard que depende de qué imagen bajó el CLI no sirve para las dos
-- cosas que tiene que hacer. Ahora el seed **revoca** explícitamente y
-- después verifica: el estado final es el mismo en cualquier imagen, y el
-- assert dejó de ser una apuesta para pasar a comprobar algo que este
-- archivo garantiza. La regla no se aflojó, se volvió exigible.
--
-- Al final se verifica que todo eso quedó en pie. Si algo se aflojara,
-- este archivo falla y el `db reset` se corta: es la red que evita que
-- local termine siendo más permisivo que producción.
-- ============================================================

-- Se otorga tabla por tabla y NO sobre las que alguna migración
-- restringió a propósito: así este archivo no tiene que repetir —ni
-- puede contradecir— el modelo de permisos que ellas definen. Sus
-- privilegios quedan exactamente como los dejó la migración.
do $$
declare
  v_tabla regclass;
  -- Cada una con la migración que manda sobre sus privilegios:
  --   empleados                  → 66 y 69 (columnas con PII afuera)
  --   terminales                 → 75 (nada de secreto_hash)
  --   fichajes_descriptor_usado  → 73 (sólo el RPC DEFINER)
  v_restringidas constant text[] :=
    array['empleados', 'terminales', 'fichajes_descriptor_usado'];
begin
  for v_tabla in
    select c.oid::regclass
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not (c.relname = any (v_restringidas))
  loop
    execute format(
      'grant select, insert, update, delete on %s to authenticated', v_tabla);
    execute format(
      'grant select, insert, update, delete on %s to service_role', v_tabla);
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ---------- `anon` queda sin nada, en cualquier imagen ----------
-- Sin excepciones y sin lista blanca: si mañana una migración agrega una
-- tabla, nace cerrada para `anon` sin que haya que acordarse de nada.
-- Sobre las tres restringidas es un no-op (su migración ya revocó), pero
-- se incluyen igual para que la regla sea total y no tenga huecos que
-- alguien tenga que ir a verificar uno por uno.
do $$
declare
  v_tabla regclass;
begin
  for v_tabla in
    select c.oid::regclass
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
  loop
    execute format('revoke all on %s from anon', v_tabla);
  end loop;
end $$;

-- Las secuencias del esquema le dan a `anon` un `UPDATE` (nextval) por
-- default ACL. No lo usa nadie y es escritura: afuera también.
revoke all on all sequences in schema public from anon;

-- ---------- Que las restricciones sigan en pie ----------
do $$
declare
  v_suelta text;
begin
  assert not has_table_privilege('authenticated', 'public.empleados', 'SELECT'),
    'empleados no puede tener SELECT de tabla: expone cbu y descriptor_facial';
  assert has_column_privilege('authenticated', 'public.empleados', 'nombre', 'SELECT'),
    'pero sí las columnas sin PII';
  assert not has_column_privilege('authenticated', 'public.empleados', 'cbu', 'SELECT'),
    'el cbu no se lee por PostgREST';

  assert not has_table_privilege('authenticated', 'public.terminales', 'SELECT'),
    'terminales no puede tener SELECT de tabla: expone secreto_hash';
  assert not has_column_privilege(
    'authenticated', 'public.terminales', 'secreto_hash', 'SELECT'),
    'el secreto de la terminal no se lee nunca';
  assert not has_table_privilege('authenticated', 'public.terminales', 'INSERT'),
    'las terminales se autorizan por RPC, no por insert';

  assert not has_table_privilege(
    'authenticated', 'public.fichajes_descriptor_usado', 'SELECT'),
    'los descriptores usados son sólo del RPC DEFINER';

  -- `anon` sobre TODA tabla de negocio, no sobre dos elegidas a mano: el
  -- agujero que importa es el de la tabla que nadie se acordó de mirar.
  -- Se listan las que fallan para no tener que adivinar cuál es.
  select string_agg(c.relname || ' (' || p.priv || ')', ', ' order by c.relname)
    into v_suelta
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as priv
    ) p
   where n.nspname = 'public'
     and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, p.priv);
  assert v_suelta is null,
    'anon no lee ni escribe datos de negocio; quedó suelto: ' || coalesce(v_suelta, '');

  -- Y el privilegio de tabla no es lo único que separa a `anon` de las
  -- filas: RLS es la segunda mitad. Se piden las dos, porque cada una
  -- tapa lo que la otra deja pasar (un GRANT nuevo, una policy laxa).
  assert (select c.relrowsecurity
            from pg_class c
           where c.oid = 'public.fichajes'::regclass),
    'fichajes tiene que tener RLS: es lo que filtra las filas por empresa';
  assert (select c.relrowsecurity
            from pg_class c
           where c.oid = 'public.ausencias'::regclass),
    'ausencias tiene que tener RLS: es lo que filtra las filas por empresa';

  -- Y lo que sí tiene que poder: si esto falla, la app local está muerta.
  assert has_table_privilege('authenticated', 'public.fichajes', 'SELECT'),
    'authenticated tiene que poder leer fichajes (RLS filtra las filas)';
  assert has_table_privilege('authenticated', 'public.ausencias', 'SELECT'),
    'authenticated tiene que poder leer ausencias (RLS filtra las filas)';
end $$;
