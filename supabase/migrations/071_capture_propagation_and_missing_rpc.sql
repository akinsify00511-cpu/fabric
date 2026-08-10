-- 071_capture_propagation_and_missing_rpc.sql
-- Closes the biggest structural gap: AICapture raised business_events that
-- nothing acted on. handler_update_entity_freshness early-returns when
-- entity_id IS NULL — which is always the case for a brand-new capture
-- ("We closed the ABC deal") because there is no existing entity yet.
-- So the success toast said "updating the relevant records" while nothing
-- was written to deals/invoices/customers/staff. This migration adds real
-- propagation handlers that perform the writes the destinations propose,
-- backfill entity_id so the freshness handler then runs, and are
-- best-effort so a missing optional table never fails the event.

-- Also defines 3 RPCs the frontend calls but no migration defined:
--   update_leave_balance, increment_saved_search_use, increment_user_learning

-- ============================================================
-- §1  CAPTURE PROPAGATION HANDLERS
-- ============================================================

-- handler_propagate_capture: reads payload._destinations and performs the
-- real writes. Runs at run_order 5 (before freshness at 10) so the entity
-- exists by the time freshness tries to record it.
CREATE OR REPLACE FUNCTION handler_propagate_capture(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  v_dest JSONB;
  v_deal_id UUID;
  v_contact_id UUID;
  v_invoice_id UUID;
  v_staff_id UUID;
  v_amount NUMERIC;
  v_name TEXT;
  v_upfront_pct NUMERIC;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_dest := COALESCE(ev.payload->'_destinations', '[]'::JSONB);
  IF jsonb_array_length(v_dest) = 0 THEN RETURN; END IF;

  v_amount   := NULLIF(ev.payload->>'amount', '')::NUMERIC;
  v_name     := ev.payload->>'name';
  v_upfront_pct := NULLIF(ev.payload->>'upfront_percent', '')::NUMERIC;

  -- DealWon: mark/create the deal as won + upsert a contact.
  IF ev.event_type = 'DealWon' THEN
    BEGIN
      -- Find an existing open deal by title, else create it.
      SELECT id INTO v_deal_id FROM deals
        WHERE business_id = ev.business_id
          AND title ILIKE COALESCE('%' || (ev.payload->>'deal_name') || '%', title)
        ORDER BY updated_at DESC LIMIT 1;
      IF v_deal_id IS NULL THEN
        INSERT INTO deals (business_id, title, value, stage, expected_close)
        VALUES (ev.business_id,
                COALESCE(ev.payload->>'deal_name', ev.payload->>'title', 'Closed deal'),
                COALESCE(v_amount, 0),
                'won',
                CURRENT_DATE)
        RETURNING id INTO v_deal_id;
      ELSE
        UPDATE deals SET stage = 'won', value = COALESCE(v_amount, value), updated_at = NOW()
          WHERE id = v_deal_id;
      END IF;

      -- Upsert the customer/contact so CRM reflects the win.
      IF v_name IS NOT NULL THEN
        INSERT INTO contacts (business_id, name, deal_id)
        VALUES (ev.business_id, v_name, v_deal_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_contact_id;
      END IF;

      -- Backfill entity_id so the freshness handler records it.
      UPDATE business_events SET entity_id = v_deal_id WHERE id = p_event_id;

      -- Draft the invoice for the balance (amount minus upfront) when an
      -- upfront % was mentioned — finance gets a receivable to collect.
      IF v_amount IS NOT NULL AND v_upfront_pct IS NOT NULL THEN
        INSERT INTO invoices (business_id, invoice_number, client_name, subtotal, total, status, due_date, deal_id)
        VALUES (ev.business_id,
                'INV-' || to_char(NOW(), 'YYYYMMDD') || '-' || substring(v_deal_id::TEXT, 1, 4),
                COALESCE(v_name, 'Customer'),
                v_amount * (1 - v_upfront_pct / 100.0),
                v_amount * (1 - v_upfront_pct / 100.0),
                'sent',
                CURRENT_DATE + 30,
                v_deal_id)
        RETURNING id INTO v_invoice_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort: a missing column/table must not fail the event.
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_capture: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;

  -- PaymentReceived: mark the matching invoice paid (if one exists).
  IF ev.event_type = 'PaymentReceived' THEN
    BEGIN
      UPDATE invoices
        SET status = 'paid', updated_at = NOW()
        WHERE business_id = ev.business_id
          AND COALESCE(total, 0) = COALESCE(v_amount, total)
          AND status IN ('sent', 'overdue')
        ORDER BY created_at DESC LIMIT 1;
      -- If we matched one, backfill its id.
      SELECT id INTO v_invoice_id FROM invoices
        WHERE business_id = ev.business_id AND status = 'paid'
        ORDER BY updated_at DESC LIMIT 1;
      IF v_invoice_id IS NOT NULL THEN
        UPDATE business_events SET entity_id = v_invoice_id WHERE id = p_event_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_payment: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;

  -- EmployeeJoined: create a staff row if one doesn't exist.
  IF ev.event_type = 'EmployeeJoined' THEN
    BEGIN
      v_name := COALESCE(ev.payload->>'name', ev.payload->>'employee_name');
      IF v_name IS NOT NULL THEN
        INSERT INTO staff (business_id, user_id, name, email, role, full_name)
        VALUES (ev.business_id, gen_random_uuid(), v_name,
                COALESCE(ev.payload->>'email', v_name || '@pending.local'),
                'staff', v_name)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_staff_id;
        IF v_staff_id IS NOT NULL THEN
          UPDATE business_events SET entity_id = v_staff_id WHERE id = p_event_id;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_staff: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register propagation handlers BEFORE the freshness handler (run_order 5).
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES
  ('DealWon',          'handler_propagate_capture', 5, 'Upsert deal/customer, draft invoice, backfill entity_id'),
  ('PaymentReceived',  'handler_propagate_capture', 5, 'Mark matching invoice paid, backfill entity_id'),
  ('EmployeeJoined',   'handler_propagate_capture', 5, 'Create staff record, backfill entity_id')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

COMMENT ON FUNCTION handler_propagate_capture IS
  'Performs the real writes proposed by payload._destinations so a capture actually updates deals/invoices/customers/staff, and backfills entity_id so the freshness handler then records it.';

-- ============================================================
-- §2  MISSING RPCs THE FRONTEND CALLS
-- ============================================================

-- update_leave_balance: called by LeaveManagement.tsx when a request is
-- approved/denied. Without it, approving leave never changed the balance.
CREATE OR REPLACE FUNCTION update_leave_balance(
  p_staff_id UUID,
  p_leave_type_id UUID,
  p_days NUMERIC,
  p_type TEXT DEFAULT 'approve'  -- 'approve' | 'reject' | 'pending'
) RETURNS VOID AS $$
BEGIN
  IF p_type = 'approve' THEN
    UPDATE leave_balances
      SET used_days = used_days + p_days,
          pending_days = GREATEST(pending_days - p_days, 0),
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  ELSIF p_type = 'reject' THEN
    UPDATE leave_balances
      SET pending_days = GREATEST(pending_days - p_days, 0),
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  ELSIF p_type = 'pending' THEN
    UPDATE leave_balances
      SET pending_days = pending_days + p_days,
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- increment_saved_search_use: called by auditLogger.ts (has a JS fallback,
-- but the RPC should exist so the fallback isn't the common path).
CREATE OR REPLACE FUNCTION increment_saved_search_use(p_search_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE saved_searches
    SET use_count = use_count + 1, updated_at = NOW()
    WHERE id = p_search_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- increment_user_learning: called by eventTracker.ts when a user accepts a
-- suggestion — the learning loop was silently broken because this didn't exist.
CREATE OR REPLACE FUNCTION increment_user_learning(
  p_user_id UUID,
  p_field TEXT
) RETURNS VOID AS $$
BEGIN
  -- Bump the named counter on the user's learning profile.
  -- Supported fields are the JSONB keys under top_features / preferred_*;
  -- for scalar columns we increment directly.
  IF p_field = 'suggestions_accepted' THEN
    UPDATE user_learning
      SET avg_actions_per_session = avg_actions_per_session + 1, updated_at = NOW()
      WHERE user_id = p_user_id;
  ELSE
    -- Generic: store the field as a top_feature frequency map.
    UPDATE user_learning
      SET top_features =
        jsonb_set(
          COALESCE(top_features, '[]'::JSONB),
          ARRAY[p_field],
          to_jsonb((top_features->>p_field)::INT + 1)
        ),
      updated_at = NOW()
      WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_leave_balance(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_saved_search_use(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_learning(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION handler_propagate_capture(UUID) TO authenticated;

COMMENT ON FUNCTION update_leave_balance IS 'Adjusts a staff member''s leave balance on approve/reject/pending — fixes the bug where approving leave never updated the balance.';
COMMENT ON FUNCTION increment_saved_search_use IS 'Bumps saved_searches.use_count — the frontend has a JS fallback but the RPC should be the primary path.';
COMMENT ON FUNCTION increment_user_learning IS 'Records that a user accepted a suggestion — the learning loop was silently broken without this.';
