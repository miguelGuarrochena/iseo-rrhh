-- ============================================================
-- Finanzas del negocio (ISEO / superadmin): facturación por empresa,
-- ingresos y gastos. Es información GLOBAL de ISEO, no de cada tenant:
-- por eso solo el superadmin puede leerla/escribirla.
-- ============================================================

-- Abono mensual que cada empresa cliente le paga a ISEO.
alter table empresas
  add column if not exists abono_mensual numeric not null default 0;

-- Movimientos: ingresos (opcionalmente asociados a una empresa) y gastos.
create table if not exists movimientos_financieros (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  concepto text not null,
  categoria text,
  empresa_id uuid references empresas (id) on delete set null,
  monto numeric not null default 0,
  fecha date not null default current_date,
  periodo text not null, -- 'YYYY-MM'
  creado_en timestamptz not null default now()
);

create index if not exists idx_movimientos_periodo
  on movimientos_financieros (periodo);
create index if not exists idx_movimientos_empresa
  on movimientos_financieros (empresa_id);

alter table movimientos_financieros enable row level security;

-- Solo el superadmin ve y gestiona las finanzas del negocio.
drop policy if exists movimientos_solo_superadmin on movimientos_financieros;
create policy movimientos_solo_superadmin
  on movimientos_financieros
  for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'superadmin'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'superadmin'
    )
  );

comment on table movimientos_financieros is
  'Ingresos y gastos de ISEO (negocio global). Solo superadmin.';
comment on column empresas.abono_mensual is
  'Abono mensual que la empresa cliente le paga a ISEO.';
