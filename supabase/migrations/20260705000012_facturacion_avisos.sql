-- ============================================================
-- Registro de avisos de facturación ya enviados, para no repetir la
-- notificación/mail de una misma empresa en un mismo período. Lo escribe
-- el proceso diario (cron) con la clave de servicio. Solo superadmin.
-- ============================================================

create table if not exists avisos_facturacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  periodo text not null, -- 'YYYY-MM'
  -- 'recordatorio' = mail al cliente antes de vencer;
  -- 'vencido' = notificación interna a ISEO al pasar el vencimiento.
  tipo text not null default 'vencido',
  notificado_en timestamptz not null default now(),
  unique (empresa_id, periodo, tipo)
);

alter table avisos_facturacion enable row level security;

-- Solo lectura para superadmin (la escritura la hace el cron con service key,
-- que saltea RLS).
drop policy if exists avisos_factura_superadmin on avisos_facturacion;
create policy avisos_factura_superadmin
  on avisos_facturacion
  for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'superadmin'
    )
  );

comment on table avisos_facturacion is
  'Marca de aviso de impago ya enviado por empresa y período (dedup del cron).';
