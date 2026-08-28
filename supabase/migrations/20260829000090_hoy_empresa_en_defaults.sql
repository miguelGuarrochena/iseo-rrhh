-- ============================================================
-- "Hoy" en la base también es el día de Buenos Aires.
--
-- Qué pasaba
-- ----------
-- Dos columnas tienen `default current_date`:
--
--   notas_internas.fecha
--   movimientos_financieros.fecha
--
-- `current_date` depende del `TimeZone` de la sesión, y en Supabase esa
-- sesión es UTC. O sea que una nota escrita a las 21:30 de Buenos Aires
-- nacía con la fecha del día siguiente.
--
-- Hoy no se dispara: las dos escrituras que hace la aplicación mandan la
-- fecha explícita (`hoyISO()` en un caso, la que elige el usuario en el
-- otro). Pero un default existe justamente para cuando alguien no manda
-- el dato —un job, un `insert` desde la consola, una pantalla nueva— y
-- entonces el error entra sin que nadie lo note. El default tiene que ser
-- correcto por sí solo, no correcto porque nadie lo usa.
--
-- Por qué no se toca `default now()` de las columnas `timestamptz`
-- ---------------------------------------------------------------
-- Porque ahí no hay nada que corregir: un `timestamptz` guarda un
-- instante y `now()` es el instante correcto. La zona sólo importa al
-- LEERLO como día, y eso ya lo hace `zona_empresa()` donde corresponde.
-- El problema es exclusivo de las columnas `date`, que guardan un día
-- civil y necesitan que alguien decida en qué huso se corta.
-- ============================================================

create or replace function public.hoy_empresa()
returns date
language sql
stable
as $$ select (now() at time zone zona_empresa())::date $$;

comment on function public.hoy_empresa() is
  'El día de hoy para el negocio (zona_empresa()). Es el equivalente en '
  'la base de `hoyISO()` en el cliente. Usar esto y no `current_date`, '
  'que depende del TimeZone de la sesión (UTC en Supabase).';

grant execute on function public.hoy_empresa() to authenticated;

alter table public.notas_internas
  alter column fecha set default hoy_empresa();

alter table public.movimientos_financieros
  alter column fecha set default hoy_empresa();

notify pgrst, 'reload schema';
