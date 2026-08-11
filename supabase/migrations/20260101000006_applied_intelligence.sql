-- ============================================
-- APPLIED INTELLIGENCE LAYER (deterministic, Postgres-only, no LLM)
-- ============================================
-- Threshold rules, anomaly detection, and aggregation over REAL tables.
-- No external API, no per-call cost, no hallucination surface — it only
-- measures what is already true in the database and surfaces it.
--
-- This is the "Intelligence tier" that can be sold on Professional/Scale
-- BEFORE the generative AI Copilot (Phase 3) exists. The generative
-- copilot depends on an LLM and real transaction history; this does not.
--
-- Domains (per Intelligence End Product Expectation Addendum, split into
-- applied-vs-generative):
--   1. Process & Bottleneck Intelligence   — pure SQL ✅ below
--   2. Risk, Fraud & Anomaly Intelligence  — threshold rules ✅ below
--   3. Capacity & Resource Intelligence    — aggregation ✅ below
--   4. Early-Warning & Opportunity Systems  — threshold alerts ✅ below
--   5. Sales Performance Intelligence       — dashboard/query ✅ below
--   (Scenario & Forecast: classical time-series only here — the narrative
--    half stays with the generative copilot, Phase 3.)
-- ============================================

-- Helper: stage duration for deals (days between stage entry and now/exit)
CREATE OR REPLACE FUNCTION deal_stage_age_days(p_deal_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at)) / 86400, 0)
  FROM deals WHERE id = p_deal_id;
$$;

-- ============================================
-- 1. PROCESS & BOTTLENECK INTELLIGENCE
-- Deals/tasks sitting past their stage's typical duration.
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_process_bottlenecks(p_business_id UUID)
RETURNS TABLE (
  kind TEXT,
  id UUID,
  title TEXT,
  stage TEXT,
  age_days NUMERIC,
  owner_id UUID,
  severity TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Stagnant deals: open, untouched > 14 days
  SELECT 'deal'::TEXT, d.id, d.title, COALESCE(d.stage,'unknown'), age_days,
         d.assigned_to,
         CASE WHEN age_days > 30 THEN 'high' WHEN age_days > 14 THEN 'medium' ELSE 'low' END
  FROM (
    SELECT id, business_id, title, stage, assigned_to, closed_at, created_at,
           COALESCE(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at)) / 86400, 0) AS age_days
    FROM deals WHERE business_id = p_business_id AND closed_at IS NULL
  ) d
  WHERE d.age_days > 14
  UNION ALL
  -- Stale tasks: open, not updated > 7 days
  SELECT 'task'::TEXT, t.id, t.title, COALESCE(t.status,'open'), task_age,
         t.assigned_to,
         CASE WHEN task_age > 21 THEN 'high' WHEN task_age > 7 THEN 'medium' ELSE 'low' END
  FROM (
    SELECT id, business_id, title, status, assigned_to,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400, 0) AS task_age
    FROM tasks WHERE business_id = p_business_id AND status NOT IN ('done','completed','cancelled','canceled')
  ) t
  WHERE t.task_age > 7;
$$;

-- ============================================
-- 2. RISK, FRAUD & ANOMALY INTELLIGENCE
-- Threshold rules over real financial tables. Flags:
--   - expense claim > 2x the staff's historical average
--   - invoice to a contact created within 24h (possible fraud)
--   - payment reversed within 24h of being received
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_risk_anomalies(p_business_id UUID)
RETURNS TABLE (
  rule TEXT,
  entity_id UUID,
  description TEXT,
  amount NUMERIC,
  detected_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Expense claims > 2x the claimant's historical average (min 3 prior claims)
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
  JOIN contacts c ON c.id = inv.contact_id
  WHERE inv.business_id = p_business_id
    AND inv.created_at - c.created_at < INTERVAL '24 hours'
  UNION ALL
  -- Payments reversed within 24h of receipt
  SELECT 'rapid_reversal'::TEXT, rf.id,
         'Payment ' || COALESCE(p.reference,'?') || ' reversed within 24h of receipt',
         p.amount, rf.created_at
  FROM payment_refunds rf
  JOIN payments p ON p.id = rf.payment_id
  WHERE p.business_id = p_business_id
    AND rf.created_at - p.created_at < INTERVAL '24 hours';
$$;

-- ============================================
-- 3. CAPACITY & RESOURCE INTELLIGENCE
-- Staff workload = open tasks/tickets assigned vs. the business average.
-- No inference — pure count + comparison to the mean.
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_capacity(p_business_id UUID)
RETURNS TABLE (
  staff_id UUID,
  open_tasks INT,
  open_tickets INT,
  total_load INT,
  business_avg_load NUMERIC,
  variance_label TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH loads AS (
    SELECT s.id AS staff_id,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('done','completed','cancelled','canceled')) AS open_tasks,
           COUNT(DISTINCT tk.id) FILTER (WHERE tk.status NOT IN ('resolved','closed','cancelled','canceled')) AS open_tickets
    FROM staff s
    LEFT JOIN tasks t ON t.assigned_to = s.id AND t.business_id = p_business_id
    LEFT JOIN tickets tk ON tk.assigned_to = s.id AND tk.business_id = p_business_id
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
$$;

-- ============================================
-- 4. EARLY-WARNING & OPPORTUNITY SYSTEMS
--   - 3+ invoices overdue >30 days
--   - budget 90% consumed
--   - deal stagnant 14 days (subset of #1, surfaced as alert)
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_early_warnings(p_business_id UUID)
RETURNS TABLE (
  alert_type TEXT,
  detail TEXT,
  value NUMERIC,
  threshold NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT 'overdue_invoices'::TEXT,
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
         'Budget ' || b.name || ' at ' || ROUND((consumed.total / NULLIF(b.amount,0))::NUMERIC * 100) || '%',
         consumed.total, b.amount * 0.9
  FROM budgets b
  JOIN LATERAL (
    SELECT COALESCE(SUM(amount),0) AS total
    FROM budget_transactions bt WHERE bt.budget_id = b.id
  ) consumed ON true
  WHERE b.business_id = p_business_id
    AND b.amount > 0
    AND consumed.total >= b.amount * 0.9;
$$;

-- ============================================
-- 5. SALES PERFORMANCE INTELLIGENCE
-- Sales targets vs. actual (closed-won) — pure reporting on real tables.
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_sales_performance(p_business_id UUID)
RETURNS TABLE (
  staff_id UUID,
  target_amount NUMERIC,
  achieved_amount NUMERIC,
  attainment_pct NUMERIC,
  status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT st.staff_id,
         st.target_amount,
         COALESCE(won.achieved,0) AS achieved_amount,
         CASE WHEN st.target_amount > 0
              THEN ROUND((COALESCE(won.achieved,0) / st.target_amount * 100)::NUMERIC, 1)
              ELSE 0 END,
         CASE
           WHEN COALESCE(won.achieved,0) >= st.target_amount THEN 'on_track'
           WHEN COALESCE(won.achieved,0) >= st.target_amount * 0.5 THEN 'at_risk'
           ELSE 'behind'
         END
  FROM sales_targets st
  LEFT JOIN LATERAL (
    SELECT SUM(d.value) AS achieved
    FROM deals d
    WHERE d.assigned_to = st.staff_id
      AND d.business_id = p_business_id
      AND d.stage IN ('won','closed_won','closed-won')
  ) won ON true
  WHERE st.business_id = p_business_id;
$$;

-- ============================================
-- 6. CASH-FLOW FORECAST (classical time-series, no LLM)
-- Simple moving average of net cash over the last 90 days, projected forward.
-- The narrative explanation ("why") stays with the generative copilot later;
-- the number itself is deterministic.
-- ============================================
CREATE OR REPLACE FUNCTION intelligence_cashflow_forecast(p_business_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (
  projected_date DATE,
  projected_net NUMERIC,
  method TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH daily AS (
    SELECT DATE(created_at) AS d, SUM(amount) AS net
    FROM cashflow_entries
    WHERE business_id = p_business_id
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
  WHERE avg_net.n >= 7;  -- need at least a week of history to forecast
$$;

GRANT EXECUTE ON FUNCTION intelligence_process_bottlenecks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligence_risk_anomalies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligence_capacity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligence_early_warnings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligence_sales_performance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligence_cashflow_forecast(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION deal_stage_age_days(UUID) TO authenticated;

COMMENT ON FUNCTION intelligence_process_bottlenecks IS
  'Applied Intelligence (deterministic): stagnant deals/tasks past typical stage duration. No LLM.';
COMMENT ON FUNCTION intelligence_risk_anomalies IS
  'Applied Intelligence (deterministic): threshold rules for expense outliers, new-counterparty invoices, rapid reversals. No LLM.';
COMMENT ON FUNCTION intelligence_cashflow_forecast IS
  'Applied Intelligence (deterministic): 90-day moving average projection. The narrative explanation is deferred to the generative copilot (Phase 3).';
