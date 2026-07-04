-- Turnos asignados a los empleados (para comparar con la fichada real).

create table turnos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  fecha date not null,
  hora_entrada time not null,
  hora_salida time not null,
  creado_en timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index turnos_empleado_idx on turnos (empleado_id);
create index turnos_fecha_idx on turnos (fecha);

alter table turnos enable row level security;

-- El empleado ve sus turnos; los gestores gestionan los de su empresa.
create policy turnos_select on turnos for select
  using (
    es_superadmin()
    or (empresa_id = auth_empresa() and (es_gestor() or empleado_id = auth_empleado()))
  );
create policy turnos_gestion on turnos for all
  using (es_superadmin() or (es_gestor() and empresa_id = auth_empresa()))
  with check (es_superadmin() or empresa_id = auth_empresa());

comment on table turnos is
  'Turnos asignados por día; se comparan con los fichajes para el control.';
