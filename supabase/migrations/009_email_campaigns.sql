-- AVENIZE Layer 1 - Email Marketing (Brevo competitor)
-- Campaigns, contacts, templates, sends, opens, clicks

-- ============================================
-- EMAIL CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company TEXT,
  tags TEXT[], -- array of tags for segmentation
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'spam')),
  source TEXT DEFAULT 'manual', -- 'manual', 'import', 'signup', 'purchase'
  metadata JSONB DEFAULT '{}', -- extra fields
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, email)
);

-- ============================================
-- EMAIL TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT, -- preview text
  content_html TEXT NOT NULL, -- HTML content
  content_text TEXT, -- plain text version
  thumbnail_url TEXT,
  category TEXT, -- 'welcome', 'promotional', 'newsletter', 'transactional'
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EMAIL CAMPAIGNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT,
  content_html TEXT NOT NULL,
  content_text TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  campaign_type TEXT DEFAULT 'regular' CHECK (campaign_type IN ('regular', 'automated', 'ab_test')),
  -- Audience
  contact_filter JSONB DEFAULT '{}', -- {"tags": ["customer"], "status": "active"}
  contact_count INTEGER DEFAULT 0, -- count of recipients
  -- Schedule
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'UTC',
  -- A/B Test
  ab_test_enabled BOOLEAN DEFAULT FALSE,
  ab_test_subject_a TEXT,
  ab_test_subject_b TEXT,
  ab_test_percentage INTEGER DEFAULT 50,
  ab_test_winner TEXT,
  -- Stats
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  -- Settings
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  track_opens BOOLEAN DEFAULT TRUE,
  track_clicks BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EMAIL SENDS TABLE (individual sends)
-- ============================================
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'spam')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounced_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EMAIL CLICKS TABLE (link tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS email_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES email_contacts(id) ON DELETE SET NULL,
  link_url TEXT NOT NULL,
  link_index INTEGER, -- which link in the email
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUTOMATED EMAIL SEQUENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'signup', 'purchase', 'inactivity', 'manual'
  trigger_delay INTEGER DEFAULT 0, -- days after trigger
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER DEFAULT 0, -- days from previous step
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  content_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES email_contacts(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'unsubscribed', 'cancelled')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, contact_id)
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE email_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Contacts: business members can view/manage
CREATE POLICY "Contacts view"
  ON email_contacts FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Contacts create"
  ON email_contacts FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Contacts update"
  ON email_contacts FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Templates: business members
CREATE POLICY "Templates view"
  ON email_templates FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates create"
  ON email_templates FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates update"
  ON email_templates FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Campaigns: business members
CREATE POLICY "Campaigns view"
  ON email_campaigns FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Campaigns create"
  ON email_campaigns FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Campaigns update"
  ON email_campaigns FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Sends: business members
CREATE POLICY "Sends view"
  ON email_sends FOR SELECT
  USING (campaign_id IN (SELECT id FROM email_campaigns WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Link clicks: business members
CREATE POLICY "Clicks view"
  ON email_link_clicks FOR SELECT
  USING (campaign_id IN (SELECT id FROM email_campaigns WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Sequences: business members
CREATE POLICY "Sequences view"
  ON email_sequences FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Sequences create"
  ON email_sequences FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Sequence steps: business members
CREATE POLICY "Steps view"
  ON email_sequence_steps FOR SELECT
  USING (sequence_id IN (SELECT id FROM email_sequences WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Enrollments: business members
CREATE POLICY "Enrollments view"
  ON email_sequence_enrollments FOR SELECT
  USING (sequence_id IN (SELECT id FROM email_sequences WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get campaign stats summary
CREATE OR REPLACE FUNCTION get_campaign_stats()
RETURNS TABLE (
  total_campaigns BIGINT,
  total_sent BIGINT,
  avg_open_rate DECIMAL,
  avg_click_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY SELECT
    COUNT(*) as total_campaigns,
    COALESCE(SUM(sent_count), 0) as total_sent,
    CASE WHEN SUM(sent_count) > 0 THEN
      ROUND(AVG(opened_count * 100.0 / NULLIF(sent_count, 0)), 2)
    ELSE 0 END as avg_open_rate,
    CASE WHEN SUM(sent_count) > 0 THEN
      ROUND(AVG(clicked_count * 100.0 / NULLIF(sent_count, 0)), 2)
    ELSE 0 END as avg_click_rate
  FROM email_campaigns WHERE status = 'sent';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get contact count by tag
CREATE OR REPLACE FUNCTION get_contact_count_by_tags(p_tags TEXT[])
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM email_contacts
    WHERE business_id IN (SELECT business_id FROM get_current_staff())
    AND status = 'active'
    AND tags && p_tags
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER email_contacts_updated_at BEFORE UPDATE ON email_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER email_campaigns_updated_at BEFORE UPDATE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
