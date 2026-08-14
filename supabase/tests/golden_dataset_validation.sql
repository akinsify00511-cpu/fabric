-- golden_dataset_validation.sql
-- §30 validation runner for the golden test datasets (098).
-- Apply 098 first, then run this script. It seeds each profile, runs the
-- intelligence engine, and SELECTs the results so a human (or test harness)
-- can assert against the expected outcomes documented in
-- INTELLIGENCE_TEST_MATRIX.md.
--
-- This is NOT a migration — it is a test fixture. Run it ad-hoc against a
-- test/staging Supabase project (never production). It cleans up after itself.

\set ON_ERROR_STOP off

-- Expected (see INTELLIGENCE_TEST_MATRIX.md):
--   A_healthy       → 0 critical recs; few/no recs; health reasonable
--   B_cashflow      → FIN-CF-001 critical fires; FIN-AR-002 may fire
--   C_sales_decline → SAL-CONV-001 fires (3 stale deals)
--   D_high_growth   → 0 negative recs; full stock (no INV-001)
--   E_inventory     → INV-001 fires (4 products)
--   F_project       → ProjectDelayed event present; project dimension reflects it
--   G_empty         → 0 recs (all rules NO-OP, §21); health insufficient_data

-- Seed + run intelligence for each profile, then read results.
DO $$
DECLARE v_bid UUID; v_profile TEXT;
BEGIN
  FOREACH v_profile IN ARRAY ARRAY['A_healthy','B_cashflow','C_sales_decline','D_high_growth','E_inventory','F_project','G_empty'] LOOP
    v_bid := seed_golden_dataset(v_profile);
    PERFORM refresh_business_metrics(v_bid);
    PERFORM run_recommendation_rules(v_bid);
    PERFORM compute_business_health(v_bid);
  END LOOP;
END $$;

-- Per-profile result summary for assertion.
SELECT
  b.name AS profile,
  (SELECT count(*) FROM claims c WHERE c.business_id=b.id AND c.claim_type='RECOMMENDATION' AND c.status='issued') AS recs,
  (SELECT count(*) FROM claims c WHERE c.business_id=b.id AND c.claim_type='RECOMMENDATION' AND c.status='issued' AND c.severity='critical') AS critical_recs,
  COALESCE((SELECT array_agg(DISTINCT c.rule_id) FROM claims c WHERE c.business_id=b.id AND c.claim_type='RECOMMENDATION' AND c.status='issued'), ARRAY[]::TEXT[]) AS fired_rules,
  (SELECT h.overall_score FROM business_health_scores h WHERE h.business_id=b.id ORDER BY h.computed_at DESC LIMIT 1) AS health_overall
FROM businesses b
WHERE b.name LIKE 'GOLDEN-%'
ORDER BY b.name;

-- G_empty must have fired NO recommendations (§21 small-data safety).
SELECT count(*) AS g_empty_recs
FROM claims c JOIN businesses b ON b.id=c.business_id
WHERE b.name='GOLDEN-G_empty' AND c.claim_type='RECOMMENDATION' AND c.status='issued';
-- Expected: 0

-- F_project must have a ProjectDelayed event.
SELECT count(*) AS f_project_delayed_events
FROM business_events e JOIN businesses b ON b.id=e.business_id
WHERE b.name='GOLDEN-F_project' AND e.event_type='ProjectDelayed';
-- Expected: 1

-- Cleanup all golden data.
SELECT cleanup_golden_datasets();
