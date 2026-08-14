-- El fichaje no guarda fotografías.
--
-- Qué se encontró
-- ---------------
-- `fichajes.foto_url` existe desde el esquema inicial (julio de 2026) y
-- **nunca la usó nadie**: ningún caller pasaba una foto, ninguna pantalla
-- la leía, y `fichar_con_rostro` tampoco la inserta. Lo que sí existía
-- era el cableado para escribirla, dormido dentro de `ficharAhora`.
--
-- Ese cableado ya se cortó del lado de la aplicación. Pero cortar la
-- aplicación no alcanza, y ésa es la razón de esta migración:
--
--   * La política de INSERT de `fichajes` deja que un empleado inserte
--     su propia marca, y su `with check` no dice nada sobre `foto_url`.
--   * Los tres triggers `before insert` que ya existen tampoco la tocan:
--     `imponer_actor_fichaje` impone el actor y limpia confianza y
--     geocerca, pero tiene dos salidas tempranas —el camino del RPC y el
--     camino sin sesión— por las que ni siquiera llega a mirarla.
--
-- O sea que un cliente modificado, o un `curl` con un token válido,
-- podía escribir ahí una `data:` URL con una cara adentro. Sin la
-- aplicación de por medio, la promesa de "no guardamos fotos" era una
-- convención, no un control.
--
-- Qué hace
-- --------
-- Fuerza `foto_url` a null en todo INSERT y UPDATE de `fichajes`. Nada
-- más.
--
-- Qué NO hace
-- -----------
-- **No borra la columna** ni ningún dato. Es aditiva y reversible: si
-- algún día se decide que el fichaje sí tiene que guardar una imagen —con
-- su base legal, su consentimiento y su política de retención— alcanza
-- con `drop trigger trg_fichaje_sin_fotografia on fichajes;`.
--
-- Se dejó la columna a propósito: quitarla es irreversible, obliga a
-- reescribir la vista y los triggers de auditoría que la nombran, y no
-- aporta ninguna garantía que este trigger no dé ya.
--
-- No toca F-01, terminal vinculada, RLS, actor, auditoría ni F-02.

create or replace function public.descartar_foto_de_fichaje()
returns trigger
language plpgsql
as $$
begin
  -- Sin condiciones y sin excepciones, a propósito.
  --
  -- La tentación sería dejar pasar el camino del RPC o el de las
  -- migraciones, como hace `imponer_actor_fichaje`. Pero acá no hay
  -- ningún caso legítimo que quiera escribir una foto: si alguno
  -- apareciera, el cambio tiene que ser explícito y discutido, no una
  -- excepción heredada.
  new.foto_url := null;
  return new;
end;
$$;

comment on function public.descartar_foto_de_fichaje is
  'Fuerza fichajes.foto_url a null. El fichaje facial guarda una '
  'plantilla de 128 números, nunca una imagen del rostro.';

drop trigger if exists trg_fichaje_sin_fotografia on public.fichajes;
create trigger trg_fichaje_sin_fotografia
  before insert or update on public.fichajes
  for each row
  execute function public.descartar_foto_de_fichaje();

-- Las filas que hubiera con foto quedan limpias.
--
-- En la base local son 0 y se espera que en producción también, porque
-- ningún código escribió nunca esta columna. Si el conteo saliera
-- distinto de 0 hay que mirarlo antes de seguir: significaría que algo
-- la escribió por un camino que esta auditoría no encontró.
do $$
declare v_con_foto integer;
begin
  select count(*) into v_con_foto from fichajes where foto_url is not null;
  if v_con_foto > 0 then
    raise notice
      'Habia % fichajes con foto_url. Se limpian, pero conviene averiguar quien las escribio.',
      v_con_foto;
  end if;
end $$;

update fichajes set foto_url = null where foto_url is not null;

notify pgrst, 'reload schema';
