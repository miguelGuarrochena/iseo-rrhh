-- ============================================================
-- Resumen semanal por mail a RRHH.
--
-- 1. Tabla de dedup: si el cron corre dos veces el mismo lunes (reintento
--    de Vercel, deploy, ejecución manual), la segunda no manda nada. La
--    marca se inserta ANTES de mandar; el unique la vuelve idempotente.
-- 2. Limpieza del default de config_plataforma: `emailAvisos` y
--    `pushHabilitado` nunca los leyó nadie. El remitente sale de
--    EMAIL_FROM y no hay push. Se sacan del default y de la fila 1 para
--    que la config guardada coincida con lo que la app realmente usa.
-- ============================================================

create table if not exists avisos_resumen_semanal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  semana date not null, -- lunes de la semana enviada
  enviado_en timestamptz not null default now(),
  unique (empresa_id, semana)
);

alter table avisos_resumen_semanal enable row level security;

-- Escribe el cron con la service key (saltea RLS). Lectura solo superadmin.
drop policy if exists avisos_resumen_superadmin on avisos_resumen_semanal;
create policy avisos_resumen_superadmin
  on avisos_resumen_semanal
  for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.rol = 'superadmin'
    )
  );

comment on table avisos_resumen_semanal is
  'Marca de resumen semanal ya enviado por empresa y semana (dedup del cron).';

-- ---------- Config de plataforma sin las claves muertas ----------

alter table config_plataforma
  alter column config set default '{
    "metodosFichajeDefault": ["celular"],
    "toleranciaDefaultMin": 10,
    "horaEntradaDefault": "08:00",
    "horaSalidaDefault": "17:00",
    "diasAvisoDefault": 30,
    "resumenSemanalEmail": true
  }'::jsonb;

update config_plataforma
set config = (config - 'emailAvisos' - 'pushHabilitado')
  || jsonb_build_object(
       'resumenSemanalEmail',
       coalesce(config -> 'resumenSemanalEmail', 'true'::jsonb)
     )
where id = 1;
