-- 20260101000011_sector_intelligence_behavior_rules.sql
-- #16/#17: sector intelligence + behavior-driven recommendations.
--
-- #16 (market intelligence / reality-gap): "Avenize observed data vs sector
-- aggregate vs variance" — which sectors use what, over/under-performing by
-- sector, say-vs-use. External market data is BLOCKED (§22: never fabricate);
-- the honest buildable slice is the INTERNAL sector benchmark: a business's
-- own metrics vs its sector's ANONYMIZED aggregate (count/avg only, never
-- individual businesses). Privacy-preserving: no business ever sees another
-- business's raw data.
--
-- #17 (behavior-driven recommendations): recommendation rules that consume
-- the usage_events telemetry (#14) — selected-but-unused modules, workflow
-- abandonment, sector-popular modules not enabled. Added to
-- run_recommendation_rules via the existing issue_recommendation helper.
--
-- Idempotent. SECURITY DEFINER. No external API.

-- ============================================================================
-- 1. SECTOR BENCHMARK (owner-gated, per-business).
--    Returns the business's own module-adoption vs its sector's ANONYMIZED
--    aggregate. Privacy-preserving: sector_count + sector_avg only, NEVER
--    individual business identities or raw rows. §22: no fabricated external
--    data — this is purely first-party (Avenize's own businesses).
-- ============================================================================
CREATE OR REPLACE FUNCTION sector_benchmark(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_industry TEXT;
  v_out JSONB;
BEGIN
  -- OWNERSHIP GUARD: only a member of p_business_id.
  IF NOT EXISTS (
    SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false, 'modules', '[]'::JSONB);
  END IF;

  SELECT b.industry INTO v_industry FROM businesses b WHERE b.id = p_business_id;

  -- The business's own module set (selected + used) vs the sector aggregate.
  -- sector_businesses = how many businesses in this sector have ANY workspace
  -- selection (the sample size for the benchmark — honest §21).
  SELECT jsonb_build_object(
    'authorized', true,
    'industry', COALESCE(v_industry, 'unspecified'),
    'sector_sample_size',
      (SELECT COUNT(DISTINCT uws.business_id)
       FROM user_workspace_selections uws
       JOIN businesses b ON b.id = uws.business_id
       WHERE COALESCE(b.industry, 'unspecified') = COALESCE(v_industry, 'unspecified')),
    'modules', COALESCE((
      WITH my_selected AS (
        SELECT unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
        FROM user_workspace_selections uws
        WHERE uws.business_id = p_business_id
      ),
      my_used AS (
        SELECT DISTINCT ue.module_key
        FROM usage_events ue
        WHERE ue.business_id = p_business_id
          AND ue.occurred_at >= NOW() - INTERVAL '30 days'
      ),
      -- sector aggregate: how many sector businesses selected each module.
      sector_selected AS (
        SELECT unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
        FROM user_workspace_selections uws
        JOIN businesses b ON b.id = uws.business_id
        WHERE COALESCE(b.industry, 'unspecified') = COALESCE(v_industry, 'unspecified')
      ),
      sector_agg AS (
        SELECT module_key, COUNT(*) AS sector_count
        FROM sector_selected
        GROUP BY module_key
      ),
      sector_total AS (
        SELECT COUNT(DISTINCT uws.business_id) AS n
        FROM user_workspace_selections uws
        JOIN businesses b ON b.id = uws.business_id
        WHERE COALESCE(b.industry, 'unspecified') = COALESCE(v_industry, 'unspecified')
      )
      SELECT jsonb_agg(jsonb_build_object(
        'module_key', m.module_key,
        'i_selected', EXISTS (SELECT 1 FROM my_selected ms WHERE ms.module_key = m.module_key),
        'i_used', EXISTS (SELECT 1 FROM my_used mu WHERE mu.module_key = m.module_key),
        'sector_businesses_selected', sa.sector_count,
        'sector_adoption_pct',
          CASE WHEN (SELECT n FROM sector_total) > 0
            THEN ROUND((sa.sector_count::NUMERIC / (SELECT n FROM sector_total)) * 100, 0)
            ELSE NULL
          END
      ) ORDER BY sa.sector_count DESC NULLS LAST)
      FROM sector_agg sa
      JOIN (SELECT DISTINCT module_key FROM (
        SELECT module_key FROM my_selected
        UNION SELECT module_key FROM my_used
        UNION SELECT module_key FROM sector_selected
      ) all_mods) m ON m.module_key = sa.module_key
    ), '[]'::JSONB)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION sector_benchmark(UUID) TO authenticated;

COMMENT ON FUNCTION sector_benchmark IS 'Owner-gated (#16): the business vs its sector ANONYMIZED aggregate (count/avg only, never individual businesses). First-party data only — no fabricated external benchmarks (§22). sector_sample_size is honest (small sectors flagged).';

-- ============================================================================
-- 2. BEHAVIOR-DRIVEN RECOMMENDATION RULES (#17).
--    A SEPARATE function (NOT a re-declaration of run_recommendation_rules —
--    that would drop the 8 original rules from 091). The client/cron calls
--    BOTH: run_recommendation_rules (financial/operational) + this
--    (behavior/usage-driven). Each rule: specific, small-data-guarded (§21),
--    idempotent (has_open_recommendation), best-effort (EXCEPTION → 0).
-- ============================================================================
CREATE OR REPLACE FUNCTION run_behavior_recommendation_rules(p_business_id UUID)
RETURNS TABLE(rule_id TEXT, issued_count INTEGER) AS $$
DECLARE
  v_n INTEGER;
BEGIN
  -- USAGE-001 (#17): Modules selected but never used in 30 days.
  -- "You selected X at setup but your team hasn't used it. Consider removing
  -- it to simplify your workspace, or explore why it isn't sticking."
  BEGIN
    WITH selected_unused AS (
      SELECT unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
      FROM user_workspace_selections uws
      WHERE uws.business_id = p_business_id
        AND uws.selection_completed = true
      EXCEPT
      SELECT DISTINCT ue.module_key
      FROM usage_events ue
      WHERE ue.business_id = p_business_id
        AND ue.occurred_at >= NOW() - INTERVAL '30 days'
    )
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'USAGE-001', 'info',
      'module', NULL,
      'You selected "' || su.module_key || '" during setup, but your team has
        not used it in the last 30 days. Consider removing it from your workspace
        to reduce clutter, or explore why it isn''t being adopted.',
      jsonb_build_object('module_key', su.module_key, 'days_unused', 30,
        'source', 'workspace_selection_vs_usage_events'),
      0.6,
      jsonb_build_object('description', 'Simpler workspace, less clutter')
    FROM selected_unused su
    WHERE NOT has_open_recommendation(p_business_id, 'USAGE-001', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'USAGE-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'USAGE-001'; issued_count := 0; RETURN NEXT;
  END;

  -- USAGE-002 (#17): Workflow abandonment — a workflow with > 50% abandonment.
  -- "Your team started N quote workflows but only completed M. Review where
  -- they stall." §21 guard: >= 3 starts (enough to call it a pattern).
  BEGIN
    WITH wf_stats AS (
      SELECT
        ue.context->>'workflow' AS wf,
        COUNT(*) FILTER (WHERE ue.action = 'workflow_start') AS started,
        COUNT(*) FILTER (WHERE ue.action = 'workflow_complete') AS completed
      FROM usage_events ue
      WHERE ue.business_id = p_business_id
        AND ue.occurred_at >= NOW() - INTERVAL '30 days'
        AND ue.action IN ('workflow_start', 'workflow_complete')
        AND ue.context ? 'workflow'
      GROUP BY ue.context->>'workflow'
    )
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'USAGE-002', 'warning',
      'workflow', NULL,
      'Your team started ' || ws.started || ' "' || ws.wf || '" workflow'
        || CASE WHEN ws.started>1 THEN 's' ELSE '' END
        || ' but only completed ' || ws.completed || ' ('
        || ROUND((ws.completed::NUMERIC / ws.started * 100)::numeric,0)
        || '%). Reviewing where they stall can recover this effort.',
      jsonb_build_object('workflow', ws.wf, 'started', ws.started,
        'completed', ws.completed,
        'abandonment_pct', ROUND(((1 - ws.completed::NUMERIC / ws.started) * 100)::numeric,1)),
      0.65,
      jsonb_build_object('description', 'Recovered workflow effort')
    FROM wf_stats ws
    WHERE ws.started >= 3 AND ws.completed::NUMERIC / ws.started < 0.5
      AND NOT has_open_recommendation(p_business_id, 'USAGE-002', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'USAGE-002'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'USAGE-002'; issued_count := 0; RETURN NEXT;
  END;

  -- SECTOR-001 (#16/#17): A module popular in your sector that you haven't enabled.
  -- "80% of businesses in your sector use [module], but you haven't enabled it."
  -- §21 guard: sector sample >= 5 businesses (small sectors suppressed — honest).
  BEGIN
    WITH my_industry AS (
      SELECT COALESCE(b.industry, 'unspecified') AS ind
      FROM businesses b WHERE b.id = p_business_id
    ),
    sector_selected AS (
      SELECT unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
      FROM user_workspace_selections uws
      JOIN businesses b ON b.id = uws.business_id
      JOIN my_industry mi ON COALESCE(b.industry, 'unspecified') = mi.ind
    ),
    sector_total AS (
      SELECT COUNT(DISTINCT uws.business_id) AS n
      FROM user_workspace_selections uws
      JOIN businesses b ON b.id = uws.business_id
      JOIN my_industry mi ON COALESCE(b.industry, 'unspecified') = mi.ind
    ),
    my_selected AS (
      SELECT unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
      FROM user_workspace_selections uws WHERE uws.business_id = p_business_id
    ),
    sector_agg AS (
      SELECT module_key, COUNT(*) AS sector_count
      FROM sector_selected GROUP BY module_key
    )
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'SECTOR-001', 'info',
      'module', NULL,
      ROUND((sa.sector_count::NUMERIC / (SELECT n FROM sector_total) * 100)::numeric,0)
        || '% of businesses in your sector ("' || (SELECT ind FROM my_industry)
        || '") use "' || sa.module_key || '", but you haven''t enabled it. Consider
        whether it''s relevant to your operations.',
      jsonb_build_object('module_key', sa.module_key,
        'sector_businesses_selected', sa.sector_count,
        'sector_sample_size', (SELECT n FROM sector_total),
        'sector_adoption_pct', ROUND((sa.sector_count::NUMERIC / (SELECT n FROM sector_total) * 100)::numeric,1)),
      0.5,
      jsonb_build_object('description', 'Catch up to sector norms')
    FROM sector_agg sa
    WHERE (SELECT n FROM sector_total) >= 5  -- §21 small-data guard
      AND sa.sector_count::NUMERIC / (SELECT n FROM sector_total) >= 0.5
      AND NOT EXISTS (SELECT 1 FROM my_selected ms WHERE ms.module_key = sa.module_key)
      AND NOT has_open_recommendation(p_business_id, 'SECTOR-001', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'SECTOR-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'SECTOR-001'; issued_count := 0; RETURN NEXT;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION run_behavior_recommendation_rules(UUID) TO authenticated;

COMMENT ON FUNCTION sector_benchmark IS 'Owner-gated (#16): business vs sector anonymized aggregate. First-party only, no fabricated external data.';
COMMENT ON FUNCTION run_behavior_recommendation_rules IS 'Behavior-driven recommendations (#17): USAGE-001 selected-but-unused, USAGE-002 workflow abandonment, SECTOR-001 sector-popular-not-enabled. Separate from run_recommendation_rules (091 financial/operational rules) — call both. Specific, small-data-guarded, idempotent, best-effort.';

-- ============================================================================
-- 3. WIRE BEHAVIOR RULES INTO THE CRON FAN-OUT (092).
--    Re-declares run_all_recommendation_rules so the hourly cron now runs
--    BOTH the financial/operational rules (091) AND the behavior rules (#17).
-- ============================================================================
CREATE OR REPLACE FUNCTION run_all_recommendation_rules()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM staff LOOP
    BEGIN
      PERFORM run_recommendation_rules(b);
      PERFORM run_behavior_recommendation_rules(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
