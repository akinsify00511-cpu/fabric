-- Avenize thick-core transactional posting and reconciliation primitives.
-- Live companion migration: thick_core_transactional_posting_v1.

create or replace function public.avenize_post_journal_entry(
  p_business_id uuid,p_entry_date date,p_description text,p_lines jsonb,p_reference text default null,p_source_type text default null,p_source_id uuid default null,p_currency text default 'NGN',p_idempotency_key text default null
) returns uuid language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_total_debit numeric := 0; v_total_credit numeric := 0; v_account uuid; v_debit numeric; v_credit numeric; v_period_status text;
begin
  if not exists (select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)<2 then raise exception 'At least two journal lines are required'; end if;
  select status into v_period_status from public.avenize_fiscal_periods where business_id=p_business_id and p_entry_date between period_start and period_end order by period_start desc limit 1;
  if v_period_status='closed' then raise exception 'Fiscal period is closed'; end if;
  if p_idempotency_key is not null then select id into v_id from public.journal_entries where business_id=p_business_id and source_type='avenize_post_journal_entry' and reference=p_idempotency_key limit 1; if v_id is not null then return v_id; end if; end if;
  for v_account,v_debit,v_credit in select (x->>'account_id')::uuid,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0) from jsonb_array_elements(p_lines) x loop
    if v_debit<0 or v_credit<0 or (v_debit=0 and v_credit=0) or (v_debit>0 and v_credit>0) then raise exception 'Invalid journal line'; end if;
    if not exists (select 1 from public.accounts where id=v_account and business_id=p_business_id and coalesce(is_active,true)) then raise exception 'Account does not belong to business'; end if;
    v_total_debit:=v_total_debit+v_debit; v_total_credit:=v_total_credit+v_credit;
  end loop;
  if v_total_debit<=0 or v_total_debit<>v_total_credit then raise exception 'Journal is not balanced'; end if;
  insert into public.journal_entries(business_id,date,description,status,posted_by,posted_at,reference,source_type,source_id,currency) values(p_business_id,p_entry_date,p_description,'posted',(select user_id from public.get_current_staff() limit 1),now(),p_idempotency_key,coalesce(p_source_type,'avenize_post_journal_entry'),p_source_id,p_currency) returning id into v_id;
  insert into public.journal_lines(business_id,journal_entry_id,account_id,debit,credit,description,currency) select p_business_id,v_id,(x->>'account_id')::uuid,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),coalesce(x->>'description',p_description),p_currency from jsonb_array_elements(p_lines) x;
  return v_id;
end;$$;

create or replace function public.avenize_post_inventory_movement(p_business_id uuid,p_product_id uuid,p_location_id uuid,p_movement_type text,p_quantity numeric,p_unit_cost numeric default 0,p_reference_type text default null,p_reference_id uuid default null) returns uuid language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
declare v_id uuid; v_balance numeric;
begin
  if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if;
  if p_quantity=0 then raise exception 'Quantity cannot be zero'; end if;
  if not exists(select 1 from public.products where id=p_product_id and business_id=p_business_id) then raise exception 'Product does not belong to business'; end if;
  if not exists(select 1 from public.avenize_stock_locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_movement_type in('out','sale','issue','delivery','adjustment_out') then select public.get_stock_balance(p_business_id,p_product_id,p_location_id) into v_balance; if v_balance+p_quantity<0 then raise exception 'Insufficient stock'; end if; end if;
  insert into public.avenize_inventory_ledger(business_id,product_id,location_id,movement_type,quantity,unit_cost,reference_type,reference_id,occurred_at) values(p_business_id,p_product_id,p_location_id,p_movement_type,p_quantity,p_unit_cost,p_reference_type,p_reference_id,now()) returning id into v_id; return v_id;
end;$$;

create or replace function public.avenize_reserve_stock(p_business_id uuid,p_product_id uuid,p_location_id uuid,p_quantity numeric,p_reference_type text default null,p_reference_id uuid default null,p_expires_at timestamptz default null) returns uuid language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
declare v_id uuid; v_available numeric; v_reserved numeric;
begin
  if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if;
  if p_quantity<=0 then raise exception 'Quantity must be positive'; end if;
  select public.get_stock_balance(p_business_id,p_product_id,p_location_id) into v_available;
  select coalesce(sum(quantity),0) into v_reserved from public.avenize_stock_reservations where business_id=p_business_id and product_id=p_product_id and location_id=p_location_id and status='reserved' and (expires_at is null or expires_at>now());
  if v_available-v_reserved<p_quantity then raise exception 'Insufficient available stock'; end if;
  insert into public.avenize_stock_reservations(business_id,product_id,location_id,reference_type,reference_id,quantity,status,expires_at) values(p_business_id,p_product_id,p_location_id,p_reference_type,p_reference_id,p_quantity,'reserved',p_expires_at) returning id into v_id; return v_id;
end;$$;

create or replace function public.avenize_release_stock_reservation(p_business_id uuid,p_reservation_id uuid) returns boolean language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
begin if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if; update public.avenize_stock_reservations set status='released',released_at=now() where id=p_reservation_id and business_id=p_business_id and status='reserved'; return found; end;$$;

create or replace function public.avenize_allocate_payment(p_business_id uuid,p_payment_reference text,p_invoice_id uuid,p_amount numeric,p_currency text default 'NGN') returns uuid language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
declare v_id uuid; v_balance numeric;
begin
  if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if;
  if p_amount<=0 then raise exception 'Allocation must be positive'; end if;
  select greatest(coalesce(balance,total),0) into v_balance from public.invoices where id=p_invoice_id and business_id=p_business_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_amount>v_balance then raise exception 'Allocation exceeds invoice balance'; end if;
  insert into public.avenize_payment_allocations(business_id,payment_reference,invoice_id,allocated_amount,currency,allocated_at) values(p_business_id,p_payment_reference,p_invoice_id,p_amount,p_currency,now()) returning id into v_id;
  update public.invoices set amount_paid=coalesce(amount_paid,0)+p_amount,balance=greatest(coalesce(balance,total)-p_amount,0),status=case when greatest(coalesce(balance,total)-p_amount,0)=0 then 'paid' else status end,updated_at=now() where id=p_invoice_id and business_id=p_business_id; return v_id;
end;$$;

create or replace function public.avenize_close_fiscal_period(p_business_id uuid,p_period_id uuid) returns boolean language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
begin if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if; update public.avenize_fiscal_periods set status='closed',closed_at=now(),closed_by=(select user_id from public.get_current_staff() limit 1) where id=p_period_id and business_id=p_business_id and status<>'closed'; return found; end;$$;

create or replace function public.avenize_reconcile_bank_account(p_business_id uuid,p_reconciliation_id uuid) returns boolean language plpgsql security invoker set search_path=public,extensions,pg_temp as $$
declare v_difference numeric;
begin if not exists(select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if; select statement_closing_balance-ledger_closing_balance into v_difference from public.avenize_bank_reconciliations where id=p_reconciliation_id and business_id=p_business_id for update; if not found then raise exception 'Reconciliation not found'; end if; update public.avenize_bank_reconciliations set difference=v_difference,status=case when v_difference=0 then 'reconciled' else 'exception' end,reconciled_by=case when v_difference=0 then(select user_id from public.get_current_staff() limit 1) else null end,reconciled_at=case when v_difference=0 then now() else null end where id=p_reconciliation_id and business_id=p_business_id; return v_difference=0; end;$$;

revoke execute on function public.avenize_post_journal_entry(uuid,date,text,jsonb,text,text,uuid,text,text) from public,anon;
revoke execute on function public.avenize_post_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,text,uuid) from public,anon;
revoke execute on function public.avenize_reserve_stock(uuid,uuid,uuid,numeric,text,uuid,timestamptz) from public,anon;
revoke execute on function public.avenize_release_stock_reservation(uuid,uuid) from public,anon;
revoke execute on function public.avenize_allocate_payment(uuid,text,uuid,numeric,text) from public,anon;
revoke execute on function public.avenize_close_fiscal_period(uuid,uuid) from public,anon;
revoke execute on function public.avenize_reconcile_bank_account(uuid,uuid) from public,anon;
grant execute on function public.avenize_post_journal_entry(uuid,date,text,jsonb,text,text,uuid,text,text) to authenticated;
grant execute on function public.avenize_post_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,text,uuid) to authenticated;
grant execute on function public.avenize_reserve_stock(uuid,uuid,uuid,numeric,text,uuid,timestamptz) to authenticated;
grant execute on function public.avenize_release_stock_reservation(uuid,uuid) to authenticated;
grant execute on function public.avenize_allocate_payment(uuid,text,uuid,numeric,text) to authenticated;
grant execute on function public.avenize_close_fiscal_period(uuid,uuid) to authenticated;
grant execute on function public.avenize_reconcile_bank_account(uuid,uuid) to authenticated;
