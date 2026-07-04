-- Convenio colectivo por empresa (para el asistente con IA).
-- Se guarda el texto completo; la búsqueda/RAG se hace en la app.

create table convenios (
  empresa_id uuid primary key references empresas (id) on delete cascade,
  nombre text not null,
  contenido text not null default '',
  actualizado_en timestamptz not null default now()
);

alter table convenios enable row level security;

-- Todos en la empresa lo leen; los administradores lo editan.
create policy convenios_select on convenios for select
  using (es_superadmin() or empresa_id = auth_empresa());
create policy convenios_gestion on convenios for all
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

comment on table convenios is
  'Convenio colectivo de la empresa; texto base del asistente con IA.';
