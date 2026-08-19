-- Internal Receipt OCR (Avenize-first: no external OCR SaaS).
--
-- Pipeline: upload (private receipts bucket) -> OCR (tesseract.js in the
-- browser, within Avenize's own runtime) -> deterministic structured
-- extraction -> per-field confidence -> HUMAN CONFIRMATION -> cashflow
-- expense entry (004). The original document + raw OCR text + extracted
-- structured data are all stored for audit.
--
-- §22 anti-fabrication: extraction is deterministic parsing; confidence is
-- computed honestly per field; NOTHING becomes a financial record until a
-- human confirms. §32: receipts bucket is PRIVATE — signed paths only,
-- never getPublicUrl. Composition-first: confirm_receipt writes into the
-- canonical cashflow_entries table (004), NOT a parallel expense system.

-- =============================================================================
-- 1. receipts storage bucket (private).
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: path convention is {business_id}/{receipt_id}.{ext} — the
-- first segment is the business, gated by membership (same pattern as the
-- meeting-recordings bucket). Private bucket: signed URLs only.
DROP POLICY IF EXISTS "receipts_business_select" ON storage.objects;
CREATE POLICY "receipts_business_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (split_part(name, '/', 1))::uuid IN (SELECT business_id FROM public.get_current_staff())
  );

DROP POLICY IF EXISTS "receipts_business_insert" ON storage.objects;
CREATE POLICY "receipts_business_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (split_part(name, '/', 1))::uuid IN (SELECT business_id FROM public.get_current_staff())
  );

DROP POLICY IF EXISTS "receipts_business_update" ON storage.objects;
CREATE POLICY "receipts_business_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (split_part(name, '/', 1))::uuid IN (SELECT business_id FROM public.get_current_staff())
  );

DROP POLICY IF EXISTS "receipts_business_delete" ON storage.objects;
CREATE POLICY "receipts_business_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (split_part(name, '/', 1))::uuid IN (SELECT business_id FROM public.get_current_staff())
  );

-- =============================================================================
-- 2. receipt_documents — original document + extracted structured data.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.receipt_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'extracted', 'confirmed', 'rejected')),
  raw_text TEXT,
  -- Extracted structured fields
  vendor TEXT,
  receipt_number TEXT,
  receipt_date DATE,
  currency TEXT NOT NULL DEFAULT 'NGN',
  subtotal NUMERIC(14,2),
  tax NUMERIC(14,2),
  discount NUMERIC(14,2),
  total NUMERIC(14,2),
  payment_method TEXT,
  category TEXT,
  expense_account TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_confidence NUMERIC(4,3),
  -- Confirmation / linkage
  linked_transaction_id UUID REFERENCES public.cashflow_entries(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_documents_business_all ON public.receipt_documents;
CREATE POLICY receipt_documents_business_all ON public.receipt_documents
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP TRIGGER IF EXISTS trg_receipt_documents_updated_at ON public.receipt_documents;
CREATE TRIGGER trg_receipt_documents_updated_at
  BEFORE UPDATE ON public.receipt_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_receipt_documents_business_status
  ON public.receipt_documents (business_id, status);

COMMENT ON TABLE public.receipt_documents IS
  'Internal Receipt OCR: original document (private storage) + deterministic extracted fields + per-field confidence + human confirmation linkage to cashflow_entries. No external OCR SaaS.';

-- =============================================================================
-- 3. create_receipt_upload_path — creates a pending row + private storage path
--    (mirrors the meeting recording signed-path pattern, §32).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_receipt_upload_path(p_filename TEXT)
RETURNS TABLE(p_receipt_id UUID, p_storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_receipt_id UUID;
  v_path TEXT;
  v_ext TEXT;
BEGIN
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can upload receipts.' USING ERRCODE = '42501';
  END IF;

  v_ext := lower(COALESCE(NULLIF(split_part(p_filename, '.', -1), ''), 'jpg'));
  IF v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp') THEN
    RAISE EXCEPTION 'Unsupported file type. Use a receipt image (jpg/png/webp).' USING ERRCODE = '23514';
  END IF;

  v_receipt_id := gen_random_uuid();
  v_path := v_staff.business_id::TEXT || '/' || v_receipt_id::TEXT || '.' || v_ext;

  INSERT INTO public.receipt_documents (id, business_id, uploaded_by, storage_path, original_filename, status)
  VALUES (v_receipt_id, v_staff.business_id, v_staff.id, v_path, p_filename, 'uploaded');

  RETURN QUERY SELECT v_receipt_id, v_path;
END
$$;

REVOKE EXECUTE ON FUNCTION public.create_receipt_upload_path(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_receipt_upload_path(TEXT) TO authenticated;

-- =============================================================================
-- 4. finalize_receipt_extraction — stores the OCR text + extracted structured
--    fields (computed client-side by the deterministic parser).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.finalize_receipt_extraction(
  p_receipt_id UUID,
  p_raw_text TEXT,
  p_fields JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can finalize receipts.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.receipt_documents SET
    status = 'extracted',
    raw_text = p_raw_text,
    vendor = NULLIF(p_fields->>'vendor', ''),
    receipt_number = NULLIF(p_fields->>'receipt_number', ''),
    receipt_date = NULLIF(p_fields->>'receipt_date', '')::DATE,
    currency = COALESCE(NULLIF(p_fields->>'currency', ''), 'NGN'),
    subtotal = NULLIF(p_fields->>'subtotal', '')::NUMERIC,
    tax = NULLIF(p_fields->>'tax', '')::NUMERIC,
    discount = NULLIF(p_fields->>'discount', '')::NUMERIC,
    total = NULLIF(p_fields->>'total', '')::NUMERIC,
    payment_method = NULLIF(p_fields->>'payment_method', ''),
    category = NULLIF(p_fields->>'category', ''),
    expense_account = NULLIF(p_fields->>'expense_account', ''),
    line_items = COALESCE(p_fields->'line_items', '[]'::jsonb),
    field_confidence = COALESCE(p_fields->'field_confidence', '{}'::jsonb),
    overall_confidence = NULLIF(p_fields->>'overall_confidence', '')::NUMERIC
  WHERE id = p_receipt_id
    AND business_id = v_staff.business_id
    AND status IN ('uploaded', 'processing', 'extracted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found or already confirmed.' USING ERRCODE = 'P0002';
  END IF;
  RETURN TRUE;
END
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_receipt_extraction(UUID, TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.finalize_receipt_extraction(UUID, TEXT, JSONB) TO authenticated;

-- =============================================================================
-- 5. confirm_receipt — the HUMAN GATE: turns the extracted receipt into a real
--    cashflow expense entry (004) and links it. Idempotent (a confirmed
--    receipt cannot create a second entry).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.confirm_receipt(p_receipt_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_receipt RECORD;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can confirm receipts.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_receipt FROM public.receipt_documents
  WHERE id = p_receipt_id AND business_id = v_staff.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already confirmed -> return the existing link.
  IF v_receipt.status = 'confirmed' AND v_receipt.linked_transaction_id IS NOT NULL THEN
    RETURN v_receipt.linked_transaction_id;
  END IF;

  IF v_receipt.status NOT IN ('extracted') THEN
    RAISE EXCEPTION 'Receipt must be extracted before confirmation.' USING ERRCODE = '23514';
  END IF;

  IF v_receipt.total IS NULL OR v_receipt.total <= 0 THEN
    RAISE EXCEPTION 'A receipt needs a total amount before it can be confirmed.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.cashflow_entries (business_id, type, category, amount, description, date, staff_id)
  VALUES (
    v_receipt.business_id,
    'expense',
    COALESCE(v_receipt.category, 'operations'),
    v_receipt.total,
    COALESCE('Receipt: ' || v_receipt.vendor, 'Receipt ' || COALESCE(v_receipt.receipt_number, p_receipt_id::TEXT)),
    COALESCE(v_receipt.receipt_date, CURRENT_DATE),
    v_staff.id
  )
  RETURNING id INTO v_entry_id;

  UPDATE public.receipt_documents SET
    status = 'confirmed',
    linked_transaction_id = v_entry_id,
    confirmed_by = v_staff.id,
    confirmed_at = now()
  WHERE id = p_receipt_id;

  RETURN v_entry_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_receipt(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.confirm_receipt(UUID) TO authenticated;

-- =============================================================================
-- 6. reject_receipt — human rejects a bad extraction (kept for audit; never
--    deletes the original document silently).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reject_receipt(p_receipt_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can reject receipts.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.receipt_documents SET status = 'rejected'
  WHERE id = p_receipt_id
    AND business_id = v_staff.business_id
    AND status IN ('uploaded', 'processing', 'extracted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found or already confirmed.' USING ERRCODE = 'P0002';
  END IF;
  RETURN TRUE;
END
$$;

REVOKE EXECUTE ON FUNCTION public.reject_receipt(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reject_receipt(UUID) TO authenticated;
