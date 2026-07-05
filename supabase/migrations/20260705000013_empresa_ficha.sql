-- Ficha ampliada del cliente (para el superadmin de ISEO): razón social,
-- domicilio, teléfono del contacto y plan contratado.

alter table empresas
  add column if not exists razon_social text,
  add column if not exists domicilio text,
  add column if not exists contacto_telefono text,
  add column if not exists plan text;

comment on column empresas.razon_social is 'Nombre legal, si difiere del comercial.';
comment on column empresas.plan is 'Nombre del plan contratado.';
