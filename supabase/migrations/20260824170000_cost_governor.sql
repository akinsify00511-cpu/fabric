-- Cost Governor + customer infrastructure-cost ledger (C15/C16).
-- The provider catalog (AI/email/storage/API/SMS/payments) is tunable by
-- operators; limits are per-plan defaults with per-business overrides;
-- metering counts usage_events; the ledger prices it. Anti-fabrication
-- (§22): no unpriced provider usage is attributed to the margin — it stays in
-- a separate 'unpriced' bucket and the margin excludes it until a rate exists.

create table if not exists public.provider_cost_catalog (
  provider_key text primary key,
  label text not null,
  unit text not null,
  cost_cents_per_unit numeric not null check (cost_cents_per_unit >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.provider_cost_catalog enable row level security;
drop policy if exists provider_cost_catalog_read on public.provider_cost_catalog;
create policy provider_cost_catalog_read on public.provider_cost_catalog
  for select to authenticated using (true);

-- Per-plan defaults + per-business override rows.
create table if not exists public.cost_governor_limits (
  id uuid primary key default gen_random_uuid(),
  plan_code text null,
  business_id uuid null,
  provider_key text not null,
  monthly_unit_limit numeric null,
  overage_action text not null default 'notify'
    check (overage_action in ('allow', 'notify', 'throttle', 'block')),
  updated_at timestamptz not null default now(),
  check (plan_code is not null or business_id is not null)
);

create unique index if not exists idx_cost_governor_limits_plan
  on public.cost_governor_limits (plan_code, provider_key)
  where business_id is null;
create unique index if not exists idx_cost_governor_limits_business
  on public.cost_governor_limits (business_id, provider_key)
  where business_id is not null;

alter table public.cost_governor_limits enable row level security;
drop policy if exists cost_governor_limits_select on public.cost_governor_limits;
create policy cost_governor_limits_select on public.cost_governor_limits
  for select to authenticated
  using (business_id is null or business_id in (select business_id from public.get_current_staff()));
drop policy if exists cost_governor_limits_write on public.cost_governor_limits;
create policy cost_governor_limits_write on public.cost_governor_limits
  for all to authenticated
  using (business_id in (
    select business_id from public.get_current_staff() cs where cs.role in ('owner','admin')
  ))
  with check (business_id in (
    select business_id from public.get_current_staff() cs where cs.role in ('owner','admin')
  ));

-- Usage metered by month; the ledger materializes one row per business/month.
create table if not exists public.usage_meter_monthly (
  business_id uuid not null,
  month date not null,
  provider_key text not null,
  units numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, month, provider_key)
);

alter table public.usage_meter_monthly enable row level security;
drop policy if exists usage_meter_monthly_read on public.usage_meter_monthly;
create policy usage_meter_monthly_read on public.usage_meter_monthly
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

create table if not exists public.customer_cost_ledger (
  business_id uuid not null,
  month date not null,
  revenue_cents numeric not null default 0,
  priced_cost_cents numeric not null default 0,
  gross_margin_cents numeric not null default 0,
  unpriced_units numeric not null default 0,
  notes text[] not null default '{}',
  computed_at timestamptz not null default now(),
  primary key (business_id, month)
);

alter table public.customer_cost_ledger enable row level security;
drop policy if exists customer_cost_ledger_read on public.customer_cost_ledger;
create policy customer_cost_ledger_read on public.customer_cost_ledger
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

-- Provider mapping (tunable): usage_events module_key -> provider_key.
create table if not exists public.provider_module_map (
  module_key text primary key,
  provider_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.provider_module_map enable row level security;
drop policy if exists provider_module_map_read on public.provider_module_map;
create policy provider_module_map_read on public.provider_module_map
  for select to authenticated using (true);

insert into public.provider_cost_catalog (provider_key, label, unit, cost_cents_per_unit) values
  ('ai',      'AI inference',              'query',           3),
  ('email',   'Outbound email',            'message',         0.8),
  ('sms',     'SMS (Termii)',              'message',         2.5),
  ('storage', 'Storage (avg 10MB/event)',  'gb-month',        25),
  ('payments','Payment gateway (flat fee)','transaction fee', 31)
on conflict (provider_key) do nothing;

insert into public.provider_module_map (module_key, provider_key) values
  ('ask','ai'), ('ai','ai'), ('copilot','ai'),
  ('sms','sms'), ('emails','email'), ('email','email'), ('campaigns','email'),
  ('docs','storage'), ('files','storage'), ('knowledge','storage'), ('documents','storage')
on conflict (module_key) do nothing;

insert into public.cost_governor_limits (plan_code, provider_key, monthly_unit_limit, overage_action) values
  ('free', 'ai', 100, 'throttle'),
  ('starter', 'ai', 500, 'notify'),
  ('team', 'ai', 2000, 'notify'),
  ('business', 'ai', 10000, 'allow'),
  ('pro', 'ai', 10000, 'allow'),
  ('scale', 'ai', null, 'allow')
on conflict do nothing;

-- Resolution: per-business override (any role-readable) wins over plan default.
create or replace function public.cost_governor_resolve_plan(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  if to_regclass('public.business_entitlements') is not null then
    select plan into v_plan from public.business_entitlements where business_id = p_business_id;
  end if;
  if v_plan is null and to_regclass('public.business_subscriptions') is not null then
    select bs.plan_code into v_plan from public.business_subscriptions bs
    where bs.business_id = p_business_id order by bs.created_at desc limit 1;
  end if;
  return coalesce(lower(v_plan), 'free');
end $$;

create or replace function public.cost_governor_limit_for(
  p_business_id uuid,
  p_provider_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := public.cost_governor_resolve_plan(p_business_id);
  v_limit numeric;
  v_action text;
  v_used numeric;
  v_month date := date_trunc('month', now())::date;
begin
  select l.monthly_unit_limit, l.overage_action
  into v_limit, v_action
  from public.cost_governor_limits l
  where l.business_id = p_business_id and l.provider_key = p_provider_key;
  if v_action is null then
    select l.monthly_unit_limit, l.overage_action
    into v_limit, v_action
    from public.cost_governor_limits l
    where l.plan_code = v_plan and l.provider_key = p_provider_key
      and l.business_id is null;
  end if;

  select coalesce(sum(u.units), 0) into v_used
  from public.usage_meter_monthly u
  where u.business_id = p_business_id and u.provider_key = p_provider_key
    and u.month = v_month;

  return jsonb_build_object(
    'provider', p_provider_key,
    'plan', v_plan,
    'month', v_month,
    'used_units', v_used,
    'limit_units', v_limit,
    'overage_action', coalesce(v_action, 'allow'),
    'blocked', (v_limit is not null and v_used >= v_limit and coalesce(v_action, 'allow') = 'block'),
    'throttled', (v_limit is not null and v_used >= v_limit and coalesce(v_action, 'allow') = 'throttle'),
    'over_limit', (v_limit is not null and v_used >= v_limit)
  );
end $$;

-- Rollup: aggregate usage_events by month through the module map. Preserves
-- prior accuracy (complete rescan would be expensive — delta insert since
-- last updated_at per row; on a small volume this stays cheap).
create or replace function public.cost_governor_rollup(p_business_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid uuid;
  v_inserted int := 0;
begin
  for v_bid in
    select id from public.businesses
    where p_business_id is null or id = p_business_id
  loop
    insert into public.usage_meter_monthly (business_id, month, provider_key, units, updated_at)
    select v_bid,
           date_trunc('month', ue.occurred_at)::date,
           mm.provider_key,
           count(*),
           now()
    from public.usage_events ue
    join public.provider_module_map mm on mm.module_key = ue.module_key
    where ue.business_id = v_bid
    group by date_trunc('month', ue.occurred_at)::date, mm.provider_key
    on conflict (business_id, month, provider_key)
    do update set units = excluded.units, updated_at = now();
    v_inserted := v_inserted + 1;
  end loop;
  return v_inserted;
end $$;

-- Ledger materialization: revenue from successful payment ledger entries,
-- priced usage from the meter through the catalog; unpriced usage stays out
-- of the margin and is flagged honestly.
create or replace function public.cost_governor_compute_ledger(
  p_business_id uuid,
  p_month date default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := coalesce(p_month, date_trunc('month', now())::date);
  v_revenue numeric;
  v_priced numeric;
  v_unpriced numeric;
begin
  select coalesce(sum(amount_cents), 0) into v_revenue
  from public.payment_transactions
  where business_id = p_business_id
    and status = 'success'
    and paid_at >= v_month
    and paid_at < v_month + interval '1 month';

  select coalesce(sum(u.units * c.cost_cents_per_unit), 0) into v_priced
  from public.usage_meter_monthly u
  join public.provider_cost_catalog c on c.provider_key = u.provider_key and c.active
  where u.business_id = p_business_id and u.month = v_month;

  select coalesce(sum(u.units), 0) into v_unpriced
  from public.usage_meter_monthly u
  left join public.provider_cost_catalog c on c.provider_key = u.provider_key and c.active
  where u.business_id = p_business_id and u.month = v_month and c.provider_key is null;

  insert into public.customer_cost_ledger (business_id, month, revenue_cents, priced_cost_cents, gross_margin_cents, unpriced_units, notes, computed_at)
  values (
    p_business_id, v_month, v_revenue, v_priced, v_revenue - v_priced, v_unpriced,
    case when v_unpriced > 0 then array['unpriced usage excluded from margin'] else '{}' end,
    now()
  )
  on conflict (business_id, month)
  do update set revenue_cents = excluded.revenue_cents,
    priced_cost_cents = excluded.priced_cost_cents,
    gross_margin_cents = excluded.gross_margin_cents,
    unpriced_units = excluded.unpriced_units,
    notes = excluded.notes,
    computed_at = now();
  return 1;
end $$;

-- Headline view for a business: current-month limits + ledger history.
create or replace function public.cost_governor(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_limits jsonb;
  v_ledger jsonb;
begin
  -- SECURITY DEFINER + a business_id param REQUIRES a membership gate
  -- (Session-18 lesson): unauthorized callers get an empty payload, never
  -- another business's cost/margin data.
  -- Membership + owner/admin (margin data is not for every staff member).
  if auth.uid() is null or not exists (
    select 1 from public.get_current_staff() cs
    where cs.business_id = p_business_id and cs.role in ('owner','admin')
  ) then
    return jsonb_build_object('authorized', false);
  end if;

  perform public.cost_governor_rollup(p_business_id);
  perform public.cost_governor_compute_ledger(p_business_id);

  select coalesce(jsonb_agg(public.cost_governor_limit_for(p_business_id, c.provider_key)), '[]'::jsonb)
  into v_limits
  from public.provider_cost_catalog c where c.active;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.month desc), '[]'::jsonb)
  into v_ledger
  from public.customer_cost_ledger l
  where l.business_id = p_business_id;

  return jsonb_build_object(
    'authorized', true,
    'business_id', p_business_id,
    'month', v_month,
    'limits', v_limits,
    'ledger', v_ledger
  );
end $$;

revoke execute on function public.cost_governor(uuid) from public, anon;
revoke execute on function public.cost_governor_rollup(uuid) from public, anon;
revoke execute on function public.cost_governor_compute_ledger(uuid, date) from public, anon;
revoke execute on function public.cost_governor_limit_for(uuid, text) from public, anon;
revoke execute on function public.cost_governor_resolve_plan(uuid) from public, anon;

grant execute on function public.cost_governor(uuid) to authenticated;
grant execute on function public.cost_governor_limit_for(uuid, text) to authenticated;
grant execute on function public.cost_governor_resolve_plan(uuid) to service_role;

-- Daily rollup for every business (guard-ed no-op when pg_cron missing).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and to_regclass('public.usage_meter_monthly') is not null then
    perform cron.schedule(
      'avenize-cost-governor-rollup',
      '15 1 * * *',
      'select public.cost_governor_rollup(null)'
    );
  end if;
exception when others then null;
end $$;
