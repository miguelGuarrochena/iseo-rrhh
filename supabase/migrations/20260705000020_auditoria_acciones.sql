-- ============================================================
-- Auditoría de acciones sensibles
-- Registro best-effort desde la app: quién hizo qué y sobre qué entidad.
-- ============================================================

create table if not exists auditoria_acciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  actor_id uuid references usuarios (id) on delete set null,
  actor_nombre text not null default '',
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb,
  creada_en timestamptz not null default now()
);

create index if not exists auditoria_empresa_fecha_idx
  on auditoria_acciones (empresa_id, creada_en desc);

alter table auditoria_acciones enable row level security;

create policy auditoria_insert_autenticado on auditoria_acciones for insert
  with check (
    empresa_id = auth_empresa()
    and actor_id = auth.uid()
  );

create policy auditoria_select_gestores on auditoria_acciones for select
  using (
    es_superadmin()
    or (es_gestor() and empresa_id = auth_empresa())
  );
