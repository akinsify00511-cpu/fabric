-- Avenize thick financial/governance controls.

create table if not exists public.avenize_bank_accounts (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  name text not null, bank_name text, account_number_masked text, currency text not null default 'NGN',
  ledger_account_id uuid references public.accounts(id), is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(business_id,name)
);

create table if not exists public.avenize_bank_reconciliations (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  bank_account_id uuid not null references public.avenize_bank_accounts(id),
  statement_start date not null, statement_end date not null, statement_closing_balance numeric not null default 0,
  ledger_closing_balance numeric not null default 0, difference numeric generated always as (statement_closing_balance-ledger_closing_balance) stored,
  status text not null default 'open', reconciled_by uuid, reconciled_at timestamptz, created_at timestamptz not null default now(),
  check(status in ('open','reconciled','locked'))
);

create table if not exists public.avenize_budgets (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  name text not null, fiscal_period_id uuid references public.avenize_fiscal_periods(id), currency text not null default 'NGN',
  status text not null default 'draft', total_amount numeric not null default 0, created_at timestamptz not null default now(),
  check(status in ('draft','approved','locked','closed'))
);

create table if not exists public.avenize_budget_lines (
  id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.avenize_budgets(id) on delete cascade,
  business_id uuid not null, account_id uuid references public.accounts(id), cost_center_id uuid references public.avenize_cost_centers(id),
  period_start date not null, amount numeric not null default 0, created_at timestamptz not null default now()
);

create table if not exists public.avenize_audit_events (
  id uuid primary key default gen_random_uuid(), business_id uuid,
  actor_user_id uuid, event_type text not null, entity_type text, entity_id uuid,
  before_data jsonb, after_data jsonb, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_avenize_audit_events_business_time on public.avenize_audit_events(business_id,created_at desc);
create index if not exists idx_avenize_bank_reconciliations on public.avenize_bank_reconciliations(business_id,status,statement_end desc);
create index if not exists idx_avenize_budgets on public.avenize_budgets(business_id,status);
create index if not exists idx_avenize_budget_lines on public.avenize_budget_lines(business_id,period_start);

do $$ declare t text; begin
  foreach t in array array['avenize_bank_accounts','avenize_bank_reconciliations','avenize_budgets','avenize_budget_lines','avenize_audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (business_id = (select business_id from public.get_current_staff() limit 1)) with check (business_id = (select business_id from public.get_current_staff() limit 1))',t||'_update',t);
  end loop;
end $$;

-- Financial posting invariant: a journal entry must balance before it can be treated as posted.
create or replace function public.avenize_assert_journal_balanced(p_journal_entry_id uuid)
returns boolean language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare d numeric; c numeric;
begin
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into d,c from public.journal_lines where journal_entry_id=p_journal_entry_id;
  if abs(d-c) > 0.000001 then raise exception 'Journal entry is not balanced'; end if;
  return true;
end;
$$;
revoke execute on function public.avenize_assert_journal_balanced(uuid) from public,anon,authenticated;
