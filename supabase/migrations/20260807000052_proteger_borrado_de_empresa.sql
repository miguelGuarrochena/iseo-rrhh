-- Freno al borrado accidental de una empresa.
--
-- Todo cuelga de `empresas` con `on delete cascade`: empleados, fichajes,
-- recibos firmados, remuneraciones, ausencias, documentos. Un `delete`
-- de una fila de `empresas` se lleva puesto el historial salarial y los
-- recibos con firma de un cliente entero — que son justamente la prueba
-- legal que la migración 26 se ocupó de preservar versión por versión.
--
-- La app no expone ese borrado (usa baja lógica), así que hoy el riesgo
-- no es el producto: es una línea de más en el SQL Editor de Supabase o
-- en un script de soporte. Sin `where`, o con el `where` equivocado.
--
-- No se cambia la cascada a `restrict` porque entonces borrar una empresa
-- de verdad —un cliente que se va y pide que borren todo— se vuelve un
-- trabajo manual tabla por tabla. Lo que se hace es pedir que la
-- intención sea explícita.

create or replace function exigir_purga_explicita_de_empresa()
returns trigger
language plpgsql
as $$
declare
  v_empleados int;
begin
  if coalesce(current_setting('app.purgar_empresa', true), '') = old.id::text
  then
    return old;
  end if;

  select count(*) into v_empleados from empleados where empresa_id = old.id;

  raise exception
    'Borrar esta empresa se lleva % legajos con su historial de sueldos y recibos firmados. '
    'Si es lo que querés, corré antes: '
    'select set_config(''app.purgar_empresa'', ''%'', true);  -- en la MISMA transacción',
    v_empleados, old.id
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists exigir_purga_explicita_de_empresa on empresas;
create trigger exigir_purga_explicita_de_empresa
  before delete on empresas
  for each row
  execute function exigir_purga_explicita_de_empresa();

comment on function exigir_purga_explicita_de_empresa is
  'Impide borrar una empresa por accidente: exige declarar la intención '
  'con set_config(''app.purgar_empresa'', <id>, true) en la misma transacción.';
