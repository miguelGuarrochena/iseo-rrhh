-- ============================================================
-- Feriados por empresa.
--
-- Pedido del cliente: "poder cargar feriados, para computar días
-- hábiles y si trabajan para pagar las horas extras".
--
-- Los sábados y domingos ya se detectaban solos (`diasHabilesEntre`),
-- pero los feriados no existían en ninguna parte: un 25 de mayo dentro
-- de unas vacaciones se contaba como día hábil.
--
-- La tabla es por empresa a propósito. Los feriados nacionales son
-- iguales para todos, pero cada empresa suma sus días no laborables:
-- el puente que decide tomarse, el día del gremio, el aniversario de la
-- planta. Guardarlos juntos evita una segunda tabla y una unión.
-- ============================================================

do $$ begin
  create type tipo_feriado as enum ('nacional', 'puente', 'empresa');
exception when duplicate_object then null;
end $$;

create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  fecha date not null,
  nombre text not null,
  tipo tipo_feriado not null default 'nacional',
  -- Si es false, se trabaja pero se paga con recargo (no laborable).
  no_laborable boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, fecha)
);

create index if not exists feriados_empresa_fecha_idx
  on feriados (empresa_id, fecha);

alter table feriados enable row level security;

-- Todos los de la empresa lo leen: el calendario del feriado le sirve
-- igual al colaborador que pide vacaciones.
drop policy if exists feriados_select on feriados;
create policy feriados_select on feriados for select
  using (es_superadmin() or empresa_id = auth_empresa());

-- Cargarlos y borrarlos es de RRHH.
drop policy if exists feriados_gestion on feriados;
create policy feriados_gestion on feriados for all
  using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  )
  with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

notify pgrst, 'reload schema';
