-- Avenize canonical data/protocol repair layer.
-- Prevents schema drift from turning an authenticated account into a false
-- onboarding path and makes legacy callers resolve to the same identity model.

create or replace function public.ensure_business_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org_id uuid;
begin
  if new.organization_id is null then
    insert into public.organizations (name)
    values (coalesce(nullif(trim(new.name), ''), 'Avenize Business'))
    returning id into v_org_id;
    new.organization_id := v_org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_business_organization_contract on public.businesses;
create trigger trg_business_organization_contract
before insert or update of organization_id on public.businesses
for each row execute function public.ensure_business_organization();

-- The canonical resolver contract (user_id, staff_id, business_id, role, active,
-- onboarding_required) is established by 20260826180000. 1900 previously re-declared
-- a shrunk 3-column shape with CREATE OR REPLACE, which (a) fails to apply on a fresh
-- chain ("cannot change return type of existing function") and (b) dropped the
-- `active`/`user_id` columns consumers read. Drop-then-create keeps the canonical
-- 6-column contract intact and the chain applying.
drop function if exists public.resolve_current_user_context();

create function public.resolve_current_user_context()
returns table (
  user_id uuid,
  staff_id uuid,
  business_id uuid,
  role text,
  active boolean,
  onboarding_required boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
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

create or replace function public.create_business_and_owner(
  p_business_name text,
  p_industry text default null,
  p_staff_name text default null,
  p_job_title text default null
)
returns table(p_business_id uuid, p_staff_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_staff_id uuid;
  v_organization_id uuid;
  v_user_id uuid := auth.uid();
  v_existing_business uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_business_name, '')), '') is null then
    raise exception 'Business name is required' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select s.business_id into v_existing_business
  from public.staff s
  where s.user_id = v_user_id
  order by s.created_at asc
  limit 1;

  if v_existing_business is not null then
    raise exception 'User already belongs to a business';
  end if;

  insert into public.organizations (name)
  values (trim(p_business_name))
  returning id into v_organization_id;

  insert into public.businesses (name, industry, organization_id)
  values (trim(p_business_name), nullif(trim(p_industry), ''), v_organization_id)
  returning id into v_business_id;

  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (v_organization_id, v_user_id, 'group_admin', true);

  insert into public.staff (
    business_id, user_id, name, role, job_title, member_kind, onboarding_completed, is_active, active
  )
  values (
    v_business_id, v_user_id, coalesce(nullif(trim(p_staff_name), ''), 'Avenize User'),
    'owner', coalesce(nullif(trim(p_job_title), ''), 'Owner'), 'owner', true, true, true
  )
  returning id into v_staff_id;

  return query select v_business_id, v_staff_id;
end;
$$;
revoke execute on function public.create_business_and_owner(text,text,text,text) from public, anon;
grant execute on function public.create_business_and_owner(text,text,text,text) to authenticated;

create or replace function public.refresh_business_metrics()
returns table(metric_key text, status text, sample_size integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_business_id uuid;
begin
  select r.business_id into v_business_id
  from public.resolve_current_user_context() r
  limit 1;
  if v_business_id is null then
    raise exception 'No active business membership' using errcode='42501';
  end if;
  return query select * from public.refresh_business_metrics(v_business_id);
end;
$$;
revoke execute on function public.refresh_business_metrics() from public, anon;
grant execute on function public.refresh_business_metrics() to authenticated;

comment on function public.ensure_business_organization() is 'Data-contract guard: guarantees every business has an organization before NOT NULL enforcement.';
comment on function public.resolve_current_user_context() is 'Canonical authenticated-user membership resolver used by onboarding and app routing.';
comment on function public.create_business_and_owner(text,text,text,text) is 'Idempotent onboarding transaction: auth identity -> organization -> business -> organization membership -> owner staff.';
comment on function public.refresh_business_metrics() is 'Compatibility adapter that resolves the authenticated user business before refreshing metrics.';
