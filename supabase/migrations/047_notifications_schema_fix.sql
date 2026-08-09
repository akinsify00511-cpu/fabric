-- ============================================
-- 047: Fix notifications table schema
-- Reconciles conflicting definitions from 013, 036, 040
-- Adds missing columns so all app inserts work
-- ============================================

-- Add columns that app code expects but may not exist
-- (each ADD COLUMN is idempotent via IF NOT EXISTS)

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_id UUID;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Drop the restrictive type CHECK constraint if it exists (from migration 013)
-- so app code can insert types like 'meeting', 'reminder', 'invoice', etc.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND conname LIKE 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

-- Make user_id nullable (notifications may target staff_id instead of auth.users)
ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

-- Indexes for the queries the app actually runs
CREATE INDEX IF NOT EXISTS idx_notifications_staff_id
  ON public.notifications(staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_business_id
  ON public.notifications(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(staff_id) WHERE is_read = FALSE;

-- RLS: staff can see notifications targeted at them or their business
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_staff_select" ON public.notifications;
CREATE POLICY "notifications_staff_select" ON public.notifications
  FOR SELECT USING (
    staff_id = (SELECT id FROM public.get_current_staff())
    OR business_id = (SELECT business_id FROM public.get_current_staff())
  );

DROP POLICY IF EXISTS "notifications_staff_update" ON public.notifications;
CREATE POLICY "notifications_staff_update" ON public.notifications
  FOR UPDATE USING (
    staff_id = (SELECT id FROM public.get_current_staff())
  );

DROP POLICY IF EXISTS "notifications_business_insert" ON public.notifications;
CREATE POLICY "notifications_business_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
    OR staff_id = (SELECT id FROM public.get_current_staff())
  );
