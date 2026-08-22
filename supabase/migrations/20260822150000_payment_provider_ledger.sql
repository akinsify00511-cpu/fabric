-- ============================================================================
-- Payment provider ledger — Paystack restored as a first-class rail.
--
-- Architecture (per the Avenize Production Constitution):
--   Paystack Checkout
--     -> payment_transactions   (ledger; the ONLY payment state)
--     -> paystack-webhook       (signature-verified, idempotent, re-verified)
--     -> business_subscriptions (provider writes; trigger syncs entitlements)
--     -> subscription_payments  (receipt history)
--     -> email_events           (receipt queued; email failure never breaks payment)
--
-- The browser NEVER decides "payment successful". The browser can only say
-- "Paystack returned me" — the server verifies against Paystack and writes
-- the ledger. Entitlement flows from business_subscriptions via the existing
-- sync_entitlement_from_subscription trigger (20260821170000), never from a
-- client-side payment response.
--
-- The manual bank-transfer rail (20260822120000) is RETAINED as a secondary
-- rail — both write business_subscriptions, so entitlements stay uniform.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. payment_transactions — the payment ledger (one row per attempted charge)
-- ----------------------------------------------------------------------------
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid,                                   -- initiating user (null for provider-initiated)
  provider text not null default 'paystack',
  provider_reference text not null,
  kind text not null default 'subscription_checkout',
  plan_code text,
  billing_cycle text check (billing_cycle in ('monthly','yearly')),
  amount_cents integer,
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending','processing','success','failed','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index if not exists payment_transactions_business_idx
  on public.payment_transactions (business_id, created_at desc);
create index if not exists payment_transactions_status_idx
  on public.payment_transactions (status) where status in ('pending','processing');

alter table public.payment_transactions enable row level security;

-- Members READ their own business's ledger. Writes are service-role only
-- (edge functions + this migration's triggers) — no client write policy.
drop policy if exists payment_transactions_member_read on public.payment_transactions;
create policy payment_transactions_member_read on public.payment_transactions
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

grant select on public.payment_transactions to authenticated;

-- Explicit payment state machine. Legal transitions:
--   pending    -> processing | success | failed
--   processing -> success | failed
--   success    -> refunded
--   failed, refunded -> (terminal)
create or replace function public.enforce_payment_transaction_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending'    and new.status in ('processing','success','failed')) or
      (old.status = 'processing' and new.status in ('success','failed')) or
      (old.status = 'success'    and new.status = 'refunded') or
      (old.status = new.status)
    ) then
      raise exception 'Illegal payment transaction transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payment_transactions_transition on public.payment_transactions;
create trigger payment_transactions_transition
  before update on public.payment_transactions
  for each row execute function public.enforce_payment_transaction_transition();

-- ----------------------------------------------------------------------------
-- 2. payment_webhook_events — provider webhook idempotency
--    Paystack may deliver charge.success multiple times; the unique
--    (provider, event_id) constraint guarantees we process it ONCE.
-- ----------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_result text check (processing_result in ('processed','duplicate','ignored','failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

alter table public.payment_webhook_events enable row level security;

-- No client access at all — the paystack-webhook edge function uses the
-- service role. (RLS enabled with zero permissive policies = deny-by-default.)

-- ----------------------------------------------------------------------------
-- 3. business_subscriptions — additive provider columns
-- ----------------------------------------------------------------------------
alter table public.business_subscriptions add column if not exists provider_customer_code text;
alter table public.business_subscriptions add column if not exists provider_email_token text;
alter table public.business_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.business_subscriptions add column if not exists last_payment_reference text;

-- ----------------------------------------------------------------------------
-- 4. Restore provider health monitoring rows.
--    20260822120000 deleted the Paystack/Resend rows when it removed the
--    providers; both are now first-class again, so the ops console must
--    monitor them. (WhatsApp/Meta stay removed per product direction.)
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.platform_integration_status') is not null then
    insert into public.platform_integration_status (integration, display_name, status)
    values
      ('paystack', 'Paystack (payments)', 'unknown'),
      ('resend', 'Resend (email)', 'unknown')
    on conflict (integration) do nothing;
  end if;
  if to_regclass('public.platform_alert_thresholds') is not null then
    insert into public.platform_alert_thresholds (key, display_name, system, metric, warning_value, critical_value)
    values
      ('paystack.consecutive_failures', 'Paystack consecutive failures', 'payments', 'consecutive_failures', 2, 5),
      ('resend.consecutive_failures', 'Resend consecutive failures', 'notifications', 'consecutive_failures', 2, 5)
    on conflict (key) do nothing;
  end if;
end $$;

comment on table public.payment_transactions is
  'Payment ledger. The ONLY payment state. Written by edge functions after server-side provider verification; read by members via RLS. The browser never writes payment state.';
comment on table public.payment_webhook_events is
  'Provider webhook idempotency ledger. unique(provider, event_id) guarantees each provider event is processed at most once.';
