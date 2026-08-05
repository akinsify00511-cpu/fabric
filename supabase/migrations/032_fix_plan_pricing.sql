-- Migration: Fix plan pricing and correct existing plan_payments
-- ============================================

-- First, let's fix the incorrect plan payment
-- Update the pro plan amount from 15000 to 186000
UPDATE plan_payments 
SET amount = 186000.00 
WHERE id = 'b6261ea4-42a7-411c-a3fd-3df48886475b';

-- Create plan_pricing table for reference
CREATE TABLE IF NOT EXISTS plan_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan TEXT UNIQUE NOT NULL CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  display_name TEXT NOT NULL,
  monthly_amount DECIMAL(15,2) NOT NULL,
  yearly_amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  features JSONB, -- list of features included
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert correct Nigerian pricing (Naira)
INSERT INTO plan_pricing (plan, display_name, monthly_amount, yearly_amount, features) VALUES
  ('free', 'Free', 0, 0, '["Basic CRM", "Up to 3 staff", "100 contacts", "5 deals"]'::jsonb),
  ('starter', 'Starter', 25000, 250000, '["Full CRM", "Up to 10 staff", "1000 contacts", "50 deals", "Invoicing", "Basic Reports"]'::jsonb),
  ('pro', 'Pro', 186000, 1860000, '["Everything in Starter", "Unlimited staff", "Unlimited contacts/deals", "Payroll", "Branches", "Multi-location", "Advanced Reports", "API Access", "Priority Support"]'::jsonb),
  ('enterprise', 'Enterprise', 500000, 5000000, '["Everything in Pro", "Custom integrations", "Dedicated support", "SLA guarantee", "Custom development"]'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  monthly_amount = EXCLUDED.monthly_amount,
  yearly_amount = EXCLUDED.yearly_amount,
  features = EXCLUDED.features;

-- Update the grant_business_plan function to use correct amounts
-- Drop existing function first
DROP FUNCTION IF EXISTS grant_business_plan(UUID, TEXT, TEXT, DECIMAL, TEXT, TEXT);

-- Create updated function with correct pricing
CREATE OR REPLACE FUNCTION grant_business_plan(
  p_business_id UUID,
  p_plan TEXT, -- 'free', 'starter', 'pro', 'enterprise'
  p_billing_cycle TEXT, -- 'monthly' or 'yearly'
  p_amount DECIMAL DEFAULT NULL, -- if NULL, auto-calculate from plan_pricing
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
  -- Get plan pricing if not provided
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
      -- Default period calculation if plan_pricing not set up
      IF p_billing_cycle = 'yearly' THEN
        v_period_end := v_period_start + INTERVAL '1 year';
      ELSE
        v_period_end := v_period_start + INTERVAL '30 days';
      END IF;
    END IF;
  ELSE
    -- Use provided amount, calculate period
    IF p_billing_cycle = 'yearly' THEN
      v_period_end := v_period_start + INTERVAL '1 year';
    ELSE
      v_period_end := v_period_start + INTERVAL '30 days';
    END IF;
  END IF;

  -- Update business plan
  UPDATE businesses 
  SET plan = p_plan, 
      plan_expires_at = v_period_end,
      billing_cycle = p_billing_cycle,
      updated_at = NOW()
  WHERE id = p_business_id;

  -- Record in plan_payments
  INSERT INTO plan_payments (business_id, plan, billing_cycle, amount, currency, period_start, period_end, source, paystack_reference, granted_by)
  VALUES (p_business_id, p_plan, p_billing_cycle, p_amount, 'NGN', v_period_start, v_period_end, p_source, p_paystack_reference, p_granted_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION grant_business_plan TO authenticated;
