-- 055_timesheets_approval_cycle.sql
-- Add a proper "Timesheets" layer on top of the existing time_entries
-- engine (§13.5): a weekly timesheet per staff member groups a week's
-- entries, goes through submit → manager approval (reusing the
-- Approvals engine), and is what gates billable time for payroll/invoicing.
--
-- time_entries already has billable/project_id/task_id/hourly_rate — we
-- only add the submission/approval wrapper, not a parallel time store.

CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Weekly period (Mon–Sun). Stored as the week-start DATE for stable keys.
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  -- Status mirrors a normal approval lifecycle, separate from the
  -- time_entries.status (active/stopped) so logging time and submitting
  -- a week are independent operations.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'approved', 'rejected', 'reopened'
  )),
  total_minutes INTEGER DEFAULT 0,
  billable_minutes INTEGER DEFAULT 0,
  -- Link to the Approvals engine row (entity_type = 'timesheet').
  approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One timesheet per staff per week.
  UNIQUE (staff_id, week_start)
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY timesheets_viewable_by_business
  ON timesheets FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));

CREATE POLICY timesheets_manageable_by_business
  ON timesheets FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- Staff can read their own timesheets even if business lookup is restricted.
CREATE POLICY timesheets_self_select
  ON timesheets FOR SELECT
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Staff can create/update their own draft/submitted timesheets.
CREATE POLICY timesheets_self_update
  ON timesheets FOR UPDATE
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timesheets_business ON timesheets(business_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff ON timesheets(staff_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(week_start);

-- Link individual time entries to a submitted timesheet. Nullable so
-- unsubmitted entries keep working as before.
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS timesheet_id UUID REFERENCES timesheets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_timesheet ON time_entries(timesheet_id);

CREATE TRIGGER timesheets_updated_at BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recompute the rolled-up totals (total/billable minutes) from the linked
-- time_entries whenever a timesheet is inserted or its entries change.
CREATE OR REPLACE FUNCTION recompute_timesheet_totals(p_timesheet_id UUID)
RETURNS VOID AS $$
DECLARE
  mins INTEGER;
  bill_mins INTEGER;
BEGIN
  SELECT COALESCE(SUM(
      COALESCE(manual_minutes,
        CASE WHEN end_time IS NOT NULL THEN
          (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER
        ELSE 0 END)
    ), 0)
  INTO mins
  FROM time_entries
  WHERE timesheet_id = p_timesheet_id AND status <> 'discarded';

  SELECT COALESCE(SUM(
      CASE WHEN billable THEN
        COALESCE(manual_minutes,
          CASE WHEN end_time IS NOT NULL THEN
            (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER
          ELSE 0 END)
      ELSE 0 END
    ), 0)
  INTO bill_mins
  FROM time_entries
  WHERE timesheet_id = p_timesheet_id AND status <> 'discarded';

  UPDATE timesheets
  SET total_minutes = mins, billable_minutes = bill_mins
  WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep totals fresh when entries are linked or edited.
CREATE OR REPLACE FUNCTION timesheet_recompute_on_entry_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM recompute_timesheet_totals(OLD.timesheet_id) WHERE OLD.timesheet_id IS NOT NULL;
  ELSE
    PERFORM recompute_timesheet_totals(NEW.timesheet_id) WHERE NEW.timesheet_id IS NOT NULL;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_entries_recompute_timesheet
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION timesheet_recompute_on_entry_change();

-- Submit a timesheet: flip status, stamp submitted_at, create an approvals
-- row the manager can act on (reuses the Approvals engine).
CREATE OR REPLACE FUNCTION submit_timesheet(p_timesheet_id UUID, p_submitter_id UUID)
RETURNS TABLE(id UUID, status TEXT, approval_id UUID) AS $$
DECLARE
  ts RECORD;
  appr_id UUID;
BEGIN
  SELECT * INTO ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF ts.status NOT IN ('draft', 'reopened') THEN
    RAISE EXCEPTION 'Timesheet is not in a submittable state';
  END IF;

  -- Recompute totals at submit time so the approval reflects reality.
  PERFORM recompute_timesheet_totals(p_timesheet_id);

  INSERT INTO approvals (business_id, entity_type, entity_id, requester_id,
    current_step, total_steps, status, description)
  VALUES (ts.business_id, 'timesheet', ts.id, p_submitter_id, 1, 1, 'pending',
    'Timesheet ' || ts.week_start || ' to ' || ts.week_end)
  RETURNING id INTO appr_id;

  UPDATE timesheets
  SET status = 'submitted', submitted_at = NOW(), approval_id = appr_id
  WHERE id = p_timesheet_id;

  -- Tag linked entries so they are locked once submitted.
  UPDATE time_entries SET status = 'stopped'
  WHERE timesheet_id = p_timesheet_id;

  RETURN QUERY SELECT timesheets.id, timesheets.status, timesheets.approval_id
  FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve / reject a timesheet (called by the approval action handler).
CREATE OR REPLACE FUNCTION decide_timesheet(p_timesheet_id UUID, p_decision TEXT, p_approver_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, status TEXT) AS $$
DECLARE
  ts RECORD;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  SELECT * INTO ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF ts.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted timesheets can be decided';
  END IF;

  UPDATE timesheets SET
    status = p_decision,
    approved_by = p_approver_id,
    approved_at = CASE WHEN p_decision = 'approved' THEN NOW() ELSE approved_at END,
    rejection_reason = p_reason
  WHERE id = p_timesheet_id;

  UPDATE approvals SET status = p_decision, updated_at = NOW()
  WHERE id = ts.approval_id;

  -- Rejection reopens the week for editing.
  IF p_decision = 'rejected' THEN
    UPDATE timesheets SET status = 'reopened' WHERE id = p_timesheet_id;
  END IF;

  RETURN QUERY SELECT timesheets.id, timesheets.status FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE timesheets IS
  'Weekly timesheet approval layer over time_entries (§13.5). Reuses the approvals engine via entity_type=''timesheet''.';
