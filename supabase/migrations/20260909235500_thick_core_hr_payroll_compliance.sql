-- Avenize thick HR/payroll/compliance foundation.

create table if not exists public.avenize_payroll_runs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  period_start date not null, period_end date not null, status text not null default 'draft',
  currency text not null default 'NGN', gross_total numeric not null default 0, deductions_total numeric not null default 0,
  net_total numeric not null default 0, approved_by uuid, approved_at timestamptz, created_at timestamptz not null default now(),
  check(status in ('draft','calculating','pending_approval','approved','paid','posted','cancelled'))
);

create table if not exists public.avenize_payroll_lines (
  id uuid primary key default gen_random_uuid(), payroll_run_id uuid not null references public.avenize_payroll_runs(id) on delete cascade,
  business_id uuid not null, employee_id uuid, gross_pay numeric not null default 0, deductions numeric not null default 0,
  net_pay numeric not null default 0, tax numeric not null default 0, pension numeric not null default 0,
  benefits numeric not null default 0, created_at timestamptz not null default now()
);

create table if not exists public.avenize_compliance_controls (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, country_code text not null,
  control_key text not null, status text not null default 'pending', due_date date, evidence jsonb not null default '{}'::jsonb,
  owner_user_id uuid, completed_at timestamptz, created_at timestamptz not null default now(),
  unique(business_id,country_code,control_key), check(status in ('pending','in_progress','complete','waived','overdue'))
);

create index if not exists idx_avenize_payroll_runs on public.avenize_payroll_runs(business_id,period_end desc,status);
create index if not exists idx_avenize_payroll_lines on public.avenize_payroll_lines(business_id,payroll_run_id);
create index if not exists idx_avenize_compliance_controls on public.avenize_compliance_controls(business_id,country_code,status,due_date);

do $$ declare t text; begin
  foreach t in array array['avenize_payroll_runs','avenize_payroll_lines','avenize_compliance_controls'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (business_id=(select business_id from public.get_current_staff() limit 1))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1)) with check (business_id=(select business_id from public.get_current_staff() limit 1))',t||'_update',t);
  end loop;
end $$;
