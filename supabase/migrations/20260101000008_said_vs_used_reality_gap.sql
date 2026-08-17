-- 20260101000008_said_vs_used_reality_gap.sql
-- Market intelligence / reality-gap (#12): "what businesses SAY they need vs
-- what they actually USE." Deterministic SQL over existing tables — no
-- external data (the external-market-data variance is the "eventually" part
-- of #12 and needs sourced benchmark data; not fabricated per §22).
--
-- Two RPCs:
--   1. said_vs_used(p_business_id)  — per-business (authenticated): compares
--      user_workspace_selections.selected_tools against usage_events touches.
--      Surfaces auto-detected gaps: tools selected at onboarding but never
--      touched ('selected_unused'), and tools touched but not selected
--      ('used_unselected'). Powers the auto-detected section of RealityGap.tsx.
--   2. sector_module_usage()       — builder-only (service role): aggregates
--      across businesses by industry so the builder can see which sectors use
--      which modules (#12 item 1) and which modules over/under-perform by
--      sector (#12 item 2). REVOKED from anon/authenticated — cross-business
--      data is builder-facing, not customer-facing (matches the
--      usage_cross_business_adoption precedent from 20260101000007).
--
-- Both SECURITY DEFINER + STABLE + best-effort. Idempotent.

-- ============================================================================
-- 1. PER-BUSINESS: said vs used
-- ============================================================================
CREATE OR REPLACE FUNCTION said_vs_used(p_business_id UUID)
RETURNS TABLE (
  module_key TEXT,
  selected BOOLEAN,
  actually_used BOOLEAN,
  distinct_staff_used INT,
  event_count BIGINT,
  last_seen TIMESTAMPTZ,
  gap_label TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- The set of tool keys this business selected at onboarding (or later via
  -- WorkspaceSettings). NULL/empty selection = "no curation yet"; we treat
  -- that as "nothing explicitly selected" so the gap is honest, not noisy.
  -- COALESCE the ARRAY first (guards a NULL selected_tools), then unnest to
  -- scalar rows. unnest of an empty array yields 0 rows (correct).
  WITH selected AS (
    SELECT unnest(COALESCE(selected_tools, '{}'::TEXT[])) AS tool_key
    FROM user_workspace_selections
    WHERE business_id = p_business_id
  ),
  -- Actual usage in the last 30 days (same window as
  -- usage_module_adoption so labels are consistent).
  used AS (
    SELECT module_key,
           COUNT(DISTINCT staff_id)::INT AS distinct_staff,
           COUNT(*)::BIGINT AS events,
           MAX(occurred_at) AS last_seen
    FROM usage_events
    WHERE business_id = p_business_id
      AND occurred_at >= NOW() - INTERVAL '30 days'
    GROUP BY module_key
  ),
  -- The union of selected + used keys (so we report both sides).
  all_tools AS (
    SELECT tool_key AS module_key FROM selected
    UNION
    SELECT module_key FROM used
  )
  SELECT
    t.module_key,
    (s.tool_key IS NOT NULL) AS selected,
    (u.module_key IS NOT NULL) AS actually_used,
    COALESCE(u.distinct_staff, 0)::INT AS distinct_staff_used,
    COALESCE(u.events, 0)::BIGINT AS event_count,
    u.last_seen,
    CASE
      WHEN s.tool_key IS NOT NULL AND u.module_key IS NULL       THEN 'selected_unused'
      WHEN s.tool_key IS NULL AND u.module_key IS NOT NULL       THEN 'used_unselected'
      WHEN u.distinct_staff >= 3                                 THEN 'adopted'
      WHEN u.distinct_staff >= 1                                 THEN 'trying'
      ELSE 'untouched'
    END AS gap_label
  FROM all_tools t
  LEFT JOIN selected s ON s.tool_key = t.module_key
  LEFT JOIN used     u ON u.module_key = t.module_key
  ORDER BY
    CASE gap_label
      WHEN 'selected_unused' THEN 0   -- the headline gap: selected but dead
      WHEN 'used_unselected' THEN 1
      WHEN 'trying'          THEN 2
      WHEN 'adopted'         THEN 3
      ELSE 4
    END,
    COALESCE(u.events, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION said_vs_used(UUID) TO authenticated;
COMMENT ON FUNCTION said_vs_used IS 'Per-business reality gap (#12): onboarding-selected tools vs actual usage_events touches. Customer-facing. Labels: selected_unused / used_unselected / adopted / trying / untouched.';

-- ============================================================================
-- 2. BUILDER-ONLY: sector (industry) x module adoption
-- Aggregates across ALL businesses by industry. Builder-facing — never
-- customer-facing (a customer must not see other businesses' data).
-- ============================================================================
CREATE OR REPLACE FUNCTION sector_module_usage()
RETURNS TABLE (
  industry TEXT,
  module_key TEXT,
  businesses_selecting INT,
  businesses_using INT,
  adoption_rate NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- One row per business per selected tool (the "said" side).
  WITH said AS (
    SELECT b.industry,
           b.id AS business_id,
           unnest(COALESCE(uws.selected_tools, '{}'::TEXT[])) AS module_key
    FROM businesses b
    JOIN user_workspace_selections uws ON uws.business_id = b.id
  ),
  -- One row per business per module actually touched in 30d (the "used" side).
  used AS (
    SELECT b.industry,
           b.id AS business_id,
           module_key
    FROM usage_events ue
    JOIN businesses b ON b.id = ue.business_id
    WHERE ue.occurred_at >= NOW() - INTERVAL '30 days'
    GROUP BY b.industry, b.id, ue.module_key
  )
  SELECT
    COALESCE(s.industry, u.industry, 'unspecified') AS industry,
    COALESCE(s.module_key, u.module_key) AS module_key,
    COUNT(DISTINCT s.business_id)::INT AS businesses_selecting,
    COUNT(DISTINCT u.business_id)::INT AS businesses_using,
    -- adoption_rate = businesses_using / NULLIF(businesses_selecting, 0).
    -- NULL when nothing selected in that sector (honest, not 0%).
    CASE
      WHEN COUNT(DISTINCT s.business_id) > 0
        THEN ROUND((COUNT(DISTINCT u.business_id)::NUMERIC / COUNT(DISTINCT s.business_id)) * 100, 1)
      ELSE NULL
    END AS adoption_rate
  FROM said s
  FULL OUTER JOIN used u
    ON u.industry = s.industry AND u.module_key = s.module_key
  GROUP BY COALESCE(s.industry, u.industry, 'unspecified'),
           COALESCE(s.module_key, u.module_key)
  ORDER BY COALESCE(s.industry, u.industry, 'unspecified'),
           adoption_rate DESC NULLS LAST;
$$;

-- Builder-only: revoked from anon + authenticated (cross-business aggregate).
-- Intended for the service role / builder dashboard, like
-- usage_cross_business_adoption() in 20260101000007.
REVOKE EXECUTE ON FUNCTION sector_module_usage FROM authenticated, anon;
COMMENT ON FUNCTION sector_module_usage IS 'Builder-only (#12): sector (industry) x module adoption across all businesses. Cross-business aggregate — service role only. Serves "which sectors use what" + "over/under-performing by sector".';
