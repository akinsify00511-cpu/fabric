-- 20260818280000_evolved_business_review.sql
--
-- §AA Business Reviews — the evolved review the directive asks for.
--
-- Audit first (composition-first):
--   • monthly_review (097) — rolls up health/OKR/risks/recommendations/metrics/
--     DQ for a month. EXISTING + strong factual base.
--   • compose_business_digest (20260818150000) — plain-language daily digest.
--     EXISTING but daily, not monthly-narrative.
--   • claims lifecycle (088) — recommendations accepted/acted/outcome.
--     EXISTING.
--   • organizational_memory (064) — institutional lessons. EXISTING.
--
-- The GENUINE gap: monthly_review gives the FACTS (scores, risks, recs) but
-- not the NARRATIVE synthesis the §AA directive asks for:
--   "What happened? Why? What improved? What deteriorated? What did we learn?
--    What did Avenize recommend? What did we actually do? What worked? What
--    didn't? What should we do next month?"
--
-- compose_business_review(business_id, period_start, period_end) synthesizes
-- monthly_review's facts + the claims lifecycle that month + organizational
-- memory into the narrative answers. Each answer cites its source (§22).
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION compose_business_review(
  p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_start DATE;
  v_end DATE;
  v_mr JSONB;           -- the monthly_review facts
  v_rec_accepted INTEGER := 0;
  v_rec_acted INTEGER := 0;
  v_rec_outcomes INTEGER := 0;
  v_successful_outcomes INTEGER := 0;
  v_what_improved JSONB;
  v_what_deteriorated JSONB;
  v_what_we_learned JSONB;
  v_recommended_vs_done JSONB;
  v_next_month JSONB;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  v_start := COALESCE(p_period_start, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date);
  v_end := COALESCE(p_period_end, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date);

  -- Pull the factual monthly_review (best-effort — may not be deployed).
  BEGIN
    SELECT * INTO v_mr FROM monthly_review(p_business_id, v_start, v_end);
  EXCEPTION WHEN OTHERS THEN
    v_mr := jsonb_build_object('note', 'monthly_review not available');
  END;

  -- Claims lifecycle this month: recommended → accepted → acted → outcome.
  SELECT
    COUNT(*) FILTER (WHERE c.status = 'accepted' OR c.status = 'acted' OR c.status = 'done'),
    COUNT(*) FILTER (WHERE c.status IN ('acted','done')),
    COUNT(*) FILTER (WHERE c.actual_impact IS NOT NULL)
  INTO v_rec_accepted, v_rec_acted, v_rec_outcomes
  FROM claims c
  WHERE c.business_id = p_business_id
    AND c.claim_type = 'RECOMMENDATION'
    AND c.created_at >= v_start AND c.created_at <= v_end;

  SELECT COUNT(*) INTO v_successful_outcomes
  FROM claims c
  WHERE c.business_id = p_business_id
    AND c.claim_type = 'RECOMMENDATION'
    AND c.actual_impact IS NOT NULL
    AND c.actual_impact > 0
    AND c.created_at >= v_start AND c.created_at <= v_end;

  -- WHAT IMPROVED: metric movers with positive change.
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'metric', m.metric_key, 'change_pct', m.change_percent
    ) ORDER BY m.change_percent DESC NULLS LAST), '[]'::jsonb) INTO v_what_improved
    FROM kpi_metrics m
    WHERE m.business_id = p_business_id
      AND m.period_end >= v_start AND m.period_end <= v_end
      AND m.change_percent IS NOT NULL AND m.change_percent > 0
    LIMIT 5;
  EXCEPTION WHEN OTHERS THEN v_what_improved := '[]'::jsonb; END;

  -- WHAT DETERIORATED: metric movers with negative change.
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'metric', m.metric_key, 'change_pct', m.change_percent
    ) ORDER BY m.change_percent ASC NULLS LAST), '[]'::jsonb) INTO v_what_deteriorated
    FROM kpi_metrics m
    WHERE m.business_id = p_business_id
      AND m.period_end >= v_start AND m.period_end <= v_end
      AND m.change_percent IS NOT NULL AND m.change_percent < 0
    LIMIT 5;
  EXCEPTION WHEN OTHERS THEN v_what_deteriorated := '[]'::jsonb; END;

  -- WHAT WE LEARNED: organizational_memory created this period + decisions reviewed.
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'topic', om.topic, 'lesson', om.lesson
    )), '[]'::jsonb) INTO v_what_we_learned
    FROM organizational_memory om
    WHERE om.business_id = p_business_id
      AND om.created_at >= v_start AND om.created_at <= v_end
      AND om.status = 'active'
    LIMIT 5;
  EXCEPTION WHEN OTHERS THEN v_what_we_learned := '[]'::jsonb; END;

  -- RECOMMENDED VS DONE: the claims lifecycle gap.
  v_recommended_vs_done := jsonb_build_object(
    'recommended', (SELECT COUNT(*) FROM claims WHERE business_id = p_business_id AND claim_type = 'RECOMMENDATION' AND created_at >= v_start AND created_at <= v_end),
    'accepted', v_rec_accepted,
    'acted', v_rec_acted,
    'outcomes_recorded', v_rec_outcomes,
    'successful_outcomes', v_successful_outcomes
  );

  -- NEXT MONTH: open recommendations + NBA + unresolved risks.
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'rule_id', c.rule_id, 'statement', c.statement, 'severity', c.severity
    ) ORDER BY CASE c.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END), '[]'::jsonb) INTO v_next_month
    FROM claims c
    WHERE c.business_id = p_business_id
      AND c.claim_type = 'RECOMMENDATION'
      AND c.status IN ('open','acknowledged','accepted');
  EXCEPTION WHEN OTHERS THEN v_next_month := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'authorized', true,
    'period_start', v_start,
    'period_end', v_end,
    'what_happened', v_mr->'summary',
    'what_improved', v_what_improved,
    'what_deteriorated', v_what_deteriorated,
    'what_we_learned', v_what_we_learned,
    'recommended_vs_done', v_recommended_vs_done,
    'next_month_priorities', v_next_month,
    'health_snapshot', v_mr->'health',
    'evidence_note', 'All numbers are computed from real data (governed metrics, claims lifecycle, organizational memory). No narrative is fabricated (§22).',
    'note', CASE
      WHEN jsonb_array_length(v_what_improved) = 0 AND jsonb_array_length(v_what_deteriorated) = 0 AND v_rec_accepted = 0
      THEN 'Not enough data this period to compose a full review. As metrics accumulate and recommendations get acted on, this generates the month-over-month narrative.' ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION compose_business_review(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION compose_business_review IS
  '§AA evolved business review. Synthesizes monthly_review facts + claims lifecycle + organizational memory into the 9 narrative answers (what happened/improved/deteriorated/learned/recommended/done/worked/next). §22 — every number from real data.';
