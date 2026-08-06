-- Migration: Grant Pro Plan Access
-- Business ID: 77e04e11-d6b1-4e11-a38e-5698fde12ce6
-- ============================================

-- Update business entitlements to Pro plan
UPDATE business_entitlements 
SET 
  plan = 'professional',
  team_limit = 50,
  storage_limit_mb = 500,
  features = get_plan_features('professional'),
  updated_at = NOW()
WHERE business_id = '77e04e11-d6b1-4e11-a38e-5698fde12ce6';

-- If no entitlements record exists, create one
INSERT INTO business_entitlements (business_id, plan, team_limit, storage_limit_mb, features)
VALUES (
  '77e04e11-d6b1-4e11-a38e-5698fde12ce6',
  'professional',
  50,
  500,
  get_plan_features('professional')
)
ON CONFLICT (business_id) DO UPDATE
SET 
  plan = 'professional',
  team_limit = 50,
  storage_limit_mb = 500,
  features = get_plan_features('professional'),
  updated_at = NOW();

-- Also update the staff record to reflect pro plan
UPDATE staff
SET 
  plan = 'pro',
  updated_at = NOW()
WHERE business_id = '77e04e11-d6b1-4e11-a38e-5698fde12ce6';

-- Log the upgrade
INSERT INTO audit_log (business_id, action, details, created_at)
VALUES (
  '77e04e11-d6b1-4e11-a38e-5698fde12ce6',
  'plan_upgrade',
  jsonb_build_object(
    'plan', 'professional',
    'previous_plan', 'free',
    'team_limit', 50,
    'storage_limit_mb', 500
  ),
  NOW()
)
ON CONFLICT DO NOTHING;
