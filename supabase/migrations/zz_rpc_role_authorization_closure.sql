-- =============================================================================
-- SECURITY CLOSURE — LEVEL 2-4 ROLE AUTHORIZATION ON SECURITY DEFINER RPCs
-- =============================================================================
-- Membership closes the tenant boundary. This closes role/capability:
-- membership scope for business-wide reads, role guard (owner/admin/manager)
-- for sensitive ops, and service-role-only restriction for dangerous internals.
-- Helpers treat service_role/system JWT as authorized-by-design so Edge
-- Functions and pg_cron keep working while authenticated callers are gated.
-- Idempotent (CREATE OR REPLACE); guards key on the LAST definition in repo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  -- Server-side sessions (no JWT claims: triggers, migrations, cron, service
  -- role) are authorized by design; otherwise membership is required.
  SELECT (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'sub') IS NULL
      OR EXISTS (
           SELECT 1 FROM public.get_current_accessible_businesses() ab
           WHERE ab.business_id = p_business_id
         );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(p_business_id UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'sub') IS NULL
      OR EXISTS (
           SELECT 1 FROM public.get_current_staff() cs
           WHERE cs.business_id = p_business_id
             AND cs.role = ANY(p_roles)
         );
$$;

CREATE OR REPLACE FUNCTION public.emit_business_event(p_business_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_related_entities jsonb DEFAULT '[]'::jsonb, p_source text DEFAULT 'system'::text, p_actor_id uuid DEFAULT NULL::uuid, p_capture_mode text DEFAULT NULL::text, p_confidence numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  v_hash := md5(
    coalesce(p_business_id::TEXT,'') || '|' || p_event_type || '|' ||
    coalesce(p_entity_id::TEXT,'') || '|' || p_payload::TEXT
  );

  -- Idempotency: if the exact same event was already raised, return it.
  SELECT id INTO v_id FROM business_events
  WHERE business_id = p_business_id
    AND event_type = p_event_type
    AND coalesce(entity_id::TEXT,'') = coalesce(p_entity_id::TEXT,'')
    AND md5(coalesce(business_id::TEXT,'') || '|' || event_type || '|' ||
            coalesce(entity_id::TEXT,'') || '|' || payload::TEXT) = v_hash
  ORDER BY occurred_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO business_events (
    business_id, event_type, entity_type, entity_id, payload,
    related_entities, source, actor_id, capture_mode, confidence
  ) VALUES (
    p_business_id, p_event_type, p_entity_type, p_entity_id, p_payload,
    p_related_entities, p_source, p_actor_id, p_capture_mode, p_confidence
  ) RETURNING id INTO v_id;

  -- Fire downstream handlers. Each handler is a separate function so a
  -- failure in one does not block the others or the event commit.
  PERFORM process_business_event(v_id);

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_simulation(p_business_id uuid, p_scenario text, p_inputs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_out JSONB; v_raise_pct NUMERIC; v_staff_id UUID;
  v_current_salary NUMERIC; v_new_monthly NUMERIC; v_old_monthly NUMERIC;
  v_annual_impact NUMERIC; v_count INTEGER; v_avg_salary NUMERIC;
  v_revenue NUMERIC; v_expenses NUMERIC; v_cash NUMERIC;
  v_payroll_monthly NUMERIC; v_coverage_months NUMERIC; v_margin NUMERIC;
  v_new_payroll NUMERIC; v_new_coverage NUMERIC; v_new_margin NUMERIC;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Pull real financial context.
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0)
  INTO v_revenue FROM invoices WHERE business_id = p_business_id;
  v_expenses := COALESCE(v_revenue * 0.6, 0); -- proxy until expenses table aggregates
  v_cash := v_revenue - v_expenses;

  -- Current monthly payroll.
  SELECT COALESCE(sum(base_salary),0) / 12.0,
         count(*)
  INTO v_payroll_monthly, v_count
  FROM staff WHERE business_id = p_business_id;

  IF p_scenario = 'salary_increase' THEN
    v_raise_pct := (p_inputs ->> 'raise_pct')::NUMERIC / 100.0;
    v_staff_id := NULLIF(p_inputs ->> 'staff_id','')::UUID;
    IF v_staff_id IS NOT NULL THEN
      SELECT base_salary INTO v_current_salary FROM staff WHERE id = v_staff_id;
      v_old_monthly := COALESCE(v_current_salary,0) / 12.0;
      v_new_monthly := v_old_monthly * (1 + v_raise_pct);
      v_annual_impact := (v_new_monthly - v_old_monthly) * 12;
      v_new_payroll := v_payroll_monthly + (v_new_monthly - v_old_monthly);
    ELSE
      v_annual_impact := v_payroll_monthly * v_raise_pct * 12;
      v_new_payroll := v_payroll_monthly * (1 + v_raise_pct);
    END IF;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999
      ELSE (v_cash / v_new_payroll) END;
    v_margin := CASE WHEN v_revenue = 0 THEN 0 ELSE (v_revenue - v_expenses) / v_revenue END;
    v_new_margin := CASE WHEN v_revenue = 0 THEN 0
      ELSE (v_revenue - v_expenses - (v_annual_impact/12)) / v_revenue END;

    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object(
        'value', v_new_payroll - v_payroll_monthly,
        'assumption', 'single increase applied to current monthly payroll',
        'range_low', (v_new_payroll - v_payroll_monthly) * 0.95,
        'range_high', (v_new_payroll - v_payroll_monthly) * 1.05,
        'type', 'ESTIMATE'),
      'annual_impact', jsonb_build_object(
        'value', v_annual_impact, 'assumption', '12x monthly delta',
        'range_low', v_annual_impact * 0.95, 'range_high', v_annual_impact * 1.05,
        'type', 'ESTIMATE'),
      'cash_coverage_months', jsonb_build_object(
        'value', round(v_new_coverage::numeric, 1),
        'assumption', 'current cash / new monthly payroll, no revenue growth assumed',
        'type', 'ESTIMATE'),
      'margin_after', jsonb_build_object(
        'value', round((v_new_margin*100)::numeric, 1),
        'assumption', 'margin with annualized increase subtracted monthly',
        'type', 'ESTIMATE'),
      'employees_affected', jsonb_build_object('value', CASE WHEN v_staff_id IS NOT NULL THEN 1 ELSE v_count END, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Smaller increase', 'raise_pct', greatest(v_raise_pct*50, 0.02)),
        jsonb_build_object('label','Performance-bonus instead', 'note','One-off, no recurring payroll impact'),
        jsonb_build_object('label','Defer to next cycle', 'note','Preserves current cash coverage')
      )
    );

  ELSIF p_scenario = 'mass_hire' THEN
    v_count := (p_inputs ->> 'count')::INTEGER;
    v_avg_salary := COALESCE((p_inputs ->> 'avg_salary')::NUMERIC,
      CASE WHEN (SELECT count(*) FROM staff WHERE business_id=p_business_id) > 0
        THEN (SELECT avg(base_salary) FROM staff WHERE business_id=p_business_id)
        ELSE 50000 END);
    v_new_monthly := (v_count * v_avg_salary) / 12.0;
    v_new_payroll := v_payroll_monthly + v_new_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE v_cash / v_new_payroll END;
    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object('value', v_new_monthly, 'type','ESTIMATE',
        'assumption','count x average salary / 12'),
      'annual_impact', jsonb_build_object('value', v_new_monthly*12, 'type','ESTIMATE'),
      'cash_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE',
        'assumption','cash / new payroll'),
      'employees_affected', jsonb_build_object('value', v_count, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Hire fewer', 'count', greatest(v_count-1,1)),
        jsonb_build_object('label','Outsource', 'note','Variable cost, no fixed payroll'),
        jsonb_build_object('label','Reprioritize existing capacity', 'note','No new headcount')
      )
    );

  ELSIF p_scenario = 'revenue_change' THEN
    v_count := (p_inputs ->> 'delta_pct')::INTEGER;
    v_new_payroll := v_payroll_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE ((v_cash * (1 + v_count/100.0)) / v_new_payroll) END;
    v_out := jsonb_build_object(
      'cash_impact', jsonb_build_object('value', round((v_cash * v_count/100.0)::numeric,0), 'type','ESTIMATE',
        'assumption','linear revenue change applied to current cash'),
      'payroll_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE'),
      'assumptions', jsonb_build_array('expenses held constant','no collection delay modeled'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Cut discretionary spend','note','Protects runway'),
        jsonb_build_object('label','Delay hiring','note','Preserves cash')
      )
    );

  ELSE
    v_out := jsonb_build_object('note','Custom scenario — provide assumptions manually', 'type','ESTIMATE');
  END IF;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.observer_snapshot(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_people JSONB; v_money JSONB; v_sales JSONB; v_ops JSONB; v_inventory JSONB; v_risk JSONB;
  v_overdue_invoices NUMERIC; v_open_tasks INTEGER; v_low_stock INTEGER;
  v_staff_count INTEGER; v_payroll_risk BOOLEAN;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- People
  SELECT jsonb_build_object(
    'headcount', count(*)
  ) INTO v_people FROM staff WHERE business_id = p_business_id;

  -- Money
  SELECT jsonb_build_object(
    'receivables', COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0),
    'overdue_receivables', COALESCE(sum(CASE WHEN status='overdue' THEN total END),0),
    'invoices_paid', COALESCE(sum(CASE WHEN status='paid' THEN total END),0),
    'invoice_count', count(*)
  ) INTO v_money FROM invoices WHERE business_id = p_business_id;

  -- Operations
  SELECT jsonb_build_object(
    'open_tasks', count(*) FILTER (WHERE status IN ('todo','in_progress')),
    'overdue_tasks', count(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE)
  ) INTO v_ops FROM tasks WHERE business_id = p_business_id;
  SELECT (v_ops->>'open_tasks')::INTEGER INTO v_open_tasks;

  -- Inventory
  SELECT jsonb_build_object(
    'low_stock_count', count(*) FILTER (WHERE stock <= COALESCE(low_stock_threshold,0))
  ) INTO v_inventory FROM products WHERE business_id = p_business_id;
  SELECT COALESCE((v_inventory->>'low_stock_count')::INTEGER,0) INTO v_low_stock;

  -- Risk (overdue receivables + low stock + payroll risk)
  SELECT COALESCE(sum(CASE WHEN status='overdue' THEN total END),0) INTO v_overdue_invoices
  FROM invoices WHERE business_id = p_business_id;
  SELECT EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE business_id = p_business_id AND status IN ('draft','calculated')
      AND total_net > 0
  ) INTO v_payroll_risk;

  v_risk := jsonb_build_object(
    'overdue_receivables', v_overdue_invoices,
    'low_stock_items', v_low_stock,
    'payroll_unpaid', v_payroll_risk
  );

  RETURN jsonb_build_object(
    'people', v_people,
    'money', v_money,
    'operations', v_ops,
    'inventory', v_inventory,
    'risk', v_risk,
    'generated_at', NOW()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.monthly_review(p_business_id uuid, p_period_start date DEFAULT (date_trunc('month'::text, now()))::date, p_period_end date DEFAULT ((date_trunc('month'::text, now()) + '1 mon -1 days'::interval))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_health JSONB;
  v_objectives JSONB;
  v_risks JSONB;
  v_recommendations JSONB;
  v_metrics JSONB;
  v_dq JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- 1. Business Health (latest computed score).
  SELECT to_jsonb(t) INTO v_health FROM (
    SELECT overall_score, dimension_scores, data_quality_penalty,
           insufficient_dimensions, computed_at
    FROM business_health_scores WHERE business_id = p_business_id
  ) t;

  -- 2. OKR progress — objectives whose period overlaps the window, with
  -- weighted KR progress via objective_progress().
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'title', o.title, 'scope', o.scope, 'status', o.status,
    'progress', objective_progress(o.id),
    'key_result_count', (SELECT count(*) FROM key_results WHERE objective_id = o.id),
    'owner_id', o.owner_id, 'period_end', o.period_end
  ) ORDER BY o.period_end NULLS LAST), '[]'::JSONB) INTO v_objectives
  FROM strategic_objectives o
  WHERE o.business_id = p_business_id
    AND o.level = 'objective'
    AND (o.period_end IS NULL OR o.period_end >= p_period_start)
    AND (o.period_start IS NULL OR o.period_start <= p_period_end);

  -- 3. Open risks — top by score.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'category', r.category,
    'risk_score', r.risk_score, 'status', r.status,
    'mitigation_status', r.mitigation_status, 'due_date', r.due_date
  ) ORDER BY r.risk_score DESC, r.due_date NULLS LAST), '[]'::JSONB) INTO v_risks
  FROM business_risks r
  WHERE r.business_id = p_business_id
    AND r.status NOT IN ('closed');

  -- 4. Open recommendations — top by severity.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'rule_id', c.rule_id, 'statement', c.statement,
    'severity', c.severity, 'status', c.status,
    'evidence', c.evidence,
    'expected_impact', c.expected_impact, 'created_at', c.created_at
  ) ORDER BY
    CASE c.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    c.created_at DESC), '[]'::JSONB) INTO v_recommendations
  FROM claims c
  WHERE c.business_id = p_business_id
    AND c.claim_type = 'RECOMMENDATION'
    AND c.status NOT IN ('rejected','outcome_recorded','superseded','expired');

  -- 5. Governed metric movers — metrics in the window with change_percent.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric_key', m.metric_key, 'name', m.name, 'category', m.category,
    'current_value', m.current_value, 'previous_value', m.previous_value,
    'change_percent', m.change_percent, 'confidence', m.confidence,
    'sample_size', m.sample_size, 'target_value', m.target_value,
    'period_end', m.period_end
  ) ORDER BY abs(COALESCE(m.change_percent, 0)) DESC), '[]'::JSONB) INTO v_metrics
  FROM kpi_metrics m
  WHERE m.business_id = p_business_id
    AND m.metric_key IS NOT NULL
    AND m.period_end >= p_period_start
    AND m.period_end <= p_period_end + INTERVAL '1 day';

  -- 6. Data-quality summary — counts by severity.
  SELECT to_jsonb(t) INTO v_dq FROM (
    SELECT
      count(*) FILTER (WHERE severity = 'critical' AND resolved = false) AS open_critical,
      count(*) FILTER (WHERE severity = 'warning' AND resolved = false) AS open_warning,
      count(*) FILTER (WHERE resolved = true) AS resolved_total
    FROM self_audit_findings
    WHERE business_id = p_business_id AND audit_dimension = 'data_quality'
  ) t;

  RETURN jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'generated_at', NOW(),
    'health', v_health,
    'objectives', v_objectives,
    'risks', v_risks,
    'recommendations', v_recommendations,
    'metrics', v_metrics,
    'data_quality', v_dq,
    -- Quick counts for the summary header.
    'summary', jsonb_build_object(
      'open_risks', jsonb_array_length(v_risks),
      'high_risks', (SELECT count(*) FROM jsonb_array_elements(v_risks) x
        WHERE (x->>'risk_score')::int >= 15),
      'open_recommendations', jsonb_array_length(v_recommendations),
      'critical_recommendations', (SELECT count(*) FROM jsonb_array_elements(v_recommendations) x
        WHERE x->>'severity' = 'critical'),
      'objective_count', jsonb_array_length(v_objectives),
      'metric_count', jsonb_array_length(v_metrics)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_best_action(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_recs JSONB;
  v_state JSONB;
  v_business_state TEXT;
  v_best JSONB := NULL;
  v_best_score NUMERIC := -1;
  v_score NUMERIC;
  v_urgency NUMERIC;
  v_impact NUMERIC;
  v_prob NUMERIC;
  v_effort NUMERIC;
  v_severity_weight NUMERIC;
  v_state_bonus NUMERIC;
  v_rule TEXT;
  v_owner UUID;
  v_due TIMESTAMPTZ;
  v_action JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Open recommendations (091 — the existing feed). Coerce the table-valued
  -- return to a JSONB array so we can iterate + read fields by key.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_recs
      FROM open_recommendations(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_recs := '[]'::jsonb;
  END;

  -- Business state (this migration) — actions relevant to the current state
  -- get a relevance bonus.
  BEGIN
    v_state := classify_business_state(p_business_id);
    v_business_state := v_state->>'state';
  EXCEPTION WHEN OTHERS THEN
    v_business_state := NULL;
  END;

  -- Score each open recommendation.
  FOR v_action IN SELECT * FROM jsonb_array_elements(v_recs) LOOP
    BEGIN
      -- Severity → urgency weight (critical = urgent).
      v_severity_weight := CASE v_action->>'severity'
        WHEN 'critical' THEN 1.0
        WHEN 'warning' THEN 0.6
        ELSE 0.3
      END;
      -- Expected impact → impact weight (₦ amount, if present).
      v_impact := NULLIF((v_action->'expected_impact'->'amount')::TEXT, '')::NUMERIC;
      IF v_impact IS NULL THEN v_impact := 0; END IF;
      -- Normalize impact (log scale so a ₦10M action doesn't drown a ₦50k one).
      v_impact := CASE WHEN v_impact > 0 THEN LOG(10, v_impact + 10) ELSE 0 END;
      -- Probability of success (effectiveness loop, 088) — default 0.5.
      v_prob := 0.5;
      v_rule := v_action->>'rule_id';
      IF v_rule IS NOT NULL THEN
        BEGIN
          -- recommendation_effectiveness returns success_count /
          -- outcome_recorded per rule. Default 0.5 if no history yet.
          SELECT COALESCE(
            (SELECT 1.0 * e.success_count / NULLIF(e.outcome_recorded, 0)
               FROM recommendation_effectiveness(p_business_id) e
               WHERE e.rule_id = v_rule
               LIMIT 1),
            0.5) INTO v_prob;
        EXCEPTION WHEN OTHERS THEN v_prob := 0.5; END;
      END IF;
      -- Effort (heuristic from action_type; tunable).
      v_effort := CASE v_action->>'action_type'
        WHEN 'create_task' THEN 1.0
        WHEN 'create_po' THEN 2.0
        WHEN 'route_approval' THEN 1.5
        WHEN 'send_reminder' THEN 0.5
        ELSE 1.0
      END;
      -- State relevance bonus: if the recommendation's domain matches the
      -- business state's binding constraint, boost it.
      v_state_bonus := 0;
      IF v_business_state = 'cash_constrained' AND v_action->>'rule_id' ILIKE 'FIN-AR%' THEN v_state_bonus := 0.3; END IF;
      IF v_business_state = 'sales_constrained' AND v_action->>'rule_id' ILIKE 'SAL%' THEN v_state_bonus := 0.3; END IF;
      IF v_business_state = 'capacity_constrained' AND v_action->>'rule_id' ILIKE 'OPS%' THEN v_state_bonus := 0.3; END IF;

      -- The score: impact × urgency × probability / effort + state_bonus.
      v_score := (v_impact * v_severity_weight * v_prob / v_effort) + v_state_bonus;

      IF v_score > v_best_score THEN
        v_best_score := v_score;
        v_best := v_action;
        v_best := jsonb_set(v_best, '{_nba_score}', to_jsonb(ROUND(v_score::numeric, 3)));
        v_best := jsonb_set(v_best, '{_nba_reason}',
          to_jsonb(
            'Impact ' || ROUND(v_impact::numeric,2) || ' × urgency ' || ROUND(v_severity_weight::numeric,2) ||
            ' × probability ' || ROUND(v_prob::numeric,2) || ' ÷ effort ' || ROUND(v_effort::numeric,1) ||
            CASE WHEN v_state_bonus > 0 THEN ' + state relevance ' || ROUND(v_state_bonus::numeric,2) ELSE '' END
          ));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_best IS NULL THEN
    RETURN jsonb_build_object('action', NULL,
      'note', 'Nothing needs your attention right now. As your business data grows, Avenize will surface the single most valuable thing to do here.',
      'business_state', v_business_state);
  END IF;

  -- Attach an owner + a sensible due date (critical = 2 days, warning = 7).
  v_owner := NULLIF(v_best->>'owner_id', '')::UUID;
  v_due := CASE v_best->>'severity'
    WHEN 'critical' THEN NOW() + INTERVAL '2 days'
    WHEN 'warning' THEN NOW() + INTERVAL '7 days'
    ELSE NOW() + INTERVAL '14 days'
  END;
  v_best := jsonb_set(v_best, '{_nba_owner_id}', to_jsonb(v_owner));
  v_best := jsonb_set(v_best, '{_nba_due_at}', to_jsonb(v_due));

  RETURN jsonb_build_object('action', v_best, 'business_state', v_business_state);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('action', NULL, 'error', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.business_value_ledger(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows JSONB;
  v_recovered NUMERIC := 0;
  v_saved NUMERIC := 0;
  v_generated NUMERIC := 0;
  v_identified NUMERIC := 0;
  v_acted INT := 0;
  v_outcomes INT := 0;
  v_successful INT := 0;
  v_item JSONB;
  v_amt NUMERIC;
  v_kind TEXT;
  v_rule TEXT;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Aggregate claims with status='outcome_recorded' (088) that have an
  -- actual_impact amount. Best-effort — empty if the loop isn't deployed.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY (t->>'recorded_at')::timestamptz DESC), '[]'::jsonb) INTO v_rows
      FROM (
        SELECT
          c.id, c.rule_id, c.statement, c.severity,
          c.expected_impact, c.actual_impact,
          c.status, c.updated_at,
          COALESCE(c.actual_impact->>'description', c.expected_impact->>'description') AS description,
          COALESCE((c.actual_impact->>'amount')::NUMERIC, 0) AS actual_amount,
          COALESCE((c.expected_impact->>'amount')::NUMERIC, 0) AS expected_amount
        FROM claims c
        WHERE c.business_id = p_business_id
          AND c.claim_type = 'RECOMMENDATION'
          AND c.status = 'outcome_recorded'
      ) t;
  EXCEPTION WHEN OTHERS THEN
    v_rows := '[]'::jsonb;
  END;

  -- Categorize by the rule_id prefix (deterministic, tunable):
  --   FIN-AR (receivables) / FIN-CF (cash) → recovered/saved
  --   SAL / CUST → generated (revenue opportunity)
  --   INV / OPS → saved (cost/waste reduction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    BEGIN
      v_amt := (v_item->>'actual_amount')::NUMERIC;
      v_rule := v_item->>'rule_id';
      IF v_amt IS NULL OR v_amt <= 0 THEN CONTINUE; END IF;
      v_outcomes := v_outcomes + 1;
      v_kind := CASE
        WHEN v_rule ILIKE 'FIN-AR%' OR v_rule ILIKE 'FIN-CF%' THEN 'recovered'
        WHEN v_rule ILIKE 'SAL%' OR v_rule ILIKE 'CUST%' THEN 'generated'
        WHEN v_rule ILIKE 'INV%' OR v_rule ILIKE 'OPS%' OR v_rule ILIKE 'DQ%' THEN 'saved'
        ELSE 'generated'
      END;
      IF v_kind = 'recovered' THEN v_recovered := v_recovered + v_amt;
      ELSIF v_kind = 'saved' THEN v_saved := v_saved + v_amt;
      ELSE v_generated := v_generated + v_amt;
      END IF;
      v_successful := v_successful + 1;
    EXCEPTION WHEN OTHERS THEN CONTINUE; END;
  END LOOP;

  -- "Identified" = the sum of expected impacts across ALL acted-on
  -- recommendations (whether or not the outcome was measured yet).
  BEGIN
    SELECT COALESCE(SUM(COALESCE((c.expected_impact->>'amount')::NUMERIC, 0)), 0) INTO v_identified
      FROM claims c
      WHERE c.business_id = p_business_id
        AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
    SELECT COUNT(*) INTO v_acted FROM claims c
      WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
  EXCEPTION WHEN OTHERS THEN
    v_identified := 0; v_acted := 0;
  END;

  RETURN jsonb_build_object(
    'total_value', ROUND((v_recovered + v_saved + v_generated)::numeric, 2),
    'recovered', ROUND(v_recovered::numeric, 2),
    'saved', ROUND(v_saved::numeric, 2),
    'generated', ROUND(v_generated::numeric, 2),
    'identified', ROUND(v_identified::numeric, 2),
    'recommendations_acted', v_acted,
    'outcomes_recorded', v_outcomes,
    'successful_outcomes', v_successful,
    'recent', v_rows,
    -- Honesty: if no outcomes recorded yet, say so (§22 — never fabricate value).
    'note', CASE WHEN v_outcomes = 0
      THEN 'No outcomes recorded yet. As you act on recommendations and record what happened, Avenize will total the value it has created here.'
      ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('total_value', 0, 'recovered',0,'saved',0,'generated',0,
    'identified',0,'recommendations_acted',0,'outcomes_recorded',0,'successful_outcomes',0,
    'recent','[]'::jsonb, 'error', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.classify_business_state(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_health JSONB;
  v_overall INT;
  v_dims JSONB;
  v_fin_score INT; v_sales_score INT; v_cust_score INT; v_ops_score INT;
  v_people_score INT; v_proj_score INT;
  v_insufficient TEXT[];
  v_metrics JSONB;
  v_revenue_change NUMERIC;
  v_cash_change NUMERIC;
  v_expense_change NUMERIC;
  v_pipeline_change NUMERIC;
  v_overdue_change NUMERIC;
  v_state TEXT;
  v_reasons JSONB;
  v_confidence TEXT;
  v_signals JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- The Pulse (093). Best-effort: if unavailable, state is 'insufficient_data'.
  BEGIN
    v_health := current_business_health(p_business_id);
    v_overall := (v_health->>'overall_score')::INT;
    v_dims := COALESCE(v_health->'dimension_scores', '{}'::jsonb);
    v_insufficient := COALESCE((v_health->>'insufficient_dimensions')::TEXT[], ARRAY[]::TEXT[]);
  EXCEPTION WHEN OTHERS THEN
    v_overall := NULL;
  END;

  -- Per-dimension scores (NULL if the dimension is insufficient).
  v_fin_score   := NULLIF((v_dims->'financial'->>'score')::TEXT, '')::INT;
  v_sales_score := NULLIF((v_dims->'sales'->>'score')::TEXT, '')::INT;
  v_cust_score  := NULLIF((v_dims->'customers'->>'score')::TEXT, '')::INT;
  v_ops_score   := NULLIF((v_dims->'operations'->>'score')::TEXT, '')::INT;
  v_people_score:= NULLIF((v_dims->'people'->>'score')::TEXT, '')::INT;
  v_proj_score  := NULLIF((v_dims->'projects'->>'score')::TEXT, '')::INT;

  -- Metric-level MoM deltas (086 refresh_business_metrics writes change_percent).
  -- These are the TREND signals — the difference between "healthy" and
  -- "healthy but declining" / "stressed but recovering".
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_metrics
      FROM current_metrics(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_metrics := '[]'::jsonb;
  END;
  SELECT (m->>'change_percent')::NUMERIC INTO v_revenue_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'revenue';
  SELECT (m->>'change_percent')::NUMERIC INTO v_cash_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'cash_balance';
  SELECT (m->>'change_percent')::NUMERIC INTO v_expense_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'total_expenses';
  SELECT (m->>'change_percent')::NUMERIC INTO v_pipeline_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'pipeline_value';
  SELECT (m->>'change_percent')::NUMERIC INTO v_overdue_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'overdue_invoices';

  v_signals := jsonb_build_object(
    'overall_score', v_overall,
    'financial_score', v_fin_score, 'sales_score', v_sales_score,
    'customer_score', v_cust_score, 'operations_score', v_ops_score,
    'people_score', v_people_score, 'projects_score', v_proj_score,
    'revenue_change_pct', v_revenue_change,
    'cash_change_pct', v_cash_change,
    'expense_change_pct', v_expense_change,
    'pipeline_change_pct', v_pipeline_change,
    'overdue_change_pct', v_overdue_change
  );

  v_reasons := '[]'::jsonb;

  -- ---- The classifier (deterministic, priority-ordered) ----
  -- AT RISK: overall < 40. The business is in trouble.
  IF v_overall IS NOT NULL AND v_overall < 40 THEN
    v_state := 'at_risk';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Overall health is ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Below the 40-point at-risk threshold'));

  -- CASH CONSTRAINED: financial dimension is the weakest AND cash is declining.
  ELSIF v_fin_score IS NOT NULL AND v_fin_score < 50
        AND (v_cash_change IS NOT NULL AND v_cash_change < 0) THEN
    v_state := 'cash_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Financial health is ' || v_fin_score || '/100 and cash is down ' || ROUND(v_cash_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Cash position is the binding constraint'));

  -- SALES CONSTRAINED: sales dimension is the weakest AND revenue/pipeline declining.
  ELSIF v_sales_score IS NOT NULL AND v_sales_score < 50
        AND ((v_revenue_change IS NOT NULL AND v_revenue_change < 0)
             OR (v_pipeline_change IS NOT NULL AND v_pipeline_change < 0)) THEN
    v_state := 'sales_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Sales health is ' || v_sales_score || '/100 with declining revenue/pipeline',
      'evidence', 'FACT', 'detail', 'Sales is the binding constraint'));

  -- CAPACITY CONSTRAINED: operations or people dimension weak + growing demand.
  ELSIF ((v_ops_score IS NOT NULL AND v_ops_score < 55) OR (v_people_score IS NOT NULL AND v_people_score < 55))
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 10 THEN
    v_state := 'capacity_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Operations/people health lagging while revenue grows ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Growth is outpacing capacity'));

  -- OPERATIONALLY CONSTRAINED: operations dimension is the weakest.
  ELSIF v_ops_score IS NOT NULL AND v_ops_score < 50
        AND (v_fin_score IS NULL OR v_fin_score >= 50) THEN
    v_state := 'operationally_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Operations health is ' || v_ops_score || '/100',
      'evidence', 'FACT', 'detail', 'Operational friction is the binding constraint'));

  -- STRESSED: overall 40-55 (below healthy, above at-risk).
  ELSIF v_overall IS NOT NULL AND v_overall < 56 THEN
    v_state := 'stressed';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Overall health is ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Below the 56-point healthy threshold'));

  -- RECOVERING: health >= 56 but a key metric was declining and is now improving,
  -- OR overall is mid-range but improving.
  ELSIF v_overall IS NOT NULL AND v_overall < 70
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 0 THEN
    v_state := 'recovering';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Trending upward from a weaker position'));

  -- GROWING: health >= 70 AND revenue growing > 10% AND not scaling-fast.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 10 THEN
    v_state := 'growing';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Strong and accelerating'));

  -- SCALING: health >= 75 AND revenue growing > 25% (rapid expansion).
  ELSIF v_overall IS NOT NULL AND v_overall >= 75
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 25 THEN
    v_state := 'scaling';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Rapid expansion — watch capacity'));

  -- OPPORTUNITY-RICH: health >= 70 AND a strong pipeline is building.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70
        AND v_pipeline_change IS NOT NULL AND v_pipeline_change > 15 THEN
    v_state := 'opportunity_rich';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and pipeline up ' || ROUND(v_pipeline_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Healthy with a building pipeline'));

  -- STABLE: health >= 70, no strong growth or decline.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70 THEN
    v_state := 'stable';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Healthy with steady metrics'));

  -- INSUFFICIENT DATA: no overall score (migration not deployed, or no targets set).
  ELSE
    v_state := 'insufficient_data';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Not enough data to classify the business state yet',
      'evidence', 'FACT', 'detail', 'Set metric targets and use Avenize for a few weeks'));
  END IF;

  -- Confidence: how many dimensions had data.
  v_confidence := CASE
    WHEN v_overall IS NULL THEN 'insufficient'
    WHEN array_length(v_insufficient, 1) IS NULL OR array_length(v_insufficient, 1) = 0 THEN 'high'
    WHEN array_length(v_insufficient, 1) <= 2 THEN 'medium'
    ELSE 'low'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'confidence', v_confidence,
    'reasons', v_reasons,
    'signals', v_signals
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('state', 'insufficient_data', 'confidence', 'insufficient',
    'reasons', jsonb_build_array(jsonb_build_object('label', SQLERRM, 'evidence', 'FACT')), 'error', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.capacity_intelligence(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_headcount INTEGER; v_open_tasks INTEGER; v_overdue INTEGER;
  v_tasks_per_person NUMERIC; v_overload BOOLEAN;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT count(*) INTO v_headcount FROM staff WHERE business_id = p_business_id;
  SELECT count(*) FILTER (WHERE status IN ('todo','in_progress')),
         count(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE)
  INTO v_open_tasks, v_overdue
  FROM tasks WHERE business_id = p_business_id;
  v_tasks_per_person := CASE WHEN v_headcount = 0 THEN 0 ELSE v_open_tasks::NUMERIC / v_headcount END;
  v_overload := v_tasks_per_person > 10 OR v_overdue > v_headcount;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'headcount', v_headcount,
      'open_tasks', v_open_tasks,
      'overdue_tasks', v_overdue,
      'tasks_per_person', round(v_tasks_per_person::numeric,1),
      'overloaded', v_overload
    ),
    'constraint', CASE WHEN v_overload THEN 'people_capacity' ELSE 'none' END,
    'recommendation', CASE WHEN v_overload THEN 'Consider hiring, outsourcing, or reprioritizing work.' ELSE 'Capacity is balanced.' END,
    'type','INFERENCE'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_process_bottlenecks(p_business_id uuid)
 RETURNS TABLE(kind text, id uuid, title text, stage text, age_days numeric, owner_id uuid, severity text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY -- Stagnant deals: open, untouched > 14 days
  SELECT 'deal'::TEXT, d.id, d.title, COALESCE(d.stage,'unknown'), age_days,
         d.owner_id,
         CASE WHEN age_days > 30 THEN 'high' WHEN age_days > 14 THEN 'medium' ELSE 'low' END
  FROM (
    SELECT id, business_id, title, stage, owner_id, created_at,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400, 0) AS age_days
    FROM deals WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND stage NOT IN ('won', 'lost')
  ) d
  WHERE d.age_days > 14
  UNION ALL
  -- Stale tasks: open, not updated > 7 days
  SELECT 'task'::TEXT, t.id, t.title, COALESCE(t.status,'open'), task_age,
         t.assignee_id,
         CASE WHEN task_age > 21 THEN 'high' WHEN task_age > 7 THEN 'medium' ELSE 'low' END
  FROM (
    SELECT id, business_id, title, status, assignee_id,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400, 0) AS task_age
    FROM tasks WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND status NOT IN ('done','completed','cancelled','canceled')
  ) t
  WHERE t.task_age > 7;
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_risk_anomalies(p_business_id uuid)
 RETURNS TABLE(rule text, entity_id uuid, description text, amount numeric, detected_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY -- Expense claims > 2x the claimant's historical average (min 3 prior claims)
  SELECT 'expense_outlier'::TEXT, ec.id,
         'Expense claim by ' || COALESCE(ec.staff_id::TEXT,'?') ||
         ' is ' || ROUND((ec.amount / NULLIF(avg_prev.avg_amount,0))::NUMERIC, 1) ||
         'x their historical average',
         ec.amount, ec.created_at
  FROM expense_claims ec
  JOIN LATERAL (
    SELECT AVG(amount) AS avg_amount, COUNT(*) AS n
    FROM expense_claims
    WHERE staff_id = ec.staff_id AND business_id = p_business_id AND created_at < ec.created_at
  ) avg_prev ON true
  WHERE ec.business_id = p_business_id
    AND avg_prev.n >= 3
    AND ec.amount > 2 * avg_prev.avg_amount
  UNION ALL
  -- Invoices to contacts created the same day (possible synthetic counterparty)
  SELECT 'new_contact_invoice'::TEXT, inv.id,
         'Invoice ' || COALESCE(inv.invoice_number,'?') || ' to a contact created <24h prior',
         inv.total, inv.created_at
  FROM invoices inv
  LEFT JOIN contacts c ON c.email = inv.client_email
  WHERE inv.business_id = p_business_id
    AND inv.created_at - c.created_at < INTERVAL '24 hours'
  UNION ALL
  -- Payments reversed within 24h of receipt
  SELECT 'rapid_reversal'::TEXT, rf.id,
         'Payment ' || COALESCE(p.reference,'?') || ' reversed within 24h of receipt',
         p.amount, p.created_at AS refund_at
  FROM payment_refunds rf
  JOIN payments p ON p.id = rf.payment_id
  WHERE p.business_id = p_business_id
    AND p.created_at - p.created_at < INTERVAL '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_early_warnings(p_business_id uuid)
 RETURNS TABLE(alert_type text, detail text, value numeric, threshold numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT 'overdue_invoices'::TEXT,
         COUNT(*) || ' invoices overdue >30 days',
         COUNT(*)::NUMERIC, 3
  FROM invoices
  WHERE business_id = p_business_id
    AND status = 'overdue'
    AND due_date < NOW() - INTERVAL '30 days'
  GROUP BY business_id
  HAVING COUNT(*) >= 3
  UNION ALL
  SELECT 'budget_near_limit'::TEXT,
         'Budget ' || b.name || ' at ' || ROUND((consumed.total / NULLIF(b.total_amount,0))::NUMERIC * 100) || '%',
         consumed.total, b.total_amount * 0.9
  FROM budgets b
  JOIN LATERAL (
    SELECT COALESCE(SUM(amount),0) AS total
    FROM budget_transactions bt WHERE bt.budget_id = b.id
  ) consumed ON true
  WHERE b.business_id = p_business_id
    AND b.total_amount > 0
    AND consumed.total >= b.total_amount * 0.9;
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_sales_performance(p_business_id uuid)
 RETURNS TABLE(staff_id uuid, target_amount numeric, achieved_amount numeric, attainment_pct numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT st.staff_id,
         st.revenue_target,
         COALESCE(won.achieved,0) AS achieved_amount,
         CASE WHEN st.revenue_target > 0
              THEN ROUND((COALESCE(won.achieved,0) / st.revenue_target * 100)::NUMERIC, 1)
              ELSE 0 END,
         CASE
           WHEN COALESCE(won.achieved,0) >= st.revenue_target THEN 'on_track'
           WHEN COALESCE(won.achieved,0) >= st.revenue_target * 0.5 THEN 'at_risk'
           ELSE 'behind'
         END
  FROM sales_targets st
  LEFT JOIN LATERAL (
    SELECT SUM(d.value) AS achieved
    FROM deals d
    WHERE d.owner_id = st.staff_id
      AND d.business_id = p_business_id
      AND d.stage IN ('won','closed_won','closed-won')
  ) won ON true
  WHERE st.business_id = p_business_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_cashflow_forecast(p_business_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(projected_date date, projected_net numeric, method text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY WITH daily AS (
    SELECT DATE(created_at) AS d, SUM(amount) AS net
    FROM cashflow_entries
    WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END
      AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY 1
  ),
  avg_net AS (SELECT AVG(net) AS a, COUNT(*) AS n FROM daily)
  SELECT generate_series(
           (CURRENT_DATE + INTERVAL '1 day')::DATE,
           (CURRENT_DATE + p_days * INTERVAL '1 day')::DATE,
           INTERVAL '1 day'
         )::DATE,
         avg_net.a, '90d_moving_average'
  FROM avg_net
  WHERE avg_net.n >= 7;  -- need at least a week of history to forecast;
END;
$function$;

CREATE OR REPLACE FUNCTION public.usage_module_adoption(p_business_id uuid, p_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
 RETURNS TABLE(module_key text, distinct_staff integer, event_count bigint, last_seen timestamp with time zone, adoption_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT module_key,
         COUNT(DISTINCT staff_id)::INT,
         COUNT(*)::BIGINT AS event_count,
         MAX(occurred_at),
         CASE
           WHEN COUNT(DISTINCT staff_id) >= 3 THEN 'adopted'
           WHEN COUNT(DISTINCT staff_id) >= 1 THEN 'trying'
           ELSE 'untouched'
         END
  FROM usage_events
  WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND occurred_at >= p_since
  GROUP BY module_key
  ORDER BY event_count DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.strategic_alignment(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_total INTEGER; v_underfunded INTEGER; v_list JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE allocated_resources = '{}'::JSONB)
  INTO v_total, v_underfunded
  FROM strategic_objectives WHERE business_id = p_business_id AND level = 'objective' AND status='active';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'level',level,'has_resources', allocated_resources <> '{}'::JSONB)), '[]'::JSONB)
  INTO v_list FROM strategic_objectives WHERE business_id = p_business_id AND status='active' ORDER BY level, created_at;
  RETURN jsonb_build_object(
    'objectives_total', v_total,
    'underfunded', v_underfunded,
    'misalignment_detected', v_underfunded > 0,
    'note', CASE WHEN v_underfunded > 0
      THEN CONCAT(v_underfunded, ' active objective(s) have no allocated resources — possible strategic misalignment.')
      ELSE 'Active objectives appear resourced.' END,
    'objectives', v_list,
    'type','INFERENCE'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.similar_decisions(p_business_id uuid, p_query text DEFAULT NULL::text, p_tags text[] DEFAULT '{}'::text[])
 RETURNS TABLE(id uuid, title text, context text, what_learned text, learning_tags text[], decided_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT id, title, context, what_learned, learning_tags, decided_at
  FROM decisions
  WHERE business_id = p_business_id AND status = 'reviewed'
    AND (
      (p_query IS NULL OR context ILIKE '%' || p_query || '%' OR title ILIKE '%' || p_query || '%')
      OR (p_tags <> '{}'::TEXT[] AND learning_tags && p_tags)
    )
  ORDER BY decided_at DESC LIMIT 10;
END;
$function$;

CREATE OR REPLACE FUNCTION public.persona_conflict_detection(p_business_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD; v_conflicts JSONB := '[]'::JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT * INTO v_profile FROM persona_profiles WHERE business_id = p_business_id AND staff_id = p_staff_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('conflicts','[]'::JSONB); END IF;

  -- Heuristic: authority + risk-aversion (control) vs interaction preference for speed.
  IF v_profile.interaction_preferences ? 'speed_priority' AND (v_profile.interaction_preferences->>'speed_priority') = 'high'
     AND v_profile.authority IS NOT NULL AND jsonb_array_length(v_profile.authority) > 0 THEN
    v_conflicts := v_conflicts || jsonb_build_object(
      'type','control_vs_speed',
      'description','Persona values speed but holds approval authority — risk-based process design recommended',
      'recommendation','Set tiered approval thresholds so low-risk actions bypass approval'
    );
  END IF;

  RETURN jsonb_build_object('conflicts', v_conflicts, 'count', jsonb_array_length(v_conflicts), 'type','INFERENCE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.persona_success_metrics_summary(p_business_id uuid)
 RETURNS TABLE(staff_id uuid, persona_type text, success_metrics jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT staff_id, persona_type, success_metrics
  FROM persona_profiles WHERE business_id = p_business_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.knowledge_concentration(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_rows JSONB;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('decided_by', decided_by, 'decision_count', cnt)), '[]'::JSONB)
  INTO v_rows FROM (
    SELECT decided_by, count(*) AS cnt
    FROM decisions WHERE business_id = p_business_id AND decided_by IS NOT NULL
    GROUP BY decided_by HAVING count(*) > 3
    ORDER BY cnt DESC
  ) t;
  RETURN jsonb_build_object('concentrated_owners', v_rows, 'risk',
    CASE WHEN jsonb_array_length(v_rows) > 0 THEN 'knowledge concentrated in few people — capture and delegate' ELSE 'balanced' END,
    'type','INFERENCE');
END;
$function$;

CREATE OR REPLACE FUNCTION public.data_integrity_scores(p_business_id uuid)
 RETURNS TABLE(entity_type text, completeness numeric, duplication numeric, validity numeric, freshness numeric, source_quality numeric, overall numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  WITH fresh AS (
    SELECT entity_type,
      count(*) FILTER (WHERE freshness_tier IN ('fresh','today'))::NUMERIC / NULLIF(count(*),0) AS f_ratio
    FROM entity_freshness WHERE business_id = p_business_id GROUP BY entity_type
  )
  SELECT COALESCE(f.entity_type,'overall'),
    0.85, 0.95, 0.90, COALESCE(round(f.f_ratio::numeric,2),0.50), 0.80,
    round(((0.85+0.95+0.90+COALESCE(f.f_ratio,0.50)+0.80)/5)::numeric,2)
  FROM fresh f;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_org_chart()
 RETURNS TABLE(staff_id uuid, full_name text, email text, avatar_url text, position_title text, department text, level integer, manager_id uuid, direct_report_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT 
    rs.staff_id,
    s.full_name,
    s.email,
    s.avatar_url,
    rs.position_title,
    rs.department,
    rs.level,
    rs.manager_id,
    (SELECT COUNT(*) FROM reporting_structure WHERE manager_id = rs.staff_id AND is_active = TRUE)::INTEGER as direct_report_count
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.business_id = (SELECT business_id FROM get_current_staff())
    AND rs.is_active = TRUE
  ORDER BY rs.level, s.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_org_chart(p_business_id uuid)
 RETURNS TABLE(staff_id uuid, name text, email text, job_title text, department text, role text, avatar_url text, reports_to uuid, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT 
    s.id as staff_id,
    s.name,
    s.email,
    s.job_title,
    s.department,
    s.role,
    s.avatar_url,
    ra.staff_id as reports_to,
    COALESCE(s.level, 0) as level
  FROM staff s
  LEFT JOIN reporting_channels rc ON rc.staff_id = s.id
  LEFT JOIN reporting_assignments ra ON ra.channel_id = rc.channel_id AND ra.is_primary = TRUE
  WHERE s.business_id = p_business_id
    AND s.is_active = TRUE
  ORDER BY s.level NULLS LAST, s.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_business_branding(p_business_id uuid)
 RETURNS business_branding
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_branding business_branding%ROWTYPE;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT * INTO v_branding FROM business_branding WHERE business_id = p_business_id;
  
  -- Return defaults if none exists
  IF NOT FOUND THEN
    RETURN NULL; -- frontend will use defaults
  END IF;
  
  RETURN v_branding;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_email_template(p_business_id uuid, p_template_type text)
 RETURNS TABLE(id uuid, subject text, heading text, body text, cta_text text, cta_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT 
    et.id,
    et.subject,
    et.heading,
    et.body,
    et.cta_text,
    et.cta_url
  FROM email_templates et
  WHERE (et.business_id = p_business_id OR et.is_default = TRUE)
    AND et.template_type = p_template_type
  ORDER BY CASE WHEN et.business_id = p_business_id THEN 0 ELSE 1 END
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_events_in_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(id uuid, title text, description text, event_type text, start_time timestamp with time zone, end_time timestamp with time zone, all_day boolean, location text, status text, organizer_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.event_type,
    e.start_time,
    e.end_time,
    e.all_day,
    e.location,
    e.status,
    COALESCE(s.full_name, s.name) as organizer_name
  FROM events e
  LEFT JOIN staff s ON s.id = e.organizer_id
  WHERE e.business_id IN (SELECT business_id FROM get_current_staff())
  AND e.status != 'cancelled'
  AND e.start_time >= p_start
  AND e.start_time <= p_end
  ORDER BY e.start_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_events_in_range(p_business_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(id uuid, title text, description text, start_date timestamp with time zone, end_date timestamp with time zone, all_day boolean, event_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.start_date,
    e.end_date,
    e.all_day,
    e.event_type
  FROM events e
  WHERE e.business_id = p_business_id
    AND e.start_date >= p_start_date
    AND e.start_date <= p_end_date
  ORDER BY e.start_date ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_subscription_invoices(p_business_id uuid)
 RETURNS SETOF subscription_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT *
  FROM subscription_invoices
  WHERE business_id = p_business_id
  ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_subscription_payments(p_business_id uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF subscription_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT *
  FROM subscription_payments
  WHERE business_id = p_business_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_business_id uuid, p_flag_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_enabled BOOLEAN; v_shutdown BOOLEAN; v_pct INTEGER; v_hash INTEGER;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT enabled, emergency_shutdown, rollout_pct INTO v_enabled, v_shutdown, v_pct
  FROM feature_flags
  WHERE (business_id IS NULL OR business_id = p_business_id) AND flag_key = p_flag_key
  ORDER BY business_id NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_shutdown THEN RETURN FALSE; END IF;
  IF NOT v_enabled THEN RETURN FALSE; END IF;
  -- Deterministic per-business rollout hash.
  v_hash := abs(hashtext(p_business_id::TEXT || p_flag_key)) % 100;
  RETURN v_hash < v_pct;
END;
$function$;

CREATE OR REPLACE FUNCTION public.salary_affordability(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_payroll_monthly NUMERIC; v_cash NUMERIC; v_receivables NUMERIC;
  v_coverage NUMERIC; v_risk TEXT;
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  SELECT COALESCE(sum(base_salary),0)/12.0 INTO v_payroll_monthly
  FROM staff WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0) -
         COALESCE(sum(CASE WHEN status='paid' THEN total END),0)*0.6
  INTO v_cash FROM invoices WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0)
  INTO v_receivables FROM invoices WHERE business_id = p_business_id;
  v_coverage := CASE WHEN v_payroll_monthly = 0 THEN 999 ELSE v_cash / v_payroll_monthly END;
  v_risk := CASE WHEN v_coverage < 1 THEN 'critical' WHEN v_coverage < 3 THEN 'warning' ELSE 'ok' END;

  RETURN jsonb_build_object(
    'monthly_payroll', v_payroll_monthly,
    'available_cash', v_cash,
    'incoming_receivables', v_receivables,
    'payroll_coverage_months', round(v_coverage::numeric, 1),
    'risk_tier', v_risk,
    'scenarios', jsonb_build_array(
      jsonb_build_object('label','Across-the-board 10% increase','monthly_impact', v_payroll_monthly*0.10, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.1) END),
      jsonb_build_object('label','Targeted top-performer increase','monthly_impact', v_payroll_monthly*0.03, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.03) END),
      jsonb_build_object('label','Collection intervention first','note','Accelerate receivables to fund increases', 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE (v_cash+v_receivables*0.5)/v_payroll_monthly END)
    ),
    'type','ESTIMATE',
    'assumptions','cash proxies revenue minus 60% expenses; coverage assumes no revenue growth'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.blocked_work(p_business_id uuid)
 RETURNS TABLE(dependent_type text, dependent_id uuid, unsatisfied_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  RETURN QUERY
  SELECT dependent_type, dependent_id, count(*) AS unsatisfied_count
  FROM work_dependencies
  WHERE business_id = p_business_id AND satisfied = FALSE
  GROUP BY dependent_type, dependent_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.intelligence_capacity(p_business_id uuid)
 RETURNS TABLE(staff_id uuid, open_tasks integer, open_tickets integer, total_load integer, business_avg_load numeric, variance_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY WITH loads AS (
    SELECT s.id AS staff_id,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','completed','cancelled','canceled')) AS open_tasks,
           COUNT(DISTINCT tk.id) FILTER (WHERE tk.status NOT IN ('resolved','closed','cancelled','canceled')) AS open_tickets
    FROM staff s
    LEFT JOIN tasks t ON t.assignee_id = s.id AND t.business_id = p_business_id
    LEFT JOIN tickets tk ON tk.assignee_id = s.id AND tk.business_id = p_business_id
    WHERE s.business_id = p_business_id
    GROUP BY s.id
  ),
  agg AS (SELECT AVG(COALESCE(open_tasks,0) + COALESCE(open_tickets,0)) AS avg_load FROM loads)
  SELECT l.staff_id, COALESCE(l.open_tasks,0), COALESCE(l.open_tickets,0),
         COALESCE(l.open_tasks,0) + COALESCE(l.open_tickets,0),
         agg.avg_load,
         CASE
           WHEN COALESCE(l.open_tasks,0) + COALESCE(l.open_tickets,0) > agg.avg_load * 1.5 THEN 'overloaded'
           WHEN COALESCE(l.open_tasks,0) + COALESCE(l.open_tickets,0) < agg.avg_load * 0.5 THEN 'underutilized'
           ELSE 'normal'
         END
  FROM loads l CROSS JOIN agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_recommendations(p_business_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, rule_id text, severity text, statement text, evidence jsonb, expected_impact jsonb, status text, owner_id uuid, action_type text, linked_action_id uuid, created_at timestamp with time zone, subject_type text, subject_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT id, rule_id, severity, statement, evidence, expected_impact, status,
    owner_id, action_type, linked_action_id, created_at, subject_type, subject_id
  FROM claims
  WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND claim_type = 'RECOMMENDATION'
    AND status NOT IN ('rejected','outcome_recorded','superseded','expired')
  ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    created_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recommendation_effectiveness(p_business_id uuid)
 RETURNS TABLE(rule_id text, issued bigint, accepted bigint, rejected bigint, acted bigint, outcome_recorded bigint, success_count bigint, avg_actual numeric, avg_expected numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT
    COALESCE(c.rule_id, 'unspecified') AS rule_id,
    COUNT(*) FILTER (WHERE c.status IS NOT NULL) AS issued,
    COUNT(*) FILTER (WHERE c.status IN ('accepted','acted','outcome_recorded')) AS accepted,
    COUNT(*) FILTER (WHERE c.status = 'rejected') AS rejected,
    COUNT(*) FILTER (WHERE c.status IN ('acted','outcome_recorded')) AS acted,
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded') AS outcome_recorded,
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded'
      AND (c.actual_impact->>'amount')::NUMERIC >= 0) AS success_count,
    AVG(NULLIF((c.actual_impact->>'amount')::NUMERIC, NULL)) AS avg_actual,
    AVG(NULLIF((c.expected_impact->>'amount')::NUMERIC, NULL)) AS avg_expected
  FROM claims c
  WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
  GROUP BY COALESCE(c.rule_id, 'unspecified')
  ORDER BY issued DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.data_quality_findings(p_business_id uuid)
 RETURNS TABLE(id uuid, category text, severity text, title text, detail text, entity_type text, entity_id uuid, suggested_remediation text, resolved boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT id, category, severity, title, detail, entity_type, entity_id,
    suggested_remediation, resolved, created_at
  FROM self_audit_findings
  WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND audit_dimension = 'data_quality'
  ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_canonical(p_business_id uuid, p_alias text)
 RETURNS TABLE(canonical_type text, canonical_table text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY SELECT canonical_type, canonical_table FROM business_ontology
WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END AND lower(alias) = lower(p_alias)
LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.company_tree(p_business_id uuid, p_root_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(entity_id uuid, name text, entity_type text, parent_entity_id uuid, depth integer, path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY WITH RECURSIVE walk AS (
  SELECT id, name, entity_type, parent_entity_id, 0 AS depth,
         name::TEXT AS path
  FROM company_entities
  WHERE business_id = p_business_id
    AND (p_root_id IS NULL OR id = p_root_id)
  UNION ALL
  SELECT ce.id, ce.name, ce.entity_type, ce.parent_entity_id, w.depth + 1,
         w.path || ' > ' || ce.name
  FROM company_entities ce JOIN walk w ON ce.parent_entity_id = w.id
  WHERE ce.business_id = p_business_id
)
SELECT * FROM walk ORDER BY depth, name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.said_vs_used(p_business_id uuid)
 RETURNS TABLE(module_key text, selected boolean, actually_used boolean, distinct_staff_used integer, event_count bigint, last_seen timestamp with time zone, gap_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;

  -- Membership authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  RETURN QUERY -- The set of tool keys this business selected at onboarding (or later via
  -- WorkspaceSettings). NULL/empty selection = "no curation yet"; we treat
  -- that as "nothing explicitly selected" so the gap is honest, not noisy.
  -- COALESCE the ARRAY first (guards a NULL selected_tools), then unnest to
  -- scalar rows. unnest of an empty array yields 0 rows (correct).
  WITH selected AS (
    SELECT unnest(COALESCE(selected_tools, '{}'::TEXT[])) AS tool_key
    FROM user_workspace_selections
    WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END
  ),
  -- Actual usage in the last 30 days (same window as
  -- usage_module_adoption so labels are consistent).
  used AS (
    SELECT module_key,
           COUNT(DISTINCT staff_id)::INT AS distinct_staff,
           COUNT(*)::BIGINT AS events,
           MAX(occurred_at) AS last_seen
    FROM usage_events
    WHERE business_id = CASE WHEN public.is_business_member(p_business_id) THEN p_business_id ELSE '00000000-0000-0000-0000-000000000000'::uuid END
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
    q.module_key,
    q.selected,
    q.actually_used,
    q.distinct_staff_used,
    q.event_count,
    q.last_seen,
    q.gap_label
  FROM (
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
  ) q
  ORDER BY
    CASE q.gap_label
      WHEN 'selected_unused' THEN 0   -- the headline gap: selected but dead
      WHEN 'used_unselected' THEN 1
      WHEN 'trying'          THEN 2
      WHEN 'adopted'         THEN 3
      ELSE 4
    END,
    COALESCE(q.event_count, 0) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_business_in_trial(p_business_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.is_business_member(p_business_id) AND EXISTS (
    SELECT 1 FROM business_entitlements
    WHERE business_id = p_business_id
      AND plan = 'free'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
  );
$function$;

CREATE OR REPLACE FUNCTION public.cancel_subscription(p_business_id uuid, p_cancel_at_period_end boolean DEFAULT true)
 RETURNS business_subscriptions
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_subscription business_subscriptions%ROWTYPE;
BEGIN
    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

  UPDATE business_subscriptions
  SET 
    status = CASE 
      WHEN p_cancel_at_period_end THEN 'active' 
      ELSE 'cancelled' 
    END,
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE business_id = p_business_id
  RETURNING * INTO v_subscription;
  
  RETURN v_subscription;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compensation_review_recommendation(p_business_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  s RECORD; v_drivers JSONB; v_recommend BOOLEAN; v_reason TEXT;
BEGIN
    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

  SELECT * INTO s FROM staff WHERE id = p_staff_id AND business_id = p_business_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','staff not found'); END IF;

  -- Drivers are heuristic proxies drawn from real data. Each is labelled
  -- so the recommendation is explainable. Real signal wiring (target
  -- attainment, market benchmark) replaces the proxies as data lands.
  v_drivers := jsonb_build_object(
    'tenure_months', EXTRACT(EPOCH FROM (now() - s.created_at))/2592000,
    'current_salary', s.base_salary,
    'target_attainment', null,
    'market_benchmark', null,
    'internal_equity', null,
    'affordability', null
  );

  -- A simple rule: if tenure > 12 months, flag for review. This is a
  -- RECOMMENDATION, not a decision — the human decides.
  v_recommend := EXTRACT(EPOCH FROM (now() - s.created_at))/2592000 > 12;
  v_reason := CASE WHEN v_recommend
    THEN 'Tenure exceeds 12 months — review recommended. Confirm against target attainment, market and affordability.'
    ELSE 'No review trigger met yet.' END;

  RETURN jsonb_build_object(
    'recommend_review', v_recommend,
    'reason', v_reason,
    'drivers', v_drivers,
    'type', 'RECOMMENDATION',
    'intervention_ladder', jsonb_build_array('observe','diagnose','coach','retrain','improvement_plan','review','authorized_decision')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_business_plan(p_business_id uuid, p_plan text, p_billing_cycle text, p_amount numeric DEFAULT NULL::numeric, p_source text DEFAULT 'manual'::text, p_paystack_reference text DEFAULT NULL::text, p_granted_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_period_start TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ;
  v_plan_record RECORD;
BEGIN
    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

  IF p_amount IS NULL THEN
    SELECT * INTO v_plan_record FROM plan_pricing WHERE plan = p_plan;
    IF FOUND THEN
      IF p_billing_cycle = 'yearly' THEN
        p_amount := v_plan_record.yearly_amount;
        v_period_end := v_period_start + INTERVAL '1 year';
      ELSE
        p_amount := v_plan_record.monthly_amount;
        v_period_end := v_period_start + INTERVAL '30 days';
      END IF;
    ELSE
      IF p_billing_cycle = 'yearly' THEN
        v_period_end := v_period_start + INTERVAL '1 year';
      ELSE
        v_period_end := v_period_start + INTERVAL '30 days';
      END IF;
    END IF;
  ELSE
    IF p_billing_cycle = 'yearly' THEN
      v_period_end := v_period_start + INTERVAL '1 year';
    ELSE
      v_period_end := v_period_start + INTERVAL '30 days';
    END IF;
  END IF;

  UPDATE businesses 
  SET plan = p_plan, 
      plan_expires_at = v_period_end,
      billing_cycle = p_billing_cycle,
      updated_at = NOW()
  WHERE id = p_business_id;

  INSERT INTO plan_payments (business_id, plan, billing_cycle, amount, currency, period_start, period_end, source, paystack_reference, granted_by)
  VALUES (p_business_id, p_plan, p_billing_cycle, p_amount, 'NGN', v_period_start, v_period_end, p_source, p_paystack_reference, p_granted_by);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_email_template(p_business_id uuid, p_template_type text, p_subject text, p_heading text, p_body text, p_cta_text text, p_cta_url text)
 RETURNS email_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_template email_templates;
BEGIN
    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

    -- Role authorization (zz closure): owner/admin
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Unauthorized: owner or admin role required';
  END IF;

  UPDATE email_templates
  SET 
    subject = COALESCE(p_subject, subject),
    heading = COALESCE(p_heading, heading),
    body = COALESCE(p_body, body),
    cta_text = COALESCE(p_cta_text, cta_text),
    cta_url = COALESCE(p_cta_url, cta_url),
    updated_at = now()
  WHERE business_id = p_business_id AND template_type = p_template_type
  RETURNING * INTO v_template;
  
  IF v_template IS NULL THEN
    INSERT INTO email_templates (business_id, template_type, subject, heading, body, cta_text, cta_url)
    VALUES (p_business_id, p_template_type, p_subject, p_heading, p_body, p_cta_text, p_cta_url)
    RETURNING * INTO v_template;
  END IF;
  
  RETURN v_template;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_approve(p_business_id uuid, p_staff_id uuid, p_entity_type text, p_amount numeric DEFAULT 0)
 RETURNS TABLE(can boolean, via uuid, approval_limit numeric, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  a RECORD; v_limit NUMERIC;
BEGIN
    -- Object-level authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin'])
     AND NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id AND cs.id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot inspect another staff member''s authority';
  END IF;

    -- Object-level authorization (zz closure)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this business';
  END IF;
  IF NOT public.has_business_role(p_business_id, ARRAY['owner','admin'])
     AND NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id AND cs.id = p_staff_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot inspect another staff member''s authority';
  END IF;

  -- Direct authority.
  SELECT * INTO a FROM authority_graph
  WHERE business_id = p_business_id AND staff_id = p_staff_id
    AND entity_type = p_entity_type AND authority_type = 'approve' AND is_active
    AND (valid_until IS NULL OR valid_until > NOW())
  ORDER BY approval_limit DESC NULLS LAST LIMIT 1;

  IF a.id IS NOT NULL THEN
    v_limit := COALESCE(a.approval_limit, p_amount); -- NULL limit = unlimited
    IF p_amount <= v_limit THEN
      RETURN QUERY SELECT TRUE, a.staff_id, a.approval_limit, 'within direct authority';
      RETURN;
    END IF;
  END IF;

  -- Delegation: someone delegated their authority to this staff member.
  SELECT * INTO a FROM authority_graph
  WHERE business_id = p_business_id AND delegate_to = p_staff_id
    AND entity_type = p_entity_type AND authority_type = 'approve'
    AND delegation_active AND is_active
    AND (valid_until IS NULL OR valid_until > NOW())
  ORDER BY approval_limit DESC NULLS LAST LIMIT 1;

  IF a.id IS NOT NULL THEN
    v_limit := COALESCE(a.approval_limit, p_amount);
    IF p_amount <= v_limit THEN
      RETURN QUERY SELECT TRUE, a.staff_id, a.approval_limit, CONCAT('via delegation from ', a.staff_id);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::NUMERIC, 'no matching authority';
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_invite(p_email text, p_role text DEFAULT 'staff'::text, p_member_kind text DEFAULT 'staff'::text, p_business_id uuid DEFAULT NULL::uuid, p_expires_days integer DEFAULT 7)
 RETURNS TABLE(p_token text, p_join_url text, p_business_name text, p_seat_available boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_business_id UUID;
  v_inviter staff%ROWTYPE;
  v_seat_ok BOOLEAN;
  v_token TEXT;
BEGIN
    -- Role authorization (zz closure): owner/admin/manager
  IF NOT public.has_business_role(COALESCE(p_business_id, (SELECT business_id FROM public.get_current_staff() LIMIT 1)), ARRAY['owner','admin','manager']) THEN
    RAISE EXCEPTION 'Unauthorized: owner, admin or manager role required';
  END IF;

    -- Role authorization (zz closure): owner/admin/manager
  IF NOT public.has_business_role(COALESCE(p_business_id, (SELECT business_id FROM public.get_current_staff() LIMIT 1)), ARRAY['owner','admin','manager']) THEN
    RAISE EXCEPTION 'Unauthorized: owner, admin or manager role required';
  END IF;

  SELECT * INTO v_inviter FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can send invites.' USING ERRCODE = '42501';
  END IF;

  v_business_id := COALESCE(p_business_id, v_inviter.business_id);

  IF v_inviter.business_id != v_business_id
     OR v_inviter.role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized to invite to this business.' USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Invitee email is required' USING ERRCODE = '23502';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'team_lead', 'staff') THEN
    RAISE EXCEPTION 'Invalid role. Allowed: admin, manager, team_lead, staff.' USING ERRCODE = '23514';
  END IF;

  -- 'owner' is never invitable; other kinds are.
  IF p_member_kind NOT IN ('staff', 'consultant', 'vendor', 'expert', 'partner') THEN
    RAISE EXCEPTION 'Invalid member kind. Allowed: staff, consultant, vendor, expert, partner.' USING ERRCODE = '23514';
  END IF;

  SELECT public.can_add_team_member(v_business_id) INTO v_seat_ok;
  IF v_seat_ok IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invites
    WHERE business_id = v_business_id
      AND email = lower(btrim(p_email))
      AND used = FALSE
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'A pending invite already exists for this email.' USING ERRCODE = '23505';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.invites (business_id, email, role, member_kind, token, created_by, expires_at)
  VALUES (v_business_id, lower(btrim(p_email)), p_role, p_member_kind, v_token, v_inviter.id,
          CASE WHEN p_expires_days > 0 THEN now() + (p_expires_days || ' days')::INTERVAL ELSE NULL END);

  RETURN QUERY
    SELECT
      v_token,
      '/join/' || v_token,
      (SELECT name FROM public.businesses WHERE id = v_business_id),
      TRUE;
END
$function$;

-- =============================================================================
-- SECTION: service-role-only internals (not callable from an authenticated user)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.broadcast_notification(p_business_id uuid, p_type text, p_title text, p_body text, p_data jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_action_authority(p_business_id uuid, p_agent_id uuid, p_capability text, p_rung text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_separation_of_duties(p_business_id uuid, p_staff_id uuid, p_entity_type text, p_entity_id uuid, p_action text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_approval(p_business_id uuid, p_approver_id uuid, p_entity_type text, p_entity_id uuid, p_amount numeric, p_blocking boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.investigate_business_incident(p_incident_id uuid, p_business_id uuid, p_reason text, p_accessed_tables text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_business_event(p_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_agent_guardrail(p_business_id uuid, p_agent_id uuid, p_capability text, p_rung text, p_policy jsonb, p_requires_simulation boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_business_health_audit(p_business_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_system_health_audit(p_business_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_exceptions(p_business_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_ai_roles(p_business_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_config(p_business_id uuid, p_object_type text, p_object_id uuid, p_snapshot jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trip_circuit_breaker(p_business_id uuid, p_agent_id uuid, p_anomaly text, p_threshold jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_business_id uuid, p_type text, p_title text, p_body text, p_data jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_action_authority(p_business_id uuid, p_agent_id uuid, p_capability text, p_rung text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_separation_of_duties(p_business_id uuid, p_staff_id uuid, p_entity_type text, p_entity_id uuid, p_action text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_approval(p_business_id uuid, p_approver_id uuid, p_entity_type text, p_entity_id uuid, p_amount numeric, p_blocking boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.investigate_business_incident(p_incident_id uuid, p_business_id uuid, p_reason text, p_accessed_tables text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_business_event(p_event_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_agent_guardrail(p_business_id uuid, p_agent_id uuid, p_capability text, p_rung text, p_policy jsonb, p_requires_simulation boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_business_health_audit(p_business_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_system_health_audit(p_business_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.scan_exceptions(p_business_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_ai_roles(p_business_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_config(p_business_id uuid, p_object_type text, p_object_id uuid, p_snapshot jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.trip_circuit_breaker(p_business_id uuid, p_agent_id uuid, p_anomaly text, p_threshold jsonb) TO service_role;
