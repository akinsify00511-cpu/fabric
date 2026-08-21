-- ============================================================================
-- Riverways account management: backing store + admin-gated RPCs for the
-- accounts panel (riverways_admin_list_accounts / riverways_assign_account_type).
-- The UI existed without these functions — this migration closes the drift.
-- Account type is a platform-operations label; it is NOT staff.role and
-- grants no tenant permissions by itself.
-- ============================================================================

create table if not exists public.riverways_account_types (
  user_id uuid primary key,
  account_type text not null check (account_type in
    ('owner','admin','manager','staff','sales','marketing','finance','operations','viewer')),
  assigned_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.riverways_account_types enable row level security;

drop policy if exists riverways_account_types_no_client on public.riverways_account_types;
create policy riverways_account_types_no_client on public.riverways_account_types
  for all to authenticated using (false) with check (false);

create or replace function public.riverways_admin_list_accounts(p_search text default null)
returns table (id uuid, email text, created_at timestamptz, account_type text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_riverways_admin() then return; end if;
  return query
    select u.id, u.email, u.created_at, t.account_type
    from auth.users u
    left join public.riverways_account_types t on t.user_id = u.id
    where p_search is null or u.email ilike '%'||p_search||'%'
    order by u.created_at desc
    limit 200;
end $$;

create or replace function public.riverways_assign_account_type(p_user_id uuid, p_account_type text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_riverways_admin() then return false; end if;
  if p_account_type not in ('owner','admin','manager','staff','sales','marketing','finance','operations','viewer') then
    return false;
  end if;
  insert into public.riverways_account_types (user_id, account_type, assigned_by, updated_at)
  values (p_user_id, p_account_type, auth.uid(), now())
  on conflict (user_id) do update set
    account_type = excluded.account_type,
    assigned_by = excluded.assigned_by,
    updated_at = now();
  perform public.emit_platform_activity(
    'security.permission_changed', 'accounts', null, 'completed', 'warn', 'web-app', null,
    jsonb_build_object('target_user', p_user_id, 'account_type', p_account_type));
  return true;
end $$;

revoke all on function public.riverways_admin_list_accounts(text) from public, anon;
revoke all on function public.riverways_assign_account_type(uuid, text) from public, anon;
grant execute on function public.riverways_admin_list_accounts(text) to authenticated;
grant execute on function public.riverways_assign_account_type(uuid, text) to authenticated;
