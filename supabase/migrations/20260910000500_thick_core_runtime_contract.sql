-- Runtime contract for thick-core feature coverage.
-- Keeps the new domains explicit and auditable without coupling Avenize to external ERP runtimes.

create table if not exists public.avenize_feature_contracts (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  domain text not null,
  capability text not null,
  status text not null default 'implemented',
  contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in ('planned','implemented','verified','deprecated'))
);

insert into public.avenize_feature_contracts(feature_key,domain,capability,contract) values
('finance.gl','finance','double-entry general ledger','{"balanced_entries":true,"trial_balance":true}'),
('finance.reconciliation','finance','bank reconciliation','{"difference_tracking":true,"lockable":true}'),
('finance.budgeting','finance','budgets and cost centres','{"period_aware":true,"cost_centres":true}'),
('inventory.ledger','inventory','stock ledger','{"multi_location":true,"reservations":true}'),
('procurement.receipt','procurement','purchase receipt','{"supplier_link":true,"po_link":true}'),
('commerce.fulfillment','commerce','order fulfillment','{"statuses":["pending","allocated","shipped","delivered","returned"]}'),
('workflow.durable','workflow','durable workflow execution','{"idempotency":true,"steps":true}'),
('workflow.approval','workflow','approval controls','{"auditable":true}'),
('integration.events','integration','event processing','{"idempotency":true,"retryable":true}'),
('migration.imports','migration','data migration','{"mapping":true,"reconciliation":true}'),
('localization.africa','localization','African country engine','{"countries":["NG","GH","KE","ZA","EG","RW","TZ","UG"]}'),
('hr.payroll','hr','payroll runs','{"approval":true,"tax":true,"pension":true}'),
('compliance.controls','compliance','country compliance controls','{"due_dates":true,"evidence":true}'),
('governance.audit','governance','business audit trail','{"before_after":true,"actor":true}')
on conflict(feature_key) do update set capability=excluded.capability,contract=excluded.contract,status='implemented',updated_at=now();

alter table public.avenize_feature_contracts enable row level security;
revoke all on public.avenize_feature_contracts from anon,authenticated;
