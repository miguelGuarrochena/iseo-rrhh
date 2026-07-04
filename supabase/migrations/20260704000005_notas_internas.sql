-- Notas internas del empleado. Solo visibles para administradores.
-- Ej.: "03/07/2026 - Solicitó aumento", "10/08/2026 - Problema familiar".

create table notas_internas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  fecha date not null default current_date,
  autor_id uuid references usuarios (id),
  autor_nombre text not null,
  motivo text not null,
  observacion text,
  creada_en timestamptz not null default now()
);

create index notas_internas_empleado_idx on notas_internas (empleado_id);

alter table notas_internas enable row level security;

-- Solo administradores (admin_rrhh de la empresa o superadmin) ven y gestionan.
create policy notas_internas_admin on notas_internas for all
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

comment on table notas_internas is
  'Notas internas del empleado, visibles solo para administradores.';
