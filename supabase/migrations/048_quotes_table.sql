-- Quotes table — moves quote storage from client localStorage to Supabase
-- so quotes persist across devices/sessions and respect RLS.

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  deal_id UUID REFERENCES deals(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_address TEXT,
  title TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'converted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_business_id ON quotes(business_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_deal_id ON quotes(deal_id);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Staff can see quotes for their own business.
CREATE POLICY "Staff can view own business quotes"
  ON quotes FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert own business quotes"
  ON quotes FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update own business quotes"
  ON quotes FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can delete own business quotes"
  ON quotes FOR DELETE
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  );

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION touch_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION touch_quotes_updated_at();
