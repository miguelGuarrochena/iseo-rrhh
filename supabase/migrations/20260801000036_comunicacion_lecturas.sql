-- ============================================================
-- Comunicaciones: leído / no leído de verdad, por usuario.
--
-- Hasta ahora el numerito del menú contaba las conversaciones que no
-- estaban cerradas. Como cerrar es una decisión aparte de leer, el
-- contador no bajaba nunca aunque hubieras leído todo: exactamente lo
-- que reportó el cliente ("sigue quedando el no leído una vez que se
-- lee").
--
-- Cada usuario guarda su propia marca de lectura. Una conversación
-- vuelve a estar sin leer cuando `comunicaciones.actualizado_en` es
-- posterior a la marca, o sea cuando llegó un mensaje nuevo después de
-- la última vez que la miraste. Es el comportamiento de un mail.
-- ============================================================

create table if not exists comunicacion_lecturas (
  comunicacion_id uuid not null
    references comunicaciones (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  leido_en timestamptz not null default now(),
  primary key (comunicacion_id, usuario_id)
);

create index if not exists comunicacion_lecturas_usuario_idx
  on comunicacion_lecturas (usuario_id);

alter table comunicacion_lecturas enable row level security;

-- Cada uno maneja sus propias marcas y no ve las de los demás. Saber
-- quién leyó qué no aporta nada acá y sí expone información del equipo.
drop policy if exists comunicacion_lecturas_propias on comunicacion_lecturas;
create policy comunicacion_lecturas_propias on comunicacion_lecturas for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

notify pgrst, 'reload schema';
