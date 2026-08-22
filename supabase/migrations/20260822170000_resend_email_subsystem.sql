-- ============================================================================
-- Resend email subsystem — transactional email as an actual Avenize service.
--
-- Design (per the Avenize Production Constitution):
--   * ONE email service — no scattered sendEmail(...) calls.
--   * Event-driven: payment.success -> queue email; email failure NEVER
--     breaks the payment (queue is best-effort, delivery is async).
--   * Avenize owns users/businesses/payments/notifications/email_events;
--     Resend owns delivery, domain authentication and delivery events.
--   * email_events is the internal delivery ledger — the admin console can
--     show exactly which transactional emails were sent/delivered/bounced.
--
-- Note: 'email_templates' (009) is the MARKETING campaign registry — this
-- subsystem deliberately uses a separate transactional registry.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. email_events — the internal delivery ledger
-- ----------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid,
  template text not null,
  recipient text not null,
  subject text,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','opened','bounced','complained','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_events_business_idx
  on public.email_events (business_id, created_at desc);
create index if not exists email_events_provider_message_idx
  on public.email_events (provider_message_id) where provider_message_id is not null;
create index if not exists email_events_queued_idx
  on public.email_events (created_at) where status = 'queued';

alter table public.email_events enable row level security;

-- Members read their own business's email ledger. Platform emails
-- (business_id null) and ALL writes are service-role only.
drop policy if exists email_events_member_read on public.email_events;
create policy email_events_member_read on public.email_events
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

grant select on public.email_events to authenticated;

drop trigger if exists email_events_updated_at on public.email_events;
create trigger email_events_updated_at
  before update on public.email_events
  for each row execute function public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 2. transactional_email_templates — the template registry
--    {{placeholder}} substitution happens in the email-service edge function.
-- ----------------------------------------------------------------------------
create table if not exists public.transactional_email_templates (
  key text primary key,
  subject text not null,
  body_html text not null,
  body_text text not null,
  category text not null default 'transactional',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactional_email_templates enable row level security;

-- Templates are not secret; any authenticated user may read them. Writes are
-- service-role only (no client write policy).
drop policy if exists transactional_email_templates_read on public.transactional_email_templates;
create policy transactional_email_templates_read on public.transactional_email_templates
  for select to authenticated using (true);

grant select on public.transactional_email_templates to authenticated;

insert into public.transactional_email_templates (key, subject, body_html, body_text) values
('welcome',
 'Welcome to {{product_name}} — your business is set up',
 '<h1>Welcome, {{name}}</h1><p>Your business <strong>{{business_name}}</strong> is ready. Avenize will now learn how your business works and show you what needs your attention.</p><p><a href="{{app_url}}">Open your workspace</a></p>',
 'Welcome, {{name}}. Your business {{business_name}} is ready. Open your workspace: {{app_url}}'),
('payment_receipt',
 'Payment received — {{plan_name}} ({{reference}})',
 '<h1>Payment received</h1><p>We received your payment of <strong>{{amount}}</strong> for <strong>{{plan_name}}</strong> ({{billing_cycle}}).</p><p>Reference: {{reference}}</p><p>Your plan is now active. Thank you for building with Avenize.</p>',
 'Payment received: {{amount}} for {{plan_name}} ({{billing_cycle}}). Reference: {{reference}}. Your plan is now active.'),
('payment_failed',
 'Your payment could not be completed ({{reference}})',
 '<h1>Payment not completed</h1><p>Your payment of <strong>{{amount}}</strong> for <strong>{{plan_name}}</strong> did not go through. No charge was made and your plan has not changed.</p><p>You can try again from your subscription page: {{app_url}}</p>',
 'Payment not completed: {{amount}} for {{plan_name}}. No charge was made. Try again: {{app_url}}'),
('subscription_activated',
 '{{plan_name}} is now active',
 '<h1>{{plan_name}} is active</h1><p>Your subscription to <strong>{{plan_name}}</strong> is now active. Next billing date: {{next_billing_date}}.</p><p>Every feature in your plan is unlocked: {{app_url}}</p>',
 '{{plan_name}} is active. Next billing date: {{next_billing_date}}.'),
('subscription_cancelled',
 'Your subscription has been cancelled',
 '<h1>Subscription cancelled</h1><p>Your <strong>{{plan_name}}</strong> subscription has been cancelled. You keep access until {{access_until}}.</p><p>You can reactivate any time: {{app_url}}</p>',
 'Your {{plan_name}} subscription has been cancelled. Access until {{access_until}}.'),
('invite',
 '{{inviter_name}} invited you to {{business_name}} on Avenize',
 '<h1>You are invited</h1><p>{{inviter_name}} invited you to join <strong>{{business_name}}</strong> on Avenize.</p><p><a href="{{invite_url}}">Accept the invitation</a></p>',
 '{{inviter_name}} invited you to join {{business_name}} on Avenize. Accept: {{invite_url}}'),
('quote_sent',
 'Quote {{quote_number}} from {{business_name}}',
 '<h1>You have a quote</h1><p>{{business_name}} sent you quote <strong>{{quote_number}}</strong> for {{amount}}.</p><p><a href="{{quote_url}}">Review and respond</a></p>',
 '{{business_name}} sent you quote {{quote_number}} for {{amount}}. Review: {{quote_url}}'),
('invoice_sent',
 'Invoice {{invoice_number}} from {{business_name}}',
 '<h1>New invoice</h1><p>{{business_name}} sent you invoice <strong>{{invoice_number}}</strong> for {{amount}}, due {{due_date}}.</p>',
 '{{business_name}} sent you invoice {{invoice_number}} for {{amount}}, due {{due_date}}.'),
('meeting_reminder',
 'Reminder: {{meeting_title}} at {{meeting_time}}',
 '<h1>Meeting reminder</h1><p><strong>{{meeting_title}}</strong> starts at {{meeting_time}}.</p><p><a href="{{meeting_url}}">Open the meeting</a></p>',
 'Reminder: {{meeting_title}} at {{meeting_time}}. {{meeting_url}}'),
('lead_notification',
 'New lead: {{lead_name}}',
 '<h1>New lead</h1><p><strong>{{lead_name}}</strong> ({{lead_source}}) just became a lead for {{business_name}}.</p><p><a href="{{app_url}}">Open your pipeline</a></p>',
 'New lead: {{lead_name}} ({{lead_source}}).'),
('task_assignment',
 'Task assigned: {{task_title}}',
 '<h1>New task</h1><p>{{assigner_name}} assigned you <strong>{{task_title}}</strong>{{#due_date}}, due {{due_date}}{{/due_date}}.</p><p><a href="{{app_url}}">Open your tasks</a></p>',
 'New task: {{task_title}}.'),
('security_alert',
 'Security alert on your account',
 '<h1>Security alert</h1><p>{{alert_detail}}</p><p>If this was not you, secure your account immediately: {{app_url}}</p>',
 'Security alert: {{alert_detail}}')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. queue_email — the ONE entry point for transactional email.
--    Members may queue for their own business; service-role callers (triggers,
--    edge functions, pg_cron) bypass the membership check (auth.uid() is null).
--    Unknown/inactive template -> NULL (best-effort no-op, never an error).
-- ----------------------------------------------------------------------------
create or replace function public.queue_email(
  p_business_id uuid,
  p_template text,
  p_recipient text,
  p_data jsonb default '{}'::jsonb,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_subject text;
begin
  if p_recipient is null or position('@' in p_recipient) = 0 then
    return null;
  end if;
  if auth.uid() is not null and p_business_id is not null and not exists (
    select 1 from public.get_current_staff() cs where cs.business_id = p_business_id
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select subject into v_subject
    from public.transactional_email_templates
   where key = p_template and active;
  if v_subject is null then
    return null;
  end if;
  insert into public.email_events (business_id, user_id, template, recipient, subject, payload, status)
  values (p_business_id, coalesce(p_user_id, auth.uid()), p_template, p_recipient, v_subject, coalesce(p_data, '{}'::jsonb), 'queued')
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.queue_email(uuid, text, text, jsonb, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Event-driven email: payment + subscription lifecycle
--    Each trigger is best-effort (EXCEPTION -> NULL): an email queue failure
--    must never break the financial write.
-- ----------------------------------------------------------------------------
create or replace function public.queue_payment_lifecycle_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient text;
  v_template text;
  v_amount text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status not in ('success', 'failed') then
    return new;
  end if;

  v_template := case when new.status = 'success' then 'payment_receipt' else 'payment_failed' end;
  v_amount := coalesce(to_char(coalesce(new.amount_cents, 0) / 100.0, 'FM999,999,990.00') || ' ' || new.currency, new.currency);

  -- Prefer the initiating user; fall back to the business owner.
  select s.email into v_recipient
    from public.staff s
   where s.business_id = new.business_id and s.user_id = new.user_id and s.email is not null
   limit 1;
  if v_recipient is null then
    select s.email into v_recipient
      from public.staff s
     where s.business_id = new.business_id and s.role = 'owner' and s.active and s.email is not null
     order by s.created_at
     limit 1;
  end if;

  perform public.queue_email(
    new.business_id,
    v_template,
    v_recipient,
    jsonb_build_object(
      'amount', v_amount,
      'plan_name', coalesce(new.plan_code, 'plan'),
      'billing_cycle', coalesce(new.billing_cycle, ''),
      'reference', new.provider_reference,
      'app_url', 'https://avenize.riverwayse.com/app/settings/subscription'
    ),
    new.user_id
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists payment_transactions_email on public.payment_transactions;
create trigger payment_transactions_email
  after update of status on public.payment_transactions
  for each row execute function public.queue_payment_lifecycle_email();

create or replace function public.queue_subscription_lifecycle_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient text;
  v_template text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'active' then
    v_template := 'subscription_activated';
  elsif new.status in ('cancelled', 'expired') then
    v_template := 'subscription_cancelled';
  else
    return new;
  end if;

  select s.email into v_recipient
    from public.staff s
   where s.business_id = new.business_id and s.role = 'owner' and s.active and s.email is not null
   order by s.created_at
   limit 1;

  perform public.queue_email(
    new.business_id,
    v_template,
    v_recipient,
    jsonb_build_object(
      'plan_name', new.plan_name,
      'next_billing_date', coalesce(to_char(new.next_billing_date, 'YYYY-MM-DD'), '—'),
      'access_until', coalesce(to_char(new.next_billing_date, 'YYYY-MM-DD'), 'the end of the paid period'),
      'app_url', 'https://avenize.riverwayse.com/app/settings/subscription'
    ),
    null
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists business_subscriptions_email on public.business_subscriptions;
create trigger business_subscriptions_email
  after insert or update of status on public.business_subscriptions
  for each row execute function public.queue_subscription_lifecycle_email();

-- ----------------------------------------------------------------------------
-- 5. email_events -> email-service fanout (async delivery).
--    Same pg_net pattern as 052's notification fanout; plpgsql resolves
--    net.http_post at EXECUTION time, so this compiles on hosts without
--    pg_net and simply no-ops there (best-effort, EXCEPTION -> NULL).
-- ----------------------------------------------------------------------------
create or replace function public.fanout_email_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edge_url text;
  v_service_key text;
begin
  if new.status = 'queued' then
    v_edge_url := coalesce(
      current_setting('app.avenize_edge_url', true),
      'https://kgsgqvatyleetyquffya.supabase.co/functions/v1/email-service'
    );
    v_service_key := current_setting('app.avenize_service_key', true);
    perform net.http_post(
      url := v_edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', case when v_service_key is not null
                              then 'Bearer ' || v_service_key
                              else to_jsonb(''::text) end
      ),
      body := jsonb_build_object('action', 'send', 'emailEventId', new.id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists email_events_fanout on public.email_events;
create trigger email_events_fanout
  after insert on public.email_events
  for each row execute function public.fanout_email_event();

-- ----------------------------------------------------------------------------
-- 6. business_email_domains — foundation for domain email (SPF/DKIM/DMARC via
--    Resend domain verification). Verification state is written by the email
--    service (service role); owners register + read.
-- ----------------------------------------------------------------------------
create table if not exists public.business_email_domains (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  domain text not null,
  status text not null default 'pending' check (status in ('pending','verifying','verified','failed')),
  provider_domain_id text,
  dns_records jsonb not null default '[]'::jsonb,
  from_addresses text[] not null default '{}',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, domain)
);

alter table public.business_email_domains enable row level security;

drop policy if exists business_email_domains_member_read on public.business_email_domains;
create policy business_email_domains_member_read on public.business_email_domains
  for select to authenticated
  using (business_id in (select business_id from public.get_current_staff()));

drop policy if exists business_email_domains_owner_insert on public.business_email_domains;
create policy business_email_domains_owner_insert on public.business_email_domains
  for insert to authenticated
  with check (business_id in (
    select business_id from public.get_current_staff() where role in ('owner','admin')
  ));

grant select, insert on public.business_email_domains to authenticated;

drop trigger if exists business_email_domains_updated_at on public.business_email_domains;
create trigger business_email_domains_updated_at
  before update on public.business_email_domains
  for each row execute function public.update_updated_at();

comment on table public.email_events is
  'Transactional email delivery ledger. Avenize owns the record; Resend owns delivery. resend-webhook updates delivery/bounce/open events by provider_message_id.';
comment on table public.business_email_domains is
  'Business sending domains (sales@/billing@/support@). DNS verification via Resend; verification state is written by the email service only.';
