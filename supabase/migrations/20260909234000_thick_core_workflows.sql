-- Avenize thick-core workflow contracts.
-- Native implementation of ERPNext/Saleor/Medusa-grade transaction discipline.

create table if not exists public.avenize_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_execution_id uuid not null references public.avenize_workflow_executions(id) on delete cascade,
  step_key text not null,
  step_order integer not null,
  status text not null default 'pending',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workflow_execution_id,step_key),
  check(status in ('pending','running','completed','failed','rolled_back','skipped'))
);

create table if not exists public.avenize_event_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  event_type text not null,
  handler_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(business_id,event_type,handler_key)
);

create table if not exists public.avenize_order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  order_id uuid,
  location_id uuid references public.avenize_stock_locations(id),
  status text not null default 'pending',
  quantity numeric not null default 0,
  shipped_at timestamptz,
  delivered_at timestamptz,
  tracking_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in ('pending','allocated','shipped','delivered','cancelled','returned'))
);

create table if not exists public.avenize_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  location_id uuid references public.avenize_stock_locations(id),
  reference_type text,
  reference_id uuid,
  quantity numeric not null check(quantity > 0),
  status text not null default 'reserved',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  check(status in ('reserved','released','consumed','expired'))
);

create table if not exists public.avenize_approval_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  request_type text not null,
  reference_type text,
  reference_id uuid,
  requested_by uuid,
  approved_by uuid,
  status text not null default 'pending',
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check(status in ('pending','approved','rejected','cancelled'))
);

do $$ declare t text; begin
  foreach t in array array['avenize_workflow_steps','avenize_event_subscriptions','avenize_order_fulfillments','avenize_stock_reservations','avenize_approval_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1)) with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_update',t);
  end loop;
end $$;

create index if not exists idx_avenize_workflow_steps_execution on public.avenize_workflow_steps(workflow_execution_id,step_order);
create index if not exists idx_avenize_event_subscriptions on public.avenize_event_subscriptions(business_id,event_type,is_active);
create index if not exists idx_avenize_fulfillments_order on public.avenize_order_fulfillments(business_id,order_id,status);
create index if not exists idx_avenize_reservations_stock on public.avenize_stock_reservations(business_id,product_id,location_id,status);
create index if not exists idx_avenize_approval_requests on public.avenize_approval_requests(business_id,status,created_at desc);

-- Strong business-scoped workflow event contract.
create or replace function public.enqueue_avenize_workflow(
  p_business_id uuid,
  p_workflow_key text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_input jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public, extensions, pg_temp
as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.get_current_staff() s where s.business_id = p_business_id) then
    raise exception 'Business access denied';
  end if;
  insert into public.avenize_workflow_executions(business_id,workflow_key,reference_type,reference_id,input,idempotency_key,status,started_at)
  values(p_business_id,p_workflow_key,p_reference_type,p_reference_id,coalesce(p_input,'{}'::jsonb),p_idempotency_key,'pending',null)
  on conflict (business_id,workflow_key,idempotency_key) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.enqueue_avenize_workflow(uuid,text,text,uuid,jsonb,text) from public, anon;
grant execute on function public.enqueue_avenize_workflow(uuid,text,text,uuid,jsonb,text) to authenticated;
