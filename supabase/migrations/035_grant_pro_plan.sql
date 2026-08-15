-- Migration: Grant Pro Plan Access
-- Business ID: 77e04e11-d6b1-4e11-a38e-5698fde12ce6
-- Data migration: only applies if the specific business exists (CI may not have it).
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM businesses WHERE id = '77e04e11-d6b1-4e11-a38e-5698fde12ce6') THEN
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
    SET plan = 'pro', updated_at = NOW()
    WHERE business_id = '77e04e11-d6b1-4e11-a38e-5698fde12ce6';
  END IF;
END $$;
