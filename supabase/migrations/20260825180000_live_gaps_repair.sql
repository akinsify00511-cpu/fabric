-- ============================================================================
-- 20260825180000_live_gaps_repair.sql
-- Forward-only reconciliation for verified production gaps (2026-08-25,
-- probed against the live DB with the publishable key, apikey-only):
--
--   1. get_current_staff() EXISTS but EXECUTE is denied to anon/authenticated
--      (live evidence: 42501 "permission denied for function get_current_staff"
--      on every RLS-protected table read). This silently broke ALL table
--      reads whose policies evaluate get_current_staff(). Repair = grant
--      EXECUTE. The function body is NOT redefined here (do not recreate).
--
--   2. budgets               — PGRST205 genuinely missing (canonical: 039)
--   3. entity_freshness      — PGRST205 genuinely missing (canonical: 058)
--   4. entity_freshness_status — PGRST205 genuinely missing (canonical: 058,
--      hardened to security_barrier + get_current_staff per 080)
--
-- Constitutional constraints honored:
--   - FORWARD-ONLY: creates only verified-missing objects; never drops, never
--     recreates existing objects, never touches data.
--   - Canonical tenant isolation: policies use get_current_staff(), never
--     USING(true), never the businesses-subquery leak pattern.
--   - Idempotent: safe to re-apply.
--   - No security weakening: RLS enabled + granted narrowly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_current_staff EXECUTE grants (the 42501 repair)
--    Guarded: only grants if the function exists; role-guarded so the same
--    file applies cleanly on bare postgres:15 (no anon/authenticated roles).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_current_staff'
  ) THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_current_staff() TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_current_staff() TO authenticated';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. budgets (canonical shape from 039_operations_backbone.sql)
--    Frontend consumer: src/pages/Budgets.tsx (select *, departments(name),
--    cost_centers(name); insert/update/delete scoped by business_id).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_type TEXT DEFAULT 'yearly' CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  allocated_amount DECIMAL(15,2) DEFAULT 0,
  spent_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'overbudget')),
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_business ON public.budgets(business_id);
CREATE INDEX IF NOT EXISTS idx_budgets_fiscal ON public.budgets(fiscal_year);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgets_tenant_select ON public.budgets;
CREATE POLICY budgets_tenant_select ON public.budgets FOR SELECT
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));
DROP POLICY IF EXISTS budgets_tenant_insert ON public.budgets;
CREATE POLICY budgets_tenant_insert ON public.budgets FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));
DROP POLICY IF EXISTS budgets_tenant_update ON public.budgets;
CREATE POLICY budgets_tenant_update ON public.budgets FOR UPDATE
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));
DROP POLICY IF EXISTS budgets_tenant_delete ON public.budgets;
CREATE POLICY budgets_tenant_delete ON public.budgets FOR DELETE
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- ----------------------------------------------------------------------------
-- 3. entity_freshness (canonical shape from 058_business_event_bus.sql)
--    Consumers: handler_update_entity_freshness (event bus), SelfAudit.tsx,
--    businessOS.ts freshness reads.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ,
  last_event_id UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_freshness_entity
  ON public.entity_freshness(business_id, entity_type, entity_id);

ALTER TABLE public.entity_freshness ENABLE ROW LEVEL SECURITY;

-- Canonical tenant isolation (080), NOT the 058 businesses-subquery pattern.
DROP POLICY IF EXISTS entity_freshness_viewable ON public.entity_freshness;
CREATE POLICY entity_freshness_viewable ON public.entity_freshness FOR SELECT
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS entity_freshness_tenant_insert ON public.entity_freshness;
CREATE POLICY entity_freshness_tenant_insert ON public.entity_freshness FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS entity_freshness_tenant_update ON public.entity_freshness;
CREATE POLICY entity_freshness_tenant_update ON public.entity_freshness FOR UPDATE
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- ----------------------------------------------------------------------------
-- 4. entity_freshness_status view (058 definition, hardened per 080:
--    security_barrier so the underlying table RLS is enforced through the view)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.entity_freshness_status;
CREATE VIEW public.entity_freshness_status WITH (security_barrier = true) AS
SELECT
  id, business_id, entity_type, entity_id,
  last_event_type, last_event_at, updated_at,
  CASE
    WHEN last_event_at IS NULL THEN 'unknown'
    WHEN now() - last_event_at < interval '1 hour' THEN 'fresh'
    WHEN now() - last_event_at < interval '24 hours' THEN 'today'
    WHEN now() - last_event_at < interval '7 days' THEN 'stale'
    ELSE 'old'
  END AS freshness_tier,
  CASE WHEN last_event_at IS NULL THEN NULL
       ELSE EXTRACT(EPOCH FROM (now() - last_event_at))::INTEGER END AS seconds_since_update
FROM public.entity_freshness;

-- ----------------------------------------------------------------------------
-- 5. Grants (guarded for bare postgres:15, which lacks Supabase roles)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.entity_freshness TO authenticated';
    EXECUTE 'GRANT SELECT ON public.entity_freshness_status TO authenticated';
  END IF;
END $$;

COMMENT ON TABLE public.budgets IS
  'Canonical finance budgets (039). Recreated forward-only on 2026-08-25 after live probe confirmed PGRST205 missing.';
COMMENT ON TABLE public.entity_freshness IS
  'Canonical freshness ledger (058). Recreated forward-only on 2026-08-25 after live probe confirmed PGRST205 missing.';
