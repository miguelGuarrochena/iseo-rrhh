-- Detalle de la remuneración para que el neto sea real: no remunerativo,
-- aportes del empleado, otros descuentos y convenio aplicado.

alter table remuneraciones
  add column if not exists no_remunerativo numeric(14, 2) not null default 0,
  add column if not exists aportes numeric(14, 2) not null default 0,
  add column if not exists otros_descuentos numeric(14, 2) not null default 0,
  add column if not exists convenio text;

comment on column remuneraciones.aportes is
  'Aportes personales del empleado (jubilación + PAMI + obra social + otros).';
