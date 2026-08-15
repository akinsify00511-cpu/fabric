-- ============================================================================
-- Migration 044: Property vertical completion — owners, tenants, sales,
--                commissions + portal-scoped RLS
-- ----------------------------------------------------------------------------
-- Closes the gap between the existing 039_property_management.sql (which built
-- properties, lease_agreements, rent_payments, maintenance_requests,
-- property_inspections) and what the Architecture §13.3 spec and the property
-- personas actually need:
--   * Property Owner   — sees their properties, payouts, statements via portal
--   * Tenant           — sees their lease, rent due, raises maintenance
--   * Sales Agent      — records an offer, drives it to completion
--   * Property Manager — approves commission splits before payout
--
-- 039 deliberately scoped owners/tenants to the existing `clients` table. This
-- migration adds the dedicated owner/tenant records + portal access + the sales
-- and commission flows that 039 omitted, WITHOUT touching 039's tables.
-- ============================================================================

\set ON_ERROR_STOP on

-- reuse the defensive helper from 043 (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. PROPERTY OWNERS  (a landlord who may own several properties)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_owners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  payout_bank_details JSONB DEFAULT '{}'::jsonb,       -- account no, bank code (never raw BVN)
  portal_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;
-- Business staff manage owners within their tenancy.
CREATE POLICY "owners_business_all" ON public.property_owners
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
-- An owner reads their own record via portal (matched on auth uid).
CREATE POLICY "owners_self_select" ON public.property_owners
  FOR SELECT USING (portal_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_owners_business ON public.property_owners(business_id);
CREATE OR REPLACE TRIGGER owners_updated_at BEFORE UPDATE ON public.property_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Link 039's properties.owner_id to property_owners (currently FK->clients).
-- We add a dedicated column rather than repointing the existing FK, so 039's
-- clients-based owners keep working during the transition.
DO $$ BEGIN
  ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS owner_id_uuid UUID REFERENCES public.property_owners(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'properties table not found, skipping'; END $$;

-- ============================================================================
-- 2. TENANTS  (the renting party — distinct from a generic CRM contact)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  emergency_contact JSONB DEFAULT '{}'::jsonb,
  portal_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_business_all" ON public.tenants
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE POLICY "tenants_self_select" ON public.tenants
  FOR SELECT USING (portal_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_tenants_business ON public.tenants(business_id);
CREATE OR REPLACE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Link lease_agreements to the dedicated tenant record (039 used clients).
DO $$ BEGIN
  ALTER TABLE public.lease_agreements ADD COLUMN IF NOT EXISTS tenant_id_uuid UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'lease_agreements not found, skipping'; END $$;

-- ============================================================================
-- 3. PROPERTY SALES  (offer -> accepted -> contract -> completion)
--    Persona: Sales Agent records offers; manager closes the sale.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  buyer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id         UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  offer_amount     DECIMAL(15, 2) NOT NULL,
  currency         TEXT DEFAULT 'NGN',
  status           TEXT NOT NULL DEFAULT 'offer'
                   CHECK (status IN ('offer','accepted','contract','completed','fell_through')),
  sale_date        DATE,
  completion_date  DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.property_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_business_all" ON public.property_sales
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_sales_property ON public.property_sales(property_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.property_sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.property_sales(agent_id) WHERE agent_id IS NOT NULL;
CREATE OR REPLACE TRIGGER sales_updated_at BEFORE UPDATE ON public.property_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 4. PROPERTY COMMISSIONS  (split-rule payout, approval-gated)
--    Persona: agent earns; Property Manager approves before Finance pays.
--    Reuses the existing approvals engine via approval_id FK.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_commissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  property_sale_id    UUID REFERENCES public.property_sales(id) ON DELETE CASCADE,
  lease_id            UUID REFERENCES public.lease_agreements(id) ON DELETE CASCADE,
  agent_id            UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  -- split rules (each defaults to 0 so a single-agent sale needs only agent_split_pct)
  agency_split_pct    DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (agency_split_pct >= 0),
  agent_split_pct     DECIMAL(5, 2) NOT NULL DEFAULT 100 CHECK (agent_split_pct >= 0),
  referral_split_pct  DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (referral_split_pct >= 0),
  gross_amount        DECIMAL(15, 2) NOT NULL,
  currency            TEXT DEFAULT 'NGN',
  status              TEXT NOT NULL DEFAULT 'pending_approval'
                      CHECK (status IN ('pending_approval','approved','paid','disputed','voided')),
  approval_id         UUID,                              -- references approvals(id)
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
DO $$ BEGIN
  ALTER TABLE public.property_commissions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "commissions_business_all" ON public.property_commissions
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'property_commissions not found, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_commissions_business ON public.property_commissions(business_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.property_commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_agent ON public.property_commissions(agent_id) WHERE agent_id IS NOT NULL;
CREATE OR REPLACE TRIGGER commissions_updated_at BEFORE UPDATE ON public.property_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Wire approval_id to approvals(id) if that table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approvals') THEN
    ALTER TABLE public.property_commissions
      ADD CONSTRAINT commission_approval_fk
      FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

-- ============================================================================
-- 5. AUDIT  (sales + commissions are financially material)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_property_commission()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (business_id, action, entity_type, entity_id, new_values)
  VALUES (NEW.business_id, 'create', 'property_commission', NEW.id,
          jsonb_build_object('status', NEW.status, 'gross_amount', NEW.gross_amount,
                             'agent_split_pct', NEW.agent_split_pct))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_property_commission_insert ON public.property_commissions;
CREATE OR REPLACE TRIGGER audit_property_commission_insert
  AFTER INSERT ON public.property_commissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_property_commission();
