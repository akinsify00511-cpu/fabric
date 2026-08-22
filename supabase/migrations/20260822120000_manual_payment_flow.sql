-- ============================================================================
-- Manual payment confirmation flow (replaces Paystack/Flutterwave checkout).
--
-- The platform no longer integrates external payment providers. A business
-- that wants a paid plan creates a payment request, pays by bank transfer
-- using the reference, and a Riverways operator confirms receipt. The
-- existing sync_entitlement_from_subscription trigger (20260821170000) then
-- unlocks the plan — no provider webhook involved.
-- ============================================================================

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_code text not null check (plan_code in ('starter','team','business','pro','scale')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  amount_cents integer not null,
  currency text not null default 'NGN',
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_requests_business_idx
  on public.payment_requests (business_id, created_at desc);
create unique index if not exists payment_requests_one_open_idx
  on public.payment_requests (business_id) where status = 'pending';

alter table public.payment_requests enable row level security;

drop policy if exists payment_requests_member_read on public.payment_requests;
create policy payment_requests_member_read on public.payment_requests
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

grant select on public.payment_requests to authenticated;

-- Where customers send the money. Managed by the platform operator (service
-- role); the client only reads it through request_plan_payment.
create table if not exists public.platform_payment_instructions (
  id boolean primary key default true check (id),
  bank_name text,
  account_name text,
  account_number text,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.platform_payment_instructions enable row level security;

insert into public.platform_payment_instructions (id, bank_name, account_name, account_number, note)
values (true, null, null, null, 'Payment instructions have not been configured yet. Contact support to activate a paid plan.')
on conflict (id) do nothing;

-- Price lookup shared by the request RPC: pricing_tiers (20260818200000) is
-- the source of truth, with a fallback so the flow works even if that
-- migration has not been applied to a drifted database.
create or replace function public.plan_price_cents(p_plan_code text, p_billing_cycle text)
returns integer as $$
declare
  v_price integer;
  v_ended boolean;
begin
  select
    case
      when t.founding_period_ends_at is not null and t.founding_period_ends_at < now()
        then case when p_billing_cycle = 'yearly' then t.future_yearly_cents else t.future_monthly_cents end
      else case when p_billing_cycle = 'yearly' then t.founding_yearly_cents else t.founding_monthly_cents end
    end
  into v_price
  from public.pricing_tiers t
  where t.plan_code = p_plan_code and t.is_sellable;

  if v_price is not null then
    return v_price;
  end if;

  return case p_plan_code
    when 'starter' then case when p_billing_cycle = 'yearly' then 15000000 else 1500000 end
    when 'team' then case when p_billing_cycle = 'yearly' then 48000000 else 4800000 end
    when 'business' then case when p_billing_cycle = 'yearly' then 112000000 else 11200000 end
    when 'pro' then case when p_billing_cycle = 'yearly' then 186000000 else 18600000 end
    when 'scale' then case when p_billing_cycle = 'yearly' then 380000000 else 38000000 end
    else null
  end;
exception when others then
  return case p_plan_code
    when 'starter' then case when p_billing_cycle = 'yearly' then 15000000 else 1500000 end
    when 'team' then case when p_billing_cycle = 'yearly' then 48000000 else 4800000 end
    when 'business' then case when p_billing_cycle = 'yearly' then 112000000 else 11200000 end
    when 'pro' then case when p_billing_cycle = 'yearly' then 186000000 else 18600000 end
    when 'scale' then case when p_billing_cycle = 'yearly' then 380000000 else 38000000 end
    else null
  end;
end;
$$ language plpgsql stable;

-- A member requests a paid plan. Idempotent: an open pending request for the
-- business is returned as-is instead of creating a duplicate.
create or replace function public.request_plan_payment(p_plan_code text, p_billing_cycle text default 'monthly')
returns jsonb as $$
declare
  v_staff record;
  v_amount integer;
  v_request public.payment_requests;
  v_instructions public.platform_payment_instructions;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Not a member of any business');
  end if;
  if v_staff.role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Only a business owner or admin can change the plan');
  end if;
  if p_plan_code not in ('starter','team','business','pro','scale') then
    return jsonb_build_object('ok', false, 'error', 'Invalid plan');
  end if;
  if p_billing_cycle not in ('monthly','yearly') then
    p_billing_cycle := 'monthly';
  end if;

  v_amount := public.plan_price_cents(p_plan_code, p_billing_cycle);
  if v_amount is null then
    return jsonb_build_object('ok', false, 'error', 'No price configured for this plan');
  end if;

  select * into v_request
  from public.payment_requests
  where business_id = v_staff.business_id and status = 'pending'
  limit 1;

  if v_request is null then
    insert into public.payment_requests (business_id, plan_code, billing_cycle, amount_cents, reference)
    values (
      v_staff.business_id,
      p_plan_code,
      p_billing_cycle,
      v_amount,
      'avz_req_' || replace(gen_random_uuid()::text, '-', '')
    )
    returning * into v_request;
  end if;

  select * into v_instructions from public.platform_payment_instructions where id = true;

  return jsonb_build_object(
    'ok', true,
    'reference', v_request.reference,
    'plan_code', v_request.plan_code,
    'billing_cycle', v_request.billing_cycle,
    'amount_cents', v_request.amount_cents,
    'currency', v_request.currency,
    'status', v_request.status,
    'instructions', jsonb_build_object(
      'bank_name', v_instructions.bank_name,
      'account_name', v_instructions.account_name,
      'account_number', v_instructions.account_number,
      'note', v_instructions.note
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.request_plan_payment(text, text) to authenticated;

-- The caller checks the state of their own pending request (polling from the
-- checkout page while they wait for confirmation).
create or replace function public.my_payment_request()
returns jsonb as $$
declare
  v_staff record;
  v_request public.payment_requests;
  v_instructions public.platform_payment_instructions;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Not a member of any business');
  end if;

  select * into v_request
  from public.payment_requests
  where business_id = v_staff.business_id and status = 'pending'
  order by created_at desc
  limit 1;

  select * into v_instructions from public.platform_payment_instructions where id = true;

  if v_request is null then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reference', v_request.reference,
    'plan_code', v_request.plan_code,
    'billing_cycle', v_request.billing_cycle,
    'amount_cents', v_request.amount_cents,
    'currency', v_request.currency,
    'status', v_request.status,
    'instructions', jsonb_build_object(
      'bank_name', v_instructions.bank_name,
      'account_name', v_instructions.account_name,
      'account_number', v_instructions.account_number,
      'note', v_instructions.note
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.my_payment_request() to authenticated;

-- Withdraw an open request (owner/admin of the same business).
create or replace function public.cancel_payment_request()
returns jsonb as $$
declare
  v_staff record;
begin
  select * into v_staff from public.get_current_staff() limit 1;
  if v_staff is null then
    return jsonb_build_object('ok', false, 'error', 'Not a member of any business');
  end if;
  if v_staff.role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Only a business owner or admin can cancel a payment request');
  end if;

  update public.payment_requests
  set status = 'cancelled', updated_at = now()
  where business_id = v_staff.business_id and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.cancel_payment_request() to authenticated;

-- Operator-side: confirm money received. Activates the subscription; the
-- sync_entitlement_from_subscription trigger unlocks the plan. Gated by the
-- Riverways operator allowlist (20260821000000).
create or replace function public.confirm_plan_payment(p_reference text)
returns jsonb as $$
declare
  v_request public.payment_requests;
begin
  if not public.is_riverways_admin() then
    return jsonb_build_object('ok', false, 'authorized', false);
  end if;

  select * into v_request
  from public.payment_requests
  where reference = p_reference
  for update;

  if v_request is null then
    return jsonb_build_object('ok', false, 'error', 'Payment request not found');
  end if;
  if v_request.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Payment request is ' || v_request.status);
  end if;

  update public.payment_requests
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  where id = v_request.id;

  insert into public.business_subscriptions (
    business_id, provider, plan_code, plan_name, status, billing_cycle,
    amount_cents, currency, start_date, next_billing_date, seats_included
  ) values (
    v_request.business_id,
    'manual',
    v_request.plan_code,
    initcap(v_request.plan_code),
    'active',
    v_request.billing_cycle,
    v_request.amount_cents,
    v_request.currency,
    now(),
    now() + case when v_request.billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end,
    5
  )
  on conflict (business_id) do update set
    provider = 'manual',
    plan_code = excluded.plan_code,
    plan_name = excluded.plan_name,
    status = 'active',
    billing_cycle = excluded.billing_cycle,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    start_date = excluded.start_date,
    next_billing_date = excluded.next_billing_date,
    cancelled_at = null;

  insert into public.subscription_payments (business_id, provider, amount_cents, currency, status, description, paid_at)
  values (
    v_request.business_id,
    'manual',
    v_request.amount_cents,
    v_request.currency,
    'successful',
    initcap(v_request.plan_code) || ' plan (' || v_request.billing_cycle || ') — manual transfer ' || v_request.reference,
    now()
  );

  return jsonb_build_object('ok', true, 'business_id', v_request.business_id, 'plan_code', v_request.plan_code);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.confirm_plan_payment(text) to authenticated;

-- Operator-side: list pending requests awaiting confirmation.
create or replace function public.pending_payment_requests()
returns jsonb as $$
begin
  if not public.is_riverways_admin() then
    return jsonb_build_object('authorized', false, 'requests', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', r.reference,
        'business_id', r.business_id,
        'business_name', b.name,
        'plan_code', r.plan_code,
        'billing_cycle', r.billing_cycle,
        'amount_cents', r.amount_cents,
        'currency', r.currency,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.payment_requests r
      join public.businesses b on b.id = r.business_id
      where r.status = 'pending'
    ), '[]'::jsonb)
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.pending_payment_requests() to authenticated;

-- Rename the legacy 'paystack' feature flag to 'payments' (feature flags are
-- a plan JSONB; businesses keep whatever their plan already unlocks).
create or replace function public.get_plan_features(p_plan text)
returns jsonb as $$
declare
  plan_features jsonb;
begin
  plan_features := case p_plan
    when 'free' then '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "payments": false, "multi_bank": false, "inventory": false, "projects": true, "crm": true, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::jsonb
    when 'starter' then '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "payments": false, "multi_bank": false, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": false, "recognition": false}'::jsonb
    when 'team' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "payments": true, "multi_bank": false, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'growth' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'business' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'professional' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'pro' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": false, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'scale' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": true, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'enterprise' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": true, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "payments": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    else '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "payments": false, "multi_bank": false, "inventory": false, "projects": false, "crm": false, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::jsonb
  end;
  return plan_features;
end;
$$ language plpgsql;

update public.business_entitlements
set features = (features - 'paystack') || jsonb_build_object('payments', features->'paystack')
where features ? 'paystack';

-- Ops hygiene: the platform no longer integrates these providers. Drop their
-- seeded health-check rows so the ops console reflects reality.
do $$
begin
  if to_regclass('public.platform_integration_status') is not null then
    delete from public.platform_integration_status where integration in ('paystack','flutterwave','termii','resend','whatsapp','meta');
  end if;
  if to_regclass('public.platform_alert_thresholds') is not null then
    delete from public.platform_alert_thresholds where integration in ('paystack','flutterwave','termii','resend','whatsapp','meta');
  end if;
end $$;

notify pgrst, 'reload schema';
