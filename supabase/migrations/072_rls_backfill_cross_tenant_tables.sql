-- ============================================
-- RLS BACKFILL: 12 tables queried from frontend but missing RLS
-- These tables have business_id columns but no row-level security policies,
-- meaning ANY authenticated user could read/write ALL businesses' data.
-- Cross-tenant data leak fix.
-- ============================================

\set ON_ERROR_STOP on

-- ============================================
-- 1. recognition — CompanyWall.tsx
-- ============================================
DO $$ BEGIN
  ALTER TABLE recognition ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "recognition business read"
    ON recognition FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  CREATE POLICY "recognition business write"
    ON recognition FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'recognition not found, skipping'; END $$;

-- ============================================
-- 2. polls — CompanyWall.tsx
-- ============================================
DO $$ BEGIN
  ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "polls business read"
    ON polls FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  CREATE POLICY "polls business write"
    ON polls FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'polls not found, skipping'; END $$;

-- ============================================
-- 3. poll_votes — CompanyWall.tsx
-- ============================================
DO $$ BEGIN
  ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "poll_votes business read"
    ON poll_votes FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  CREATE POLICY "poll_votes business write"
    ON poll_votes FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'poll_votes not found, skipping'; END $$;

-- ============================================
-- 4. legal_cases
-- ============================================
DO $$ BEGIN
  ALTER TABLE legal_cases ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "legal_cases business read"
  ON legal_cases FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_cases business write"
  ON legal_cases FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'legal_cases not found, skipping'; END $$;
-- ============================================
-- 5. legal_contracts
-- ============================================
DO $$ BEGIN
  ALTER TABLE legal_contracts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "legal_contracts business read"
  ON legal_contracts FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_contracts business write"
  ON legal_contracts FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'legal_contracts not found, skipping'; END $$;
-- ============================================
-- 6. legal_obligations
-- ============================================
DO $$ BEGIN
  ALTER TABLE legal_obligations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "legal_obligations business read"
  ON legal_obligations FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_obligations business write"
  ON legal_obligations FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'legal_obligations not found, skipping'; END $$;
-- ============================================
-- 7. decision_log
-- ============================================
DO $$ BEGIN
  ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "decision_log business read"
    ON decision_log FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  
  CREATE POLICY "decision_log business write"
    ON decision_log FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'decision_log not found, skipping'; END $$;

-- ============================================
-- 8. organizational_memory
-- ============================================
DO $$ BEGIN
  ALTER TABLE organizational_memory ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "organizational_memory business read"
    ON organizational_memory FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  
  CREATE POLICY "organizational_memory business write"
    ON organizational_memory FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'organizational_memory not found, skipping'; END $$;

-- ============================================
-- 9. reality_gaps
-- ============================================
DO $$ BEGIN
  ALTER TABLE reality_gaps ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "reality_gaps business read"
  ON reality_gaps FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "reality_gaps business write"
  ON reality_gaps FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'reality_gaps not found, skipping'; END $$;
-- ============================================
-- 10. purchase_requests — procurement
-- ============================================
DO $$ BEGIN
  ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "purchase_requests business read"
    ON purchase_requests FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  CREATE POLICY "purchase_requests business write"
    ON purchase_requests FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'purchase_requests not found, skipping';
END $$;

-- ============================================
-- 11. rfqs — procurement (Request for Quotation)
-- ============================================
DO $$ BEGIN
  ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "rfqs business read"
    ON rfqs FOR SELECT
    USING (business_id IN (SELECT business_id FROM get_current_staff()));
  
  CREATE POLICY "rfqs business write"
    ON rfqs FOR ALL
    USING (business_id IN (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'rfqs not found, skipping';
END $$;
-- ============================================
-- 12. payroll_items — no direct business_id, joins via payroll_runs
-- ============================================
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items business read"
  ON payroll_items FOR SELECT
  USING (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ));

CREATE POLICY "payroll_items business write"
  ON payroll_items FOR ALL
  USING (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ))
  WITH CHECK (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ));

-- ============================================
-- 13. xp_history — PHANTOM TABLE (GamificationContext inserts into it
--     but no migration ever created it; every XP award silently fails)
-- ============================================
CREATE TABLE IF NOT EXISTS xp_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_history_user ON xp_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_history_business ON xp_history(business_id, created_at DESC);

ALTER TABLE xp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xp_history own user read"
  ON xp_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "xp_history own user insert"
  ON xp_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- 14. approval_rules — PHANTOM TABLE (approvalWorkflow.ts queries it
--     but no migration ever created it; functions are currently dead
--     code but referenced by Approvals.tsx type imports)
-- ============================================
CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  min_amount DECIMAL(15,2),
  max_amount DECIMAL(15,2),
  required_approvers JSONB NOT NULL DEFAULT '[]',
  conditions JSONB DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_rules_business ON approval_rules(business_id, type, active);

ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_rules business read"
  ON approval_rules FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "approval_rules business write"
  ON approval_rules FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));
