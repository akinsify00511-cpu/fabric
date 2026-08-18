-- 20260818250000_multi_role_switching.sql
--
-- §K Owner vs Staff vs Multiple Roles — the genuine personalization gap.
--
-- The directive (checklist §K): a user can hold multiple roles (e.g. an owner
-- who is also Sales + Finance), switch which persona they're operating as, and
-- have the dashboard/notifications/AI lens adapt to the active role.
--
-- Audit first (composition-first — build on the spine):
--   • staff.role (002/024) — a SINGLE business role (owner/admin/manager/
--     team_lead/staff). The security boundary (RLS + permissions.ts use it).
--     NOT replaced — it stays the authoritative primary role.
--   • functional_roles + staff_functional_roles (027) — already MANY-to-many:
--     a staff member CAN have multiple functional roles + useToolAccess already
--     intersects their tool sets. So "combined tool permissions" is PARTIALLY
--     built. NOT duplicated.
--   • permissions.ts ROLE_HIERARCHY — the permission precedence. Reused to
--     compute the effective permission level = MAX(primary, secondary roles).
--   • Dashboard.tsx (Session 21 P0.4 #6) — already role-aware (Focus mode
--     adapts to staff.role). Wired to activeRole so a multi-role user switching
--     to "Sales" sees the sales-persona dashboard.
--
-- The GENUINE gap: staff.role is single-valued (no secondary business roles)
-- + no role-switching active-persona state. Two additions:
--
-- 1. staff_secondary_roles — a staff member can hold secondary business roles
--    beyond their primary staff.role. The effective permission level is the
--    MAX across primary + secondary (UNION — a secondary role can only ADD
--    access the user is entitled to, never remove). RLS: a user can read/write
--    only their own secondary roles (owner/admin can manage anyone's in their
--    business).
--
-- 2. active_role session state — which persona the user is operating as right
--    now. Server-validated: can only be set to a role the user actually holds
--    (primary OR a secondary role). Drives the Dashboard context + AI lens.
--    This is UX/context ONLY — the security boundary stays staff.role + RLS +
--    functional_roles (matches the Session-20 selection-is-UX-not-security
--    principle). A user CANNOT switch to a role they don't hold.
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- staff_secondary_roles: secondary business roles a staff member holds.
-- The primary role stays staff.role; this adds secondary personas.
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_secondary_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','team_lead','staff')),
  label TEXT,  -- optional display override, e.g. "Head of Sales"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, role)
);

CREATE INDEX IF NOT EXISTS idx_staff_secondary_roles_staff ON staff_secondary_roles(staff_id);

ALTER TABLE staff_secondary_roles ENABLE ROW LEVEL SECURITY;

-- A user can read + manage their OWN secondary roles.
DROP POLICY IF EXISTS "staff_secondary_roles_self" ON staff_secondary_roles;
CREATE POLICY "staff_secondary_roles_self" ON staff_secondary_roles
  FOR ALL USING (
    staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- Owners + admins can manage anyone's secondary roles in their business
-- (for assigning the Sales persona to a staff member, etc.).
DROP POLICY IF EXISTS "staff_secondary_roles_business_admin" ON staff_secondary_roles;
CREATE POLICY "staff_secondary_roles_business_admin" ON staff_secondary_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM get_current_staff() cs
      JOIN staff s ON s.business_id = cs.business_id
      WHERE s.id = staff_secondary_roles.staff_id
        AND cs.role IN ('owner','admin')
    )
  );

-- ============================================================
-- get_staff_roles(p_staff_id) — the full role set a staff member holds:
-- { primary: staff.role, secondary: [...], effective_level: MAX, roles: [all] }
-- Used by the switcher UI + the effective-permission computation.
-- ============================================================
CREATE OR REPLACE FUNCTION get_staff_roles(p_staff_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_secondary JSONB;
  v_primary TEXT;
  v_levels JSONB;
  v_max_level INTEGER := 0;
  v_effective TEXT;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Membership guard: a user can only read their own roles, OR be an owner/admin
  -- in the same business.
  DECLARE
    v_caller RECORD;
    v_authorized BOOLEAN := false;
  BEGIN
    SELECT * INTO v_caller FROM get_current_staff();
    IF FOUND THEN
      v_authorized := (v_caller.id = p_staff_id)
        OR (v_caller.business_id = v_staff.business_id AND v_caller.role IN ('owner','admin'));
    END IF;
    IF NOT v_authorized THEN
      RETURN jsonb_build_object('authorized', false);
    END IF;
  END;

  v_primary := v_staff.role;
  -- Secondary roles (excluding the primary to avoid dupes in the list).
  SELECT COALESCE(jsonb_agg(to_jsonb(role) ORDER BY role), '[]'::jsonb) INTO v_secondary
    FROM staff_secondary_roles
    WHERE staff_id = p_staff_id AND role <> v_primary;

  -- Effective level = MAX across primary + secondary (UNION — adds access).
  -- Mirrors permissions.ts ROLE_HIERARCHY: owner=90, admin=80, manager=70,
  -- team_lead=60, staff=40.
  v_levels := jsonb_build_object(
    'owner', 90, 'admin', 80, 'manager', 70, 'team_lead', 60, 'staff', 40
  );
  v_max_level := (v_levels->>v_primary)::INTEGER;
  DECLARE
    r TEXT;
  BEGIN
    FOR r IN SELECT role FROM staff_secondary_roles WHERE staff_id = p_staff_id LOOP
      IF (v_levels->>r)::INTEGER > v_max_level THEN
        v_max_level := (v_levels->>r)::INTEGER;
      END IF;
    END LOOP;
  END;
  -- The effective role is the highest-level role (for permission precedence).
  v_effective := CASE
    WHEN v_max_level >= 90 THEN 'owner'
    WHEN v_max_level >= 80 THEN 'admin'
    WHEN v_max_level >= 70 THEN 'manager'
    WHEN v_max_level >= 60 THEN 'team_lead'
    ELSE 'staff'
  END;

  RETURN jsonb_build_object(
    'authorized', true,
    'primary', v_primary,
    'secondary', v_secondary,
    'roles', v_secondary || to_jsonb(v_primary),
    'effective', v_effective,
    'effective_level', v_max_level
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_staff_roles(UUID) TO authenticated;

COMMENT ON TABLE staff_secondary_roles IS
  '§K secondary business roles a staff member holds beyond their primary staff.role. UNION — adds access, never removes. RLS: self-manage + owner/admin business-wide.';
COMMENT ON FUNCTION get_staff_roles IS
  '§K returns a staff member''s full role set: primary (staff.role), secondary roles, + the effective role (MAX level). Used by the role switcher + effective-permission computation. Membership-guarded.';

-- ============================================================
-- set_active_role(p_staff_id, p_role) — validates that the user actually
-- holds the role (primary OR secondary) before recording the active persona.
-- Returns the validated active role, or NULL if the user can't switch to it.
-- The active_role is stored on staff (a real column) so server-side code
-- (notifications, AI lens) can read it. This is UX/context ONLY — RLS +
-- staff.role remain the security boundary.
-- ============================================================

-- Add the active_role column (nullable; NULL = use primary).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS active_role TEXT
  CHECK (active_role IN ('owner','admin','manager','team_lead','staff'));
COMMENT ON COLUMN staff.active_role IS
  '§K the persona the user is currently operating as (for dashboard context + AI lens). UX only — security stays staff.role + RLS. NULL = use primary role.';

CREATE OR REPLACE FUNCTION set_active_role(p_staff_id UUID, p_role TEXT)
RETURNS TEXT AS $$
DECLARE
  v_staff RECORD;
  v_holds BOOLEAN := false;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Membership guard: only the user themselves (or an owner/admin in the
  -- business) can set their active role.
  DECLARE
    v_caller RECORD;
    v_authorized BOOLEAN := false;
  BEGIN
    SELECT * INTO v_caller FROM get_current_staff();
    IF FOUND THEN
      v_authorized := (v_caller.id = p_staff_id)
        OR (v_caller.business_id = v_staff.business_id AND v_caller.role IN ('owner','admin'));
    END IF;
    IF NOT v_authorized THEN RETURN NULL; END IF;
  END;

  -- Validate the user actually holds this role (primary or secondary).
  IF v_staff.role = p_role THEN
    v_holds := true;
  ELSE
    SELECT EXISTS(SELECT 1 FROM staff_secondary_roles
      WHERE staff_id = p_staff_id AND role = p_role) INTO v_holds;
  END IF;

  IF NOT v_holds THEN
    -- Can't switch to a role you don't hold. Return NULL (no oracle — caller
    -- can't distinguish "invalid role" from "unauthorized", both deny).
    RETURN NULL;
  END IF;

  UPDATE staff SET active_role = p_role WHERE id = p_staff_id;
  RETURN p_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_active_role(p_staff_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller RECORD;
  v_authorized BOOLEAN := false;
BEGIN
  SELECT * INTO v_caller FROM get_current_staff();
  IF FOUND THEN
    v_authorized := (v_caller.id = p_staff_id)
      OR (v_caller.role IN ('owner','admin'));
  END IF;
  IF NOT v_authorized THEN RETURN; END IF;

  UPDATE staff SET active_role = NULL WHERE id = p_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_active_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_active_role(UUID) TO authenticated;

COMMENT ON FUNCTION set_active_role IS
  '§K sets the active persona. Server-validated: only a role the user actually holds (primary or secondary). UX/context only — RLS + staff.role remain the security boundary.';
COMMENT ON FUNCTION clear_active_role IS
  '§K resets the active persona back to the primary role (active_role = NULL).';
