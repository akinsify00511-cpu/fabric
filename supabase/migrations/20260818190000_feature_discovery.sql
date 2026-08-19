-- ============================================================================
-- P0 #13: Autonomous trial feature-discovery engine.
--
-- The directive: during the trial, Avenize should notice "You haven't
-- explored Finance" and explain why it matters. Or "Based on your business,
-- Inventory could help you identify ₦X in trapped capital." Then
-- "Explore Inventory ->". This sells Avenize without requiring technical
-- support.
--
-- This is the DISCOVERY layer that consumes the self-instrumentation data
-- (Session 21 #14: feature_activation + usage_events). It's deterministic
-- (§22) — every value estimate is computed from REAL data, never fabricated.
--
-- What this migration adds:
--   1. module_value_propositions — the "why this tool matters" copy per module,
--      including the query to compute a real value estimate (e.g. Inventory's
--      "trapped capital" = sum of stock value for low-stock products). Tunable
--      by Avenize operators (service role) — Riverwayse decides the copy, not
--      hardcoded in app code (matches the ops-dashboard tunable-threshold standard).
--   2. feature_discovery(business_id) RPC — returns, for each module the
--      business is entitled to but hasn't meaningfully used: the module, its
--      value proposition copy, a REAL value estimate (if computable from their
--      data), and the route to explore it. Ordered by value-estimate descending
--      (highest-impact unexplored tool first). Best-effort per module (§24).
--
-- Privacy: SECURITY DEFINER so it can read usage_events (business-scoped).
-- Membership-guarded via get_current_staff. Granted to authenticated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.module_value_propositions (
  module_key TEXT PRIMARY KEY REFERENCES public.module_plan_tiers(module_key) ON DELETE CASCADE,
  -- The plain-language "why this matters" headline (the directive's standard:
  -- a business owner understands it without being told what it means).
  value_headline TEXT NOT NULL,
  -- The supporting explanation (one or two sentences).
  value_explanation TEXT NOT NULL,
  -- The route to explore the tool (the "Explore ->" action).
  explore_route TEXT NOT NULL,
  -- Optional: a SQL snippet that computes a REAL value estimate for this
  -- business (e.g. "SELECT COALESCE(SUM(stock * cost_price),0) FROM products
  -- WHERE business_id = $1 AND stock <= low_stock_threshold" for Inventory's
  -- "trapped capital"). NULL = no computable estimate (just show the headline).
  -- SECURITY: executed via EXECUTE in feature_discovery; the snippet is
  -- stored here (service-role-managed, NOT client-writable) and always
  -- substitutes the single p_business_id via format() — never string concat
  -- from client input.
  value_estimate_sql TEXT,
  -- The label for the estimate (e.g. "in trapped capital", "in overdue
  -- invoices", "in stale deals").
  value_estimate_label TEXT,
  -- Display order hint (lower = higher priority suggestion).
  display_order INT DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.module_value_propositions ENABLE ROW LEVEL SECURITY;
-- All authenticated staff can read the value-proposition catalog (it's
-- product copy, not business data). Only the service role writes it.
DROP POLICY IF EXISTS module_value_propositions_read ON public.module_value_propositions;
CREATE POLICY module_value_propositions_read ON public.module_value_propositions
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Seed value propositions for the modules most valuable to discover during a
-- trial. Tunable by Avenize operators (service role); the app reads these,
-- never hardcodes them. Each value_estimate_sql substitutes %s with the
-- business_id (via format() — see feature_discovery).
-- ---------------------------------------------------------------------------
INSERT INTO public.module_value_propositions
  (module_key, value_headline, value_explanation, explore_route, value_estimate_sql, value_estimate_label, display_order)
VALUES
  ('inventory',
   'Inventory could help you find trapped capital',
   'See exactly what you have in stock, what''s running low, and what''s sitting idle. Avenize flags slow-moving stock before it ties up cash.',
   '/app/inventory',
   'SELECT COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) FROM products WHERE business_id = %L AND stock <= COALESCE(low_stock_threshold, 0)',
   'in low-stock or idle inventory value', 10),
  ('finance',
   'Finance turns your transactions into clarity',
   'Track money in and out, send invoices that compute totals for you, and see what you''re actually making — not just what you remember.',
   '/app/finance',
   'SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE business_id = %L AND type = ''expense'' AND occurred_at > NOW() - INTERVAL ''30 days''',
   'in expenses tracked in the last 30 days', 20),
  ('crm',
   'CRM shows you who owes you and who you''re talking to',
   'Never lose track of a deal or a follow-up. Avenize tells you which customers are overdue and which leads have gone quiet.',
   '/app/crm',
   'SELECT COUNT(*) FROM deals WHERE business_id = %L AND stage NOT IN (''won'',''lost'')',
   'open deals you could be moving forward', 30),
  ('projects',
   'Projects keep work from slipping through the cracks',
   'See what''s on track, what''s behind, and who''s blocked — before a deadline surprises you.',
   '/app/projects',
   'SELECT COUNT(*) FROM tasks WHERE business_id = %L AND status NOT IN (''done'',''cancelled'') AND due_date < NOW()',
   'overdue tasks hiding in your work', 40),
  ('tasks',
   'Tasks turn "don''t forget" into "done"',
   'Capture what needs doing, assign it, and let Avenize remind you — so nothing depends on your memory.',
   '/app/tasks',
   'SELECT COUNT(*) FROM tasks WHERE business_id = %L AND status NOT IN (''done'',''cancelled'')',
   'tasks waiting to be organized', 50),
  ('hr',
   'People helps you run your team with less paperwork',
   'Track attendance, leave, and who does what — without spreadsheets that go stale.',
   '/app/people',
   'SELECT COUNT(*) FROM staff WHERE business_id = %L AND active = true',
   'team members you could be tracking', 60),
  ('approvals',
   'Approvals protect your money without slowing you down',
   'Set a threshold above which a second pair of eyes checks a purchase or payment. Solo? Skip it entirely.',
   '/app/approvals',
   NULL, NULL, 70),
  ('reports',
   'Reports turn your raw data into the answer "how am I doing"',
   'Avenize shows your revenue trend, top customers, and overdue invoices — the picture an owner actually needs.',
   '/app/reports',
   NULL, NULL, 80)
ON CONFLICT (module_key) DO UPDATE SET
  value_headline = EXCLUDED.value_headline,
  value_explanation = EXCLUDED.value_explanation,
  explore_route = EXCLUDED.explore_route,
  value_estimate_sql = EXCLUDED.value_estimate_sql,
  value_estimate_label = EXCLUDED.value_estimate_label,
  display_order = EXCLUDED.display_order;

-- ---------------------------------------------------------------------------
-- feature_discovery(business_id)
-- Returns the modules the business is ENTITLED to (current plan covers) but
-- has NOT meaningfully used (not in feature_activation, or view_only). For
-- each: value headline + explanation + a REAL value estimate (if computable)
-- + the route to explore. Ordered: computable estimates first (desc by value),
-- then by display_order. Best-effort per module (§24 — a failed estimate
-- never breaks the batch).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feature_discovery(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_membership RECORD;
  v_current_tier INT;
  v_result JSONB[] := '{}';
  v_module RECORD;
  v_estimate NUMERIC;
  v_estimate_label TEXT;
  v_used_modules TEXT[] := '{}';
  v_view_only_modules TEXT[] := '{}';
  v_act RECORD;
BEGIN
  SELECT * INTO v_membership FROM get_current_staff() cs WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'suggestions', '[]'::JSONB);
  END IF;

  -- Current plan tier.
  SELECT CASE COALESCE(e.plan, 'free')
    WHEN 'free' THEN 0 WHEN 'starter' THEN 1
    WHEN 'team' THEN 2 WHEN 'growth' THEN 2 WHEN 'professional' THEN 2
    WHEN 'pro' THEN 2 WHEN 'business' THEN 2
    WHEN 'scale' THEN 3 WHEN 'enterprise' THEN 3 ELSE 0
  END INTO v_current_tier
    FROM business_entitlements e WHERE e.business_id = p_business_id;
  v_current_tier := COALESCE(v_current_tier, 0);

  -- What have they used? Separate "activated/used" from "view_only".
  FOR v_act IN SELECT module_key, reuse_label FROM feature_activation(p_business_id) LOOP
    IF v_act.reuse_label IN ('reused','returning','activated') THEN
      v_used_modules := array_append(v_used_modules, v_act.module_key);
    ELSIF v_act.reuse_label = 'view_only' THEN
      v_view_only_modules := array_append(v_view_only_modules, v_act.module_key);
    END IF;
  END LOOP;

  -- For each value-proposition module the business is entitled to AND has NOT
  -- meaningfully used: build a suggestion.
  FOR v_module IN
    SELECT vp.*, mpt.display_name, ms.ready
      FROM module_value_propositions vp
      JOIN module_plan_tiers mpt ON mpt.module_key = vp.module_key
      LEFT JOIN module_status ms ON ms.module_key = vp.module_key
      WHERE mpt.min_plan_tier <= v_current_tier
        AND NOT (vp.module_key = ANY(v_used_modules))
      ORDER BY vp.display_order
  LOOP
    v_estimate := NULL;
    v_estimate_label := NULL;
    -- Compute the real value estimate (best-effort; §24 — swallow errors).
    IF v_module.value_estimate_sql IS NOT NULL THEN
      BEGIN
        EXECUTE format(v_module.value_estimate_sql, p_business_id) INTO v_estimate;
        v_estimate_label := v_module.value_estimate_label;
      EXCEPTION WHEN OTHERS THEN
        v_estimate := NULL;
        v_estimate_label := NULL;
      END;
    END IF;

    v_result := array_append(v_result, jsonb_build_object(
      'module_key', v_module.module_key,
      'display_name', v_module.display_name,
      'value_headline', v_module.value_headline,
      'value_explanation', v_module.value_explanation,
      'explore_route', v_module.explore_route,
      'value_estimate', v_estimate,
      'value_estimate_label', v_estimate_label,
      'viewed_but_unused', v_module.module_key = ANY(v_view_only_modules)
    ));
  END LOOP;

  -- Order: suggestions with a non-null/non-zero estimate first (desc by value),
  -- then the rest by display_order. This surfaces highest-impact unexplored
  -- tools first — the directive's intent.
  SELECT jsonb_agg(elem ORDER BY
    CASE WHEN (elem->>'value_estimate') IS NOT NULL
              AND (elem->>'value_estimate')::NUMERIC > 0 THEN 0 ELSE 1 END,
    CASE WHEN (elem->>'value_estimate') IS NOT NULL
              AND (elem->>'value_estimate')::NUMERIC > 0
         THEN (elem->>'value_estimate')::NUMERIC END DESC NULLS LAST
  ) INTO v_result
  FROM unnest(v_result) AS elem;

  RETURN jsonb_build_object(
    'authorized', true,
    'current_tier', v_current_tier,
    'modules_used_count', array_length(v_used_modules, 1),
    'suggestions', COALESCE(v_result, '[]'::JSONB)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'suggestions', '[]'::JSONB, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.feature_discovery(UUID) TO authenticated;

COMMENT ON FUNCTION public.feature_discovery(UUID) IS
  'P0 #13: the autonomous trial feature-discovery engine. Returns modules the business is entitled to but has NOT meaningfully used, each with a plain-language value proposition + a REAL value estimate computed from their data (§22 — never fabricated). Ordered: highest-impact (non-zero estimate) first. Best-effort per module (§24). Membership-guarded.';
