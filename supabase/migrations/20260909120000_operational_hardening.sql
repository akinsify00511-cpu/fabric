-- Operational hardening: financial writes must be atomic and posted entries must be balanced.

create or replace function public.create_journal_entry_with_lines(
  p_business_id uuid,
  p_date date,
  p_reference text,
  p_description text,
  p_currency text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_entry_number text;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_line jsonb;
  v_account_id uuid;
begin
  if not exists (
    select 1 from public.staff s
    where s.business_id = p_business_id
      and s.user_id = auth.uid()
      and coalesce(s.active, s.is_active, true) = true
  ) then
    raise exception 'not authorized for business';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'journal entry requires at least two lines';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_account_id := (v_line->>'account_id')::uuid;
    if v_account_id is null or not exists (
      select 1 from public.accounts a where a.id = v_account_id and a.business_id = p_business_id and coalesce(a.is_active, true)
    ) then raise exception 'invalid account for business'; end if;
    if coalesce((v_line->>'debit')::numeric, 0) < 0 or coalesce((v_line->>'credit')::numeric, 0) < 0 then raise exception 'debit and credit cannot be negative'; end if;
    if coalesce((v_line->>'debit')::numeric, 0) = 0 and coalesce((v_line->>'credit')::numeric, 0) = 0 then raise exception 'each journal line must have a debit or credit'; end if;
    if coalesce((v_line->>'debit')::numeric, 0) > 0 and coalesce((v_line->>'credit')::numeric, 0) > 0 then raise exception 'a journal line cannot contain both debit and credit'; end if;
    v_debit := v_debit + coalesce((v_line->>'debit')::numeric, 0);
    v_credit := v_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;
  if round(v_debit, 2) <> round(v_credit, 2) then raise exception 'journal entry is not balanced: debit % credit %', v_debit, v_credit; end if;
  v_entry_number := 'JE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.journal_entries (business_id, entry_number, date, reference, description, status, posted_by, posted_at, currency, created_at, updated_at)
  values (p_business_id, v_entry_number, p_date, p_reference, p_description, 'posted', auth.uid(), now(), coalesce(p_currency, 'NGN'), now(), now())
  returning id into v_entry_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.journal_lines (business_id, journal_entry_id, account_id, debit, credit, description, currency, created_at)
    values (p_business_id, v_entry_id, (v_line->>'account_id')::uuid, coalesce((v_line->>'debit')::numeric, 0), coalesce((v_line->>'credit')::numeric, 0), v_line->>'description', coalesce(v_line->>'currency', p_currency, 'NGN'), now());
  end loop;
  return v_entry_id;
end;
$$;
revoke all on function public.create_journal_entry_with_lines(uuid,date,text,text,text,jsonb) from public;
grant execute on function public.create_journal_entry_with_lines(uuid,date,text,text,text,jsonb) to authenticated;

create or replace function public.assert_posted_journal_entry_balanced()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_debit numeric; v_credit numeric;
begin
  if new.status = 'posted' then
    select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_debit, v_credit from public.journal_lines where journal_entry_id = new.id;
    if v_debit = 0 or round(v_debit,2) <> round(v_credit,2) then raise exception 'posted journal entry % is not balanced', new.id; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assert_posted_journal_entry_balanced on public.journal_entries;
create constraint trigger trg_assert_posted_journal_entry_balanced after insert or update of status on public.journal_entries deferrable initially deferred for each row execute function public.assert_posted_journal_entry_balanced();

-- Authoritative monitoring summary. Missing telemetry remains unknown; no synthetic health values.
create or replace function public.get_monitoring_summary(p_business_id uuid)
returns table (monitor_count bigint, up_count bigint, degraded_count bigint, down_count bigint, unknown_count bigint, active_incidents bigint)
language sql security definer set search_path = public as $$
  select count(*) filter (where m.is_active = true),
         count(*) filter (where m.is_active = true and m.status = 'up'),
         count(*) filter (where m.is_active = true and m.status = 'degraded'),
         count(*) filter (where m.is_active = true and m.status = 'down'),
         count(*) filter (where m.is_active = true and coalesce(m.status, 'unknown') = 'unknown'),
         (select count(*) from public.incidents i where i.business_id = p_business_id and i.status <> 'resolved')
  from public.monitors m
  where m.business_id = p_business_id
    and exists (select 1 from public.staff s where s.business_id = p_business_id and s.user_id = auth.uid() and coalesce(s.active, s.is_active, true) = true);
$$;
revoke all on function public.get_monitoring_summary(uuid) from public;
grant execute on function public.get_monitoring_summary(uuid) to authenticated;
