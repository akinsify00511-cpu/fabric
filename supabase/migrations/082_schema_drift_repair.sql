-- ============================================
-- SCHEMA DRIFT REPAIR: deals columns + stage CHECK, staff.date_of_birth,
-- realtime publication, signatures storage bucket
--
-- Fixes frontend↔schema drift found by comprehensive column-level audit.
-- Every column/stage referenced by the frontend but missing from the schema
-- is added here. Idempotent (IF NOT EXISTS / DROP IF EXISTS).
-- ============================================

\set ON_ERROR_STOP on

-- ============================================
-- 1. DEALS TABLE: add missing columns + fix stage CHECK constraint
-- ============================================
-- CRM.tsx inserts/updates contact_name, contact_email, contact_phone,
-- notes, probability — none exist on the deals table (001).
-- Dashboard.tsx filters .eq('stage','hot'); CRM default stage is 'active'.
-- The 001 CHECK only allows prospect|qualified|proposal|negotiation|won|lost
-- — 'hot' and 'active' are rejected, breaking deal creation and the dashboard.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50;

-- Replace the stage CHECK to include 'hot' and 'active' (used by CRM + Dashboard).
-- Constraint name is auto-generated; drop by pattern using a DO block.
DO $$
BEGIN
  -- Drop any existing CHECK constraint on deals.stage
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'deals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%stage IN%'
  ) THEN
    EXECUTE format(
      'ALTER TABLE deals DROP CONSTRAINT %I',
      (SELECT conname FROM pg_constraint
       WHERE conrelid = 'deals'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%stage IN%'
       LIMIT 1)
    );
  END IF;
END $$;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('prospect', 'qualified', 'hot', 'active', 'proposal', 'negotiation', 'won', 'lost'));

-- ============================================
-- 2. STAFF TABLE: add date_of_birth
-- ============================================
-- CompanyWall.tsx and CompanyHome.tsx select staff.date_of_birth for
-- birthday widgets. No migration ever defined this column.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ============================================
-- 3. REALTIME PUBLICATION: add tables the frontend subscribes to
-- ============================================
-- Only channels/messages/tasks were in supabase_realtime (999_fix_missing).
-- The frontend subscribes to postgres_changes on:
--   notifications (NotificationBell, Notifications, NotificationsCenter)
--   business_events (FreshnessBadge)
--   chat_messages (LiveChat)
-- Without these in the publication, subscribe() fires a postgres_changes error.

-- (ALTER PUBLICATION ADD TABLE IF NOT EXISTS is not valid PG syntax;
-- use DO blocks that catch duplicate_object exceptions.)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE business_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 4. SIGNATURES STORAGE BUCKET
-- ============================================
-- SignDocument.tsx uploads signature images to storage.from('signatures')
-- but no migration created the bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;


-- ============================================
-- MERGED from 082_self_audit_function_grant.sql (was a duplicate-numbered sibling)
-- ============================================

-- Ensure run_system_health_audit exists AND is callable from the client.
-- PostgREST reports "Could not find the function public.run_system_health_audit
-- (p_business_id) in the schema cache" when the function is missing or not
-- granted to the requesting role. This migration re-declares the function
-- idempotently (so it exists even if 068 was not applied) and grants EXECUTE
-- to authenticated, then reloads the PostgREST schema cache.

CREATE TABLE IF NOT EXISTS self_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  audit_dimension TEXT,
  category TEXT,
  severity TEXT,
  title TEXT,
  detail TEXT,
  entity_type TEXT,
  entity_id TEXT,
  owner_id UUID,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION run_system_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'stale_data', 'warning',
    'Stale entity: ' || entity_type, 'No events for ' || entity_type || ' in 30 days',
    entity_type, entity_id
  FROM entity_freshness
  WHERE business_id = p_business_id AND freshness_tier IN ('stale','old')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'missing_audit_event', 'warning',
    'Work route with no audit event', CONCAT('Route ', wr.id, ' has no matching business event'),
    'work_route', wr.id
  FROM work_routes wr
  WHERE wr.business_id = p_business_id AND NOT EXISTS (
    SELECT 1 FROM business_events e
    WHERE e.business_id = p_business_id AND e.entity_type = 'work_route' AND e.entity_id = wr.id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION run_business_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'incomplete_record', 'warning',
    'Invoice without a contact', 'Invoice has no contact linked',
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.contact_id IS NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'financial_anomaly', 'critical',
    'Overdue invoice', CONCAT('Invoice overdue, total ', i.total),
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.status = 'overdue'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION run_system_health_audit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION run_business_health_audit(UUID) TO authenticated;

-- Reload the PostgREST schema cache so the newly-granted function is visible.
NOTIFY pgrst, 'reload schema';
