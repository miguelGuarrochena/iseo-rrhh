-- ============================================================
-- Migration 70: close IND-04 / IND-06b — empresa_de_documento_firma
-- tenant oracle
--
-- The helper exists only so RLS on documento_firma_destinatarios can
-- read documentos_firma.empresa_id without recursive policy loops
-- (mig 40). It is NOT a product RPC for clients.
--
-- Fix:
--   1. Return empresa_id only for superadmin OR caller's own tenant.
--      Cross-tenant / missing / unauthorized → NULL (no oracle).
--   2. REVOKE EXECUTE from anon/public; GRANT authenticated only
--      (RLS policy expressions run as the session role).
-- Idempotent.
-- ============================================================

create or replace function public.empresa_de_documento_firma(doc_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.empresa_id
  from public.documentos_firma d
  where d.id = doc_id
    and (
      es_superadmin()
      or (
        auth_empresa() is not null
        and d.empresa_id = auth_empresa()
      )
    );
$$;

comment on function public.empresa_de_documento_firma(uuid) is
  'RLS helper: empresa_id of a firma document only when caller is superadmin or the document belongs to auth_empresa(). Never leaks other tenants.';

revoke all on function public.empresa_de_documento_firma(uuid) from public;
revoke all on function public.empresa_de_documento_firma(uuid) from anon;
grant execute on function public.empresa_de_documento_firma(uuid) to authenticated;

notify pgrst, 'reload schema';
