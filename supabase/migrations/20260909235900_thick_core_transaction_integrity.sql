-- Thick-core transaction integrity: make operational posting and reconciliation safe.
-- Native Avenize implementation; no external ERP runtime dependency.

create table if not exists public.avenize_stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  location_id uuid not null references public.avenize_stock_locations(id),
  product_id uuid not null,
  counted_quantity numeric not null,
  book_quantity numeric not null,
  variance_quantity numeric not null,
  unit_cost numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  reference text,
  created_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.avenize_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_avenize_stock_reconciliation_business on public.avenize_stock_reconciliations(business_id,created_at desc);
create index if not exists idx_avenize_audit_events_business on public.avenize_audit_events(business_id,created_at desc);

alter table public.avenize_stock_reconciliations enable row level security;
alter table public.avenize_audit_events enable row level security;

drop policy if exists avenize_stock_reconciliations_select on public.avenize_stock_reconciliations;
drop policy if exists avenize_stock_reconciliations_insert on public.avenize_stock_reconciliations;
drop policy if exists avenize_stock_reconciliations_update on public.avenize_stock_reconciliations;
create policy avenize_stock_reconciliations_select on public.avenize_stock_reconciliations for select to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1));
create policy avenize_stock_reconciliations_insert on public.avenize_stock_reconciliations for insert to authenticated with check (business_id = (select business_id from public.get_current_staff() limit 1));
create policy avenize_stock_reconciliations_update on public.avenize_stock_reconciliations for update to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1)) with check (business_id = (select business_id from public.get_current_staff() limit 1));

drop policy if exists avenize_audit_events_select on public.avenize_audit_events;
create policy avenize_audit_events_select on public.avenize_audit_events for select to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1));

create or replace function public.avenize_post_inventory_movement(
  p_business_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public, extensions, pg_temp
as $$
declare v_id uuid;
begin
  if p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_movement_type not in ('receipt','issue','transfer_in','transfer_out','adjustment','reservation','release') then raise exception 'invalid movement type'; end if;
  if p_business_id <> (select business_id from public.get_current_staff() limit 1) then raise exception 'business access denied'; end if;
  if p_movement_type in ('issue','transfer_out','reservation') and public.get_stock_balance(p_business_id,p_product_id,p_location_id) < p_quantity then raise exception 'insufficient stock'; end if;
  insert into public.avenize_inventory_ledger(business_id,product_id,location_id,movement_type,quantity,unit_cost,reference_type,reference_id)
  values(p_business_id,p_product_id,p_location_id,p_movement_type,p_quantity,p_unit_cost,p_reference_type,p_reference_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.avenize_post_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,text,uuid) from public, anon;
grant execute on function public.avenize_post_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,text,uuid) to authenticated;

create or replace function public.avenize_post_stock_reconciliation(p_reconciliation_id uuid)
returns uuid
language plpgsql security invoker set search_path = public, extensions, pg_temp
as $$
declare r public.avenize_stock_reconciliations%rowtype; v_id uuid;
begin
  select * into r from public.avenize_stock_reconciliations where id=p_reconciliation_id for update;
  if not found then raise exception 'reconciliation not found'; end if;
  if r.business_id <> (select business_id from public.get_current_staff() limit 1) then raise exception 'business access denied'; end if;
  if r.status <> 'draft' then raise exception 'reconciliation is not draft'; end if;
  if r.variance_quantity = 0 then
    update public.avenize_stock_reconciliations set status='posted',posted_at=now() where id=r.id;
    return r.id;
  end if;
  insert into public.avenize_inventory_ledger(business_id,product_id,location_id,movement_type,quantity,unit_cost,reference_type,reference_id)
  values(r.business_id,r.product_id,r.location_id,'adjustment',abs(r.variance_quantity),r.unit_cost,'stock_reconciliation',r.id)
  returning id into v_id;
  if r.variance_quantity < 0 then
    update public.avenize_inventory_ledger set movement_type='issue' where id=v_id;
  end if;
  update public.avenize_stock_reconciliations set status='posted',posted_at=now() where id=r.id;
  return r.id;
end;
$$;
revoke execute on function public.avenize_post_stock_reconciliation(uuid) from public, anon;
grant execute on function public.avenize_post_stock_reconciliation(uuid) to authenticated;

create or replace function public.avenize_create_audit_event(
  p_business_id uuid,p_entity_type text,p_entity_id uuid,p_action text,p_before jsonb default null,p_after jsonb default null
) returns uuid
language plpgsql security invoker set search_path = public, extensions, pg_temp
as $$
declare v_id uuid;
begin
  if p_business_id <> (select business_id from public.get_current_staff() limit 1) then raise exception 'business access denied'; end if;
  insert into public.avenize_audit_events(business_id,entity_type,entity_id,action,before_data,after_data,actor_id)
  values(p_business_id,p_entity_type,p_entity_id,p_action,p_before,p_after,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.avenize_create_audit_event(uuid,text,uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.avenize_create_audit_event(uuid,text,uuid,text,jsonb,jsonb) to authenticated;
