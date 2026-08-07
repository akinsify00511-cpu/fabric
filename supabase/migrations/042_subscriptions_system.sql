-- ============================================
-- Subscriptions System
-- Track subscription details, billing, and payment history
-- ============================================

-- Subscriptions table
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack', 'flutterwave', 'stripe', 'manual')),
  provider_subscription_id TEXT,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_billing_date TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  seats_included INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id)
);

-- Subscription payment history
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES business_subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'paystack',
  provider_payment_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'successful' CHECK (status IN ('successful', 'failed', 'pending', 'refunded')),
  description TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice records
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES business_subscriptions(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  provider_invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'failed', 'refunded', 'void')),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Functions
-- ============================================

-- Function to get active subscription for a business
CREATE OR REPLACE FUNCTION get_business_subscription(p_business_id UUID)
RETURNS business_subscriptions AS $$
DECLARE
  v_subscription business_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_subscription
  FROM business_subscriptions
  WHERE business_id = p_business_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN v_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get subscription payment history
CREATE OR REPLACE FUNCTION get_subscription_payments(p_business_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS SETOF subscription_payments AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM subscription_payments
  WHERE business_id = p_business_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get subscription invoices
CREATE OR REPLACE FUNCTION get_subscription_invoices(p_business_id UUID)
RETURNS SETOF subscription_invoices AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM subscription_invoices
  WHERE business_id = p_business_id
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel subscription
CREATE OR REPLACE FUNCTION cancel_subscription(p_business_id UUID, p_cancel_at_period_end BOOLEAN DEFAULT true)
RETURNS business_subscriptions AS $$
DECLARE
  v_subscription business_subscriptions%ROWTYPE;
BEGIN
  UPDATE business_subscriptions
  SET 
    status = CASE 
      WHEN p_cancel_at_period_end THEN 'active' 
      ELSE 'cancelled' 
    END,
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE business_id = p_business_id
  RETURNING * INTO v_subscription;
  
  RETURN v_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update subscription from webhook
CREATE OR REPLACE FUNCTION update_subscription_from_webhook(
  p_business_id UUID,
  p_provider TEXT,
  p_provider_subscription_id TEXT,
  p_status TEXT,
  p_next_billing_date TIMESTAMPTZ,
  p_amount_cents INTEGER,
  p_plan_code TEXT DEFAULT NULL,
  p_plan_name TEXT DEFAULT NULL
)
RETURNS business_subscriptions AS $$
DECLARE
  v_subscription business_subscriptions%ROWTYPE;
BEGIN
  UPDATE business_subscriptions
  SET
    provider = COALESCE(p_provider, provider),
    provider_subscription_id = COALESCE(p_provider_subscription_id, provider_subscription_id),
    status = COALESCE(p_status, status),
    next_billing_date = COALESCE(p_next_billing_date, next_billing_date),
    amount_cents = COALESCE(p_amount_cents, amount_cents),
    plan_code = COALESCE(p_plan_code, plan_code),
    plan_name = COALESCE(p_plan_name, plan_name),
    updated_at = NOW()
  WHERE business_id = p_business_id
  RETURNING * INTO v_subscription;
  
  RETURN v_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

-- Subscriptions: staff can read own business, admins can manage
CREATE POLICY "Staff can read own business subscriptions"
  ON business_subscriptions FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage subscriptions"
  ON business_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Payments: staff can read own business
CREATE POLICY "Staff can read own subscription payments"
  ON subscription_payments FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage payments"
  ON subscription_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Invoices: staff can read own business
CREATE POLICY "Staff can read own invoices"
  ON subscription_invoices FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage invoices"
  ON subscription_invoices FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_business_subscriptions_updated_at
  BEFORE UPDATE ON business_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_business_id ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_business_id ON subscription_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_business_id ON subscription_invoices(business_id);

-- ============================================
-- Seed demo subscription for existing businesses (optional)
-- ============================================

-- Uncomment to seed test data:
-- INSERT INTO business_subscriptions (business_id, plan_name, status, billing_cycle, amount_cents, next_billing_date)
-- SELECT 
--   id,
--   COALESCE(subscription_tier, 'free'),
--   CASE WHEN subscription_tier IS NOT NULL THEN 'active' ELSE 'trialing' END,
--   'monthly',
--   CASE subscription_tier 
--     WHEN 'starter' THEN 1500000
--     WHEN 'professional' THEN 4800000
--     WHEN 'enterprise' THEN 1860000
--     ELSE 0
--   END,
--   NOW() + INTERVAL '30 days'
-- FROM businesses
-- ON CONFLICT (business_id) DO NOTHING;

COMMENT ON TABLE business_subscriptions IS 'Tracks business subscription details including plan, billing, and status';
COMMENT ON TABLE subscription_payments IS 'Payment history for subscriptions';
COMMENT ON TABLE subscription_invoices IS 'Invoice records for subscriptions';
