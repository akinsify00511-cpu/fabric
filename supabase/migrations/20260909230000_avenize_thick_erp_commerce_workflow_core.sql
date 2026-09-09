-- Avenize thick ERP / commerce / workflow core.
-- Reference architecture: ERPNext accounting discipline, Saleor API-first commerce,
-- Medusa modular workflows. Implemented natively in Avenize; no runtime dependency.

create table if not exists public.avenize_stock_locations (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  code text not null, name text not null, location_type text not null default 'warehouse',
  address text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(business_id, code)
);
create table if not exists public.avenize_inventory_ledger (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, product_id uuid,
  location_id uuid references public.avenize_stock_locations(id), movement_type text not null,
  quantity numeric not null, unit_cost numeric not null default 0, reference_type text,
  reference_id uuid, occurred_at timestamptz not null default now(), created_at timestamptz not null default now(),
  constraint inventory_movement_type_chk check (movement_type in ('receipt','issue','transfer_in','transfer_out','adjustment','reservation','release'))
);
create table if not exists public.avenize_suppliers (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, name text not null,
  email text, phone text, tax_id text, currency text not null default 'NGN', payment_terms_days integer not null default 30,
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,name)
);
create table if not exists public.avenize_goods_receipts (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, purchase_order_id uuid references public.purchase_orders(id),
  supplier_id uuid references public.avenize_suppliers(id), receipt_number text not null, status text not null default 'draft',
  received_at timestamptz, received_by uuid, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,receipt_number)
);
create table if not exists public.avenize_payment_allocations (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, payment_reference text not null,
  invoice_id uuid references public.invoices(id), allocated_amount numeric not null, currency text not null default 'NGN',
  allocated_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(business_id,payment_reference,invoice_id)
);
create table if not exists public.avenize_fiscal_periods (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, period_start date not null, period_end date not null,
  status text not null default 'open', closed_at timestamptz, closed_by uuid, created_at timestamptz not null default now(),
  constraint fiscal_period_dates_chk check (period_end >= period_start), unique(business_id,period_start,period_end)
);
create table if not exists public.avenize_cost_centers (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, code text not null, name text not null,
  parent_id uuid references public.avenize_cost_centers(id), is_active boolean not null default true, created_at timestamptz not null default now(), unique(business_id,code)
);
create table if not exists public.avenize_country_rules (
  id uuid primary key default gen_random_uuid(), country_code text not null, rule_type text not null, rule_key text not null,
  rule_value jsonb not null default '{}'::jsonb, is_active boolean not null default true, effective_from date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(country_code,rule_type,rule_key)
);
create table if not exists public.avenize_workflow_executions (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, workflow_key text not null, reference_type text, reference_id uuid,
  status text not null default 'pending', current_step integer not null default 0, input jsonb not null default '{}'::jsonb, output jsonb not null default '{}'::jsonb,
  error text, idempotency_key text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,workflow_key,idempotency_key)
);
create table if not exists public.avenize_integration_events (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, integration_id uuid references public.integrations(id), event_type text not null,
  direction text not null, idempotency_key text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'pending', attempts integer not null default 0,
  last_error text, next_attempt_at timestamptz, processed_at timestamptz, created_at timestamptz not null default now(), unique(business_id,integration_id,event_type,idempotency_key)
);

do $$ declare t text; begin
  foreach t in array array['avenize_stock_locations','avenize_inventory_ledger','avenize_suppliers','avenize_goods_receipts','avenize_payment_allocations','avenize_fiscal_periods','avenize_cost_centers','avenize_workflow_executions','avenize_integration_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_select_business',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert_business',t);
    execute format('drop policy if exists %I on public.%I',t||'_update_business',t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_select_business',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_insert_business',t);
    execute format('create policy %I on public.%I for update to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1)) with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_update_business',t);
  end loop;
end $$;
create index if not exists idx_avenize_inventory_ledger_business_product on public.avenize_inventory_ledger(business_id,product_id,occurred_at desc);
create index if not exists idx_avenize_inventory_ledger_location on public.avenize_inventory_ledger(location_id,occurred_at desc);
create index if not exists idx_avenize_workflow_executions_status on public.avenize_workflow_executions(business_id,status,created_at desc);
create index if not exists idx_avenize_integration_events_pending on public.avenize_integration_events(status,next_attempt_at) where status in ('pending','retry');
create or replace function public.get_stock_balance(p_business_id uuid,p_product_id uuid,p_location_id uuid default null)
returns numeric language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select coalesce(sum(case when movement_type in ('receipt','transfer_in','release','adjustment') then quantity when movement_type in ('issue','transfer_out','reservation') then -quantity else 0 end),0)
  from public.avenize_inventory_ledger where business_id=p_business_id and product_id=p_product_id and (p_location_id is null or location_id=p_location_id);
$$;
revoke execute on function public.get_stock_balance(uuid,uuid,uuid) from public, anon;
grant execute on function public.get_stock_balance(uuid,uuid,uuid) to authenticated;
create or replace function public.get_trial_balance(p_business_id uuid)
returns table(account_id uuid, account_code text, account_name text, debit numeric, credit numeric, balance numeric)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select a.id,a.code,a.name,coalesce(sum(jl.debit),0),coalesce(sum(jl.credit),0),coalesce(sum(jl.debit-jl.credit),0)
  from public.accounts a left join public.journal_lines jl on jl.account_id=a.id and jl.business_id=a.business_id
  where a.business_id=p_business_id group by a.id,a.code,a.name order by a.code;
$$;
revoke execute on function public.get_trial_balance(uuid) from public, anon;
grant execute on function public.get_trial_balance(uuid) to authenticated;
