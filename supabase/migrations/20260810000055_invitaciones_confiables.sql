-- ============================================================
-- Invitaciones confiables (QA BUG-001 / BUG-002)
--
-- Completar una cuenta a medias leía rol / empresa_id / empleado_id de
-- `auth.users.raw_user_meta_data`. Esa metadata la puede escribir un
-- signup abierto: un atacante se inventaba admin_rrhh o el legajo de un
-- compañero, aparecía en Permisos como "sin perfil" y el admin legítimo
-- materializaba el ataque al pulsar "Completar el alta".
--
-- La fuente de verdad pasa a ser esta tabla, escrita sólo por las APIs
-- de invitación (service role). Completar / listar huérfanas / reenviar
-- sin perfil leen de acá, nunca de la metadata del usuario.
-- ============================================================

create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  rol text not null
    check (rol in ('admin_rrhh', 'supervisor', 'empleado')),
  nombre_completo text not null default '',
  empleado_id uuid references public.empleados (id) on delete set null,
  auth_user_id uuid,
  creada_por uuid,
  creada_en timestamptz not null default now(),
  -- Cuándo se creó (o reparó) el perfil a partir de esta invitación.
  perfil_creado_en timestamptz,
  constraint invitaciones_email_empresa_unico unique (empresa_id, email)
);

create index if not exists invitaciones_auth_user_id_idx
  on public.invitaciones (auth_user_id)
  where auth_user_id is not null;

create index if not exists invitaciones_email_idx
  on public.invitaciones (email);

comment on table public.invitaciones is
  'Invitaciones emitidas por la plataforma. Única fuente de autoridad para completar cuentas a medias (no usar user_metadata).';

alter table public.invitaciones enable row level security;

-- El browser no toca esta tabla: todo pasa por APIs con service role.
-- Sin policies de SELECT/INSERT/UPDATE/DELETE para `authenticated`.

-- ---------- Backfill de invitaciones reales sin perfil ----------
-- Sólo cuentas que nacieron como invitación (invited_at). Un signup
-- suelto con metadata envenenada no entra acá.
insert into public.invitaciones (
  email,
  empresa_id,
  rol,
  nombre_completo,
  empleado_id,
  auth_user_id,
  creada_en
)
select
  lower(trim(u.email)),
  (u.raw_user_meta_data ->> 'empresa_id')::uuid,
  case
    when u.raw_user_meta_data ->> 'rol' in ('admin_rrhh', 'supervisor', 'empleado')
      then u.raw_user_meta_data ->> 'rol'
    else 'empleado'
  end,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'nombre_completo', ''),
    u.email
  ),
  -- Legajo sólo si pertenece a la misma empresa (anti-IDOR).
  case
    when em.id is not null then em.id
    else null
  end,
  u.id,
  coalesce(u.invited_at, u.created_at, now())
from auth.users u
left join public.usuarios p on p.id = u.id
left join public.empleados em
  on u.raw_user_meta_data ->> 'empleado_id' ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and em.id = (u.raw_user_meta_data ->> 'empleado_id')::uuid
  and em.empresa_id = (u.raw_user_meta_data ->> 'empresa_id')::uuid
where p.id is null
  and u.invited_at is not null
  and u.email is not null
  and u.raw_user_meta_data ->> 'empresa_id' ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.empresas e
    where e.id = (u.raw_user_meta_data ->> 'empresa_id')::uuid
  )
on conflict (empresa_id, email) do nothing;

notify pgrst, 'reload schema';
