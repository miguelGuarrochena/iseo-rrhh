-- Fichaje manual de respaldo: cuando falla la tablet, no hay internet en
-- planta o el equipo no está cargado, RRHH o el supervisor cargan el fichaje
-- a mano. Se registra quién lo hizo, para auditoría.

alter table fichajes
  add column if not exists registrado_por text;

comment on column fichajes.registrado_por is
  'Nombre de quien cargó el fichaje a mano (metodo = manual).';
