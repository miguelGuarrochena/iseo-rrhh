-- Aprobación de horas extra por día: el supervisor decide qué extras
-- detectadas se aprueban para pagar.

alter table turnos
  add column if not exists extras_aprobadas boolean not null default false;

comment on column turnos.extras_aprobadas is
  'El supervisor aprobó las horas extra de ese turno para liquidarlas.';
