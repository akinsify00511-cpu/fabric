-- 057_multi_currency_and_payment_rails.sql
-- Wire multi-currency into the actual ledger and add a payment-provider
-- abstraction so Avenize isn't hard-coupled to Paystack (§11.2 items 4-6).
--
-- Context: exchange_rates + currency_balances + convert_currency() already
-- exist (038_critical_infrastructure), but the ledger tables (accounts,
-- journal_entries, journal_lines), invoices and payments had NO currency
-- column, and businesses had no base_currency — so multi-currency infra
-- was never actually wired into accounting. Payments were Paystack-only.

-- 1. Business base currency (the currency the books are kept in).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (base_currency IN ('USD','NGN','EUR','GBP','GHS','ZAR','KES','CAD','AUD'));

-- 2. Per-row currency on the financial tables. Nullable-but-defaulted so
--    historical rows are treated as the business base currency.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- Backfill: existing rows are in the (previously only) base currency.
UPDATE accounts a SET currency = b.base_currency
  FROM businesses b WHERE a.business_id = b.id AND a.currency IS NULL;
UPDATE journal_entries j SET currency = b.base_currency
  FROM businesses b WHERE j.business_id = b.id AND j.currency IS NULL;
UPDATE journal_lines j SET currency = b.base_currency
  FROM businesses b WHERE j.business_id = b.id AND j.currency IS NULL;
UPDATE invoices i SET currency = b.base_currency
  FROM businesses b WHERE i.business_id = b.id AND i.currency IS NULL;
UPDATE payments p SET currency = b.base_currency
  FROM businesses b WHERE p.business_id = b.id AND p.currency IS NULL;

-- Exchange-rate (stored) for foreign-currency journal entries so the base-
-- currency equivalent is auditable. Rate = 1 base currency unit in foreign
-- currency terms at the time of the entry.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);

CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);
CREATE INDEX IF NOT EXISTS idx_journal_entries_currency ON journal_entries(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON invoices(currency);
CREATE INDEX IF NOT EXISTS idx_payments_currency ON payments(currency);

-- 3. Payment-provider abstraction. A business can configure one or more
--    rails; each row stores the provider type + (encrypted-at-rest by the
--    app) credentials reference and which currencies that rail handles.
CREATE TABLE IF NOT EXISTS payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'paystack', 'stripe', 'flutterwave', 'paypal', 'square', 'manual'
  )),
  label TEXT, -- friendly name shown in UI
  -- Reference to the secret in vault / env, never the raw secret itself.
  credential_ref TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  supported_currencies TEXT[] DEFAULT '{USD}'::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, provider)
);

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_providers_viewable
  ON payment_providers FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY payment_providers_managing
  ON payment_providers FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_payment_providers_business ON payment_providers(business_id);

-- Link a payment to the rail that processed it (Paystack reference today,
-- any provider tomorrow). Null for manually-recorded payments.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_provider_id UUID REFERENCES payment_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT; -- provider's transaction id

CREATE TRIGGER payment_providers_updated_at BEFORE UPDATE ON payment_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Helper: resolve a business's default active provider for a currency.
--    Returns NULL when none configured (manual entry fallback).
CREATE OR REPLACE FUNCTION resolve_payment_provider(p_business_id UUID, p_currency TEXT)
RETURNS TABLE(id UUID, provider TEXT) AS $$
DECLARE
  v_default UUID;
BEGIN
  SELECT id INTO v_default FROM payment_providers
  WHERE business_id = p_business_id AND is_active AND is_default
  ORDER BY created_at LIMIT 1;

  IF v_default IS NOT NULL THEN
    RETURN QUERY SELECT pp.id, pp.provider FROM payment_providers pp
    WHERE pp.id = v_default;
    RETURN;
  END IF;

  -- Fall back to the first active provider that lists the currency.
  RETURN QUERY SELECT pp.id, pp.provider FROM payment_providers pp
  WHERE pp.business_id = p_business_id AND pp.is_active
    AND (p_currency = ANY(pp.supported_currencies) OR array_length(pp.supported_currencies,1) IS NULL)
  ORDER BY pp.created_at LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE payment_providers IS
  'Pluggable payment-rail registry (§11.2 item 6). Decouples payments from any single provider (Paystack).';
COMMENT ON COLUMN businesses.base_currency IS
  'Currency the books are kept in (§11.2 item 4). Ledger rows default to this.';
