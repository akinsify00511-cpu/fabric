-- Defense-in-depth: Business Value Ledger must never expose another business's claims.
CREATE OR REPLACE FUNCTION public.business_value_ledger(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY (t->>'recorded_at')::timestamptz DESC), '[]'::jsonb) INTO v_rows
      FROM (
        SELECT c.id, c.rule_id, c.statement, c.severity, c.expected_impact, c.actual_impact,
          c.status, c.updated_at,
          COALESCE(c.actual_impact->>'description', c.expected_impact->>'description') AS description,
          COALESCE((c.actual_impact->>'amount')::NUMERIC, 0) AS actual_amount,
          COALESCE((c.expected_impact->>'amount')::NUMERIC, 0) AS expected_amount
        FROM claims c
        WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION' AND c.status = 'outcome_recorded'
      ) t;
  EXCEPTION WHEN OTHERS THEN
    v_rows := '[]'::jsonb;
  END;

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

  BEGIN
    SELECT COALESCE(SUM(COALESCE((c.expected_impact->>'amount')::NUMERIC, 0)), 0) INTO v_identified
      FROM claims c
      WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
    SELECT COUNT(*) INTO v_acted FROM claims c
      WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
  EXCEPTION WHEN OTHERS THEN
    v_identified := 0; v_acted := 0;
  END;

  RETURN jsonb_build_object(
    'total_value', ROUND((v_recovered + v_saved + v_generated)::numeric, 2),
    'recovered', ROUND(v_recovered::numeric, 2), 'saved', ROUND(v_saved::numeric, 2),
    'generated', ROUND(v_generated::numeric, 2), 'identified', ROUND(v_identified::numeric, 2),
    'recommendations_acted', v_acted, 'outcomes_recorded', v_outcomes,
    'successful_outcomes', v_successful, 'recent', v_rows,
    'note', CASE WHEN v_outcomes = 0
      THEN 'No outcomes recorded yet. As you act on recommendations and record what happened, Avenize will total the value it has created here.'
      ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('total_value', 0, 'recovered',0,'saved',0,'generated',0,
    'identified',0,'recommendations_acted',0,'outcomes_recorded',0,'successful_outcomes',0,
    'recent','[]'::jsonb, 'error', true);
END;
$$;
REVOKE ALL ON FUNCTION public.business_value_ledger(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_value_ledger(UUID) TO authenticated;
COMMENT ON FUNCTION public.business_value_ledger(UUID) IS 'Business Value Ledger: aggregates real recommendation outcomes; membership-guarded.';
