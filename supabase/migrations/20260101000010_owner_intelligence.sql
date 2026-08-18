-- 20260101000010_owner_intelligence.sql
-- Owner-only business intelligence (#18) + defense-in-depth ownership guards
-- on the per-business analytics RPCs from #14.
--
-- #18 requires an owner/admin-gated private intelligence layer ordinary users
-- cannot access. #21 requires privileged/walled content (legal, disciplinary,
-- board finance, litigation) to stay OUT of the general intelligence layer.
--
-- This migration:
--   1. Re-declares the 5 per-business RPCs from #14 with an OWNERSHIP GUARD
--      (defense-in-depth: even though the page also gates, SECURITY DEFINER
--      bypasses RLS, so the RPC itself MUST verify the caller belongs to the
--      business before returning data). Previously an authenticated user
--      could pass another business's UUID and read its analytics — a cross-
--      tenant leak. Now: returns empty if the caller is not a member of
--      p_business_id. SAFE (no error, no leak — empty result).
--   2. Adds owner_intelligence(p_business_id): the #18 aggregator. Verifies
--      the caller's role is owner/admin (get_current_staff) AND belongs to
--      the business. Returns feature activation + reuse, quick-turnoff,
--      ignored automations, workflow funnel, onboarding completion in ONE
--      call. Reads ONLY usage_events + automations (operational/usage data)
--      — NEVER legal_cases, disciplinary, board finance, or litigation
--      (#21 boundary — documented in the COMMENT + the page).
--
-- Idempotent. SECURITY DEFINER STABLE. No external API.

-- ============================================================================
-- OWNERSHIP GUARD HELPER — true only if the caller is a member of p_business_id.
-- ============================================================================

-- ============================================================================
-- 1. onboarding_funnel — now scoped to the caller's own business only.
--    (NULL p_business_id previously meant "all" — a cross-tenant leak. Now
--    always resolves to the caller's business_id; the cross-business version
--    is onboarding_conversion, service-role only.)
-- ============================================================================
CREATE OR REPLACE FUNCTION onboarding_funnel(p_business_id UUID DEFAULT NULL)
RETURNS TABLE (
  business_id UUID,
  completed_at TIMESTAMPTZ,
  steps_reached INT,
  duration_seconds INT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ue.business_id,
    ue.occurred_at AS completed_at,
    COALESCE((ue.context->>'steps_reached')::INT, 0) AS steps_reached,
    COALESCE((ue.context->>'duration_seconds')::INT, 0) AS duration_seconds
  FROM usage_events ue
  WHERE ue.action = 'onboarding_complete'
    -- OWNERSHIP GUARD: only the caller's own business (defense-in-depth).
    AND ue.business_id = COALESCE(
      p_business_id,
      (SELECT business_id FROM get_current_staff())
    )
    AND EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = ue.business_id
    )
  ORDER BY ue.occurred_at DESC;
$$;

GRANT EXECUTE ON FUNCTION onboarding_funnel(UUID) TO authenticated;

-- ============================================================================
-- 2. workflow_funnel — ownership guard added.
-- ============================================================================
CREATE OR REPLACE FUNCTION workflow_funnel(p_business_id UUID)
RETURNS TABLE (
  workflow TEXT,
  started INT,
  completed INT,
  abandoned INT,
  completion_rate NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Empty if caller is not a member of p_business_id.
  SELECT
    q.workflow, q.started, q.completed, q.abandoned, q.completion_rate
  FROM (
    WITH starts AS (
      SELECT ue.context->>'workflow' AS wf, ue.occurred_at AS started_at
      FROM usage_events ue
      WHERE ue.business_id = p_business_id
        AND ue.action = 'workflow_start'
        AND ue.context ? 'workflow'
    ),
    completes AS (
      SELECT ue.context->>'workflow' AS wf, ue.occurred_at AS completed_at
      FROM usage_events ue
      WHERE ue.business_id = p_business_id
        AND ue.action = 'workflow_complete'
        AND ue.context ? 'workflow'
    )
    SELECT
      COALESCE(s.wf, c.wf) AS workflow,
      COUNT(DISTINCT s.started_at) AS started,
      COUNT(DISTINCT c.completed_at) AS completed,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM completes c2
        WHERE c2.wf = s.wf
          AND c2.completed_at >= s.started_at
          AND c2.completed_at <= s.started_at + INTERVAL '24 hours'
      )) AS abandoned,
      CASE WHEN COUNT(DISTINCT s.started_at) > 0
        THEN ROUND((COUNT(DISTINCT c.completed_at)::NUMERIC / COUNT(DISTINCT s.started_at)) * 100, 1)
        ELSE NULL
      END AS completion_rate
    FROM starts s
    FULL OUTER JOIN completes c ON c.wf = s.wf
    GROUP BY COALESCE(s.wf, c.wf)
  ) q
  -- OWNERSHIP GUARD
  WHERE EXISTS (
    SELECT 1 FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id
  )
  ORDER BY q.started DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION workflow_funnel(UUID) TO authenticated;

-- ============================================================================
-- 3. feature_activation — ownership guard added.
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
    ue.module_key,
    MIN(ue.occurred_at) FILTER (WHERE ue.action IN ('create','update','activate')) AS first_active_at,
    COUNT(DISTINCT DATE(ue.occurred_at)) FILTER (WHERE ue.action IN ('create','update','activate'))::INT AS distinct_active_days,
    MAX(ue.occurred_at) AS last_active_at,
    CASE
      WHEN COUNT(DISTINCT DATE(ue.occurred_at)) FILTER (WHERE ue.action IN ('create','update','activate')) >= 5 THEN 'reused'
      WHEN COUNT(DISTINCT DATE(ue.occurred_at)) FILTER (WHERE ue.action IN ('create','update','activate')) >= 2 THEN 'returning'
      WHEN COUNT(*) FILTER (WHERE ue.action IN ('create','update','activate')) >= 1 THEN 'activated'
      ELSE 'view_only'
    END AS reuse_label
  FROM usage_events ue
  WHERE ue.business_id = p_business_id
    -- OWNERSHIP GUARD
    AND EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = p_business_id
    )
  GROUP BY ue.module_key
  ORDER BY distinct_active_days DESC NULLS LAST, last_active_at DESC;
$$;

GRANT EXECUTE ON FUNCTION feature_activation(UUID) TO authenticated;

-- ============================================================================
-- 4. ignored_automations — ownership guard added.
-- ============================================================================
CREATE OR REPLACE FUNCTION ignored_automations(p_business_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  trigger_type TEXT,
  created_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  run_count BIGINT,
  enabled BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.id,
    a.name,
    a.trigger_type,
    a.created_at,
    ar.last_run_at,
    COALESCE(ar.run_count, 0)::BIGINT AS run_count,
    a.enabled
  FROM automations a
  LEFT JOIN (
    SELECT automation_id,
           COUNT(*) AS run_count,
           MAX(executed_at) AS last_run_at
    FROM automation_runs
    GROUP BY automation_id
  ) ar ON ar.automation_id = a.id
  WHERE a.business_id = p_business_id
    -- OWNERSHIP GUARD
    AND EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = p_business_id
    )
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION ignored_automations(UUID) TO authenticated;

-- ============================================================================
-- 5. quick_turnoff — ownership guard added.
-- ============================================================================
CREATE OR REPLACE FUNCTION quick_turnoff(p_business_id UUID)
RETURNS TABLE (
  tool_key TEXT,
  selected_at TIMESTAMPTZ,
  deselected_at TIMESTAMPTZ,
  days_until_turnoff NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH selects AS (
    SELECT ue.occurred_at AS sel_at, ue.context->>'tool' AS tool_key
    FROM usage_events ue
    WHERE ue.business_id = p_business_id
      AND ue.action = 'tool_select'
      AND ue.context ? 'tool'
  ),
  deselects AS (
    SELECT ue.occurred_at AS desel_at, ue.context->>'tool' AS tool_key
    FROM usage_events ue
    WHERE ue.business_id = p_business_id
      AND ue.action = 'tool_deselect'
      AND ue.context ? 'tool'
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
  -- OWNERSHIP GUARD
  WHERE EXISTS (
    SELECT 1 FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id
  )
  ORDER BY days_until_turnoff ASC;
$$;

GRANT EXECUTE ON FUNCTION quick_turnoff(UUID) TO authenticated;

-- ============================================================================
-- 6. OWNER-ONLY INTELLIGENCE AGGREGATOR (#18).
--    Verifies the caller's role is owner/admin AND belongs to the business.
--    If not owner/admin, returns empty rows (safe — no error, no leak).
--    Returns JSONB so the page gets one structured payload (not 5 calls).
--    Reads ONLY usage_events + automations — operational/usage data. NEVER
--    legal_cases, disciplinary, board finance, or litigation (#21 boundary).
-- ============================================================================
CREATE OR REPLACE FUNCTION owner_intelligence(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT;
  v_is_member BOOLEAN;
  v_out JSONB;
BEGIN
  -- OWNER/ADMIN + MEMBERSHIP GATE (defense-in-depth + checklist #18).
  SELECT cs.role, (cs.business_id = p_business_id)
    INTO v_role, v_is_member
    FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id
    LIMIT 1;

  -- Not a member, or not owner/admin -> empty result (safe, no leak).
  IF NOT COALESCE(v_is_member, false) OR v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'authorized', false,
      'feature_activation', '[]'::JSONB,
      'quick_turnoff', '[]'::JSONB,
      'ignored_automations', '[]'::JSONB,
      'workflow_funnel', '[]'::JSONB,
      'onboarding_completion', NULL
    );
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'feature_activation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'module_key', fa.module_key,
        'first_active_at', fa.first_active_at,
        'distinct_active_days', fa.distinct_active_days,
        'last_active_at', fa.last_active_at,
        'reuse_label', fa.reuse_label
      ) ORDER BY fa.distinct_active_days DESC NULLS LAST)
      FROM feature_activation(p_business_id) fa
    ), '[]'::JSONB),
    'quick_turnoff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tool_key', qt.tool_key,
        'selected_at', qt.selected_at,
        'deselected_at', qt.deselected_at,
        'days_until_turnoff', qt.days_until_turnoff
      ))
      FROM quick_turnoff(p_business_id) qt
    ), '[]'::JSONB),
    'ignored_automations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ia.id,
        'name', ia.name,
        'trigger_type', ia.trigger_type,
        'created_at', ia.created_at,
        'last_run_at', ia.last_run_at,
        'run_count', ia.run_count,
        'enabled', ia.enabled
      ))
      FROM ignored_automations(p_business_id) ia
    ), '[]'::JSONB),
    'workflow_funnel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'workflow', wf.workflow,
        'started', wf.started,
        'completed', wf.completed,
        'abandoned', wf.abandoned,
        'completion_rate', wf.completion_rate
      ))
      FROM workflow_funnel(p_business_id) wf
    ), '[]'::JSONB),
    'onboarding_completion', (
      SELECT jsonb_build_object(
        'completed_at', ofn.completed_at,
        'steps_reached', ofn.steps_reached,
        'duration_seconds', ofn.duration_seconds
      )
      FROM onboarding_funnel(p_business_id) ofn
      LIMIT 1
    ),
    -- #21 boundary declaration: this aggregator intentionally reads only
    -- operational/usage data. Privileged/walled content (legal, disciplinary,
    -- board finance, litigation) is NEVER accessed here.
    'data_scope', 'operational_and_usage_only'
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION owner_intelligence(UUID) TO authenticated;

COMMENT ON FUNCTION owner_intelligence IS 'Owner-only business intelligence (#18). Verifies caller role is owner/admin AND a member of p_business_id via get_current_staff (defense-in-depth). Returns feature activation, quick-turnoff, ignored automations, workflow funnel, and onboarding completion in one JSONB payload. #21 boundary: reads ONLY usage_events + automations (operational/usage data) — NEVER legal_cases, disciplinary, board finance, or litigation.';
