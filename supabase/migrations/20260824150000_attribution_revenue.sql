-- ============================================================================
-- Attribution -> revenue chain completion (go/no-go item 9).
--
-- The existing chain (20260819090000) preserves:
--   UTM/source -> visit -> signup -> business -> discovery_referrals
-- and discovery_roi connects referrals to deal + subscription revenue.
--
-- This closes the remaining hop:
--   business -> checkout -> Paystack reference -> subscription -> revenue
--
-- The subscription-management edge function stores the browser-captured
-- attribution (advisory, non-privileged metadata) on the payment_transactions
-- ledger row at checkout creation. This RPC reads THAT ledger so revenue is
-- attributed to the campaign that produced it — per source/medium/campaign.
--
-- Anti-fabrication (§22): every number comes from real rows. Buckets with no
-- data simply do not appear; 'unattributed' is reported honestly.
-- ============================================================================

create or replace function public.attribution_revenue(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_campaign jsonb;
  v_totals jsonb;
begin
  -- Membership guard (SECURITY DEFINER bypasses RLS — this IS the boundary).
  if not exists (
    select 1 from public.get_current_staff() cs where cs.business_id = p_business_id
  ) then
    return jsonb_build_object('authorized', false);
  end if;

  -- Per-campaign rollup. The attribution metadata key is written by the
  -- subscription-management edge function (sanitized server-side); rows
  -- without attribution fall into the honest 'direct / unattributed' bucket.
  with tx as (
    select
      coalesce(nullif(t.metadata #>> '{attribution,campaign}', ''), '(no campaign)') as campaign,
      coalesce(nullif(t.metadata #>> '{attribution,source}', ''), 'direct') as source,
      coalesce(nullif(t.metadata #>> '{attribution,medium}', ''), 'none') as medium,
      t.status,
      t.amount_cents
    from public.payment_transactions t
    where t.business_id = p_business_id
      and t.provider = 'paystack'
  ),
  rollup as (
    select
      campaign, source, medium,
      count(*) as checkouts,
      count(*) filter (where status = 'success') as successful,
      coalesce(sum(amount_cents) filter (where status = 'success'), 0) / 100.0 as revenue
    from tx
    group by campaign, source, medium
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign', r.campaign,
    'source', r.source,
    'medium', r.medium,
    'checkouts', r.checkouts,
    'successful', r.successful,
    'revenue', r.revenue
  ) order by r.revenue desc, r.checkouts desc), '[]'::jsonb)
  into v_by_campaign
  from rollup r;

  select jsonb_build_object(
    'checkouts', count(*),
    'successful', count(*) filter (where t.status = 'success'),
    'revenue', coalesce(sum(t.amount_cents) filter (where t.status = 'success'), 0) / 100.0,
    'attributed_checkouts', count(*) filter (where t.metadata #>> '{attribution,campaign}' is not null)
  )
  into v_totals
  from public.payment_transactions t
  where t.business_id = p_business_id and t.provider = 'paystack';

  return jsonb_build_object(
    'authorized', true,
    'totals', coalesce(v_totals, '{}'::jsonb),
    'by_campaign', v_by_campaign,
    'note', case
      when coalesce((v_totals ->> 'checkouts')::int, 0) = 0
        then 'No checkouts recorded yet. Revenue attribution starts the moment a plan checkout is created.'
      when coalesce((v_totals ->> 'attributed_checkouts')::int, 0) = 0
        then 'Checkouts exist but none carry campaign attribution yet. Campaign-tagged visits (UTM links) will appear here once they convert.'
      else null end
  );
end;
$$;

revoke execute on function public.attribution_revenue(uuid) from public, anon;
grant execute on function public.attribution_revenue(uuid) to authenticated;

comment on function public.attribution_revenue(uuid) is
  'Attribution -> revenue: per-campaign checkout/success/revenue rollup from the payment_transactions ledger. Membership-guarded; honest empty buckets (§22).';
