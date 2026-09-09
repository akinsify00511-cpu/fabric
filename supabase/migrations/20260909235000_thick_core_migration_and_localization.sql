-- Avenize migration/localization foundation.

create table if not exists public.avenize_import_jobs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  source_type text not null, source_name text, entity_type text not null, status text not null default 'pending',
  mapping jsonb not null default '{}'::jsonb, source_row_count integer not null default 0, imported_row_count integer not null default 0,
  rejected_row_count integer not null default 0, reconciliation jsonb not null default '{}'::jsonb,
  error text, created_at timestamptz not null default now(), completed_at timestamptz,
  check(status in ('pending','mapping','running','completed','failed','rolled_back'))
);

create table if not exists public.avenize_country_localizations (
  id uuid primary key default gen_random_uuid(), country_code text not null,
  country_name text not null, currency_code text not null, currency_decimals integer not null default 2,
  tax_engine_key text, payroll_engine_key text, payment_engine_key text, banking_engine_key text,
  is_active boolean not null default true, created_at timestamptz not null default now(), unique(country_code)
);

insert into public.avenize_country_localizations(country_code,country_name,currency_code,tax_engine_key,payroll_engine_key,payment_engine_key,banking_engine_key)
values
 ('NG','Nigeria','NGN','ng-vat','ng-payroll','paystack','ng-banking'),
 ('GH','Ghana','GHS','gh-vat','gh-payroll','paystack','gh-banking'),
 ('KE','Kenya','KES','ke-tax','ke-payroll','mpesa','ke-banking'),
 ('ZA','South Africa','ZAR','za-tax','za-payroll','paystack','za-banking'),
 ('EG','Egypt','EGP','eg-tax','eg-payroll','payment-provider','eg-banking'),
 ('RW','Rwanda','RWF','rw-tax','rw-payroll','payment-provider','rw-banking'),
 ('TZ','Tanzania','TZS','tz-tax','tz-payroll','payment-provider','tz-banking'),
 ('UG','Uganda','UGX','ug-tax','ug-payroll','payment-provider','ug-banking')
on conflict(country_code) do update set currency_code=excluded.currency_code,tax_engine_key=excluded.tax_engine_key,payroll_engine_key=excluded.payroll_engine_key,payment_engine_key=excluded.payment_engine_key,banking_engine_key=excluded.banking_engine_key,is_active=true;

do $$ begin
  alter table public.avenize_import_jobs enable row level security;
  create policy avenize_import_jobs_select on public.avenize_import_jobs for select to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1));
  create policy avenize_import_jobs_insert on public.avenize_import_jobs for insert to authenticated with check (business_id=(select business_id from public.get_current_staff() limit 1));
  create policy avenize_import_jobs_update on public.avenize_import_jobs for update to authenticated using (business_id=(select business_id from public.get_current_staff() limit 1)) with check (business_id=(select business_id from public.get_current_staff() limit 1));
end $$;

create index if not exists idx_avenize_import_jobs on public.avenize_import_jobs(business_id,status,created_at desc);
