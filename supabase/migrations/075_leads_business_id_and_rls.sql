-- ============================================
-- LEADS TABLE: Add business_id + fix cross-tenant RLS
--
-- The leads table (migration 041) was created WITHOUT a business_id
-- column, but the frontend (Leads.tsx, crm.ts) filters by business_id —
-- so queries silently returned nothing and the lead pipeline was broken.
-- The RLS policy also allowed ANY authenticated user to see ALL
-- unassigned leads across ALL businesses (cross-tenant leak).
--
-- This migration:
-- 1. Adds business_id (nullable — existing leads and platform-level
--    leads have no business)
-- 2. Drops the permissive "unassigned visible to all" policy
-- 3. Restores business-scoped RLS
-- 4. Adds an index for the business_id filter
-- ============================================

\set ON_ERROR_STOP on

-- 1. Add business_id column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- 2. Index for the common query pattern
CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_id, created_at DESC);

-- 3. Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can create leads" ON leads;
DROP POLICY IF EXISTS "Users can view business leads" ON leads;
DROP POLICY IF EXISTS "Users can update assigned leads" ON leads;

-- 4. New RLS policies

-- Public insert: anonymous users can submit a lead for a specific business
-- (business_id is provided by the public form). Platform-level leads
-- (business_id NULL) are also allowed from the public marketing form.
CREATE POLICY "leads_public_insert"
  ON leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

-- Business members can see leads scoped to their business
CREATE POLICY "leads_business_select"
  ON leads FOR SELECT
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Business members can update leads in their business
CREATE POLICY "leads_business_update"
  ON leads FOR UPDATE
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Business members can delete leads in their business
CREATE POLICY "leads_business_delete"
  ON leads FOR DELETE
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- Done
-- ============================================
SELECT 'leads table: business_id added, RLS scoped to business' as status;

-- ============================================
-- CONTACTS: Add traceability columns used by crm.ts convertLeadToContact
-- The contacts table (migration 001) only has: name, email, phone,
-- company, deal_id. The lead-conversion code inserts full_name, source,
-- lead_id, notes — none of which exist. Add them so the pipeline works.
-- ============================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS full_name TEXT;

-- full_name is the human-readable name; populate from name for existing rows
UPDATE contacts SET full_name = name WHERE full_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id) WHERE lead_id IS NOT NULL;
