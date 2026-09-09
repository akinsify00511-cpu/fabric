-- Thick-core financial controls: posting guardrails and reconciliation state.

create table if not exists public.avenize_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  reconciliation_type text not null check (reconciliation_type in ('bank','receivables','payables','inventory','trial_balance')),
  period_start date,
  period_end date,
  status text not null default 'open' check (status in ('open','matched','exception','closed')),
  expected_total numeric not null default 0,
  actual_total numeric not null default 0,
  variance numeric generated always as (expected_total-actual_total) stored,
  exception_count integer not null default 0,
  created_by uuid,
  closed_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.avenize_financial_controls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  control_key text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,control_key)
);

alter table public.avenize_reconciliation_runs enable row level security;
alter table public.avenize_financial_controls enable row level security;

drop policy if exists avenize_reconciliation_runs_select on public.avenize_reconciliation_runs;
drop policy if exists avenize_reconciliation_runs_insert on public.avenize_reconciliation_runs;
drop policy if exists avenize_reconciliation_runs_update on public.avenize_reconciliation_runs;
create policy avenize_reconciliation_runs_select on public.avenize_reconciliation_runs for select to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1));
create policy avenize_reconciliation_runs_insert on public.avenize_reconciliation_runs for insert to authenticated with check (business_id=(select business_id from public.get_current_staff() limit 1));
create policy avenize_reconciliation_runs_update on public.avenize_reconciliation_runs for update to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1)) with check (business_id=(select business_id from public.get_current_staff() limit 1));

drop policy if exists avenize_financial_controls_select on public.avenize_financial_controls;
drop policy if exists avenize_financial_controls_insert on public.avenize_financial_controls;
drop policy if exists avenize_financial_controls_update on public.avenize_financial_controls;
create policy avenize_financial_controls_select on public.avenize_financial_controls for select to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1));
create policy avenize_financial_controls_insert on public.avenize_financial_controls for insert to authenticated with check (business_id=(select business_id from public.get_current_staff() limit 1));
create policy avenize_financial_controls_update on public.avenize_financial_controls for update to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1)) with check (business_id=(select business_id from public.get_current_staff() limit 1));

create index if not exists idx_avenize_reconciliation_runs_business on public.avenize_reconciliation_runs(business_id,created_at desc);
create index if not exists idx_avenize_financial_controls_business on public.avenize_financial_controls(business_id,control_key);

insert into public.avenize_financial_controls(business_id,control_key,configuration)
select id,'double_entry',jsonb_build_object('required',true) from public.businesses
on conflict (business_id,control_key) do nothing;
insert into public.avenize_financial_controls(business_id,control_key,configuration)
select id,'period_lock',jsonb_build_object('required',true) from public.businesses
on conflict (business_id,control_key) do nothing;
insert into public.avenize_financial_controls(business_id,control_key,configuration)
select id,'audit_trail',jsonb_build_object('required',true) from public.businesses
on conflict (business_id,control_key) do nothing;
