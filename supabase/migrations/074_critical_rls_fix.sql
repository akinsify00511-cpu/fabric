-- ============================================
-- CRITICAL RLS FIX: Remove "Allow all" permissive policies on core tables
--
-- Migration 041 created `USING (true) WITH CHECK (true)` policies on
-- businesses, staff, business_branding, and user_xp. No later migration
-- ever dropped them. In Postgres RLS, multiple permissive policies for
-- the same command combine with OR, so even the restrictive policies
-- added by 998/999 on user_xp were effectively bypassed.
--
-- CONSEQUENCE: ANY authenticated user could read, insert, update, or
-- delete ANY business record, ANY staff record, ANY branding record,
-- and ANY user's XP — across ALL tenants. This completely broke
-- multi-tenant isolation.
--
-- Signup/invite flows are unaffected because create_business_and_owner
-- and accept_invite are SECURITY DEFINER functions that bypass RLS.
-- ============================================

\set ON_ERROR_STOP on

-- ============================================
-- 1. BUSINESSES
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on businesses" ON businesses;
DROP POLICY IF EXISTS "Users see own business" ON businesses;
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Businesses insert" ON businesses;

-- Users can see the business they belong to
CREATE POLICY "businesses_own_select"
  ON businesses FOR SELECT
  USING (id IN (SELECT business_id FROM get_current_staff()));

-- Owner/admin of the business can update it
CREATE POLICY "businesses_own_update"
  ON businesses FOR UPDATE
  USING (id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (id IN (SELECT business_id FROM get_current_staff()));

-- Direct INSERT is blocked — business creation must go through the
-- create_business_and_owner SECURITY DEFINER RPC (which bypasses RLS).
-- This prevents users from creating arbitrary businesses or inserting
-- into other tenants' business rows.

-- ============================================
-- 2. STAFF
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on staff" ON staff;
DROP POLICY IF EXISTS "Staff see same business" ON staff;
DROP POLICY IF EXISTS "Owners/managers can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Staff insert" ON staff;
DROP POLICY IF EXISTS "staff_update_own_profile" ON staff;
DROP POLICY IF EXISTS "staff_read_own_profile" ON staff;

-- Users can see all staff in their own business
CREATE POLICY "staff_business_select"
  ON staff FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users can update their own profile (non-role fields)
CREATE POLICY "staff_self_update"
  ON staff FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owners/admins can manage staff in their business (insert/update/delete)
CREATE POLICY "staff_admin_manage"
  ON staff FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM get_current_staff()
      WHERE role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM get_current_staff()
      WHERE role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 3. BUSINESS_BRANDING
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on branding" ON business_branding;
DROP POLICY IF EXISTS "Allow all on business_branding" ON business_branding;
DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Branding insert" ON business_branding;

-- Users can see their own business branding
CREATE POLICY "branding_business_select"
  ON business_branding FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users in the business can update branding
CREATE POLICY "branding_business_update"
  ON business_branding FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users in the business can insert branding
CREATE POLICY "branding_business_insert"
  ON business_branding FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 4. USER_XP
-- ============================================

-- Drop ALL existing policies (permissive + restrictive that were OR-bypassed)
DROP POLICY IF EXISTS "Allow all on user_xp" ON user_xp;
DROP POLICY IF EXISTS "XP own" ON user_xp;
DROP POLICY IF EXISTS "Users can view their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can update their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can insert their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can view own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can update own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can insert own XP" ON user_xp;

-- Users can only access their own XP record
CREATE POLICY "user_xp_own_select"
  ON user_xp FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_xp_own_insert"
  ON user_xp FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_xp_own_update"
  ON user_xp FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_xp_own_delete"
  ON user_xp FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- Done
-- ============================================
SELECT 'Critical RLS policies restored on businesses, staff, business_branding, user_xp' as status;
