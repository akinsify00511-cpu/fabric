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

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS business_events;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS chat_messages;

-- ============================================
-- 4. SIGNATURES STORAGE BUCKET
-- ============================================
-- SignDocument.tsx uploads signature images to storage.from('signatures')
-- but no migration created the bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;
