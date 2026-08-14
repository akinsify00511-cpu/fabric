-- 084_task_management_enhancements.sql
-- Turn the tasks table from a basic todo list into a managed-work surface:
-- assignment, follow-up comments, review feedback (satisfactory / rework),
-- and time management (estimated vs logged hours).
--
-- All additions are additive (no drop of existing data) and idempotent.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. Extend tasks table with review + time-management columns
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(6,2) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_status TEXT
  DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'satisfactory', 'needs_rework'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Allow the richer priority set used by the UI (004 only allowed low/medium/high/urgent).
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

COMMENT ON COLUMN tasks.review_status IS
  'pending = not yet reviewed; satisfactory = approved by a manager/lead; needs_rework = sent back for rework.';

-- ============================================================
-- 2. task_comments — follow-up thread on a task
-- ============================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID REFERENCES staff(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_comments same business read"
  ON task_comments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_comments same business write"
  ON task_comments FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 3. task_time_logs — manual time entries (hours + note)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0),
  note TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id);

ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_time_logs same business read"
  ON task_time_logs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_time_logs same business write"
  ON task_time_logs FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 4. Auto-maintain tasks.actual_hours from time logs + updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION maintain_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  p_task UUID;
  p_business UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    p_task := OLD.task_id;
    p_business := OLD.business_id;
  ELSE
    p_task := NEW.task_id;
    p_business := NEW.business_id;
  END IF;

  UPDATE tasks SET
    actual_hours = (
      SELECT COALESCE(SUM(hours), 0) FROM task_time_logs WHERE task_id = p_task
    ),
    updated_at = NOW()
  WHERE id = p_task;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_time_logs_actual_hours ON task_time_logs;
CREATE TRIGGER trg_task_time_logs_actual_hours
  AFTER INSERT OR UPDATE OR DELETE ON task_time_logs
  FOR EACH ROW EXECUTE FUNCTION maintain_task_actual_hours();
