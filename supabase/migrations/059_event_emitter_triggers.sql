-- 059_event_emitter_triggers.sql
-- Wire existing domain tables into the Business Event Bus so meaningful
-- moments raise events automatically — without each page calling
-- emit_business_event by hand. This is what makes the bus actually fire.
--
-- Events emitted:
--   invoices (status -> paid)         => PaymentReceived
--   deals (status -> closed_won)       => DealWon
--   products (stock <= reorder_level)  => InventoryLow
--   staff (INSERT)                    => EmployeeJoined
--   staff (status -> exited/inactive)  => EmployeeExited
-- Each trigger is AFTER so we only emit for committed changes.

-- Helper to read a column value from the NEW row by name.
CREATE OR REPLACE FUNCTION col_text(r RECORD, c TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN (to_jsonb(r) ->> c);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- PaymentReceived: when an invoice transitions to paid, or a payment row
-- is created against an invoice.
CREATE OR REPLACE FUNCTION emit_payment_received() RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID; v_invoice_id UUID; v_amount NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_business_id := (NEW).business_id;
    v_invoice_id := (NEW).invoice_id;
    v_amount := (NEW).amount;
  ELSE -- invoices update to paid
    IF (OLD).status = 'paid' OR (NEW).status <> 'paid' THEN RETURN NEW; END IF;
    v_business_id := (NEW).business_id;
    v_invoice_id := (NEW).id;
    v_amount := (NEW).total;
  END IF;
  IF v_business_id IS NULL THEN RETURN NEW; END IF;
  PERFORM emit_business_event(
    p_business_id := v_business_id,
    p_event_type := 'PaymentReceived',
    p_entity_type := 'invoice',
    p_entity_id := v_invoice_id,
    p_payload := jsonb_build_object('amount', v_amount,
      'when', coalesce((TG_TABLE_NAME='payments')::text, 'invoice_paid')),
    p_related_entities := jsonb_build_array(
      jsonb_build_object('type','invoice','id',v_invoice_id)),
    p_source := 'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER evt_payment_received_insert AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION emit_payment_received();
CREATE TRIGGER evt_invoice_paid AFTER UPDATE OF status ON invoices
  FOR EACH ROW WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION emit_payment_received();

-- DealWon: when a deal/opportunity moves to won. Tolerates either a
-- 'deals' or 'opportunities' table; uses dynamic SQL so a missing table
-- is a no-op rather than a migration failure. NOTE: deals uses `stage`
-- (not `status`) per 001; 090 drops+recreates this trigger with the
-- correct column — this definition is kept in sync so 059 applies clean.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='deals') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION emit_deal_won() RETURNS TRIGGER AS $fn$
      BEGIN
        IF (OLD).stage IS DISTINCT FROM 'won' AND (NEW).stage = 'won' THEN
          PERFORM emit_business_event(
            p_business_id := (NEW).business_id,
            p_event_type := 'DealWon',
            p_entity_type := 'deal',
            p_entity_id := (NEW).id,
            p_payload := to_jsonb(NEW) - 'business_id',
            p_related_entities := jsonb_build_array(
              jsonb_build_object('type','deal','id',(NEW).id),
              jsonb_build_object('type','customer','id',(NEW).customer_id)),
            p_source := 'system'
          );
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER;
      DROP TRIGGER IF EXISTS evt_deal_won ON deals;
      CREATE TRIGGER evt_deal_won AFTER UPDATE OF stage ON deals
        FOR EACH ROW EXECUTE FUNCTION emit_deal_won();
    $sql$;
  END IF;
END $$;

-- InventoryLow: when a product's stock drops to/below reorder_level.
CREATE OR REPLACE FUNCTION emit_inventory_low() RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID; v_id UUID; v_stock NUMERIC; v_reorder NUMERIC;
BEGIN
  v_business_id := (NEW).business_id;
  v_id := (NEW).id;
  v_stock := COALESCE((NEW).stock, (NEW).quantity, 0);
  v_reorder := COALESCE((NEW).reorder_level, (NEW).reorder_point, 0);
  IF v_stock <= v_reorder AND v_reorder > 0 THEN
    PERFORM emit_business_event(
      p_business_id := v_business_id,
      p_event_type := 'InventoryLow',
      p_entity_type := 'product',
      p_entity_id := v_id,
      p_payload := jsonb_build_object('stock', v_stock, 'reorder_level', v_reorder)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='products') THEN
    EXECUTE $sql$
      CREATE TRIGGER evt_inventory_low AFTER INSERT OR UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION emit_inventory_low();
    $sql$;
  END IF;
END $$;

-- EmployeeJoined / EmployeeExited on staff. staff may or may not have a
-- status column; we detect it dynamically and degrade gracefully (joined
-- always fires on INSERT; exited only if a status column exists).
DO $$ DECLARE
  v_has_status BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staff' AND column_name='status'
  ) INTO v_has_status;

  IF v_has_status THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION emit_staff_event() RETURNS TRIGGER AS $f$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          PERFORM emit_business_event(
            p_business_id := (NEW).business_id,
            p_event_type := 'EmployeeJoined',
            p_entity_type := 'staff',
            p_entity_id := (NEW).id,
            p_payload := jsonb_build_object('name', coalesce((NEW).full_name,(NEW).name)),
            p_source := 'system'
          );
        ELSIF TG_OP = 'UPDATE' THEN
          IF ((OLD).status IS DISTINCT FROM (NEW).status)
             AND (NEW).status IN ('exited','inactive','terminated') THEN
            PERFORM emit_business_event(
              p_business_id := (NEW).business_id,
              p_event_type := 'EmployeeExited',
              p_entity_type := 'staff',
              p_entity_id := (NEW).id,
              p_payload := jsonb_build_object('name', coalesce((NEW).full_name,(NEW).name),'new_status',(NEW).status)
            );
          END IF;
        END IF;
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE TRIGGER evt_staff_joined AFTER INSERT ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
      CREATE TRIGGER evt_staff_exited AFTER UPDATE OF status ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
    $fn$;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION emit_staff_joined() RETURNS TRIGGER AS $f$
      BEGIN
        PERFORM emit_business_event(
          p_business_id := (NEW).business_id,
          p_event_type := 'EmployeeJoined',
          p_entity_type := 'staff',
          p_entity_id := (NEW).id,
          p_payload := jsonb_build_object('name', (NEW).name),
          p_source := 'system'
        );
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE TRIGGER evt_staff_joined AFTER INSERT ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_joined();
    $fn$;
  END IF;
END $$;

COMMENT ON FUNCTION emit_business_event IS
  'Bus entry point; called by the triggers in 059 for invoices, deals, products, staff.';
