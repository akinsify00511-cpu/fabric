-- ============================================================================
-- Auth / onboarding identity resolver hardening
--
-- A returning authenticated user must never be classified as a new onboarding
-- user merely because a normal `staff` SELECT is delayed, RLS-filtered, or an
-- older `get_current_staff()` implementation is missing/drifted.
--
-- This SECURITY DEFINER RPC is the canonical read-only identity boundary for
-- the browser auth layer. It answers one question: does auth.uid() already
-- belong to a business, and if so, which staff/business context is it?
-- It performs no writes and never creates an organization/business.
-- ============================================================================

create or replace function public.resolve_current_user_context()
returns table (
  user_id uuid,
  staff_id uuid,
  business_id uuid,
  role text,
  active boolean,
  onboarding_required boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() as user_id,
    s.id as staff_id,
    s.business_id,
    s.role,
    coalesce(s.active, true) as active,
    false as onboarding_required
  from public.staff s
  where s.user_id = auth.uid()
  order by
    case when coalesce(s.active, true) then 0 else 1 end,
    s.created_at asc nulls last,
    s.id asc
  limit 1;
$$;

revoke execute on function public.resolve_current_user_context() from public, anon;
grant execute on function public.resolve_current_user_context() to authenticated;

comment on function public.resolve_current_user_context() is
  'Canonical authenticated identity resolver for Avenize onboarding/auth routing. Existing staff membership always wins over onboarding; read-only, SECURITY DEFINER, auth.uid()-scoped.';
