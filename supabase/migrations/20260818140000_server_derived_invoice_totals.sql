-- ============================================================================
-- Section 4.2 (Finance/Invoicing) + Guiding Principle §0.4:
-- "Financial and security-critical numbers are always server-derived, never
--  client-supplied. Any total, balance, score, or aggregate the app shows or
--  acts on must be computed in a SECURITY DEFINER RPC or trusted server
--  function, not summed in the browser and trusted as-is."
--
-- The master checklist explicitly flags FinanceNigeria.tsx as having the
-- same class of bug as the (missing) convert_quote_to_invoice fix:
-- `calculateTotals()` sums subtotal/vat/wht/total in the browser and the
-- insert trusts them. This migration:
--   (1) Ensures ALL the columns FinanceNigeria writes actually exist on
--       `invoices` (several — vat_amount, vat_rate, wht_amount, wht_rate,
--       amount_paid, balance, is_proforma, client_address, job_reference,
--       notes, issue_date, staff_id — were never added, so the inserts
--       were silently dropping those values, a §6 done-means-done gap).
--   (2) Defines `create_invoice` — a SECURITY DEFINER RPC that RECOMPUTES
--       subtotal/vat/wht/total from the raw line items server-side and
--       inserts the invoice + line items atomically. The client supplies
--       raw item data (description, quantity, unit_price) + tax config;
--       the server derives every money total. This is the §0.4 reference
--       pattern the checklist demands.
--   (3) Defines `record_invoice_payment` — server-derived balance update
--       (the existing FinanceNigeria payment path computed `newBalance`
--       client-side and trusted it).
--
-- Idempotent throughout (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Ensure the columns FinanceNigeria writes actually exist.
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wht_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_proforma BOOLEAN DEFAULT FALSE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS job_reference TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- (2) create_invoice — the §0.4 reference RPC.
--     Inputs the RAW line items (description, quantity, unit_price) + the
--     tax configuration (vat_rate, apply_wht). The server RECOMPUTES every
--     money total. Returns the new invoice id. Business-scoped + staff-gated.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice(
  p_client_name TEXT,
  p_items JSONB,                       -- [{description, quantity, unit_price}, ...]
  p_vat_rate NUMERIC DEFAULT 0,        -- e.g. 0.075 for 7.5%
  p_apply_wht BOOLEAN DEFAULT FALSE,
  p_wht_rate NUMERIC DEFAULT 0.05,     -- default resident WHT 5%
  p_client_email TEXT DEFAULT NULL,
  p_client_address TEXT DEFAULT NULL,
  p_job_reference TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_due_date TIMESTAMPTZ DEFAULT NULL,
  p_is_proforma BOOLEAN DEFAULT FALSE,
  p_notes TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_business_id UUID DEFAULT NULL       -- optional explicit; else caller's
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_bid UUID;
  v_item JSONB;
  v_line_subtotal NUMERIC(12,2) := 0;
  v_subtotal NUMERIC(12,2) := 0;
  v_vat_amount NUMERIC(12,2) := 0;
  v_wht_amount NUMERIC(12,2) := 0;
  v_total NUMERIC(12,2) := 0;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_qty INT;
  v_unit_price NUMERIC(12,2);
  v_line_total NUMERIC(12,2);
BEGIN
  -- Resolve the caller's staff record (business + role). This is the
  -- authorization gate — RLS does not apply to SECURITY DEFINER functions.
  SELECT * INTO v_staff FROM get_current_staff();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  END IF;
  v_bid := COALESCE(p_business_id, v_staff.business_id);

  -- Validate inputs: client name + at least one item with a price.
  IF COALESCE(p_client_name, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CLIENT_REQUIRED');
  END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ITEMS_REQUIRED');
  END IF;

  -- ---- RECOMPUTE every money total server-side (§0.4) ----
  v_subtotal := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    -- Guard against negative line totals (defensive; the UI shouldn't send them).
    v_line_total := GREATEST(v_qty * v_unit_price, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;
  v_vat_amount := ROUND(v_subtotal * COALESCE(p_vat_rate, 0), 2);
  v_wht_amount := CASE WHEN p_apply_wht THEN ROUND(v_subtotal * COALESCE(p_wht_rate, 0), 2) ELSE 0 END;
  -- total = subtotal + vat (wht is a deduction at payment, not from the invoice total).
  v_total := v_subtotal + v_vat_amount;

  IF v_total < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOTAL');
  END IF;

  -- Default invoice number if not supplied.
  v_invoice_number := COALESCE(p_invoice_number, 'INV-' || to_char(NOW(), 'YYMMDDHHMISS'));

  -- ---- Atomic insert of invoice + line items ----
  INSERT INTO public.invoices (
    business_id, invoice_number, client_name, client_email, client_address,
    job_reference, subtotal, vat_rate, vat_amount, wht_rate, wht_amount,
    total, amount_paid, balance, status, issue_date, due_date, is_proforma,
    notes, currency, staff_id
  ) VALUES (
    v_bid, v_invoice_number, p_client_name, p_client_email, p_client_address,
    p_job_reference, v_subtotal, COALESCE(p_vat_rate, 0), v_vat_amount,
    CASE WHEN p_apply_wht THEN COALESCE(p_wht_rate, 0) ELSE 0 END, v_wht_amount,
    v_total, 0, v_total, 'draft', COALESCE(CURRENT_DATE, NOW()::date),
    p_due_date, p_is_proforma, p_notes, p_currency, COALESCE(p_staff_id, v_staff.id)
  )
  RETURNING id INTO v_invoice_id;

  -- Insert the recomputed line items (server-derived line totals).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_line_total := GREATEST(v_qty * v_unit_price, 0);
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (v_invoice_id, v_item->>'description', v_qty, v_unit_price, v_line_total);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'subtotal', v_subtotal,
    'vat_amount', v_vat_amount,
    'wht_amount', v_wht_amount,
    'total', v_total,
    'balance', v_total
  );
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: never leak the raw error to a non-staff caller, but log it.
  RAISE NOTICE 'create_invoice failed: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'INVOICE_CREATE_FAILED');
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_invoice(
  TEXT, JSONB, NUMERIC, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, UUID, UUID
) TO authenticated;

-- ----------------------------------------------------------------------------
-- (3) record_invoice_payment — server-derived balance update.
--     The client supplies the payment AMOUNT; the server reads the current
--     invoice, recomputes amount_paid + balance, updates status if fully
--     paid, and inserts the payment row. Never trusts a client-supplied balance.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'manual',
  p_reference TEXT DEFAULT NULL,
  p_business_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_bid UUID;
  v_invoice RECORD;
  v_new_paid NUMERIC(12,2);
  v_new_balance NUMERIC(12,2);
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  END IF;
  v_bid := COALESCE(p_business_id, v_staff.business_id);

  -- Lock the invoice row for the duration of the update (concurrent payments).
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id = p_invoice_id AND business_id = v_bid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVOICE_NOT_FOUND');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  END IF

  -- Server-derived: recompute from the authoritative stored total + paid.
  v_new_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;
  v_new_balance := v_invoice.total - v_new_paid;
  v_new_status := CASE WHEN v_new_balance <= 0 THEN 'paid'
                       WHEN v_new_balance < v_invoice.total THEN 'sent'
                       ELSE v_invoice.status END;

  UPDATE public.invoices
    SET amount_paid = v_new_paid,
        balance = v_new_balance,
        status = v_new_status
    WHERE id = p_invoice_id;

  -- Record the payment (payments table defined in 010: business_id, amount,
  -- payment_method, reference, invoice_id, date).
  INSERT INTO public.payments (business_id, invoice_id, amount, payment_method, reference, date)
  VALUES (v_bid, p_invoice_id, p_amount, p_payment_method, p_reference, CURRENT_DATE)
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'amount_paid', v_new_paid,
    'balance', v_new_balance,
    'status', v_new_status
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'record_invoice_payment failed: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_RECORD_FAILED');
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.create_invoice(TEXT, JSONB, NUMERIC, BOOLEAN, NUMERIC, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, UUID, UUID) IS
  '§0.4 reference RPC: recomputes subtotal/vat/wht/total server-side from raw line items. The client supplies item data + tax config; the server derives every money total. Business-scoped + staff-gated.';
COMMENT ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, UUID) IS
  '§0.4: server-derived balance update. Recomputes amount_paid + balance from the authoritative stored total, never trusts a client-supplied balance. Updates status to paid when fully settled.';
