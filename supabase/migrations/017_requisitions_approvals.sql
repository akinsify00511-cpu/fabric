-- AVENIZE Layer 1 - Requisitions, Approvals & Follow-ups
-- Request system with multi-level approval workflow

-- ============================================
-- REQUISITION CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS requisition_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'FileText',
  color TEXT DEFAULT '#6366F1',
  -- Budget settings
  requires_approval BOOLEAN DEFAULT TRUE,
  min_amount NUMERIC DEFAULT 0,
  max_amount NUMERIC, -- NULL = unlimited
  -- Approval settings
  auto_approve_below NUMERIC, -- Amount below this auto-approves
  approver_role TEXT DEFAULT 'manager', -- 'manager', 'owner', 'specific'
  escalation_days INTEGER DEFAULT 3, -- Days before escalation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REQUISITIONS (requests)
-- ============================================
CREATE TABLE IF NOT EXISTS requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES requisition_categories(id),
  requester_id UUID REFERENCES staff(id),
  title TEXT NOT NULL,
  description TEXT,
  -- Request details
  amount NUMERIC,
  currency TEXT DEFAULT 'USD',
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  -- Items/line items
  items JSONB DEFAULT '[]', -- [{name, quantity, unit_price, total}]
  -- Timeline
  needed_by DATE,
  reason TEXT,
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'denied', 
    'partially_approved', 'cancelled', 'expired'
  )),
  -- Approval tracking
  current_approval_level INTEGER DEFAULT 0,
  max_approval_levels INTEGER DEFAULT 1,
  -- Financial
  approved_amount NUMERIC,
  -- Denial
  denial_reason TEXT,
  denial_notes TEXT,
  denied_by UUID REFERENCES staff(id),
  denied_at TIMESTAMPTZ,
  -- Follow-up
  follow_up_sent BOOLEAN DEFAULT FALSE,
  follow_up_count INTEGER DEFAULT 0,
  last_follow_up_at TIMESTAMPTZ,
  -- Events
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- ============================================
-- APPROVAL LEVELS & APPROVERS
-- ============================================
CREATE TABLE IF NOT EXISTS approval_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES requisition_categories(id), -- NULL = global
  level INTEGER NOT NULL,
  name TEXT NOT NULL, -- 'Manager Approval', 'Director Approval', 'Finance Approval'
  role TEXT CHECK (role IN ('manager', 'director', 'finance', 'owner')),
  -- Specific approvers (can be list of staff IDs or roles)
  approver_staff_ids UUID[],
  auto_approve_below NUMERIC, -- Auto-approve if amount is below this
  require_all BOOLEAN DEFAULT FALSE, -- All approvers must approve or just one
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPROVAL DECISIONS
-- ============================================
CREATE TABLE IF NOT EXISTS approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  approval_level_id UUID REFERENCES approval_levels(id),
  approver_id UUID NOT NULL REFERENCES staff(id),
  level INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied', 'delegated', 'skipped')),
  amount_approved NUMERIC, -- For partial approvals
  comments TEXT,
  delegation_to UUID REFERENCES staff(id),
  delegation_reason TEXT,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FOLLOW-UPS & REMINDERS
-- ============================================
CREATE TABLE IF NOT EXISTS requisition_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  -- Who to follow up with
  target_id UUID NOT NULL, -- staff_id or approver_id
  target_type TEXT NOT NULL CHECK (target_type IN ('requester', 'approver', 'escalation')),
  -- Follow-up details
  type TEXT NOT NULL CHECK (type IN (
    'reminder', 'approval_request', 'denial_notification', 
    'approval_notification', 'escalation', 'status_update', 'deadline_warning'
  )),
  subject TEXT NOT NULL,
  message TEXT,
  -- Timing
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  -- Tracking
  follow_up_number INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ESCALATION RULES
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES requisition_categories(id),
  -- Trigger conditions
  condition_type TEXT NOT NULL CHECK (condition_type IN (
    'days_pending', 'amount_above', 'priority', 'approver_unavailable'
  )),
  condition_value TEXT NOT NULL, -- JSON value for the condition
  -- Escalation action
  action_type TEXT NOT NULL CHECK (action_type IN (
    'notify_manager', 'notify_owner', 'auto_approve', 'auto_deny', 'reassign_approver'
  )),
  action_value TEXT, -- JSON for action details
  -- Timing
  delay_days INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPROVAL WORKFLOW LOG
-- ============================================
CREATE TABLE IF NOT EXISTS approval_workflow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'submitted', 'approved', 'denied', 'escalated', 'reminder_sent'
  actor_id UUID REFERENCES staff(id),
  actor_type TEXT DEFAULT 'staff', -- 'staff', 'system', 'approver'
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE requisition_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflow_log ENABLE ROW LEVEL SECURITY;

-- Categories: business scope
CREATE POLICY "Categories view"
  ON requisition_categories FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Categories manage"
  ON requisition_categories FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Requisitions: requester can see own, managers see all
CREATE POLICY "Requisitions view"
  ON requisitions FOR SELECT
  USING (
    requester_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM get_current_staff() 
      WHERE role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Requisitions create"
  ON requisitions FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Requisitions update"
  ON requisitions FOR UPDATE
  USING (
    -- Requester can update draft
    (status = 'draft' AND requester_id IN (SELECT id FROM staff WHERE user_id = auth.uid()))
    -- Managers can update anything
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

-- Approval decisions: approvers and managers
CREATE POLICY "Decisions view"
  ON approval_decisions FOR SELECT
  USING (
    requisition_id IN (SELECT id FROM requisitions WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

CREATE POLICY "Decisions create"
  ON approval_decisions FOR INSERT
  WITH CHECK (approver_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Follow-ups: related to business
CREATE POLICY "Followups view"
  ON requisition_follow_ups FOR SELECT
  USING (
    requisition_id IN (SELECT id FROM requisitions WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

-- Escalation rules: managers only
CREATE POLICY "Escalation view"
  ON escalation_rules FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Escalation manage"
  ON escalation_rules FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Workflow log: managers
CREATE POLICY "Workflow log view"
  ON approval_workflow_log FOR SELECT
  USING (requisition_id IN (SELECT id FROM requisitions WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Workflow log create"
  ON approval_workflow_log FOR INSERT
  WITH CHECK (requisition_id IN (SELECT id FROM requisitions WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Create requisition
CREATE OR REPLACE FUNCTION create_requisition(
  p_title TEXT,
  p_category_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_priority TEXT DEFAULT 'normal',
  p_needed_by DATE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_req_id UUID;
  v_business_id UUID;
BEGIN
  v_business_id := (SELECT business_id FROM get_current_staff());
  
  INSERT INTO requisitions (
    id, business_id, category_id, requester_id, title, description,
    amount, items, priority, needed_by, reason, status
  )
  VALUES (
    gen_random_uuid(), v_business_id, p_category_id,
    (SELECT id FROM staff WHERE user_id = auth.uid()),
    p_title, p_description, p_amount, p_items, p_priority, p_needed_by, p_reason,
    'draft'
  )
  RETURNING id INTO v_req_id;
  
  RETURN v_req_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit requisition for approval
CREATE OR REPLACE FUNCTION submit_requisition(p_requisition_id UUID)
RETURNS VOID AS $$
DECLARE
  v_req RECORD;
  v_category RECORD;
BEGIN
  -- Get requisition
  SELECT * INTO v_req FROM requisitions WHERE id = p_requisition_id;
  
  -- Get category settings
  SELECT * INTO v_category FROM requisition_categories WHERE id = v_req.category_id;
  
  -- Check if auto-approve
  IF v_category.auto_approve_below IS NOT NULL 
     AND v_req.amount <= v_category.auto_approve_below 
     AND v_category.requires_approval = FALSE THEN
    UPDATE requisitions SET status = 'approved', resolved_at = NOW() WHERE id = p_requisition_id;
    INSERT INTO approval_workflow_log (requisition_id, action, actor_type, details)
    VALUES (p_requisition_id, 'auto_approved', 'system', '{"reason": "Below auto-approve threshold"}');
    RETURN;
  END IF;
  
  -- Submit for approval
  UPDATE requisitions 
  SET status = 'pending_approval', 
      submitted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_requisition_id;
  
  -- Log submission
  INSERT INTO approval_workflow_log (requisition_id, action, actor_id, actor_type)
  SELECT p_requisition_id, 'submitted', id, 'staff' FROM staff WHERE user_id = auth.uid();
  
  -- Create initial follow-up for approvers
  INSERT INTO requisition_follow_ups (
    requisition_id, target_id, target_type, type, subject, message
  )
  SELECT 
    p_requisition_id,
    s.id,
    'approver',
    'approval_request',
    'New requisition requires your approval: ' || v_req.title,
    'A requisition has been submitted and requires your approval.'
  FROM staff s
  WHERE s.business_id = v_req.business_id AND s.role IN ('manager', 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve requisition
CREATE OR REPLACE FUNCTION approve_requisition(
  p_requisition_id UUID,
  p_amount_approved NUMERIC DEFAULT NULL,
  p_comments TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req RECORD;
  v_approver_id UUID;
  v_level INTEGER;
BEGIN
  -- Get requester and level
  SELECT id INTO v_approver_id FROM staff WHERE user_id = auth.uid();
  SELECT * INTO v_req FROM requisitions WHERE id = p_requisition_id;
  
  v_level := COALESCE(v_req.current_approval_level, 0) + 1;
  
  -- Record decision
  INSERT INTO approval_decisions (
    requisition_id, approver_id, level, decision, amount_approved, comments
  )
  VALUES (p_requisition_id, v_approver_id, v_level, 'approved', p_amount_approved, p_comments);
  
  -- Update requisition
  UPDATE requisitions
  SET status = 'approved',
      approved_amount = COALESCE(p_amount_approved, amount),
      current_approval_level = v_level,
      resolved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_requisition_id;
  
  -- Log and notify
  INSERT INTO approval_workflow_log (requisition_id, action, actor_id, actor_type, details)
  VALUES (p_requisition_id, 'approved', v_approver_id, 'staff', jsonb_build_object('level', v_level, 'amount', p_amount_approved));
  
  -- Notify requester
  INSERT INTO requisition_follow_ups (
    requisition_id, target_id, target_type, type, subject, message
  )
  SELECT p_requisition_id, v_req.requester_id, 'requester', 'approval_notification',
         'Your requisition has been approved',
         'Good news! Your requisition "' || v_req.title || '" has been approved.'
  FROM requisitions WHERE id = p_requisition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deny requisition
CREATE OR REPLACE FUNCTION deny_requisition(
  p_requisition_id UUID,
  p_denial_reason TEXT,
  p_denial_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req RECORD;
  v_denier_id UUID;
BEGIN
  SELECT id INTO v_denier_id FROM staff WHERE user_id = auth.uid();
  SELECT * INTO v_req FROM requisitions WHERE id = p_requisition_id;
  
  -- Record decision
  INSERT INTO approval_decisions (
    requisition_id, approver_id, level, decision, comments
  )
  VALUES (
    p_requisition_id, v_denier_id, 
    COALESCE(v_req.current_approval_level, 0) + 1,
    'denied', 
    p_denial_notes
  );
  
  -- Update requisition
  UPDATE requisitions
  SET status = 'denied',
      denial_reason = p_denial_reason,
      denial_notes = p_denial_notes,
      denied_by = v_denier_id,
      denied_at = NOW(),
      resolved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_requisition_id;
  
  -- Log denial
  INSERT INTO approval_workflow_log (requisition_id, action, actor_id, actor_type, details)
  VALUES (p_requisition_id, 'denied', v_denier_id, 'staff', jsonb_build_object('reason', p_denial_reason));
  
  -- Notify requester
  INSERT INTO requisition_follow_ups (
    requisition_id, target_id, target_type, type, subject, message
  )
  SELECT p_requisition_id, v_req.requester_id, 'requester', 'denial_notification',
         'Your requisition has been denied',
         'Your requisition "' || v_req.title || '" has been denied. Reason: ' || p_denial_reason
  FROM requisitions WHERE id = p_requisition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resubmit denied requisition
CREATE OR REPLACE FUNCTION resubmit_requisition(
  p_requisition_id UUID,
  p_changes JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM requisitions WHERE id = p_requisition_id;
  
  IF v_req.status != 'denied' THEN
    RAISE EXCEPTION 'Can only resubmit denied requisitions';
  END IF;
  
  -- Apply changes if provided
  IF p_changes IS NOT NULL THEN
    UPDATE requisitions
    SET 
      title = COALESCE(p_changes->>'title', title),
      description = COALESCE(p_changes->>'description', description),
      amount = COALESCE((p_changes->>'amount')::numeric, amount),
      items = COALESCE(p_changes->'items', items),
      reason = COALESCE(p_changes->>'reason', reason),
      status = 'pending_approval',
      denial_reason = NULL,
      denial_notes = NULL,
      denied_by = NULL,
      denied_at = NULL,
      submitted_at = NOW(),
      updated_at = NOW()
    WHERE id = p_requisition_id;
  ELSE
    UPDATE requisitions
    SET status = 'pending_approval',
        denial_reason = NULL,
        denial_notes = NULL,
        denied_by = NULL,
        denied_at = NULL,
        submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_requisition_id;
  END IF;
  
  -- Log resubmission
  INSERT INTO approval_workflow_log (requisition_id, action, actor_id, actor_type)
  SELECT p_requisition_id, 'resubmitted', id, 'staff' FROM staff WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Send follow-up reminder
CREATE OR REPLACE FUNCTION send_follow_up(p_requisition_id UUID)
RETURNS VOID AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM requisitions WHERE id = p_requisition_id;
  
  -- Increment follow-up count
  UPDATE requisitions
  SET follow_up_count = follow_up_count + 1,
      follow_up_sent = TRUE,
      last_follow_up_at = NOW(),
      updated_at = NOW()
  WHERE id = p_requisition_id;
  
  -- Send reminders to pending approvers
  INSERT INTO requisition_follow_ups (
    requisition_id, target_id, target_type, type, subject, message, follow_up_number
  )
  SELECT 
    p_requisition_id,
    s.id,
    'approver',
    'reminder',
    'Reminder: Approval pending for "' || v_req.title || '"',
    'This is a reminder that requisition "' || v_req.title || '" is awaiting your approval.',
    v_req.follow_up_count + 1
  FROM staff s
  WHERE s.business_id = v_req.business_id AND s.role IN ('manager', 'owner');
  
  -- Log reminder
  INSERT INTO approval_workflow_log (requisition_id, action, actor_type, details)
  VALUES (p_requisition_id, 'reminder_sent', 'system', jsonb_build_object('count', v_req.follow_up_count + 1));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending approvals for current user
CREATE OR REPLACE FUNCTION get_pending_approvals()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  amount NUMERIC,
  priority TEXT,
  status TEXT,
  requester_name TEXT,
  submitted_at TIMESTAMPTZ,
  needed_by DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id, r.title, r.description, r.amount, r.priority, r.status,
    s.full_name as requester_name,
    r.submitted_at,
    r.needed_by
  FROM requisitions r
  JOIN staff s ON s.id = r.requester_id
  WHERE r.business_id = (SELECT business_id FROM get_current_staff())
    AND r.status = 'pending_approval'
  ORDER BY 
    CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
    r.submitted_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEED DEFAULT CATEGORIES
-- ============================================
INSERT INTO requisition_categories (business_id, name, description, icon, color, requires_approval, auto_approve_below, approver_role)
SELECT 
  id, 'General Purchase', 'General purchases and expenses', 'ShoppingCart', '#6366F1', TRUE, 100, 'manager'
FROM businesses
ON CONFLICT DO NOTHING;

INSERT INTO requisition_categories (business_id, name, description, icon, color, requires_approval, auto_approve_below, approver_role)
SELECT 
  id, 'Travel & Expenses', 'Travel, meals, and expense reimbursements', 'Plane', '#10B981', TRUE, 50, 'manager'
FROM businesses
ON CONFLICT DO NOTHING;

INSERT INTO requisition_categories (business_id, name, description, icon, color, requires_approval, auto_approve_below, approver_role)
SELECT 
  id, 'Equipment', 'Hardware, software, and equipment purchases', 'Laptop', '#F59E0B', TRUE, 500, 'manager'
FROM businesses
ON CONFLICT DO NOTHING;

INSERT INTO requisition_categories (business_id, name, description, icon, color, requires_approval, auto_approve_below, approver_role)
SELECT 
  id, 'Marketing', 'Marketing and advertising expenses', 'Megaphone', '#EC4899', TRUE, 200, 'manager'
FROM businesses
ON CONFLICT DO NOTHING;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER requisition_categories_updated_at BEFORE UPDATE ON requisition_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER requisitions_updated_at BEFORE UPDATE ON requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
