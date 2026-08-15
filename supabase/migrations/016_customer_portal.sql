-- AVENIZE Layer 1 - Customer Portal
-- Client self-service: invoice viewing, ticket submission, project tracking

-- ============================================
-- PORTAL INVITATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS portal_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  email TEXT NOT NULL,
  name TEXT,
  token TEXT UNIQUE NOT NULL,
  -- Access permissions
  can_view_invoices BOOLEAN DEFAULT TRUE,
  can_view_quotes BOOLEAN DEFAULT TRUE,
  can_view_projects BOOLEAN DEFAULT FALSE,
  can_submit_tickets BOOLEAN DEFAULT TRUE,
  can_view_history BOOLEAN DEFAULT TRUE,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES staff(id)
);

-- ============================================
-- PORTAL SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES portal_invitations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PORTAL TICKETS (client-submitted)
-- ============================================
CREATE TABLE IF NOT EXISTS portal_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  invitation_id UUID REFERENCES portal_invitations(id),
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_to UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PORTAL COMMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS portal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES portal_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('client', 'staff')),
  author_id TEXT, -- contact_id or staff_id
  author_name TEXT,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- Only visible to staff
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE portal_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_comments ENABLE ROW LEVEL SECURITY;

-- Portal Invitations: by token or business owner
CREATE POLICY "Invitations view token"
  ON portal_invitations FOR SELECT
  USING (TRUE); -- Token-based access

CREATE POLICY "Invitations manage"
  ON portal_invitations FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- Portal Sessions: by token
CREATE POLICY "Sessions view token"
  ON portal_sessions FOR SELECT
  USING (TRUE); -- Token-based access

-- Portal Tickets: by invitation or business scope
CREATE POLICY "Tickets view portal"
  ON portal_tickets FOR SELECT
  USING (
    invitation_id IS NOT NULL
    OR business_id IN (SELECT business_id FROM get_current_staff())
  );

CREATE POLICY "Tickets create portal"
  ON portal_tickets FOR INSERT
  WITH CHECK (invitation_id IS NOT NULL OR business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Tickets update portal"
  ON portal_tickets FOR UPDATE
  USING (
    invitation_id IS NOT NULL
    OR business_id IN (SELECT business_id FROM get_current_staff())
  );

-- Portal Comments: visible based on internal flag
CREATE POLICY "Comments view portal"
  ON portal_comments FOR SELECT
  USING (
    is_internal = FALSE
    OR EXISTS (
      SELECT 1 FROM get_current_staff() gs
      JOIN portal_tickets pt ON pt.id = ticket_id
      WHERE pt.business_id = gs.business_id
    )
  );

CREATE POLICY "Comments create portal"
  ON portal_comments FOR INSERT
  WITH CHECK (TRUE); -- Token or staff

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate portal invitation
CREATE OR REPLACE FUNCTION generate_portal_invitation(
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_can_view_invoices BOOLEAN DEFAULT TRUE,
  p_can_view_quotes BOOLEAN DEFAULT TRUE,
  p_can_view_projects BOOLEAN DEFAULT FALSE,
  p_can_submit_tickets BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(invitation_id UUID, token TEXT, url TEXT) AS $$
DECLARE
  v_invitation_id UUID;
  v_token TEXT;
  v_business_id UUID;
  v_url TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  v_business_id := (SELECT business_id FROM get_current_staff());

  INSERT INTO portal_invitations (
    id, business_id, email, name, token,
    can_view_invoices, can_view_quotes, can_view_projects, can_submit_tickets,
    created_by
  )
  VALUES (
    gen_random_uuid(), v_business_id, p_email, p_name, v_token,
    p_can_view_invoices, p_can_view_quotes, p_can_view_projects, p_can_submit_tickets,
    (SELECT id FROM staff WHERE user_id = auth.uid())
  )
  RETURNING id INTO v_invitation_id;

  v_url := (SELECT value FROM app_config WHERE key = 'portal_base_url') || '/invite/' || v_token;
  IF v_url IS NULL THEN
    v_url := '/portal/invite/' || v_token;
  END IF;

  RETURN QUERY SELECT v_invitation_id, v_token, v_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get portal invitation by token
CREATE OR REPLACE FUNCTION get_portal_invitation(p_token TEXT)
RETURNS portal_invitations AS $$
DECLARE result portal_invitations;
BEGIN
  SELECT * INTO result FROM portal_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept portal invitation
CREATE OR REPLACE FUNCTION accept_portal_invitation(p_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_invitation_id UUID;
BEGIN
  UPDATE portal_invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE token = p_token
    AND status = 'pending'
  RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create portal session
CREATE OR REPLACE FUNCTION create_portal_session(p_invitation_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO portal_sessions (invitation_id, token)
  VALUES (p_invitation_id, v_token);

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify portal session
CREATE OR REPLACE FUNCTION verify_portal_session(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  business_id UUID,
  email TEXT,
  can_view_invoices BOOLEAN,
  can_view_quotes BOOLEAN,
  can_view_projects BOOLEAN,
  can_submit_tickets BOOLEAN
) AS $$
BEGIN
  UPDATE portal_sessions
  SET last_active_at = NOW()
  WHERE token = p_token AND expires_at > NOW();

  RETURN QUERY
  SELECT
    pi.id,
    pi.business_id,
    pi.email,
    pi.can_view_invoices,
    pi.can_view_quotes,
    pi.can_view_projects,
    pi.can_submit_tickets
  FROM portal_sessions ps
  JOIN portal_invitations pi ON pi.id = ps.invitation_id
  WHERE ps.token = p_token
    AND ps.expires_at > NOW()
    AND pi.status = 'accepted'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
