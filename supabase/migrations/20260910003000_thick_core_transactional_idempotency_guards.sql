-- Avenize thick-core transactional idempotency guards.
-- Prevents duplicate journal postings under concurrent retries.

create unique index if not exists uq_avenize_journal_entry_idempotency
  on public.journal_entries(business_id, source_type, reference)
  where source_type = 'avenize_post_journal_entry' and reference is not null;

create or replace function public.avenize_post_journal_entry(
  p_business_id uuid,p_entry_date date,p_description text,p_lines jsonb,p_reference text default null,p_source_type text default null,p_source_id uuid default null,p_currency text default 'NGN',p_idempotency_key text default null
) returns uuid language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_total_debit numeric := 0; v_total_credit numeric := 0; v_account uuid; v_debit numeric; v_credit numeric; v_period_status text;
begin
  if not exists (select 1 from public.get_current_staff() s where s.business_id=p_business_id) then raise exception 'Business access denied'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)<2 then raise exception 'At least two journal lines are required'; end if;
  select status into v_period_status from public.avenize_fiscal_periods where business_id=p_business_id and p_entry_date between period_start and period_end order by period_start desc limit 1;
  if v_period_status='closed' then raise exception 'Fiscal period is closed'; end if;
  if p_idempotency_key is not null then
    select id into v_id from public.journal_entries where business_id=p_business_id and source_type='avenize_post_journal_entry' and reference=p_idempotency_key limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  for v_account,v_debit,v_credit in select (x->>'account_id')::uuid,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0) from jsonb_array_elements(p_lines) x loop
    if v_debit<0 or v_credit<0 or (v_debit=0 and v_credit=0) or (v_debit>0 and v_credit>0) then raise exception 'Invalid journal line'; end if;
    if not exists (select 1 from public.accounts where id=v_account and business_id=p_business_id and coalesce(is_active,true)) then raise exception 'Account does not belong to business'; end if;
    v_total_debit:=v_total_debit+v_debit; v_total_credit:=v_total_credit+v_credit;
  end loop;
  if v_total_debit<=0 or v_total_debit<>v_total_credit then raise exception 'Journal is not balanced'; end if;
  begin
    insert into public.journal_entries(business_id,date,description,status,posted_by,posted_at,reference,source_type,source_id,currency) values(p_business_id,p_entry_date,p_description,'posted',(select user_id from public.get_current_staff() limit 1),now(),p_idempotency_key,coalesce(p_source_type,'avenize_post_journal_entry'),p_source_id,p_currency) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.journal_entries where business_id=p_business_id and source_type='avenize_post_journal_entry' and reference=p_idempotency_key limit 1;
    if v_id is null then raise; end if;
  end;
  if not exists (select 1 from public.journal_lines where journal_entry_id=v_id) then
    insert into public.journal_lines(business_id,journal_entry_id,account_id,debit,credit,description,currency) select p_business_id,v_id,(x->>'account_id')::uuid,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),coalesce(x->>'description',p_description),p_currency from jsonb_array_elements(p_lines) x;
  end if;
  return v_id;
end;$$;

revoke execute on function public.avenize_post_journal_entry(uuid,date,text,jsonb,text,text,uuid,text,text) from public,anon;
grant execute on function public.avenize_post_journal_entry(uuid,date,text,jsonb,text,text,uuid,text,text) to authenticated;
