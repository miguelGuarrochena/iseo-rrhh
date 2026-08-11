-- Un legajo, una cuenta.
--
-- `usuarios.empleado_id` es lo que resuelve "lo mío" en toda la app: los
-- recibos, la ficha, las ausencias y los fichajes se filtran con
-- `auth_empleado()`. Si dos cuentas apuntan al mismo colaborador, las dos
-- ven —y firman— el mismo recibo de sueldo, y ninguna pantalla lo avisa.
--
-- Hasta ahora el vínculo se fijaba una sola vez, en la metadata de la
-- invitación, y no había forma de repetirlo desde la app. Con la
-- vinculación manual en Permisos sí la hay, así que el caso pasa a ser
-- alcanzable y se cierra en la base, que es donde no se puede esquivar.

do $$
declare v_duplicados text;
begin
  select string_agg(empleado_id::text, ', ')
    into v_duplicados
  from (
    select empleado_id
    from public.usuarios
    where empleado_id is not null
    group by empleado_id
    having count(*) > 1
  ) d;

  if v_duplicados is not null then
    -- Crear el índice acá fallaría y dejaría la migración trabada. Se
    -- avisa con los ids para poder resolverlo a mano y reintentar.
    raise warning 'Hay colaboradores con más de una cuenta vinculada (%). El índice único no se creó: revisá esos legajos y volvé a aplicar esta migración.', v_duplicados;
  else
    create unique index if not exists usuarios_empleado_unico_idx
      on public.usuarios (empleado_id)
      where empleado_id is not null;
  end if;
end;
$$;
