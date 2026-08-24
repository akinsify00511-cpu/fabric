-- ============================================================================
-- Marketing attribution report — the platform-operator ad → revenue join.
--
-- Complements the per-business attribution_revenue (20260824150000): that
-- one answers "which campaigns produced THIS business's revenue" for the
-- owner; this one answers "which channels drive signups and revenue ACROSS
-- the platform" for the operator deciding ad spend.
--
-- Closes the acquisition loop end to end:
--   ad click (utm/fbclid) → landing (discovery_referrals at signup)
--   → checkout (payment_transactions.metadata.attribution)
--   → verified payment (paystack-webhook settlement) → revenue.
--
-- SECURITY: gated by is_platform_admin() (the platform-operator email
-- allowlist, NOT a business role). Aggregate-only (#21): counts and sums per
-- channel — never business names, ids, emails, or individual transactions.
-- The in-function gate is the real boundary (the 998 blanket GRANT makes
-- EXECUTE broadly available; the gate decides what is returned).
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.marketing_attribution_report()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN jsonb_build_object(
      'authorized', false,
      'channels', '[]'::JSONB,
      'totals', NULL,
      'data_scope', 'aggregate_only_no_business_pii'
    );
  END IF;

  WITH payments AS (
    SELECT
      COALESCE(NULLIF(t.metadata->'attribution'->>'source', ''), 'direct') AS source,
      COALESCE(NULLIF(t.metadata->'attribution'->>'medium', ''), 'none') AS medium,
      COALESCE(NULLIF(t.metadata->'attribution'->>'campaign', ''), 'none') AS campaign,
      t.status,
      t.amount_cents,
      t.paid_at
    FROM public.payment_transactions t
    WHERE t.kind = 'subscription_checkout'
  ),
  referrals AS (
    SELECT
      COALESCE(NULLIF(r.source, ''), 'direct') AS source,
      COALESCE(NULLIF(r.medium, ''), 'none') AS medium,
      COALESCE(NULLIF(r.campaign, ''), 'none') AS campaign
    FROM public.discovery_referrals r
    WHERE r.entity_type = 'business'
  ),
  channel_keys AS (
    SELECT source, medium, campaign FROM payments
    UNION
    SELECT source, medium, campaign FROM referrals
  ),
  channels AS (
    SELECT
      k.source,
      k.medium,
      k.campaign,
      (SELECT COUNT(*) FROM referrals r
        WHERE r.source = k.source AND r.medium = k.medium AND r.campaign = k.campaign) AS signups,
      (SELECT COUNT(*) FROM payments p
        WHERE p.source = k.source AND p.medium = k.medium AND p.campaign = k.campaign) AS checkouts,
      (SELECT COUNT(*) FROM payments p
        WHERE p.source = k.source AND p.medium = k.medium AND p.campaign = k.campaign
          AND p.status = 'success') AS purchases,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
        WHERE p.source = k.source AND p.medium = k.medium AND p.campaign = k.campaign
          AND p.status = 'success') AS revenue_cents,
      (SELECT MAX(p.paid_at) FROM payments p
        WHERE p.source = k.source AND p.medium = k.medium AND p.campaign = k.campaign
          AND p.status = 'success') AS last_conversion_at
    FROM channel_keys k
  )
  SELECT jsonb_build_object(
    'authorized', true,
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'source', c.source,
        'medium', c.medium,
        'campaign', c.campaign,
        'signups', c.signups,
        'checkouts', c.checkouts,
        'purchases', c.purchases,
        'revenue_cents', c.revenue_cents,
        'avg_order_value_cents', CASE WHEN c.purchases > 0 THEN c.revenue_cents / c.purchases ELSE NULL END,
        'signup_to_purchase_rate', CASE WHEN c.signups > 0 THEN ROUND(c.purchases::NUMERIC / c.signups, 4) ELSE NULL END,
        'last_conversion_at', c.last_conversion_at
      ) ORDER BY c.revenue_cents DESC, c.purchases DESC, c.signups DESC)
      FROM channels c
    ), '[]'::JSONB),
    'totals', (
      SELECT jsonb_build_object(
        'signups', COALESCE(SUM(c.signups), 0),
        'checkouts', COALESCE(SUM(c.checkouts), 0),
        'purchases', COALESCE(SUM(c.purchases), 0),
        'revenue_cents', COALESCE(SUM(c.revenue_cents), 0)
      )
      FROM channels c
    ),
    'data_scope', 'aggregate_only_no_business_pii'
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marketing_attribution_report() TO authenticated;

COMMENT ON FUNCTION public.marketing_attribution_report() IS 'Platform-operator marketing attribution: ad → signup → checkout → verified payment → revenue per (source, medium, campaign) across the platform. Gated by is_platform_admin (email allowlist, NOT a business role). Aggregate-only (#21): counts and sums — never business identities or individual transactions. Signup provenance from discovery_referrals (B14); payment provenance from payment_transactions.metadata.attribution (captured at checkout, settled by paystack-webhook). Complements the per-business attribution_revenue (20260824150000).';
