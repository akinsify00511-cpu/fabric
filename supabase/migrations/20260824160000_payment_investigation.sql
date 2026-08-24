-- ============================================================================
-- Payment Investigation (go/no-go item 14) — the Friday-incident tool.
--
-- A Riverways platform admin enters a customer email and/or a Paystack
-- reference; Avenize answers, stage by stage, how far the payment got:
--
--   checkout -> provider -> webhook -> verification -> ledger
--     -> subscription -> entitlement
--
-- Every stage verdict comes from real rows in the payment ledger chain
-- (20260822150000). The provider stage is honestly marked 'external' — the
-- definitive provider-side status lives in the Paystack dashboard, which this
-- RPC cannot query; everything AFTER the provider is answered from our own
-- records. A "no ledger row at all" result is itself the answer: the checkout
-- never reached our system, so the customer could not have been charged by a
-- completed Avenize checkout — reconcile against the Paystack dashboard.
--
-- Gate: is_riverways_admin() (20260821000000). Non-admins get
-- {authorized:false} with NO payload — this is a cross-business read.
-- ============================================================================

create or replace function public.riverways_payment_investigation(
  p_reference text default null,
  p_email text default null,
  p_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matches jsonb;
  v_tx record;
  v_business_ids uuid[];
  v_has_webhook boolean;
  v_sub record;
  v_ent_plan text;
  v_stages jsonb;
begin
  if not public.is_riverways_admin() then
    return jsonb_build_object('authorized', false);
  end if;

  if nullif(trim(coalesce(p_reference, '')), '') is null
     and nullif(trim(coalesce(p_email, '')), '') is null then
    return jsonb_build_object(
      'authorized', true,
      'error', 'Provide a Paystack reference or a customer email.'
    );
  end if;

  -- Resolve the business set for an email lookup via staff rows.
  if nullif(trim(coalesce(p_email, '')), '') is not null then
    select coalesce(array_agg(distinct s.business_id), '{}'::uuid[])
    into v_business_ids
    from public.staff s
    where lower(s.email) = lower(trim(p_email));
  else
    v_business_ids := null;
  end if;

  v_matches := '[]'::jsonb;

  for v_tx in
    select t.*, b.name as business_name
    from public.payment_transactions t
    left join public.businesses b on b.id = t.business_id
    where (
      nullif(trim(coalesce(p_reference, '')), '') is not null
      and t.provider_reference = trim(p_reference)
    ) or (
      v_business_ids is not null
      and t.business_id = any (v_business_ids)
      and t.created_at >= now() - make_interval(days => greatest(p_days, 1))
    )
    order by t.created_at desc
    limit 20
  loop
    select exists (
      select 1 from public.payment_webhook_events w
      where w.provider = v_tx.provider
        and (
          w.payload #>> '{data,reference}' = v_tx.provider_reference
          or w.event_id like '%' || v_tx.provider_reference || '%'
        )
    ) into v_has_webhook;

    select s.plan_code, s.status, s.billing_cycle, s.next_billing_date,
           s.last_payment_reference
    into v_sub
    from public.business_subscriptions s
    where s.business_id = v_tx.business_id
    limit 1;

    select e.plan into v_ent_plan
    from public.business_entitlements e
    where e.business_id = v_tx.business_id;

    v_stages := jsonb_build_array(
      jsonb_build_object(
        'stage', 'checkout',
        'status', 'ok',
        'detail', format('Checkout created %s — amount %s %s (%s)',
                         to_char(v_tx.created_at, 'YYYY-MM-DD HH24:MI'),
                         coalesce((v_tx.amount_cents / 100.0)::text, '?'),
                         upper(v_tx.currency), v_tx.kind)
      ),
      jsonb_build_object(
        'stage', 'provider',
        'status', 'external',
        'detail', 'The definitive provider-side status lives in the Paystack dashboard — search reference ' || v_tx.provider_reference || '. Everything after this stage is answered from Avenize records.'
      ),
      jsonb_build_object(
        'stage', 'webhook',
        'status', case when v_has_webhook then 'ok' else 'missing' end,
        'detail', case when v_has_webhook
                    then 'Provider webhook received and recorded (idempotency ledger).'
                    else 'No webhook event recorded for this reference.' end
      ),
      jsonb_build_object(
        'stage', 'verification',
        'status', case when v_tx.verified_at is not null then 'ok' else 'missing' end,
        'detail', case when v_tx.verified_at is not null
                    then 'Server-side re-verification against Paystack completed ' || to_char(v_tx.verified_at, 'YYYY-MM-DD HH24:MI') || '.'
                    else 'The transaction was never re-verified against Paystack.' end
      ),
      jsonb_build_object(
        'stage', 'ledger',
        'status', case v_tx.status
                    when 'success' then 'ok'
                    when 'failed' then 'failed'
                    when 'refunded' then 'ok'
                    else 'pending' end,
        'detail', 'Ledger status: ' || v_tx.status
      ),
      jsonb_build_object(
        'stage', 'subscription',
        'status', case
                    when v_sub.plan_code is not null
                         and v_sub.status in ('active', 'trialing') then 'ok'
                    when v_sub.plan_code is not null then 'failed'
                    else 'missing' end,
        'detail', case
                    when v_sub.plan_code is not null
                      then format('Subscription plan %s (%s, %s).', v_sub.plan_code, v_sub.billing_cycle, v_sub.status)
                    else 'No subscription row exists for this business.' end
      ),
      jsonb_build_object(
        'stage', 'entitlement',
        'status', case
                    when v_sub.plan_code is not null and v_ent_plan = v_sub.plan_code then 'ok'
                    when v_ent_plan is not null and v_ent_plan <> 'free' then 'failed'
                    else 'missing' end,
        'detail', case
                    when v_ent_plan is not null
                      then 'Entitlement plan: ' || v_ent_plan
                    else 'No entitlement row exists for this business.' end
      )
    );

    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'reference', v_tx.provider_reference,
      'provider', v_tx.provider,
      'business_id', v_tx.business_id,
      'business_name', v_tx.business_name,
      'plan_code', v_tx.plan_code,
      'billing_cycle', v_tx.billing_cycle,
      'amount_cents', v_tx.amount_cents,
      'currency', v_tx.currency,
      'status', v_tx.status,
      'created_at', v_tx.created_at,
      'paid_at', v_tx.paid_at,
      'verified_at', v_tx.verified_at,
      'attribution', v_tx.metadata -> 'attribution',
      'stages', v_stages
    ));
  end loop;

  return jsonb_build_object(
    'authorized', true,
    'query', jsonb_build_object(
      'reference', nullif(trim(coalesce(p_reference, '')), ''),
      'email', nullif(trim(coalesce(p_email, '')), ''),
      'days', p_days
    ),
    'matches', v_matches,
    'note', case
      when jsonb_array_length(v_matches) = 0 then
        'No payment record exists in the Avenize ledger for this lookup. That means the checkout never reached our system — reconcile against the Paystack dashboard directly: if Paystack shows a successful charge with a reference, the customer paid but the checkout/webhook path failed before writing the ledger, and the subscription must be repaired manually.'
      else null end
  );
end;
$$;

revoke execute on function public.riverways_payment_investigation(text, text, integer) from public, anon;
grant execute on function public.riverways_payment_investigation(text, text, integer) to authenticated;

comment on function public.riverways_payment_investigation(text, text, integer) is
  'Riverways admin payment investigation: stage-by-stage checklist (checkout/provider/webhook/verification/ledger/subscription/entitlement) for a Paystack reference or customer email. is_riverways_admin()-gated; {authorized:false} with no payload otherwise.';
