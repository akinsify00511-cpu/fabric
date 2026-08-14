-- 087_context_graph_wiring.sql
--
-- P1 / U3 of the Intelligence Transformation. Wires the Business Context
-- Graph (migration 060) — `entity_relationships` + `link_entities` — which
-- exists but was never populated. This is the §4 relationship graph the
-- instruction requires (Customer→Deal→Invoice→Payment→Revenue→Cost→Margin)
-- for cross-module diagnosis (§11).
--
-- Approach (lowest risk, architecture-aligned): a NEW best-effort handler
-- `handler_derive_relationships` registered with the event bus
-- (business_event_handlers) at run_order 6 — AFTER propagation (5, which
-- backfills entity_id and creates the customer/staff rows) and BEFORE
-- freshness (10). It derives edges from the committed event and its
-- related_entities/payload, using `link_entities` (idempotent upsert, 060).
-- The existing triggers/handlers are NOT modified, so no working path is
-- destabilised.
--
-- Edges derived per event:
--   DealWon:        deal -[owned_by]-> owner (staff), deal -[for_customer]-> customer,
--                   deal -[created_invoice]-> invoice (when captured), invoice -[for_customer]-> customer
--   PaymentReceived: invoice -[received_payment]-> payment
--                   invoice -[for_customer]-> customer (best-effort via client_name)
--   EmployeeJoined: staff -[member_of]-> business
--   (generic)      event.entity -[rel]-> each related_entities entry
--
-- All edge writes are inside a sub-block with EXCEPTION so a missing
-- optional table/column never fails the event (§24). link_entities is itself
-- idempotent (ON CONFLICT DO UPDATE). No business data is mutated — only
-- graph edges are appended.
--
-- Pure internal SQL. Idempotent.

\set ON_ERROR_STOP on

-- ============================================================
-- handler_derive_relationships — derives context-graph edges from an event.
-- Runs after propagation (entity_id backfilled) so it can resolve the actual
-- deal/invoice/customer/staff rows. Best-effort: never fails the event.
-- ============================================================
CREATE OR REPLACE FUNCTION handler_derive_relationships(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  v_deal_id UUID; v_invoice_id UUID; v_staff_id UUID; v_customer_id UUID;
  v_payment_id UUID; v_name TEXT; v_owner_id UUID;
  v_rel JSONB; i INTEGER;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    IF ev.event_type = 'DealWon' THEN
      v_deal_id := ev.entity_id;        -- backfilled by propagate (run_order 5)
      v_name    := ev.payload->>'name';
      IF v_name IS NULL THEN v_name := ev.payload->>'customer'; END IF;
      IF v_name IS NULL THEN v_name := ev.payload->>'client'; END IF;

      -- deal -> customer (resolve contact by name within the business)
      IF v_name IS NOT NULL THEN
        SELECT id INTO v_customer_id FROM contacts
          WHERE business_id = ev.business_id AND name ILIKE v_name
          ORDER BY updated_at DESC LIMIT 1;
        IF v_customer_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'for_customer','customer',v_customer_id,'derived');
        END IF;
      END IF;

      -- deal -> owner (staff). deals uses owner_id (added 002), not assigned_to.
      IF v_deal_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner_id FROM deals WHERE id = v_deal_id;
        IF v_owner_id IS NOT NULL THEN
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'owned_by','staff',v_owner_id,'derived');
        END IF;
      END IF;

      -- An invoice may have been drafted for this deal during capture. Link
      -- deal -> invoice and invoice -> customer (via client_name).
      IF v_deal_id IS NOT NULL THEN
        FOR v_invoice_id IN SELECT id FROM invoices WHERE business_id = ev.business_id AND deal_id = v_deal_id LOOP
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'created_invoice','invoice',v_invoice_id,'derived');
          DECLARE v_client TEXT;
          BEGIN
            SELECT client_name INTO v_client FROM invoices WHERE id = v_invoice_id;
            IF v_client IS NOT NULL AND v_client <> '' THEN
              SELECT id INTO v_customer_id FROM contacts
                WHERE business_id = ev.business_id AND name ILIKE v_client
                ORDER BY updated_at DESC LIMIT 1;
              IF v_customer_id IS NOT NULL THEN
                PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'for_customer','customer',v_customer_id,'inferred');
              END IF;
            END IF;
          END;
        END LOOP;
      END IF;

    ELSIF ev.event_type = 'PaymentReceived' THEN
      v_invoice_id := ev.entity_id;       -- backfilled by propagate
      -- invoice -> payment, for the payment rows linked to this invoice.
      IF v_invoice_id IS NOT NULL THEN
        FOR v_payment_id IN SELECT id FROM payments WHERE invoice_id = v_invoice_id AND business_id = ev.business_id LOOP
          PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'received_payment','payment',v_payment_id,'derived');
        END LOOP;
        -- invoice -> customer via client_name (best-effort; invoices has no contact_id)
        DECLARE v_client TEXT;
        BEGIN
          SELECT client_name INTO v_client FROM invoices WHERE id = v_invoice_id;
          IF v_client IS NOT NULL AND v_client <> '' THEN
            SELECT id INTO v_customer_id FROM contacts
              WHERE business_id = ev.business_id AND name ILIKE v_client
              ORDER BY updated_at DESC LIMIT 1;
            IF v_customer_id IS NOT NULL THEN
              PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'for_customer','customer',v_customer_id,'inferred');
            END IF;
          END IF;
        END;
      END IF;

    ELSIF ev.event_type = 'EmployeeJoined' THEN
      v_staff_id := ev.entity_id;         -- backfilled by propagate
      IF v_staff_id IS NOT NULL THEN
        PERFORM link_entities(ev.business_id,'staff',v_staff_id,'member_of','business',ev.business_id,'derived');
      END IF;
    END IF;

    -- Generic: link event entity to each related_entities entry that carries an id.
    IF ev.related_entities IS NOT NULL AND jsonb_typeof(ev.related_entities) = 'array' THEN
      FOR i IN 0..jsonb_array_length(ev.related_entities) - 1 LOOP
        v_rel := ev.related_entities->i;
        IF ev.entity_id IS NOT NULL AND (v_rel->>'id') IS NOT NULL AND (v_rel->>'type') IS NOT NULL THEN
          PERFORM link_entities(
            ev.business_id,
            ev.entity_type, ev.entity_id,
            COALESCE(v_rel->>'relationship', ev.event_type),
            v_rel->>'type', (v_rel->>'id')::UUID,
            'derived'
          );
        END IF;
      END LOOP;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Edge derivation is best-effort. A missing column/table (e.g. an older
    -- schema without owner_id) must never fail the event or block business
    -- operations. Record the error and continue.
    UPDATE business_events
      SET processing_error = COALESCE(processing_error,'') || ' derive_relationships: ' || SQLERRM || E'\n'
      WHERE id = p_event_id;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register the handler AFTER propagation (run_order 5) and BEFORE freshness
-- (run_order 10). Covers the canonical capture events; future events
-- (InvoiceCreated etc., U6) will register it too.
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, is_active, description)
VALUES
  ('DealWon',         'handler_derive_relationships', 6, TRUE, 'Derive deal/customer/invoice context-graph edges'),
  ('PaymentReceived', 'handler_derive_relationships', 6, TRUE, 'Derive invoice/payment/customer context-graph edges'),
  ('EmployeeJoined',  'handler_derive_relationships', 6, TRUE, 'Derive staff/business context-graph edge')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- Read helper: business_relationships(business_id, start_type, start_id, depth)
-- Thin wrapper over recursive_neighbors (060) so the frontend / diagnosis
-- engine can ask "what else is connected to this entity?" in one call.
-- Returns (entity_type, entity_id, depth, path) for impact analysis.
-- ============================================================
CREATE OR REPLACE FUNCTION business_relationships(
  p_business_id UUID, p_start_type TEXT, p_start_id UUID, p_max_depth INTEGER DEFAULT 3
) RETURNS TABLE(entity_type TEXT, entity_id UUID, depth INTEGER, path TEXT[]) AS $$
  SELECT * FROM recursive_neighbors(p_business_id, p_start_type, p_start_id, p_max_depth);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION business_relationships(UUID, TEXT, UUID, INT) TO authenticated;

COMMENT ON FUNCTION handler_derive_relationships IS
  'Derives context-graph edges (entity_relationships) from a committed business event. Best-effort, runs after propagation (run_order 6). §4 relationship graph.';
COMMENT ON FUNCTION business_relationships IS
  'Read helper over recursive_neighbors (060): entities reachable from a start, for cross-module diagnosis / impact analysis.';
