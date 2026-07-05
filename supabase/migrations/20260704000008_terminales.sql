-- Terminales de fichaje: dispositivos (tablets) autorizados para el
-- "Modo planta" (fichaje facial 1:N). Solo en un dispositivo registrado
-- funciona ese modo; así no puede usarse desde cualquier equipo.

create table terminales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now()
);

create index terminales_empresa_idx on terminales (empresa_id);

alter table terminales enable row level security;

-- Los gestores leen las terminales de su empresa; el admin las administra.
create policy terminales_select on terminales for select
  using (es_superadmin() or (es_gestor() and empresa_id = auth_empresa()));
create policy terminales_gestion on terminales for all
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

comment on table terminales is
  'Dispositivos autorizados para el Modo planta (fichaje facial 1:N).';
