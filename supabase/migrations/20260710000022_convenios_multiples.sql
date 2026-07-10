-- ============================================================
-- Convenios: de uno por empresa a varios (listados, sin pisarse).
-- Muchas PyMEs tienen personal bajo más de un CCT.
-- ============================================================

alter table convenios drop constraint convenios_pkey;
alter table convenios add column id uuid not null default gen_random_uuid();
alter table convenios add primary key (id);
create index convenios_empresa_idx on convenios (empresa_id);

comment on table convenios is
  'Convenios colectivos de la empresa (puede haber varios); texto base del asistente con IA.';
