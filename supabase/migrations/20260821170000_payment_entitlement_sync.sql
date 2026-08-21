-- ============================================================================
-- Payment → entitlement sync (launch blocker P0).
--
-- The Paystack webhook activates business_subscriptions but never touched
-- business_entitlements — and business_entitlements.plan is what has_feature,
-- can_access_module and resolve_plan_tier actually gate on. A paying customer
-- stayed on plan 'free'. This migration closes the loop:
--   1. resolve_plan_tier learns 'team' + 'business' (both were tier 0 = free).
--   2. get_plan_features learns the 5 paid plan codes (ELSE was all-false).
--   3. A trigger on business_subscriptions syncs entitlements on every
--      activation / cancellation, from ANY writer (webhook, admin, migration).
--   4. One-time backfill for already-active subscriptions.
-- ============================================================================

-- The subscription-checkout edge function records each checkout attempt in
-- subscription_provider_attempts, but no migration created the table — every
-- checkout would fail AFTER Paystack accepted the transaction. Create it.
create table if not exists public.subscription_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'paystack',
  operation text not null default 'subscription_checkout',
  idempotency_key text unique,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  provider_reference text,
  amount_cents integer,
  currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_provider_attempts_ref_idx
  on public.subscription_provider_attempts (provider_reference);
create index if not exists subscription_provider_attempts_business_idx
  on public.subscription_provider_attempts (business_id, created_at desc);

alter table public.subscription_provider_attempts enable row level security;

drop policy if exists subscription_provider_attempts_no_client on public.subscription_provider_attempts;
create policy subscription_provider_attempts_no_client on public.subscription_provider_attempts
  for all to authenticated using (false) with check (false);

-- Defensive: ensure the plan CHECK admits all 8 codes even if the pricing
-- engine migration hasn't run yet (028 only allowed 4).
do $$
begin
  alter table public.business_entitlements drop constraint if exists business_entitlements_plan_check;
  alter table public.business_entitlements add constraint business_entitlements_plan_check
    check (plan in ('free','starter','team','business','professional','pro','scale','enterprise'));
exception when others then
  raise notice 'plan CHECK widening skipped: %', sqlerrm;
end $$;

-- 1. Plan → tier. team and business were missing → silently tier 0 (free).
create or replace function public.resolve_plan_tier(p_business_id uuid)
returns integer as $$
declare v_plan text; v_tier integer;
begin
  select e.plan into v_plan
  from public.business_entitlements e
  where e.business_id = p_business_id;
  v_plan := coalesce(v_plan, 'free');
  v_tier := case v_plan
    when 'free' then 0
    when 'starter' then 1
    when 'team' then 2
    when 'growth' then 2
    when 'business' then 2
    when 'professional' then 2
    when 'pro' then 2
    when 'scale' then 3
    when 'enterprise' then 3
    else 0
  end;
  return v_tier;
end;
$$ language plpgsql stable;

-- 2. Plan → feature flags. team/business/pro/scale hit the ELSE branch
--    (all features false). Map each paid code to its feature set.
create or replace function public.get_plan_features(p_plan text)
returns jsonb as $$
declare
  plan_features jsonb;
begin
  plan_features := case p_plan
    when 'free' then '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": false, "projects": true, "crm": true, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::jsonb
    when 'starter' then '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": false, "recognition": false}'::jsonb
    when 'team' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": true, "multi_bank": false, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'growth' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'business' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'professional' then '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'pro' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": false, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'scale' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": true, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    when 'enterprise' then '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": true, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::jsonb
    else '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": false, "projects": false, "crm": false, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::jsonb
  end;
  return plan_features;
end;
$$ language plpgsql;

-- 3. The sync trigger: business_subscriptions is the payment record;
--    business_entitlements is the access gate. Keep them in lock-step.
create or replace function public.sync_entitlement_from_subscription()
returns trigger as $$
begin
  if new.status = 'active' and new.plan_code is not null then
    insert into public.business_entitlements (business_id, plan, features, updated_at)
    values (new.business_id, new.plan_code, public.get_plan_features(new.plan_code), now())
    on conflict (business_id) do update set
      plan = excluded.plan,
      features = excluded.features,
      updated_at = now();
  elsif new.status in ('cancelled', 'expired') then
    -- Immediate-cancel / expiry paths. cancel_at_period_end keeps status
    -- 'active', so period-end access is preserved by construction.
    update public.business_entitlements
    set plan = 'free', features = public.get_plan_features('free'), updated_at = now()
    where business_id = new.business_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists sync_entitlement_from_subscription on public.business_subscriptions;
create trigger sync_entitlement_from_subscription
  after insert or update of status, plan_code on public.business_subscriptions
  for each row execute function public.sync_entitlement_from_subscription();

-- 4. Backfill: businesses that already paid but never got their entitlement.
insert into public.business_entitlements (business_id, plan, features, updated_at)
select s.business_id, s.plan_code, public.get_plan_features(s.plan_code), now()
from public.business_subscriptions s
where s.status = 'active' and s.plan_code is not null
on conflict (business_id) do update set
  plan = excluded.plan,
  features = excluded.features,
  updated_at = now();
