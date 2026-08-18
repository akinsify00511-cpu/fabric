-- 20260818230000_business_memory_recall.sql
--
-- §I Business Memory / Semantic Recall. The "ready" pillar the checklist
-- demands: "The system remembers — What happened before?"
--
-- The directive (checklist §I/§Y): Avenize should be able to say
--   "You encountered a similar problem six months ago. You tried X, and the
--    result was Y."
--
-- COMPOSITION-FIRST (§0.5/§6 — build on the existing spine, never parallel):
--   • The Brain's diagnose_business (20260818220000) is EPHEMERAL — it fires
--     diagnosis_rules and returns the result but persists NOTHING. So a fired
--     diagnosis vanishes; there is no history to recall from.
--   • The fix has two parts, both reusing existing tables:
--     1. record_diagnosis — persists a fired diagnosis as an INFERENCE claim
--        (claim_type='INFERENCE' — a diagnosis IS an inference, per §20) into
--        the existing claims table (060). No new write store. Idempotent per
--        (business, rule_id, day) so re-running the brain doesn't dupe.
--     2. recall_similar_problems — given the CURRENT diagnosis's rule_id +
--        symptom_metric, retrieves PRIOR similar problems + what was tried +
--        the outcome, by matching against:
--          - historical diagnosis claims (same rule_id, or same symptom_metric)
--          - decisions (064) whose learning_tags / context overlap the metric
--          - organizational_memory (gap-fill) whose topic/applies_to overlap
--   • Every recall row carries an evidence tag: a prior diagnosis = FACT
--     (it happened); a learned lesson = INFERENCE (a generalization). The
--     "you tried X, result was Y" requires a decision with actual_outcome
--     filled — surfaced honestly, never fabricated (§22).
--   • SECURITY DEFINER + membership guard via get_current_staff() (the
--     Session-21 #18 lesson). Best-effort + non-blocking (§24).
--
-- Pure internal SQL over existing tables. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- record_diagnosis(p_business_id, p_rule_id, p_symptom_metric,
--   p_cause_metric, p_headline, p_relationship, p_impact_amount, p_severity)
-- Persists a fired diagnosis as an INFERENCE claim so it becomes searchable
-- history. Idempotent per (business, rule_id, day) — the brain re-runs on the
-- cron cadence; we only want ONE claim per diagnosis per day.
-- Returns the claim id (or NULL if suppressed/duplicate).
-- ============================================================
CREATE OR REPLACE FUNCTION record_diagnosis(
  p_business_id UUID,
  p_rule_id TEXT,
  p_symptom_metric TEXT,
  p_cause_metric TEXT,
  p_headline TEXT,
  p_relationship TEXT,
  p_impact_amount NUMERIC,
  p_severity TEXT
) RETURNS UUID AS $$
DECLARE
  v_membership RECORD;
  v_claim_id UUID;
  v_existing UUID;
  v_statement TEXT;
  v_evidence JSONB;
BEGIN
  -- Membership guard.
  SELECT * INTO v_membership FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_statement := COALESCE(p_headline, p_rule_id || ': ' || p_symptom_metric || ' ↓ ' || p_cause_metric);

  -- Evidence: the measured symptom (FACT) + the inferred cause link (INFERENCE)
  -- + the ₦ impact if known. Mirrors the diagnosis card's labelling.
  v_evidence := jsonb_build_object(
    'rule_id', p_rule_id,
    'symptom_metric', p_symptom_metric,
    'cause_metric', p_cause_metric,
    'symptom', 'FACT',
    'cause_link', 'INFERENCE',
    'impact_amount', p_impact_amount,
    'severity', p_severity,
    'recorded_at', NOW()
  );

  -- Idempotent: one diagnosis claim per (business, rule_id, day). The brain
  -- re-runs on the cron cadence; we only want ONE claim per diagnosis per
  -- day so recall stays clean. Check-then-insert (avoids expression-index
  -- fragility). If a row exists for today, refresh its headline/impact so
  -- the latest measurement wins.
  SELECT id INTO v_existing FROM claims
    WHERE business_id = p_business_id
      AND claim_type = 'INFERENCE'
      AND rule_id = p_rule_id
      AND created_at >= date_trunc('day', NOW())
    LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE claims SET statement = v_statement, evidence = v_evidence WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO claims (business_id, claim_type, rule_id, statement, evidence, confidence)
  VALUES (p_business_id, 'INFERENCE', p_rule_id, v_statement, v_evidence, 0.7)
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The recall query performance index: find prior diagnosis claims by
-- (business, rule_id) or (business, symptom_metric in evidence).
CREATE INDEX IF NOT EXISTS idx_claims_diagnosis_rule
  ON claims (business_id, rule_id, created_at DESC)
  WHERE claim_type = 'INFERENCE' AND rule_id IS NOT NULL AND rule_id LIKE 'DIAG-%';
CREATE INDEX IF NOT EXISTS idx_claims_diagnosis_symptom
  ON claims (business_id, (evidence->>'symptom_metric'), created_at DESC)
  WHERE claim_type = 'INFERENCE' AND rule_id LIKE 'DIAG-%';

-- ============================================================
-- recall_similar_problems(p_business_id, p_rule_id, p_symptom_metric)
-- Retrieves PRIOR similar problems + what was tried + the outcome.
-- Matches the current diagnosis against:
--   1. Historical diagnosis claims (same rule_id → strongest; same symptom)
--   2. decisions (064) whose learning_tags/context overlap the symptom metric
--   3. organizational_memory whose topic/applies_to overlap
-- Returns JSONB: { matches: [...], note }
-- Each match: { source, title, what_happened, what_was_tried, outcome, date,
--   relevance, evidence_tag }
-- ============================================================
CREATE OR REPLACE FUNCTION recall_similar_problems(
  p_business_id UUID,
  p_rule_id TEXT DEFAULT NULL,
  p_symptom_metric TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_membership RECORD;
  v_matches JSONB := '[]'::JSONB;
  c RECORD;
  d RECORD;
  m RECORD;
BEGIN
  SELECT * INTO v_membership FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'matches', '[]'::JSONB);
  END IF;

  -- 1. Historical diagnosis claims — same rule_id (strongest match) or same
  --    symptom_metric in evidence. Exclude the one recorded today (if any) so
  --    we recall PRIOR occurrences, not the current one.
  FOR c IN
    SELECT id, statement, evidence, created_at
    FROM claims
    WHERE business_id = p_business_id
      AND claim_type = 'INFERENCE'
      AND rule_id IS NOT NULL AND rule_id LIKE 'DIAG-%'
      AND created_at < date_trunc('day', NOW())  -- prior days only
      AND (
        (p_rule_id IS NOT NULL AND rule_id = p_rule_id)
        OR (p_symptom_metric IS NOT NULL
            AND (evidence->>'symptom_metric') = p_symptom_metric)
      )
    ORDER BY created_at DESC
    LIMIT 5
  LOOP
    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'source', 'prior_diagnosis',
      'title', c.statement,
      'what_happened', c.evidence->>'rule_id' || ' fired — ' || COALESCE(c.evidence->>'severity', 'unknown') || ' severity',
      'what_was_tried', NULL,  -- a diagnosis alone doesn't record an action; the linked rec does
      'outcome', NULL,
      'date', c.created_at,
      'relevance', CASE WHEN c.evidence->>'rule_id' = p_rule_id THEN 'high' ELSE 'medium' END,
      'evidence_tag', 'FACT'   -- it happened (a measured diagnosis fired)
    ));
  END LOOP;

  -- 2. Decisions (064) whose learning_tags or context mention the symptom.
  --    These carry the "you tried X, result was Y" — the directive's headline.
  --    Only decisions with actual_outcome / what_learned filled (reviewed).
  FOR d IN
    SELECT title, context, what_worked, what_learned, actual_outcome,
           learning_tags, decided_at, status
    FROM decisions
    WHERE business_id = p_business_id
      AND status = 'reviewed'
      AND (
        (p_symptom_metric IS NOT NULL
         AND (context ILIKE '%' || p_symptom_metric || '%'
              OR title ILIKE '%' || p_symptom_metric || '%'
              OR learning_tags @> ARRAY[p_symptom_metric]))
        OR (p_rule_id IS NOT NULL AND context ILIKE '%' || p_rule_id || '%')
      )
    ORDER BY decided_at DESC
    LIMIT 3
  LOOP
    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'source', 'decision',
      'title', d.title,
      'what_happened', d.context,
      'what_was_tried', d.what_worked,
      'outcome', d.actual_outcome,
      'lesson', d.what_learned,
      'date', d.decided_at,
      'relevance', 'medium',
      -- A reviewed decision's recorded outcome is a FACT; the generalization
      -- (what_learned) is an INFERENCE.
      'evidence_tag', CASE WHEN d.actual_outcome IS NOT NULL THEN 'FACT' ELSE 'INFERENCE' END
    ));
  END LOOP;

  -- 3. Organizational memory — general lessons whose topic/applies_to overlap.
  FOR m IN
    SELECT topic, lesson, context, applies_to, created_at, times_applied
    FROM organizational_memory
    WHERE business_id = p_business_id
      AND status = 'active'
      AND (
        (p_symptom_metric IS NOT NULL
         AND (topic ILIKE '%' || p_symptom_metric || '%'
              OR applies_to ILIKE '%' || p_symptom_metric || '%'
              OR context ILIKE '%' || p_symptom_metric || '%'))
        OR (p_rule_id IS NOT NULL
            AND (topic ILIKE '%' || p_rule_id || '%' OR context ILIKE '%' || p_rule_id || '%'))
      )
    ORDER BY times_applied DESC NULLS LAST, created_at DESC
    LIMIT 3
  LOOP
    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'source', 'organizational_memory',
      'title', m.topic,
      'what_happened', m.context,
      'what_was_tried', NULL,
      'outcome', m.lesson,
      'times_applied', m.times_applied,
      'date', m.created_at,
      'relevance', 'low',
      -- A learned lesson is a generalization → INFERENCE (§20).
      'evidence_tag', 'INFERENCE'
    ));
  END LOOP;

  -- Honest note when nothing matches — never fabricate a "similar problem".
  IF jsonb_array_length(v_matches) = 0 THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'matches', '[]'::JSONB,
      'note', 'No similar past problems found yet. As you use Avenize and review decisions, this will recall prior situations.'
    );
  END IF;

  RETURN jsonb_build_object('authorized', true, 'matches', v_matches);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_diagnosis(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION recall_similar_problems(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- WIRE PERSISTENCE INTO THE BRAIN (composition-first, non-destructive).
-- Re-declare diagnose_business (20260818220000) to persist each fired
-- diagnosis via record_diagnosis, so fired diagnoses become searchable
-- history that recall_similar_problems can retrieve. The ONLY addition is
-- one best-effort record_diagnosis call inside the existing per-rule
-- EXCEPTION block — a persistence failure never breaks the diagnosis (§24).
-- The function body is otherwise identical to the shipped version.
-- ============================================================
CREATE OR REPLACE FUNCTION public.diagnose_business(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule RECORD;
  v_metrics JSONB;
  v_symptom JSONB;
  v_cause JSONB;
  v_sym_change NUMERIC;
  v_cause_change NUMERIC;
  v_sym_val NUMERIC;
  v_cause_val NUMERIC;
  v_impact NUMERIC;
  v_impact_metric_val NUMERIC;
  v_diagnoses JSONB := '[]'::jsonb;
  v_diag JSONB;
BEGIN
  -- Load the governed metrics (086) once.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_metrics
      FROM current_metrics(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_metrics := '[]'::jsonb;
  END;
  IF v_metrics = '[]'::jsonb THEN
    RETURN jsonb_build_object('diagnoses', '[]'::jsonb, 'note', 'Not enough metric history to diagnose yet. Use Avenize for a few weeks to build a baseline.');
  END IF;

  FOR v_rule IN
    SELECT * FROM diagnosis_rules WHERE enabled = true ORDER BY display_order
  LOOP
    BEGIN
      v_symptom := NULL; v_cause := NULL;
      SELECT m INTO v_symptom FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.symptom_metric;
      SELECT m INTO v_cause FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.cause_metric;
      CONTINUE WHEN v_symptom IS NULL OR v_cause IS NULL;
      v_sym_change := NULLIF((v_symptom->>'change_percent')::TEXT, '')::NUMERIC;
      v_cause_change := NULLIF((v_cause->>'change_percent')::TEXT, '')::NUMERIC;
      CONTINUE WHEN v_sym_change IS NULL OR v_cause_change IS NULL;
      v_sym_val := NULLIF((v_symptom->>'current_value')::TEXT, '')::NUMERIC;
      v_cause_val := NULLIF((v_cause->>'current_value')::TEXT, '')::NUMERIC;

      CONTINUE WHEN v_rule.symptom_direction = 'down' AND NOT (v_sym_change <= -v_rule.trigger_threshold_pct);
      CONTINUE WHEN v_rule.symptom_direction = 'up'   AND NOT (v_sym_change >=  v_rule.trigger_threshold_pct);
      CONTINUE WHEN v_rule.cause_direction = 'down' AND NOT (v_cause_change < 0);
      CONTINUE WHEN v_rule.cause_direction = 'up'   AND NOT (v_cause_change > 0);

      v_impact := NULL;
      IF v_rule.impact_method = 'symptom_delta' AND v_sym_val IS NOT NULL THEN
        v_impact_metric_val := v_sym_val;
        IF v_rule.impact_metric IS NOT NULL AND v_rule.impact_metric <> v_rule.symptom_metric THEN
          SELECT (m->>'current_value')::NUMERIC INTO v_impact_metric_val
            FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.impact_metric;
        END IF;
        IF v_impact_metric_val IS NOT NULL THEN
          v_impact := ABS(v_impact_metric_val * v_sym_change / 100.0);
        END IF;
      END IF;

      v_diag := jsonb_build_object(
        'rule_id', v_rule.rule_id,
        'symptom_metric', v_rule.symptom_metric,
        'symptom_change_pct', ROUND(v_sym_change::numeric, 1),
        'cause_metric', v_rule.cause_metric,
        'cause_change_pct', ROUND(v_cause_change::numeric, 1),
        'relationship', v_rule.relationship,
        'impact_amount', CASE WHEN v_impact IS NOT NULL THEN ROUND(v_impact::numeric, 2) ELSE NULL END,
        'severity', v_rule.severity,
        'evidence', jsonb_build_object('symptom', 'FACT', 'cause_link', 'INFERENCE')
      );
      v_diag := jsonb_set(v_diag, '{headline}', to_jsonb(
        COALESCE(v_symptom->>'name', v_rule.symptom_metric) || ' is ' ||
        CASE WHEN v_sym_change >= 0 THEN 'up' ELSE 'down' END || ' ' ||
        ABS(ROUND(v_sym_change::numeric,1))::TEXT || '%'
      ));

      v_diagnoses := v_diagnoses || jsonb_build_array(v_diag);

      -- §I PERSISTENCE: record the fired diagnosis as an INFERENCE claim so it
      -- becomes searchable history. Best-effort — a persistence failure never
      -- breaks the diagnosis (§24). Idempotent per (business, rule, day).
      BEGIN
        PERFORM record_diagnosis(
          p_business_id, v_rule.rule_id, v_rule.symptom_metric, v_rule.cause_metric,
          v_diag->>'headline', v_rule.relationship, v_impact, v_rule.severity
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- best-effort per rule (§24)
    END;
  END LOOP;

  RETURN jsonb_build_object('diagnoses', v_diagnoses);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('diagnoses', '[]'::jsonb, 'error', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.diagnose_business(UUID) TO authenticated;

COMMENT ON FUNCTION record_diagnosis IS
  '§I persists a fired diagnosis as an INFERENCE claim so it becomes searchable history. Idempotent per (business, rule, day). Membership-guarded.';
COMMENT ON FUNCTION recall_similar_problems IS
  '§I recalls prior similar problems + what was tried + the outcome, matching a current diagnosis against historical diagnosis claims, reviewed decisions (064), and organizational_memory. FACT for happened/prior-outcome, INFERENCE for lessons. Honest empty state when no match (§22).';
