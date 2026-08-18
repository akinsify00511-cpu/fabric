create schema if not exists private;

create or replace function private.can_access_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from businesses b
    join organization_memberships om on om.organization_id = b.organization_id
    where b.id = target_business_id
      and om.user_id = (select auth.uid())
      and om.is_active = true
  );
$$;

create table if not exists public.market_intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location text not null,
  granularity text not null check (granularity in ('country','region','city','area')),
  leads integer not null default 0 check (leads >= 0),
  opportunities integer not null default 0 check (opportunities >= 0),
  won_deals integer not null default 0 check (won_deals >= 0),
  revenue numeric not null default 0 check (revenue >= 0),
  average_deal_value numeric not null default 0 check (average_deal_value >= 0),
  conversion_rate numeric not null default 0 check (conversion_rate >= 0 and conversion_rate <= 1),
  period_start date not null,
  period_end date not null,
  source text not null default 'crm',
  metadata jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, location, granularity, period_start, period_end)
);

create index if not exists market_intelligence_signals_business_idx on public.market_intelligence_signals (business_id, period_end desc);
create index if not exists market_intelligence_signals_org_idx on public.market_intelligence_signals (organization_id, period_end desc);

alter table public.market_intelligence_signals enable row level security;

drop policy if exists "market signals visible to authorized users" on public.market_intelligence_signals;
create policy "market signals visible to authorized users" on public.market_intelligence_signals
for select to authenticated using ((select private.can_access_business(business_id)));

drop policy if exists "market signals writable by authorized users" on public.market_intelligence_signals;
create policy "market signals writable by authorized users" on public.market_intelligence_signals
for all to authenticated
using ((select private.can_access_business(business_id)))
with check (
  (select private.can_access_business(business_id))
  and organization_id = (select organization_id from public.businesses where id = market_intelligence_signals.business_id)
);

grant select, insert, update, delete on public.market_intelligence_signals to authenticated;
revoke all on public.market_intelligence_signals from anon;
