-- ============================================================
-- Objetivos de ventas: un objetivo mensual por empresa.
--
-- Módulo opcional comercializable (`config.modulos.objetivos-ventas`).
-- Independiente de remuneraciones, recibos y fichaje. El progreso se
-- carga a mano. El bono es informativo: no se liquida acá.
--
-- En empresas que ya existen arranca APAGADO: ISEO lo prende desde
-- Empresa → Módulos. Ausente en config = encendido (regla de módulos),
-- por eso se escribe false explícito.
-- ============================================================

create table if not exists public.objetivos_venta_mes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  periodo text not null,
  monto_objetivo numeric(14,2) not null check (monto_objetivo >= 0),
  monto_alcanzado numeric(14,2) not null default 0 check (monto_alcanzado >= 0),
  bono_monto numeric(14,2) check (bono_monto is null or bono_monto >= 0),
  notas text,
  actualizado_en timestamptz not null default now(),
  unique (empresa_id, periodo)
);

comment on table public.objetivos_venta_mes is
  'Objetivo de ventas de un mes, a nivel empresa. Progreso manual.';

create index if not exists objetivos_venta_mes_empresa_periodo_idx
  on public.objetivos_venta_mes (empresa_id, periodo desc);

alter table public.objetivos_venta_mes enable row level security;

grant select, insert, update, delete
  on table public.objetivos_venta_mes to authenticated;

create policy objetivos_venta_select on public.objetivos_venta_mes
  for select using (
    es_superadmin() or empresa_id = auth_empresa()
  );

create policy objetivos_venta_insert on public.objetivos_venta_mes
  for insert with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy objetivos_venta_update on public.objetivos_venta_mes
  for update using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  ) with check (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

create policy objetivos_venta_delete on public.objetivos_venta_mes
  for delete using (
    es_superadmin()
    or (auth_rol() = 'admin_rrhh' and empresa_id = auth_empresa())
  );

-- Empresas actuales: el módulo no aparece hasta que ISEO lo prenda.
update public.empresas
set config = jsonb_set(
  coalesce(config, '{}'::jsonb),
  '{modulos}',
  coalesce(config -> 'modulos', '{}'::jsonb) || '{"objetivos-ventas": false}'::jsonb
)
where config #>> '{modulos,objetivos-ventas}' is null;

notify pgrst, 'reload schema';
