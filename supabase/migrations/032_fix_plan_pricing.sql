-- Migration: Update plan pricing with correct Nigerian Naira amounts
-- ============================================

-- First, fix the incorrect plan payment (was 15,000, should be 186,000)
UPDATE plan_payments 
SET amount = 186000.00 
WHERE id = 'b6261ea4-42a7-411c-a3fd-3df48886475b';

-- Create plan_pricing table for reference
CREATE TABLE IF NOT EXISTS plan_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan TEXT UNIQUE NOT NULL CHECK (plan IN ('free', 'starter', 'team', 'business', 'pro', 'scale')),
  display_name TEXT NOT NULL,
  monthly_amount DECIMAL(15,2) NOT NULL,
  yearly_amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  seats_min INTEGER DEFAULT 1,
  seats_max INTEGER,
  features JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert correct Nigerian pricing (Founding Rates)
INSERT INTO plan_pricing (plan, display_name, monthly_amount, yearly_amount, seats_min, seats_max, features) VALUES
  ('free', 'Free', 0, 0, 1, 5, '["Core job tracking", "Basic CRM"]'::jsonb),
  ('starter', 'Starter', 15000, 150000, 1, 5, '["Core job & project tracking", "Invoicing with VAT & WHT", "Basic inventory (single location)", "CRM basics", "5 team members"]'::jsonb),
  ('team', 'Team', 48000, 480000, 6, 15, '["Everything in Starter", "Advanced CRM with AI insights", "Department groups & tasks", "Offline field sync", "Priority support"]'::jsonb),
  ('business', 'Business', 112000, 1120000, 16, 30, '["Everything in Team", "Multi-location inventory", "Client communication log", "Advanced reporting", "Custom integrations"]'::jsonb),
  ('pro', 'Pro', 186000, 1860000, 31, 75, '["Everything in Business", "Full API access", "Approval workflows", "Dedicated account manager", "Custom onboarding"]'::jsonb),
  ('scale', 'Scale', 380000, 3800000, 76, NULL, '["Everything in Pro", "SSO & data residency", "Priority support", "Custom SLA", "White-label options"]'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  monthly_amount = EXCLUDED.monthly_amount,
  yearly_amount = EXCLUDED.yearly_amount,
  seats_min = EXCLUDED.seats_min,
  seats_max = EXCLUDED.seats_max,
  features = EXCLUDED.features;

-- Create or replace grant_business_plan function
DROP FUNCTION IF EXISTS grant_business_plan(UUID, TEXT, TEXT, DECIMAL, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION grant_business_plan(
  p_business_id UUID,
  p_plan TEXT,
  p_billing_cycle TEXT,
  p_amount DECIMAL DEFAULT NULL,
  p_source TEXT DEFAULT 'manual',
  p_paystack_reference TEXT DEFAULT NULL,
  p_granted_by UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_period_start TIMESTAMPTZ := NOW();
  v_period_end TIMESTAMPTZ;
  v_plan_record RECORD;
BEGIN
  IF p_amount IS NULL THEN
    SELECT * INTO v_plan_record FROM plan_pricing WHERE plan = p_plan;
    IF FOUND THEN
      IF p_billing_cycle = 'yearly' THEN
        p_amount := v_plan_record.yearly_amount;
        v_period_end := v_period_start + INTERVAL '1 year';
      ELSE
        p_amount := v_plan_record.monthly_amount;
        v_period_end := v_period_start + INTERVAL '30 days';
      END IF;
    ELSE
      IF p_billing_cycle = 'yearly' THEN
        v_period_end := v_period_start + INTERVAL '1 year';
      ELSE
        v_period_end := v_period_start + INTERVAL '30 days';
      END IF;
    END IF;
  ELSE
    IF p_billing_cycle = 'yearly' THEN
      v_period_end := v_period_start + INTERVAL '1 year';
    ELSE
      v_period_end := v_period_start + INTERVAL '30 days';
    END IF;
  END IF;

  UPDATE businesses 
  SET plan = p_plan, 
      plan_expires_at = v_period_end,
      billing_cycle = p_billing_cycle,
      updated_at = NOW()
  WHERE id = p_business_id;

  INSERT INTO plan_payments (business_id, plan, billing_cycle, amount, currency, period_start, period_end, source, paystack_reference, granted_by)
  VALUES (p_business_id, p_plan, p_billing_cycle, p_amount, 'NGN', v_period_start, v_period_end, p_source, p_paystack_reference, p_granted_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION grant_business_plan TO authenticated;
