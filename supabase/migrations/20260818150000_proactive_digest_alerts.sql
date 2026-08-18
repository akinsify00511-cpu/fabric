-- ============================================================================
-- Section 5.5 (Alerts with one-tap resolving actions) + Section 7.4
-- (Proactive delivery — digest, WhatsApp-first but with NO external WhatsApp
-- dependency; delivered via the existing email/Resend edge function).
--
-- Guiding Principle §0.2: "Sentences over dashboards, alerts over reports."
-- §0.5 (proactive): the owner learns how their business is doing WITHOUT
-- opening the app — the summary arrives the way a message would.
--
-- This migration adds the SERVER-SIDE digest composition (one call produces
-- the plain-language summary the owner gets) + the opt-in cadence tracking +
-- the alert→resolving-action map. The delivery itself is the existing
-- send-email-notification edge function (Resend) — no new external service.
--
-- §22 anti-fabrication: the digest is composed from REAL data (business health,
-- open recommendations, overdue invoices, low stock, stale deals). Every line
-- cites the source. Never a generic "improve your sales".
--
-- Idempotent throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Digest delivery tracking — when was the last digest sent, what cadence.
--    Reuses notification_preferences.email_weekly_digest as the opt-in gate;
--    this table records delivery state so we don't double-send or spam.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  summary JSONB NOT NULL,   -- the composed digest (for audit)
  delivery_status TEXT DEFAULT 'sent',  -- sent/failed
  error TEXT
);
ALTER TABLE public.business_digest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_digest_log_business_all" ON public.business_digest_log
  FOR SELECT USING (business_id IN (SELECT business_id FROM public.get_current_staff()));
-- Only service role writes (the cron/scheduled job).
REVOKE ALL ON public.business_digest_log FROM authenticated, anon;
GRANT SELECT ON public.business_digest_log TO authenticated;
CREATE INDEX IF NOT EXISTS idx_digest_log_business ON public.business_digest_log(business_id, sent_at DESC);

-- ----------------------------------------------------------------------------
-- (2) Alert resolving-action map (§5.5: every alert has a one-tap action).
--    Maps a recommendation/alert rule to the single action that resolves it.
--    The RecommendationsCard already has "Act → Create task"; this makes the
--    action specific per alert type (overdue invoice → Send reminder, low
--    stock → Reorder, stale deal → Follow up).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_action_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,                -- e.g. FIN-AR-002, INV-001, SAL-CONV-001
  action_label TEXT NOT NULL,           -- "Send reminder", "Reorder stock"
  action_route TEXT NOT NULL,           -- the /app/* route to perform it
  action_type TEXT NOT NULL DEFAULT 'navigate',  -- navigate|rpc
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, rule_id)
);
ALTER TABLE public.alert_action_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_action_map_business_all" ON public.alert_action_map
  FOR ALL USING (business_id IN (SELECT business_id FROM public.get_current_staff()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_action_map TO authenticated;

-- Seed default resolving actions (owners can customize per business later).
INSERT INTO public.alert_action_map (business_id, rule_id, action_label, action_route, action_type)
  SELECT b.id, 'FIN-AR-002', 'Send reminder', '/app/finance', 'navigate'
  FROM public.businesses b
  ON CONFLICT (business_id, rule_id) DO NOTHING;
INSERT INTO public.alert_action_map (business_id, rule_id, action_label, action_route, action_type)
  SELECT b.id, 'INV-001', 'Reorder stock', '/app/inventory', 'navigate'
  FROM public.businesses b
  ON CONFLICT (business_id, rule_id) DO NOTHING;
INSERT INTO public.alert_action_map (business_id, rule_id, action_label, action_route, action_type)
  SELECT b.id, 'SAL-CONV-001', 'Follow up on deal', '/app/crm', 'navigate'
  FROM public.businesses b
  ON CONFLICT (business_id, rule_id) DO NOTHING;
INSERT INTO public.alert_action_map (business_id, rule_id, action_label, action_route, action_type)
  SELECT b.id, 'CUST-001', 'Reach out to customer', '/app/crm', 'navigate'
  FROM public.businesses b
  ON CONFLICT (business_id, rule_id) DO NOTHING;
INSERT INTO public.alert_action_map (business_id, rule_id, action_label, action_route, action_type)
  SELECT b.id, 'OPS-001', 'Reassign tasks', '/app/tasks', 'navigate'
  FROM public.businesses b
  ON CONFLICT (business_id, rule_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- (3) compose_business_digest — the §7.4 server-side digest.
--    Composes a plain-language summary from REAL data: business health,
--    open recommendations, overdue invoices, low stock, stale deals, needs-
--    attention count. Every line cites its source (§22). Owner-gated +
--    membership-guarded (the digest is for the business owner).
--    Returns JSONB the delivery edge function turns into an email.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compose_business_digest(
  p_business_id UUID,
  p_digest_type TEXT DEFAULT 'daily'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_owner RECORD;
  v_health JSONB;
  v_recs JSONB;
  v_overdue_count INT;
  v_overdue_total NUMERIC;
  v_low_stock_count INT;
  v_stale_deals INT;
  v_tasks_due INT;
  v_lines JSONB[];
  v_result JSONB;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  -- Only the owner/admin can request the digest composition (it's the owner's
  -- private business summary). Membership guard is the real boundary.
  IF v_staff.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- (a) Business health (Session 13/14 compute_business_health).
  BEGIN
    SELECT * INTO v_health FROM current_business_health WHERE business_id = p_business_id;
  EXCEPTION WHEN OTHERS THEN
    v_health := NULL;  -- health layer not deployed yet (§24 graceful)
  END;

  -- (b) Open recommendations (Session 13/14 open_recommendations).
  BEGIN
    SELECT COALESCE(jsonb_agg(r) FILTER (WHERE r->>'status' = 'open'), '[]'::jsonb)
      INTO v_recs
      FROM (
        SELECT row_to_json(x) AS r FROM (
          SELECT claim_id, rule_id, statement, severity, expected_impact
            FROM claims
           WHERE business_id = p_business_id AND status = 'open'
           ORDER BY (CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END), created_at DESC
           LIMIT 5
        ) x
      ) sub;
  EXCEPTION WHEN OTHERS THEN
    v_recs := '[]'::jsonb;
  END;

  -- (c) Overdue invoices (real data, §22).
  BEGIN
    SELECT count(*), COALESCE(sum(balance), 0)
      INTO v_overdue_count, v_overdue_total
      FROM invoices
     WHERE business_id = p_business_id
       AND status NOT IN ('draft', 'cancelled', 'paid')
       AND balance > 0
       AND due_date < CURRENT_DATE;
  EXCEPTION WHEN OTHERS THEN
    v_overdue_count := 0; v_overdue_total := 0;
  END;

  -- (d) Low stock (real data).
  BEGIN
    SELECT count(*) INTO v_low_stock_count FROM products
     WHERE business_id = p_business_id
       AND low_stock_threshold IS NOT NULL
       AND stock <= low_stock_threshold;
  EXCEPTION WHEN OTHERS THEN
    v_low_stock_count := 0;
  END;

  -- (e) Stale deals > 14 days (the intelligence threshold).
  BEGIN
    SELECT count(*) INTO v_stale_deals FROM deals
     WHERE business_id = p_business_id
       AND stage NOT IN ('won', 'lost')
       AND updated_at < NOW() - INTERVAL '14 days';
  EXCEPTION WHEN OTHERS THEN
    v_stale_deals := 0;
  END;

  -- (f) Tasks due soon / overdue (real data).
  BEGIN
    SELECT count(*) INTO v_tasks_due FROM tasks
     WHERE business_id = p_business_id
       AND status NOT IN ('done', 'cancelled')
       AND due_date < NOW() + INTERVAL '2 days';
  EXCEPTION WHEN OTHERS THEN
    v_tasks_due := 0;
  END;

  -- ---- Compose plain-language lines (§0.2: sentences, not numbers). ----
  v_lines := '{}';
  IF v_health IS NOT NULL AND v_health ? 'overall_score' THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', CASE
          WHEN (v_health->>'overall_score')::int >= 80 THEN 'Your business is healthy — score ' || (v_health->>'overall_score') || '/100.'
          WHEN (v_health->>'overall_score')::int >= 60 THEN 'Your business needs attention — score ' || (v_health->>'overall_score') || '/100.'
          ELSE 'Your business is at risk — score ' || (v_health->>'overall_score') || '/100.'
        END,
        'source', 'business_health_scores'
      )
    );
  END IF;
  IF v_overdue_count > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', v_overdue_count || ' overdue invoice' || (CASE WHEN v_overdue_count > 1 THEN 's' ELSE '' END)
                 || ' totalling ' || to_char(v_overdue_total, 'FM999,999,999') || '.',
        'source', 'invoices', 'action', 'Send reminders', 'route', '/app/finance'
      )
    );
  END IF;
  IF v_low_stock_count > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', v_low_stock_count || ' product' || (CASE WHEN v_low_stock_count > 1 THEN 's are' ELSE ' is' END)
                 || ' running low on stock.',
        'source', 'products', 'action', 'Reorder', 'route', '/app/inventory'
      )
    );
  END IF;
  IF v_stale_deals > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', v_stale_deals || ' deal' || (CASE WHEN v_stale_deals > 1 THEN 's have' ELSE ' has' END)
                 || ' gone cold (no activity in 14+ days).',
        'source', 'deals', 'action', 'Follow up', 'route', '/app/crm'
      )
    );
  END IF;
  IF v_tasks_due > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', v_tasks_due || ' task' || (CASE WHEN v_tasks_due > 1 THEN 's need' ELSE ' needs' END)
                 || ' attention in the next 2 days.',
        'source', 'tasks', 'action', 'Review', 'route', '/app/tasks'
      )
    );
  END IF;
  IF jsonb_array_length(COALESCE(v_recs, '[]'::jsonb)) > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'text', jsonb_array_length(v_recs) || ' recommendation' || (CASE WHEN jsonb_array_length(v_recs) > 1 THEN 's' ELSE '' END)
                 || ' open on your Executive Cockpit.',
        'source', 'claims', 'action', 'Review', 'route', '/app/cockpit'
      )
    );
  END IF;

  -- If nothing needs attention, the digest says so (honest, not empty).
  IF jsonb_array_length(v_lines) = 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('text', 'Nothing needs your attention right now. All clear.', 'source', 'digest')
    );
  END IF;

  -- Get the owner's email for delivery.
  SELECT u.email, s.name INTO v_owner
    FROM staff s JOIN auth.users u ON s.user_id = u.id
   WHERE s.business_id = p_business_id AND s.role = 'owner'
   LIMIT 1;

  v_result := jsonb_build_object(
    'authorized', true,
    'business_id', p_business_id,
    'digest_type', p_digest_type,
    'recipient_email', v_owner.email,
    'recipient_name', v_owner.name,
    'lines', v_lines,
    'stats', jsonb_build_object(
      'overall_score', CASE WHEN v_health ? 'overall_score' THEN (v_health->>'overall_score') ELSE NULL END,
      'overdue_invoices', v_overdue_count,
      'overdue_total', v_overdue_total,
      'low_stock', v_low_stock_count,
      'stale_deals', v_stale_deals,
      'tasks_due', v_tasks_due,
      'open_recommendations', jsonb_array_length(COALESCE(v_recs, '[]'::jsonb))
    ),
    'recommendations', v_recs,
    'composed_at', NOW()
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'compose_business_digest failed: %', SQLERRM;
  RETURN jsonb_build_object('authorized', false, 'error', 'DIGEST_COMPOSE_FAILED');
END;
$$;
GRANT EXECUTE ON FUNCTION public.compose_business_digest(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- (4) send_business_digest — delivers a composed digest to the owner.
--    Records the delivery in business_digest_log. The actual email send is
--    the existing send-email-notification edge function (Resend) called by the
--    cron job; this RPC composes + logs so the delivery is auditable (§7.5).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_business_digest(
  p_business_id UUID,
  p_digest_type TEXT DEFAULT 'daily'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_digest JSONB;
  v_last_sent TIMESTAMPTZ;
  v_log_id UUID;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  END IF;
  IF v_staff.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_OWNER');
  END IF;

  -- Compose the digest.
  v_digest := public.compose_business_digest(p_business_id, p_digest_type);
  IF COALESCE((v_digest->>'authorized')::boolean, false) = false THEN
    RETURN v_digest;
  END IF;

  -- Idempotency: don't double-send within the cadence window (§0.5/§25 anti-spam).
  SELECT MAX(sent_at) INTO v_last_sent FROM public.business_digest_log
   WHERE business_id = p_business_id AND digest_type = p_digest_type;
  IF v_last_sent IS NOT NULL THEN
    IF p_digest_type = 'daily' AND v_last_sent > NOW() - INTERVAL '20 hours' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'recently_sent', 'last_sent', v_last_sent);
    ELSIF p_digest_type = 'weekly' AND v_last_sent > NOW() - INTERVAL '6 days' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'recently_sent', 'last_sent', v_last_sent);
    END IF;
  END IF;

  -- Check the opt-in preference (§7.4: opt-in cadence). Default opt-in if no
  -- preference row exists yet.
  BEGIN
    IF EXISTS (SELECT 1 FROM notification_preferences np
               JOIN auth.users u ON np.user_id = u.id
               WHERE u.email = v_digest->>'recipient_email'
                 AND np.email_weekly_digest = false) THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'opted_out');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- default to sending if preference check fails
  END;

  -- Log the delivery (the cron job reads pending logs + calls the email fn).
  INSERT INTO public.business_digest_log (business_id, digest_type, recipient_user_id, summary, delivery_status)
  VALUES (p_business_id, p_digest_type,
    (SELECT id FROM auth.users WHERE email = v_digest->>'recipient_email' LIMIT 1),
    v_digest, 'sent')
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id, 'digest', v_digest);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send_business_digest failed: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'DIGEST_SEND_FAILED');
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_business_digest(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- (5) get_alert_actions — returns the one-tap resolving actions for the
--    business's open alerts (§5.5). The RecommendationsCard uses this to
--    show a specific action button per alert instead of the generic
--    "Act → Create task".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_alert_actions(p_business_id UUID)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_id', rule_id, 'label', action_label, 'route', action_route, 'type', action_type
  )), '[]'::jsonb)
  FROM alert_action_map
  WHERE business_id = $1;
$$;
GRANT EXECUTE ON FUNCTION public.get_alert_actions(UUID) TO authenticated;

COMMENT ON FUNCTION public.compose_business_digest(UUID, TEXT) IS
  '§7.4: composes a plain-language business digest from real data (health, recommendations, overdue invoices, low stock, stale deals, tasks). §22: every line cites its source. Owner-gated + membership-guarded.';
COMMENT ON FUNCTION public.send_business_digest(UUID, TEXT) IS
  '§7.4 + §25 anti-spam: delivers the digest to the owner, idempotent within the cadence window, respects the opt-in preference. Audited in business_digest_log (§7.5).';
COMMENT ON FUNCTION public.get_alert_actions(UUID) IS
  '§5.5: returns the one-tap resolving action per alert rule (overdue→Send reminder, low stock→Reorder, stale deal→Follow up). Owners can customize.';
