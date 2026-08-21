-- Riverways Platform Admin — protected admin surface distinct from a tenant
-- business. This is NOT a business role; it is the platform operator's
-- command center. The table is RLS-denied to all regular clients (service
-- role only manages). The RPC gate is membership-checked server-side.

create table if not exists public.riverways_admins (
  email text primary key,
  added_by text null,
  created_at timestamptz not null default now()
);

alter table public.riverways_admins enable row level security;

-- Clients must never see the admin roster.
drop policy if exists riverways_admins_no_client on public.riverways_admins;
create policy riverways_admins_no_client on public.riverways_admins
  for all to authenticated using (false) with check (false);

-- The RPC gate: caller must be a member (their auth email is in the
-- allowlist). SECURITY DEFINER so we can read the RLS-denied table but
-- only to verify the caller's own email.
create or replace function public.is_riverways_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := (select email from auth.users where id = auth.uid());
  if v_email is null then return false; end if;
  return exists (
    select 1 from public.riverways_admins where lower(email) = lower(v_email)
  );
end $$;

revoke execute on function public.is_riverways_admin() from public, anon;
grant execute on function public.is_riverways_admin() to authenticated;

-- Overview: aggregate platform state. Aggregate-only — no PII/business rows.
create or replace function public.riverways_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_riverways_admin() then
    return jsonb_build_object('authorized', false);
  end if;

  select jsonb_build_object(
    'authorized', true,
    'businesses', (select count(*) from businesses),
    'staff', (select count(*) from staff where active),
    'recent_errors', (
      select jsonb_agg(jsonb_build_object('id',id,'message',message,'severity',severity,'business_id',business_id,'created_at',created_at))
      from (select id, message, severity, business_id, created_at from platform_error_events order by created_at desc limit 20) s
    ),
    'integrations_ok', (select count(*) from platform_integration_status where last_check_status = 'ok'),
    'integrations_total', (select count(*) from platform_integration_status),
    'open_incidents', (select count(*) from platform_incidents where resolved_at is null)
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.riverways_admin_overview() from public, anon;
grant execute on function public.riverways_admin_overview() to authenticated;
