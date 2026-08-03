-- ============================================================
-- Realtime para el hilo de comunicaciones.
--
-- Sin agregar la tabla a la publicación `supabase_realtime`, la
-- suscripción del cliente se conecta pero no recibe nunca nada: falla
-- en silencio, que es la peor forma de fallar.
--
-- Sobre privacidad: la publicación habilita el canal, pero Supabase
-- aplica RLS a los eventos de realtime igual que a las consultas
-- normales, así que sólo llegan los de conversaciones que la persona ya
-- puede leer. Además el cliente usa el evento sólo como "hubo novedad" y
-- vuelve a pedir los mensajes por la vía normal, así que el contenido no
-- viaja por el canal.
--
-- Idempotente: no falla si ya estaba agregada.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comunicacion_mensajes'
  ) then
    alter publication supabase_realtime add table comunicacion_mensajes;
  end if;
end
$$;

-- Realtime necesita la fila completa para poder filtrar por
-- comunicacion_id en el canal.
alter table comunicacion_mensajes replica identity full;

notify pgrst, 'reload schema';
