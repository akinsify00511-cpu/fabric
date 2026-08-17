-- 20260101000009_self_instrumentation.sql
-- Platform self-instrumentation (#14). The PRD requires measuring:
--   - modules switched off quickly (tool deselection shortly after selection)
--   - onboarding abandonment (started but not completed)
--   - setup abandonment (tool/workspace setup started but not finished)
--   - ignored automations (created but never triggered)
--   - feature activation (first real use of a module)
--   - feature reuse (repeat use across days)
--   - workflow completion / abandonment (started but not finished)
--
-- The existing usage_events table (20260101000007) only logged action='view'.
-- This migration ADDS an optional `context JSONB` column for step/workflow
-- metadata + richer `action` values (no breaking change — existing 'view'
-- rows stay valid). Pages emit the richer events via the logUsageEvent helper;
-- the route-change 'view' hook continues unchanged.
--
-- All analysis RPCs are builder-facing (service role): they aggregate across
-- businesses/sessions, so they are REVOKED from anon/authenticated (matches
-- the usage_cross_business_adoption precedent). Per-business versions are
-- granted to authenticated so an owner can see their own funnel.
--
-- Idempotent. No external API. Deterministic SQL over real telemetry.

-- ============================================================================
-- 0. ADD context column (additive — existing rows keep NULL context)
-- ============================================================================
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::JSONB;
CREATE INDEX IF NOT EXISTS idx_usage_events_action ON usage_events(business_id, action, occurred_at DESC);

-- ============================================================================
-- 1. ONBOARDING COMPLETION (per-business — authenticated can see their own).
--    The page emits ONE event after business creation succeeds:
--      action='onboarding_complete' context={steps_reached:N, duration_seconds:N}
--    ABANDONMENT cannot use per-business events (a business that exists
--    completed by definition) — it's a cross-business fact (see #6 below):
--    authenticated users (auth.users) with no staff record = abandoned.
-- ============================================================================
CREATE OR REPLACE FUNCTION onboarding_funnel(p_business_id UUID DEFAULT NULL)
RETURNS TABLE (
  business_id UUID,
  completed_at TIMESTAMPTZ,
  steps_reached INT,
  duration_seconds INT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    business_id,
    occurred_at AS completed_at,
    COALESCE((context->>'steps_reached')::INT, 0) AS steps_reached,
    COALESCE((context->>'duration_seconds')::INT, 0) AS duration_seconds
  FROM usage_events
  WHERE action = 'onboarding_complete'
    AND (p_business_id IS NULL OR business_id = p_business_id)
  ORDER BY occurred_at DESC;
$$;

GRANT EXECUTE ON FUNCTION onboarding_funnel(UUID) TO authenticated;

-- ============================================================================
-- 2. WORKFLOW FUNNEL (per-business). Pages emit:
--    action='workflow_start' context={workflow:'quote'|'invoice'|...}
--    action='workflow_complete' context={workflow:...}
--    Abandoned = a start with no matching complete within 24h (INFERENCE).
-- ============================================================================
CREATE OR REPLACE FUNCTION workflow_funnel(p_business_id UUID)
RETURNS TABLE (
  workflow TEXT,
  started INT,
  completed INT,
  abandoned INT,
  completion_rate NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH starts AS (
    SELECT business_id,
           context->>'workflow' AS wf,
           occurred_at AS started_at
    FROM usage_events
    WHERE business_id = p_business_id
      AND action = 'workflow_start'
      AND context ? 'workflow'
  ),
  completes AS (
    SELECT business_id,
           context->>'workflow' AS wf,
           occurred_at AS completed_at
    FROM usage_events
    WHERE business_id = p_business_id
      AND action = 'workflow_complete'
      AND context ? 'workflow'
  )
  SELECT
    COALESCE(s.wf, c.wf) AS workflow,
    COUNT(DISTINCT s.started_at) AS started,
    COUNT(DISTINCT c.completed_at) AS completed,
    -- abandoned = started without a complete for the same workflow within 24h
    COUNT(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM completes c2
      WHERE c2.business_id = s.business_id
        AND c2.wf = s.wf
        AND c2.completed_at >= s.started_at
        AND c2.completed_at <= s.started_at + INTERVAL '24 hours'
    )) AS abandoned,
    CASE WHEN COUNT(DISTINCT s.started_at) > 0
      THEN ROUND((COUNT(DISTINCT c.completed_at)::NUMERIC / COUNT(DISTINCT s.started_at)) * 100, 1)
      ELSE NULL
    END AS completion_rate
  FROM starts s
  FULL OUTER JOIN completes c ON c.business_id = s.business_id AND c.wf = s.wf
  GROUP BY COALESCE(s.wf, c.wf)
  ORDER BY started DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION workflow_funnel(UUID) TO authenticated;

-- ============================================================================
-- 3. FEATURE ACTIVATION + REUSE (per-business).
--    activation = first 'create'|'update'|'activate' action for a module
--    (distinct from passive 'view'). reuse = distinct calendar days touched.
-- ============================================================================
CREATE OR REPLACE FUNCTION feature_activation(p_business_id UUID)
RETURNS TABLE (
  module_key TEXT,
  first_active_at TIMESTAMPTZ,
  distinct_active_days INT,
  last_active_at TIMESTAMPTZ,
  reuse_label TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    module_key,
    MIN(occurred_at) FILTER (WHERE action IN ('create','update','activate')) AS first_active_at,
    COUNT(DISTINCT DATE(occurred_at)) FILTER (WHERE action IN ('create','update','activate'))::INT AS distinct_active_days,
    MAX(occurred_at) AS last_active_at,
    CASE
      WHEN COUNT(DISTINCT DATE(occurred_at)) FILTER (WHERE action IN ('create','update','activate')) >= 5 THEN 'reused'
      WHEN COUNT(DISTINCT DATE(occurred_at)) FILTER (WHERE action IN ('create','update','activate')) >= 2 THEN 'returning'
      WHEN COUNT(*) FILTER (WHERE action IN ('create','update','activate')) >= 1 THEN 'activated'
      ELSE 'view_only'
    END AS reuse_label
  FROM usage_events
  WHERE business_id = p_business_id
  GROUP BY module_key
  ORDER BY distinct_active_days DESC NULLS LAST, last_active_at DESC;
$$;

GRANT EXECUTE ON FUNCTION feature_activation(UUID) TO authenticated;

-- ============================================================================
-- 4. IGNORED AUTOMATIONS (per-business). Derives from the automations table:
--    created but never executed (0 runs). Pure read — no events needed.
-- ============================================================================
CREATE OR REPLACE FUNCTION ignored_automations(p_business_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  trigger_type TEXT,
  created_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  run_count BIGINT,
  status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.id,
    a.name,
    a.trigger_type,
    a.created_at,
    ar.last_run_at,
    COALESCE(ar.run_count, 0) AS run_count,
    a.status
  FROM automations a
  LEFT JOIN (
    SELECT automation_id,
           COUNT(*) AS run_count,
           MAX(executed_at) AS last_run_at
    FROM automation_runs
    GROUP BY automation_id
  ) ar ON ar.automation_id = a.id
  WHERE a.business_id = p_business_id
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION ignored_automations(UUID) TO authenticated;

-- ============================================================================
-- 5. QUICK TURNOFF (per-business). A tool selected then deselected within 7
--    days. Pages emit action='tool_select'/'tool_deselect' context={tool:key}.
--    Surfaces "modules switched off quickly" (PRD #14 item 1).
-- ============================================================================
CREATE OR REPLACE FUNCTION quick_turnoff(p_business_id UUID)
RETURNS TABLE (
  tool_key TEXT,
  selected_at TIMESTAMPTZ,
  deselected_at TIMESTAMPTZ,
  days_until_turnoff NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH selects AS (
    SELECT occurred_at AS sel_at, context->>'tool' AS tool_key
    FROM usage_events
    WHERE business_id = p_business_id
      AND action = 'tool_select'
      AND context ? 'tool'
  ),
  deselects AS (
    SELECT occurred_at AS desel_at, context->>'tool' AS tool_key
    FROM usage_events
    WHERE business_id = p_business_id
      AND action = 'tool_deselect'
      AND context ? 'tool'
  )
  SELECT
    s.tool_key,
    s.sel_at AS selected_at,
    d.desel_at AS deselected_at,
    ROUND(EXTRACT(EPOCH FROM (d.desel_at - s.sel_at)) / 86400, 1) AS days_until_turnoff
  FROM selects s
  JOIN deselects d ON d.tool_key = s.tool_key
    AND d.desel_at > s.sel_at
    AND d.desel_at <= s.sel_at + INTERVAL '7 days'
  ORDER BY days_until_turnoff ASC;
$$;

GRANT EXECUTE ON FUNCTION quick_turnoff(UUID) TO authenticated;

-- ============================================================================
-- 6. BUILDER-ONLY: cross-business onboarding conversion + abandonment.
--    ABANDONMENT = an authenticated user (auth.users) with NO staff record —
--    i.e. signed up but never completed business creation. This is a FACT
--    (not an inference), derived from the auth.users → staff gap, stronger
--    than tab-close guessing (§22).
--    Completion + steps/duration come from the onboarding_complete event.
--    REVOKED from anon/authenticated (cross-tenant auth data — service role).
-- ============================================================================
CREATE OR REPLACE FUNCTION onboarding_conversion()
RETURNS TABLE (
  total_authenticated INT,
  total_completed INT,
  total_abandoned INT,
  conversion_rate NUMERIC,
  median_steps_reached NUMERIC,
  avg_duration_seconds NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM auth.users)::INT AS total_authenticated,
    (SELECT COUNT(*) FROM usage_events WHERE action = 'onboarding_complete')::INT AS total_completed,
    -- abandoned = authenticated users who are NOT in staff (no business)
    ((SELECT COUNT(*) FROM auth.users)
      - (SELECT COUNT(DISTINCT s.user_id) FROM staff s WHERE s.user_id IS NOT NULL))::INT AS total_abandoned,
    CASE WHEN (SELECT COUNT(*) FROM auth.users) > 0
      THEN ROUND(((SELECT COUNT(*) FROM usage_events WHERE action = 'onboarding_complete')::NUMERIC
        / (SELECT COUNT(*) FROM auth.users)) * 100, 1)
      ELSE NULL
    END AS conversion_rate,
    -- PERCENTILE_CONT/AVG over the onboarding_complete events; wrapped in a
    -- subquery so 0 events yield NULL (not 0 rows) — the outer SELECT always
    -- returns exactly one row.
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (context->>'steps_reached')::INT)
       FROM usage_events WHERE action = 'onboarding_complete') AS median_steps_reached,
    (SELECT ROUND(AVG((context->>'duration_seconds')::NUMERIC), 1)
       FROM usage_events WHERE action = 'onboarding_complete') AS avg_duration_seconds;
$$;

REVOKE EXECUTE ON FUNCTION onboarding_conversion FROM authenticated, anon;

COMMENT ON FUNCTION onboarding_funnel IS 'Per-business onboarding completion (#14): completed_at + steps_reached + duration from the onboarding_complete event. Customer-facing (own business). Abandonment is cross-business (onboarding_conversion).';
COMMENT ON FUNCTION workflow_funnel IS 'Per-business workflow funnel (#14): started/completed/abandoned/completion_rate per workflow. Customer-facing.';
COMMENT ON FUNCTION feature_activation IS 'Per-business feature activation + reuse (#14): first-active, distinct active days, reuse label. Customer-facing.';
COMMENT ON FUNCTION ignored_automations IS 'Per-business: automations created but never/infrequently run (#14). Derives from automations + automation_runs. Customer-facing.';
COMMENT ON FUNCTION quick_turnoff IS 'Per-business: tools selected then deselected within 7 days (#14 item 1). Customer-facing.';
COMMENT ON FUNCTION onboarding_conversion IS 'Builder-only: cross-business onboarding conversion + abandonment (#14). Abandonment = auth.users with no staff record (FACT). Service role only.';
