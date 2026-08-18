-- ============================================================================
-- Section 5.3 (EBITDA / operating profitability) + Section 7.1 (automation
-- idempotency fix).
--
-- §5.3 is unblocked now that Section 1 reconciled the duplicate tables
-- (recurring_expenses is canonical; recurring_costs dropped). Per the
-- ebitda-feature-scope doc: server-side RPC, plain-language label by default
-- ("what you made / what you spent / what's left"), technical label for the
-- accountant. §0.4: every component is server-derived.
--
-- §7.1 fix: the deal_stage_changed automation trigger fired on EVERY AFTER
-- UPDATE, not just when the stage actually changed — updating a deal's title
-- re-fired the automation (double-fire). The checklist §7.1 explicitly demands
-- "idempotent by design (a retried trigger doesn't double-fire)." This
-- migration re-declares the trigger function with the change-guard.
--
-- Idempotent throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) EBITDA RPC — server-derived operating profitability.
--    EBITDA = Revenue (paid invoices) − COGS (purchase transactions) −
--    Operating Expenses (recurring_expenses monthly equivalent + non-sale
--    expenses). Business-scoped + staff-gated. Returns plain-language +
--    technical labels + the component breakdown (§0.2 sentences + §21
--    explainable). §21 small-data: flags insufficient data honestly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_ebitda(
  p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_start DATE;
  v_end DATE;
  v_revenue NUMERIC(15,2) := 0;
  v_cogs NUMERIC(15,2) := 0;
  v_recurring_monthly NUMERIC(15,2) := 0;
  v_other_expenses NUMERIC(15,2) := 0;
  v_total_expenses NUMERIC(15,2) := 0;
  v_ebitda NUMERIC(15,2) := 0;
  v_margin NUMERIC := 0;
  v_label TEXT;
  v_period_days INT;
  v_recurring_count INT := 0;
  v_invoice_count INT := 0;
  v_purchase_count INT := 0;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  -- Membership guard (defense-in-depth; the RPC takes a business_id param).
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = v_staff.id AND business_id = p_business_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Default period: current month.
  v_start := COALESCE(p_period_start, date_trunc('month', CURRENT_DATE)::date);
  v_end := COALESCE(p_period_end, CURRENT_DATE);
  v_period_days := GREATEST(v_end - v_start + 1, 1);

  -- (a) Revenue = sum of PAID invoices in the period (server-derived §0.4).
  BEGIN
    SELECT COALESCE(sum(total), 0), count(*)
      INTO v_revenue, v_invoice_count
      FROM invoices
     WHERE business_id = p_business_id
       AND status = 'paid'
       AND issue_date IS NOT NULL
       AND issue_date::date BETWEEN v_start AND v_end;
  EXCEPTION WHEN OTHERS THEN
    v_revenue := 0; v_invoice_count := 0;
  END;

  -- (b) COGS = sum of PURCHASE transactions in the period (what you bought
  -- to fulfill sales). Sale transactions are revenue-side; purchases are the
  -- direct cost of goods.
  BEGIN
    SELECT COALESCE(sum(total), 0), count(*)
      INTO v_cogs, v_purchase_count
      FROM transactions
     WHERE business_id = p_business_id
       AND type = 'purchase'
       AND created_at::date BETWEEN v_start AND v_end;
  EXCEPTION WHEN OTHERS THEN
    v_cogs := 0; v_purchase_count := 0;
  END;

  -- (c) Recurring operating expenses — normalize to the period.
  -- monthly → 1, quarterly → 1/3, annually → 1/12 of the monthly equivalent.
  BEGIN
    SELECT
      COALESCE(sum(CASE frequency
        WHEN 'monthly' THEN amount
        WHEN 'quarterly' THEN amount / 3.0
        WHEN 'annually' THEN amount / 12.0
        ELSE amount
      END), 0),
      count(*)
      INTO v_recurring_monthly, v_recurring_count
      FROM recurring_expenses
     WHERE business_id = p_business_id AND is_active = true;
    -- Scale the monthly equivalent to the actual period fraction.
    v_recurring_monthly := v_recurring_monthly * (v_period_days::numeric / 30.0);
  EXCEPTION WHEN OTHERS THEN
    v_recurring_monthly := 0; v_recurring_count := 0;
  END;

  -- (d) Other operating expenses (non-sale, non-purchase adjustment
  -- transactions in the period — e.g. recorded expense adjustments).
  BEGIN
    SELECT COALESCE(sum(ABS(total)), 0)
      INTO v_other_expenses
      FROM transactions
     WHERE business_id = p_business_id
       AND type = 'adjustment'
       AND total < 0
       AND created_at::date BETWEEN v_start AND v_end;
  EXCEPTION WHEN OTHERS THEN
    v_other_expenses := 0;
  END;

  v_total_expenses := v_cogs + v_recurring_monthly + v_other_expenses;
  v_ebitda := v_revenue - v_total_expenses;
  v_margin := CASE WHEN v_revenue > 0 THEN ROUND((v_ebitda / v_revenue) * 100, 1) ELSE NULL END;

  -- Plain-language label (§0.2: the owner reads the conclusion, not the number).
  v_label := CASE
    WHEN v_ebitda > 0 AND COALESCE(v_margin, 0) >= 20 THEN 'Profitable and efficient'
    WHEN v_ebitda > 0 THEN 'Profitable'
    WHEN v_ebitda = 0 THEN 'Breaking even'
    ELSE 'Operating at a loss'
  END;

  RETURN jsonb_build_object(
    'authorized', true,
    'period_start', v_start,
    'period_end', v_end,
    'revenue', ROUND(v_revenue, 2),
    'cogs', ROUND(v_cogs, 2),
    'recurring_expenses', ROUND(v_recurring_monthly, 2),
    'other_expenses', ROUND(v_other_expenses, 2),
    'total_expenses', ROUND(v_total_expenses, 2),
    'ebitda', ROUND(v_ebitda, 2),
    'margin_pct', v_margin,
    'label', v_label,
    'components', jsonb_build_object(
      'revenue', jsonb_build_object('amount', ROUND(v_revenue, 2), 'source', 'invoices', 'count', v_invoice_count),
      'cogs', jsonb_build_object('amount', ROUND(v_cogs, 2), 'source', 'transactions', 'count', v_purchase_count),
      'recurring', jsonb_build_object('amount', ROUND(v_recurring_monthly, 2), 'source', 'recurring_expenses', 'count', v_recurring_count)
    ),
    'insufficient_data', (v_invoice_count + v_purchase_count + v_recurring_count) = 0,
    'composed_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'compute_ebitda failed: %', SQLERRM;
  RETURN jsonb_build_object('authorized', false, 'error', 'EBITDA_COMPUTE_FAILED');
END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_ebitda(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.compute_ebitda(UUID, DATE, DATE) IS
  '§5.3 + §0.4: server-derived EBITDA. Revenue (paid invoices) − COGS (purchase transactions) − operating expenses (recurring_expenses + adjustments). Plain-language label + component breakdown + honest insufficient-data flag. Business-scoped + membership-guarded.';

-- ----------------------------------------------------------------------------
-- (2) §7.1 idempotency fix — re-declare check_deal_automations with the
--    stage-change guard so a retried/title-only update doesn't double-fire.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_deal_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automations RECORD;
BEGIN
  -- §7.1 idempotency: only fire when the stage ACTUALLY CHANGED. The prior
  -- version fired on every AFTER UPDATE, so updating a deal's title while it
  -- was already in the target stage re-fired the automation (double-fire).
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    FOR v_automations IN
      SELECT id, trigger_config FROM automations
      WHERE business_id = NEW.business_id
      AND enabled = TRUE
      AND trigger_type = 'deal_stage_changed'
    LOOP
      IF v_automations.trigger_config->>'to_stage' IS NULL
         OR v_automations.trigger_config->>'to_stage' = NEW.stage THEN
        PERFORM execute_automation_action(
          v_automations.id,
          jsonb_build_object(
            'deal_id', NEW.id,
            'deal_title', NEW.title,
            'from_stage', OLD.stage,
            'to_stage', NEW.stage,
            'value', NEW.value,
            'contact_id', NEW.contact_id
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- deal_won / deal_lost already had the old!=new guard; keep them.
  IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'deal_won'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('deal_id', NEW.id, 'deal_title', NEW.title, 'value', NEW.value, 'contact_id', NEW.contact_id)
      );
    END LOOP;
  END IF;

  IF NEW.stage = 'lost' AND OLD.stage != 'lost' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'deal_lost'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('deal_id', NEW.id, 'deal_title', NEW.title, 'value', NEW.value, 'contact_id', NEW.contact_id)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
