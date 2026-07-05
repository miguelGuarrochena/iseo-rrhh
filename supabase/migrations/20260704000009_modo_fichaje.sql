-- Modo de fichaje por empleado: en planta (tablet facial), desde el celular
-- con geocerca, o remoto. Y marca de fichaje fuera de la zona de trabajo.

alter table empleados
  add column if not exists modo_fichaje text not null default 'celular',
  add column if not exists geocerca jsonb;

alter table fichajes
  add column if not exists fuera_de_zona boolean;

comment on column empleados.modo_fichaje is
  'Cómo ficha el empleado: planta | celular | remoto.';
comment on column empleados.geocerca is
  'Zona de trabajo para el modo celular: { lat, lng, radioM }.';
comment on column fichajes.fuera_de_zona is
  'El fichaje por celular se hizo fuera de la geocerca del empleado.';
