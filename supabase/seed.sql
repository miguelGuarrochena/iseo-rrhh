-- ============================================================
-- Grants de plataforma para la base LOCAL.
--
-- Por qué hace falta
-- ------------------
-- En el proyecto hosteado, Supabase le da a `anon`, `authenticated` y
-- `service_role` los privilegios de tabla del esquema `public` cuando
-- se crea el proyecto; las policies de RLS son las que después deciden
-- qué fila ve cada uno. Las migraciones de este repo nunca otorgan esos
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
-- A esas tres directamente no se las toca: conservan los privilegios que
-- les dejó su migración.
--
-- Al final se verifica que las tres restricciones quedaron en pie. Si
-- alguna se aflojara, este archivo falla y el `db reset` se corta: es la
-- red que evita que local termine siendo más permisivo que producción.
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
      'grant select, insert, update, delete on %s to anon', v_tabla);
    execute format(
      'grant select, insert, update, delete on %s to authenticated', v_tabla);
    execute format(
      'grant select, insert, update, delete on %s to service_role', v_tabla);
  end loop;
end $$;

grant usage, select on all sequences in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ---------- Que las restricciones sigan en pie ----------
do $$
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

  -- PII: anon no tiene SELECT de tabla sobre empleados (mig 66).
  assert not has_table_privilege('anon', 'public.empleados', 'SELECT'),
    'anon no tiene SELECT de tabla sobre empleados';

  -- El resto de tablas de negocio: en el hosteado, `anon` SÍ tiene
  -- privilegio de tabla; RLS es lo que impide leer filas. Exigir la
  -- *falta* de GRANT acá hacía fallar `supabase start` en CI (el rol ya
  -- viene con el GRANT default de la imagen) y no se corría ningún test
  -- SQL. Los tests que hacen `set role anon` y esperan 0 filas dependen
  -- de que el GRANT exista: si no, pasan por "permission denied".
  assert (select c.relrowsecurity
            from pg_class c
           where c.oid = 'public.fichajes'::regclass),
    'fichajes tiene que tener RLS: es lo que impide que anon lea marcas';
  assert (select c.relrowsecurity
            from pg_class c
           where c.oid = 'public.ausencias'::regclass),
    'ausencias tiene que tener RLS: es lo que impide que anon lea ausencias';

  -- Y lo que sí tiene que poder: si esto falla, la app local está muerta.
  assert has_table_privilege('authenticated', 'public.fichajes', 'SELECT'),
    'authenticated tiene que poder leer fichajes (RLS filtra las filas)';
  assert has_table_privilege('authenticated', 'public.ausencias', 'SELECT'),
    'authenticated tiene que poder leer ausencias (RLS filtra las filas)';
end $$;
