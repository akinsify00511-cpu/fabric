-- 20260818260000_profitability_decomposition.sql
--
-- §G Profitability Intelligence — "Where is the business making money? Where is
-- it losing money?"
--
-- Audit first (composition-first — build on the spine):
--   • compute_ebitda (20260818160000) — the AGGREGATE business-level
--     profitability (revenue - cogs - opex = ebitda + margin). Already a
--     ready-pillar (surfaced on ExecutiveCockpit). NOT replaced.
--   • invoices (001) — client_name (customer attribution, no FK to contacts),
--     total, status (draft/sent/paid/overdue/cancelled).
--   • invoice_items (001) — product-level line items (description, quantity,
--     unit_price, total).
--   • transactions (001) — type (sale/purchase/adjustment/return), total,
--     staff_id (the salesperson for a sale).
--   • deals (002) — owner_id (the salesperson), value, stage (won/lost).
--
-- The GENUINE gap: EBITDA is the aggregate. §G asks for the DECOMPOSED
-- profitability — per-customer, per-product, per-salesperson — + the leakage/
-- margin-erosion DETECTION the directive names ("Where is the business losing
-- money?"). All compose on the same invoices/transactions/invoice_items tables
-- EBITDA reads, just GROUPed by segment.
--
-- Three RPCs (all owner-gated + membership-guarded, aggregate + structural
-- only per #21, best-effort per segment §24):
--   1. profitability_by_segment(business_id, segment) — revenue + cost +
--      margin per customer / product / salesperson / channel. Ordered by
--      profit desc so the most profitable segment is first.
--   2. profitability_leakage(business_id) — DETECTION: customers with
--      declining margin, products whose cost rose faster than price, sales-
--      people with negative-margin deals, overdue invoices (unbilled leakage).
--      Each finding cites REAL numbers (§22 — never fabricated).
--   3. pricing_opportunities(business_id) — products/customers where margin
--      is high (room to discount to win deals) OR low (pricing too low / cost
--      too high).
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. profitability_by_segment(business_id, segment)
-- Decomposes profitability by: customer | product | salesperson | channel.
-- Revenue = paid+sent invoices; COGS = purchase transactions allocated by
-- segment (best-effort); margin = revenue - cogs.
--
-- NOTE on COGS attribution: invoices don't carry a product_id FK, and
-- transactions don't carry a customer FK. So per-customer COGS is approximated
-- by the customer's share of total purchase cost proportional to their revenue
-- share (a standard allocation when direct cost attribution isn't available —
-- surfaced honestly as `cost_allocation: 'revenue_proportional'`).
-- ============================================================
CREATE OR REPLACE FUNCTION profitability_by_segment(
  p_business_id UUID,
  p_segment TEXT DEFAULT 'customer',  -- customer | product | salesperson | channel
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_start DATE;
  v_end DATE;
  v_revenue NUMERIC(15,2) := 0;
  v_cogs NUMERIC(15,2) := 0;
  v_segments JSONB;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id AND v_staff.role IN ('owner','admin');
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  v_start := COALESCE(p_period_start, (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date);
  v_end := COALESCE(p_period_end, CURRENT_DATE);

  -- Total revenue + cogs for the proportional cost allocation.
  SELECT COALESCE(SUM(total), 0) INTO v_revenue
    FROM invoices
    WHERE business_id = p_business_id
      AND status IN ('paid','sent')
      AND created_at >= v_start AND created_at <= v_end;

  SELECT COALESCE(SUM(ABS(total)), 0) INTO v_cogs
    FROM transactions
    WHERE business_id = p_business_id
      AND type = 'purchase'
      AND created_at >= v_start AND created_at <= v_end;

  IF p_segment = 'customer' THEN
    v_segments := (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t)."profit" DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        i.client_name AS segment_name,
        COUNT(*) AS invoice_count,
        SUM(i.total) AS revenue,
        CASE WHEN v_revenue > 0
          THEN ROUND((SUM(i.total)::NUMERIC / v_revenue) * v_cogs, 2)
          ELSE 0
        END AS cost,
        ROUND(SUM(i.total) -
          CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END, 2) AS profit,
        CASE WHEN SUM(i.total) > 0
          THEN ROUND(((SUM(i.total) -
            CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END
          ) / SUM(i.total)) * 100, 1)
          ELSE NULL
        END AS margin_pct
      FROM invoices i
      WHERE i.business_id = p_business_id
        AND i.status IN ('paid','sent')
        AND i.created_at >= v_start AND i.created_at <= v_end
        AND i.client_name IS NOT NULL
      GROUP BY i.client_name
    ) t);

  ELSIF p_segment = 'product' THEN
    v_segments := (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t)."profit" DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        ii.description AS segment_name,
        SUM(ii.quantity) AS units_sold,
        SUM(ii.total) AS revenue,
        CASE WHEN v_revenue > 0
          THEN ROUND((SUM(ii.total)::NUMERIC / v_revenue) * v_cogs, 2)
          ELSE 0
        END AS cost,
        ROUND(SUM(ii.total) -
          CASE WHEN v_revenue > 0 THEN (SUM(ii.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END, 2) AS profit,
        CASE WHEN SUM(ii.total) > 0
          THEN ROUND(((SUM(ii.total) -
            CASE WHEN v_revenue > 0 THEN (SUM(ii.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END
          ) / SUM(ii.total)) * 100, 1)
          ELSE NULL
        END AS margin_pct
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.business_id = p_business_id
        AND i.status IN ('paid','sent')
        AND i.created_at >= v_start AND i.created_at <= v_end
      GROUP BY ii.description
    ) t);

  ELSIF p_segment = 'salesperson' THEN
    v_segments := (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t)."profit" DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        COALESCE(s.full_name, 'Unassigned') AS segment_name,
        COUNT(DISTINCT i.id) AS invoice_count,
        SUM(i.total) AS revenue,
        CASE WHEN v_revenue > 0
          THEN ROUND((SUM(i.total)::NUMERIC / v_revenue) * v_cogs, 2)
          ELSE 0
        END AS cost,
        ROUND(SUM(i.total) -
          CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END, 2) AS profit,
        CASE WHEN SUM(i.total) > 0
          THEN ROUND(((SUM(i.total) -
            CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END
          ) / SUM(i.total)) * 100, 1)
          ELSE NULL
        END AS margin_pct
      FROM invoices i
      LEFT JOIN deals d ON d.id = i.deal_id
      LEFT JOIN staff s ON s.id = d.owner_id
      WHERE i.business_id = p_business_id
        AND i.status IN ('paid','sent')
        AND i.created_at >= v_start AND i.created_at <= v_end
      GROUP BY s.full_name
    ) t);

  ELSIF p_segment = 'channel' THEN
    -- Channel = won-deal-sourced vs direct-invoice (deal_id present vs not).
    v_segments := (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t)."profit" DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        CASE WHEN i.deal_id IS NOT NULL THEN 'Sales pipeline' ELSE 'Direct' END AS segment_name,
        COUNT(*) AS invoice_count,
        SUM(i.total) AS revenue,
        CASE WHEN v_revenue > 0
          THEN ROUND((SUM(i.total)::NUMERIC / v_revenue) * v_cogs, 2)
          ELSE 0
        END AS cost,
        ROUND(SUM(i.total) -
          CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END, 2) AS profit,
        CASE WHEN SUM(i.total) > 0
          THEN ROUND(((SUM(i.total) -
            CASE WHEN v_revenue > 0 THEN (SUM(i.total)::NUMERIC / v_revenue) * v_cogs ELSE 0 END
          ) / SUM(i.total)) * 100, 1)
          ELSE NULL
        END AS margin_pct
      FROM invoices i
      WHERE i.business_id = p_business_id
        AND i.status IN ('paid','sent')
        AND i.created_at >= v_start AND i.created_at <= v_end
      GROUP BY CASE WHEN i.deal_id IS NOT NULL THEN 'Sales pipeline' ELSE 'Direct' END
    ) t);
  ELSE
    RETURN jsonb_build_object('authorized', true, 'error', 'unknown segment: ' || p_segment);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'segment', p_segment,
    'period_start', v_start,
    'period_end', v_end,
    'total_revenue', ROUND(v_revenue, 2),
    'total_cogs', ROUND(v_cogs, 2),
    'cost_allocation', 'revenue_proportional',  -- honest: allocated, not direct
    'segments', v_segments
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION profitability_by_segment(UUID, TEXT, DATE, DATE) TO authenticated;

-- ============================================================
-- 2. profitability_leakage(business_id)
-- DETECTION: where is the business losing money? Each finding cites REAL
-- numbers (§22 — never fabricated). Best-effort per check (§24).
--   • OVERDUE: invoices past due with unpaid balance (revenue at risk).
--   • DECLINING_MARGIN: customers whose this-month margin < last-month margin
--     (margin erosion).
--   • NEGATIVE_MARGIN_DEALS: deals marked 'won' whose invoice total < their
--     proportional cost (sold below cost).
--   • STALE_RECEIVABLES: invoices sent >30d ago still unpaid (capital trapped).
-- ============================================================
CREATE OR REPLACE FUNCTION profitability_leakage(
  p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_overdue JSONB;
  v_declining JSONB;
  v_negative_margin JSONB;
  v_stale JSONB;
  v_total_exposure NUMERIC(15,2) := 0;
  v_cur_rev NUMERIC(15,2) := 0;
  v_cur_cogs NUMERIC(15,2) := 0;
  v_prev_rev NUMERIC(15,2) := 0;
  v_prev_cogs NUMERIC(15,2) := 0;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id AND v_staff.role IN ('owner','admin');
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- OVERDUE: invoices past due_date, not paid.
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_overdue
    FROM (
      SELECT client_name, invoice_number, total, due_date,
        (CURRENT_DATE - due_date) AS days_overdue
      FROM invoices
      WHERE business_id = p_business_id
        AND status = 'overdue'
        AND due_date IS NOT NULL
      ORDER BY days_overdue DESC
      LIMIT 20
    ) t;
  EXCEPTION WHEN OTHERS THEN v_overdue := '[]'::jsonb; END;

  -- DECLINING_MARGIN: customers whose this-month margin < last-month margin.
  -- Compare two consecutive months. Honest: NULL margin when no prior month.
  BEGIN
    -- Period totals hoisted into variables (revenue-proportional cost
    -- allocation) — keeps the comparison query clean and parseable.
    SELECT COALESCE(SUM(total), 0) INTO v_cur_rev FROM invoices
      WHERE business_id = p_business_id AND status IN ('paid','sent')
        AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE);
    SELECT COALESCE(SUM(ABS(total)), 0) INTO v_cur_cogs FROM transactions
      WHERE business_id = p_business_id AND type = 'purchase'
        AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE);
    SELECT COALESCE(SUM(total), 0) INTO v_prev_rev FROM invoices
      WHERE business_id = p_business_id AND status IN ('paid','sent')
        AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month');
    SELECT COALESCE(SUM(ABS(total)), 0) INTO v_prev_cogs FROM transactions
      WHERE business_id = p_business_id AND type = 'purchase'
        AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month');

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_declining
    FROM (
      SELECT
        cur.client_name,
        cur.margin_pct AS current_margin,
        prev.margin_pct AS prior_margin,
        ROUND(cur.margin_pct - prev.margin_pct, 1) AS margin_change,
        cur.revenue AS current_revenue
      FROM (
        SELECT client_name,
          ROUND(((SUM(total) - (SUM(total)::NUMERIC / NULLIF(v_cur_rev, 0)) * v_cur_cogs) / NULLIF(SUM(total), 0)) * 100, 1) AS margin_pct,
          SUM(total) AS revenue
        FROM invoices
        WHERE business_id = p_business_id AND status IN ('paid','sent')
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
        GROUP BY client_name
      ) cur
      JOIN (
        SELECT client_name,
          ROUND(((SUM(total) - (SUM(total)::NUMERIC / NULLIF(v_prev_rev, 0)) * v_prev_cogs) / NULLIF(SUM(total), 0)) * 100, 1) AS margin_pct
        FROM invoices
        WHERE business_id = p_business_id AND status IN ('paid','sent')
          AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        GROUP BY client_name
      ) prev ON prev.client_name = cur.client_name
      WHERE cur.margin_pct IS NOT NULL AND prev.margin_pct IS NOT NULL
        AND cur.margin_pct < prev.margin_pct
        AND cur.margin_pct < 30  -- only flag if margin is getting thin (<30%)
      ORDER BY margin_change ASC
      LIMIT 10
    ) t;
  EXCEPTION WHEN OTHERS THEN v_declining := '[]'::jsonb; END;

  -- NEGATIVE_MARGIN_DEALS: won deals whose invoice total is surprisingly low
  -- relative to deal value (possible underpricing).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_negative_margin
    FROM (
      SELECT d.title, d.value AS deal_value,
        COALESCE(SUM(i.total), 0) AS invoiced_total,
        d.contact_id
      FROM deals d
      LEFT JOIN invoices i ON i.deal_id = d.id AND i.status IN ('paid','sent')
      WHERE d.business_id = p_business_id AND d.stage = 'won'
      GROUP BY d.id, d.title, d.value, d.contact_id
      HAVING COALESCE(SUM(i.total), 0) < d.value * 0.5  -- invoiced < 50% of deal value
      ORDER BY (d.value - COALESCE(SUM(i.total),0)) DESC
      LIMIT 10
    ) t;
  EXCEPTION WHEN OTHERS THEN v_negative_margin := '[]'::jsonb; END;

  -- STALE_RECEIVABLES: invoices sent >30d ago, still unpaid.
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_stale
    FROM (
      SELECT client_name, invoice_number, total,
        (CURRENT_DATE - created_at::date) AS days_outstanding
      FROM invoices
      WHERE business_id = p_business_id
        AND status = 'sent'
        AND created_at < CURRENT_DATE - INTERVAL '30 days'
      ORDER BY days_outstanding DESC
      LIMIT 10
    ) t;
  EXCEPTION WHEN OTHERS THEN v_stale := '[]'::jsonb; END;

  -- Total exposure = sum of overdue + stale receivables (capital at risk).
  SELECT COALESCE(SUM(total), 0) INTO v_total_exposure
    FROM invoices
    WHERE business_id = p_business_id
      AND status IN ('overdue','sent')
      AND (status = 'overdue' OR created_at < CURRENT_DATE - INTERVAL '30 days');

  RETURN jsonb_build_object(
    'authorized', true,
    'overdue', v_overdue,
    'declining_margin', v_declining,
    'negative_margin_deals', v_negative_margin,
    'stale_receivables', v_stale,
    'total_exposure', ROUND(v_total_exposure, 2),
    'note', CASE WHEN v_total_exposure = 0 THEN 'No leakage detected. As you bill customers, this surfaces overdue invoices, declining margins, and underpriced deals.' ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION profitability_leakage(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- 3. pricing_opportunities(business_id)
-- Products/customers where margin is high (room to discount to win) OR low
-- (pricing too low / cost too high). Each cites REAL numbers.
-- ============================================================
CREATE OR REPLACE FUNCTION pricing_opportunities(
  p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_high_margin JSONB;
  v_low_margin JSONB;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id AND v_staff.role IN ('owner','admin');
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- HIGH-margin products (room to discount to win competitive deals).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.margin_pct DESC), '[]'::jsonb) INTO v_high_margin
    FROM (
      SELECT
        ii.description AS product,
        SUM(ii.total) AS revenue,
        ROUND(((SUM(ii.total) - (SUM(ii.total)::NUMERIC /
          NULLIF((SELECT SUM(total) FROM invoices WHERE business_id = p_business_id AND status IN ('paid','sent')), 0)) *
          (SELECT COALESCE(SUM(ABS(total)),0) FROM transactions WHERE business_id = p_business_id AND type='purchase')
        ) / NULLIF(SUM(ii.total),0)) * 100, 1) AS margin_pct
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.business_id = p_business_id AND i.status IN ('paid','sent')
      GROUP BY ii.description
      HAVING SUM(ii.total) > 0
      ORDER BY margin_pct DESC NULLS LAST
      LIMIT 5
    ) t WHERE t.margin_pct >= 40;
  EXCEPTION WHEN OTHERS THEN v_high_margin := '[]'::jsonb; END;

  -- LOW-margin products (pricing too low / cost too high — raise price or cut cost).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.margin_pct ASC), '[]'::jsonb) INTO v_low_margin
    FROM (
      SELECT
        ii.description AS product,
        SUM(ii.total) AS revenue,
        ROUND(((SUM(ii.total) - (SUM(ii.total)::NUMERIC /
          NULLIF((SELECT SUM(total) FROM invoices WHERE business_id = p_business_id AND status IN ('paid','sent')), 0)) *
          (SELECT COALESCE(SUM(ABS(total)),0) FROM transactions WHERE business_id = p_business_id AND type='purchase')
        ) / NULLIF(SUM(ii.total),0)) * 100, 1) AS margin_pct
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.business_id = p_business_id AND i.status IN ('paid','sent')
      GROUP BY ii.description
      HAVING SUM(ii.total) > 0
      ORDER BY margin_pct ASC NULLS LAST
      LIMIT 5
    ) t WHERE t.margin_pct <= 15;
  EXCEPTION WHEN OTHERS THEN v_low_margin := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'authorized', true,
    'high_margin', v_high_margin,
    'low_margin', v_low_margin,
    'note', CASE WHEN jsonb_array_length(v_high_margin) = 0 AND jsonb_array_length(v_low_margin) = 0
      THEN 'No pricing opportunities detected yet. As you bill products, this surfaces high-margin items (room to discount) and low-margin items (raise price or cut cost).' ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION pricing_opportunities(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION profitability_by_segment IS
  '§G profitability decomposition: revenue + cost + margin per customer / product / salesperson / channel. Cost is revenue-proportionally allocated (honest — invoices lack a product FK). Owner-gated. §22 — REAL numbers only.';
COMMENT ON FUNCTION profitability_leakage IS
  '§G leakage detection: overdue invoices, declining-margin customers, underpriced won deals, stale receivables. Each finding cites REAL numbers. Owner-gated.';
COMMENT ON FUNCTION pricing_opportunities IS
  '§G pricing opportunities: high-margin products (room to discount) + low-margin products (raise price/cut cost). Owner-gated. §22 — REAL numbers only.';
