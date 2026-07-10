-- El convenio colectivo es un dato del empleado (no cambia mes a mes).
-- Se carga una vez en su ficha y se arrastra a cada remuneración.

alter table empleados
  add column if not exists convenio text;

comment on column empleados.convenio is
  'Convenio colectivo bajo el que está encuadrado el empleado.';
