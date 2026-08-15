-- ============================================
-- PAYMENTS, EMAIL & WHATSAPP INTEGRATION
-- Complete payment processing infrastructure
-- ============================================

-- ============================================
-- PART 1: PAYMENT GATEWAYS & SETTINGS
-- ============================================

-- Payment Gateway Settings
CREATE TABLE IF NOT EXISTS payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Provider
  provider TEXT NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'stripe', 'square', 'custom')),
  
  -- Keys (encrypted in production)
  public_key TEXT,
  secret_key_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  
  -- Settings
  is_active BOOLEAN DEFAULT FALSE,
  is_test_mode BOOLEAN DEFAULT TRUE,
  
  -- Supported currencies
  supported_currencies TEXT[] DEFAULT '{}',
  
  -- Fees
  transaction_fee_percent DECIMAL(5,2) DEFAULT 0,
  fixed_fee DECIMAL(10,2) DEFAULT 0,
  
  -- Branding
  brand_color TEXT,
  brand_logo TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'inactive')),
  status_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, provider)
);

CREATE INDEX idx_payment_gateways_business ON payment_gateways(business_id);
CREATE INDEX idx_payment_gateways_active ON payment_gateways(is_active);

-- ============================================
-- PART 2: PAYMENTS
-- ============================================

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- References
  invoice_id UUID, -- Reference to invoice if applicable
  customer_id UUID REFERENCES contacts(id),
  expense_claim_id UUID, -- Reference to expense claim
  
  -- Amount
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  
  -- Provider
  provider TEXT NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'stripe', 'cash', 'bank_transfer', 'other')),
  
  -- Transaction details
  reference TEXT NOT NULL UNIQUE, -- External reference
  transaction_id TEXT, -- Provider's transaction ID
  gateway_reference TEXT, -- Provider's full reference
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  
  -- Payment method
  payment_method TEXT, -- card, bank_transfer, ussd, mobile_money, qr_code, cash
  card_last_four TEXT,
  card_brand TEXT,
  
  -- Customer info (for non-logged-in payments)
  payer_name TEXT,
  payer_email TEXT,
  payer_phone TEXT,
  
  -- Fees
  gateway_fee DECIMAL(10,2) DEFAULT 0,
  our_fee DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(15,2), -- Amount after fees
  
  -- Refund
  refunded_amount DECIMAL(15,2) DEFAULT 0,
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  refunded_by UUID REFERENCES staff(id),
  
  -- Description
  description TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timing
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX idx_payments_created ON payments(created_at);

-- Payment Refunds
CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  
  -- Provider reference
  refund_reference TEXT,
  gateway_refund_id TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'successful', 'failed')),
  
  requested_by UUID REFERENCES staff(id),
  processed_by UUID REFERENCES staff(id),
  
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_refunds_payment ON payment_refunds(payment_id);

-- Payment Links (for sharing invoices)
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  code TEXT NOT NULL UNIQUE, -- Short code for URL
  
  -- What to pay for
  invoice_id UUID, -- Optional: linked to specific invoice
  customer_id UUID REFERENCES contacts(id),
  
  -- Amount
  amount DECIMAL(15,2), -- NULL = pay any amount
  currency TEXT DEFAULT 'NGN',
  description TEXT,
  
  -- Settings
  expires_at TIMESTAMPTZ,
  max_uses INTEGER, -- NULL = unlimited
  use_count INTEGER DEFAULT 0,
  
  -- Active
  is_active BOOLEAN DEFAULT TRUE,
  
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_links_code ON payment_links(code);
CREATE INDEX idx_payment_links_business ON payment_links(business_id);

-- ============================================
-- PART 3: EMAIL SYSTEM
-- ============================================

-- Email Logs
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Recipients
  to_email TEXT[] NOT NULL,
  cc_email TEXT[] DEFAULT '{}',
  bcc_email TEXT[] DEFAULT '{}',
  
  -- Content
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  
  -- Template
  template_id UUID REFERENCES email_templates(id),
  template_name TEXT,
  
  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'opened', 'bounced', 'failed')),
  
  -- Tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  
  opens_count INTEGER DEFAULT 0,
  clicks_count INTEGER DEFAULT 0,
  
  -- Provider
  provider TEXT DEFAULT 'smtp', -- smtp, sendgrid, mailgun, ses
  provider_message_id TEXT, -- External provider's message ID
  
  -- Error
  error_message TEXT,
  error_code TEXT,
  
  -- Context
  entity_type TEXT, -- invoice, quote, lead, etc.
  entity_id UUID,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Sender
  sender_email TEXT,
  sender_name TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_business ON emails(business_id);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_template ON emails(template_id);
CREATE INDEX idx_emails_entity ON emails(entity_type, entity_id);
CREATE INDEX idx_emails_created ON emails(created_at);
CREATE INDEX idx_emails_opened ON emails(opened_at) WHERE opened_at IS NOT NULL;

-- Email Clicks (for tracking)
CREATE TABLE IF NOT EXISTS email_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  
  url TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Device info
  user_agent TEXT,
  ip_address INET
);

CREATE INDEX idx_email_clicks_email ON email_clicks(email_id);

-- Email Bounces
CREATE TABLE IF NOT EXISTS email_bounces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  email TEXT NOT NULL,
  bounce_type TEXT, -- hard, soft
  bounce_reason TEXT,
  
  bounced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Link to email
  email_id UUID REFERENCES emails(id),
  
  -- Suppress future sends
  is_suppressed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_email_bounces_email ON email_bounces(email);
CREATE INDEX idx_email_bounces_suppressed ON email_bounces(is_suppressed) WHERE is_suppressed;

-- ============================================
-- PART 4: WHATSAPP MESSAGES
-- ============================================

-- WhatsApp Messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Recipient
  recipient TEXT NOT NULL, -- Phone number
  recipient_name TEXT,
  
  -- Message type
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'template', 'location', 'contact')),
  
  -- Content
  content JSONB NOT NULL, -- { body, media_url, caption, etc. }
  
  -- Provider
  provider TEXT DEFAULT 'whatsapp_business', -- whatsapp_business, twilio, other
  
  -- WhatsApp specific
  wa_message_id TEXT, -- WhatsApp's message ID
  wa_from TEXT, -- Sender phone
  wa_to TEXT, -- Recipient phone
  
  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'unsubscribed')),
  
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  -- Error
  error_message TEXT,
  error_code TEXT,
  
  -- Template (for template messages)
  template_name TEXT,
  
  -- Context
  entity_type TEXT, -- invoice, quote, appointment, etc.
  entity_id UUID,
  
  -- Customer
  contact_id UUID REFERENCES contacts(id),
  
  -- Staff who sent (for manual messages)
  sent_by UUID REFERENCES staff(id),
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_business ON whatsapp_messages(business_id);
CREATE INDEX idx_whatsapp_recipient ON whatsapp_messages(recipient);
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_entity ON whatsapp_messages(entity_type, entity_id);
CREATE INDEX idx_whatsapp_contact ON whatsapp_messages(contact_id);
CREATE INDEX idx_whatsapp_created ON whatsapp_messages(created_at);

-- WhatsApp Templates
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  display_name TEXT,
  
  -- WhatsApp Business API template info
  wa_template_id TEXT,
  wa_template_name TEXT,
  
  -- Category
  category TEXT CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'disabled')),
  rejection_reason TEXT,
  
  -- Content
  header_type TEXT, -- text, image, video, document
  header_content TEXT,
  
  body_template TEXT NOT NULL, -- The message template with {{1}}, {{2}} placeholders
  
  footer_text TEXT,
  
  buttons JSONB DEFAULT '[]', -- [{type: 'url', text: '...'}, {type: 'phone', text: '...'}]
  
  -- Variables
  variables JSONB DEFAULT '[]', -- [{index: 1, name: 'customer_name', required: true}]
  
  -- Usage
  sent_count INTEGER DEFAULT 0,
  
  -- Language
  language TEXT DEFAULT 'en',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, name)
);

CREATE INDEX idx_whatsapp_templates_business ON whatsapp_templates(business_id);
CREATE INDEX idx_whatsapp_templates_status ON whatsapp_templates(status);

-- WhatsApp Opt-ins (for legal compliance)
CREATE TABLE IF NOT EXISTS whatsapp_optins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  phone TEXT NOT NULL,
  email TEXT,
  
  -- Source
  source TEXT CHECK (source IN ('website', 'app', 'in_person', 'other')),
  
  -- Consent
  has_consent BOOLEAN DEFAULT TRUE,
  consent_given_at TIMESTAMPTZ DEFAULT NOW(),
  consent_text TEXT, -- The consent message they agreed to
  
  -- Opt-out
  opted_out BOOLEAN DEFAULT FALSE,
  opted_out_at TIMESTAMPTZ,
  
  -- Contact link
  contact_id UUID REFERENCES contacts(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, phone)
);

CREATE INDEX idx_whatsapp_optins_phone ON whatsapp_optins(phone);
CREATE INDEX idx_whatsapp_optins_consent ON whatsapp_optins(has_consent, opted_out) WHERE NOT opted_out;

-- ============================================
-- PART 5: NOTIFICATIONS
-- ============================================

-- In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- User
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  
  -- Type
  type TEXT NOT NULL, -- invoice, payment, leave, reminder, mention, etc.
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Content
  title TEXT NOT NULL,
  message TEXT,
  icon TEXT,
  color TEXT,
  
  -- Link
  link TEXT,
  
  -- Read status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Actions
  actions JSONB DEFAULT '[]', -- [{label: 'Approve', action: '/approve'}, {label: 'View', action: '/view'}]
  
  -- Source
  source_type TEXT, -- entity type
  source_id UUID, -- entity ID
  
  -- Created by
  created_by UUID REFERENCES staff(id),
  
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS staff_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Channels
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  whatsapp_enabled BOOLEAN DEFAULT FALSE,
  
  -- Categories
  invoice_notifications BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  leave_notifications BOOLEAN DEFAULT TRUE,
  task_notifications BOOLEAN DEFAULT TRUE,
  mention_notifications BOOLEAN DEFAULT TRUE,
  reminder_notifications BOOLEAN DEFAULT TRUE,
  marketing_notifications BOOLEAN DEFAULT FALSE,
  
  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON emails FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_updated_at BEFORE UPDATE ON whatsapp_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Increment functions for tracking
CREATE OR REPLACE FUNCTION increment_email_opens(p_email_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE emails SET 
    opens_count = opens_count + 1,
    opened_at = CASE WHEN opened_at IS NULL THEN NOW() ELSE opened_at END
  WHERE id = p_email_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_email_clicks(p_email_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE emails SET clicks_count = clicks_count + 1 WHERE id = p_email_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment(p_x INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN p_x + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_bounces ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_optins ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Payment Gateways - Only admins
CREATE POLICY "Admins can manage payment gateways"
  ON payment_gateways FOR ALL
  USING (user_is_admin(business_id));

-- Payments - Business staff can view
CREATE POLICY "Business staff can view payments"
  ON payments FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "System can insert payments"
  ON payments FOR INSERT WITH CHECK (user_in_business(business_id));
CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE
  USING (user_is_admin(business_id));

-- Emails - Business staff can view
CREATE POLICY "Business staff can view emails"
  ON emails FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "System can insert emails"
  ON emails FOR INSERT WITH CHECK (user_in_business(business_id));
CREATE POLICY "System can update emails"
  ON emails FOR UPDATE USING (TRUE);

-- Email Clicks - Public (for tracking pixel)
CREATE POLICY "Public can view email clicks"
  ON email_clicks FOR SELECT USING (TRUE);
CREATE POLICY "Public can insert email clicks"
  ON email_clicks FOR INSERT WITH CHECK (TRUE);

-- WhatsApp Messages
CREATE POLICY "Business staff can view WhatsApp messages"
  ON whatsapp_messages FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "System can insert WhatsApp messages"
  ON whatsapp_messages FOR INSERT WITH CHECK (user_in_business(business_id));
CREATE POLICY "Business staff can update WhatsApp messages"
  ON whatsapp_messages FOR UPDATE
  USING (user_in_business(business_id));

-- WhatsApp Templates
CREATE POLICY "Business staff can view WhatsApp templates"
  ON whatsapp_templates FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage WhatsApp templates"
  ON whatsapp_templates FOR ALL
  USING (user_is_admin(business_id));

-- WhatsApp Opt-ins
CREATE POLICY "Business staff can view opt-ins"
  ON whatsapp_optins FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "System can insert opt-ins"
  ON whatsapp_optins FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "System can update opt-ins"
  ON whatsapp_optins FOR UPDATE USING (TRUE);

-- Notifications - User can view own
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid() OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid() OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Notification Preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can manage own preferences" ON notification_preferences;
CREATE POLICY "Users can manage own preferences"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- SEED DATA
-- ============================================

-- Default notification preferences
INSERT INTO notification_preferences (user_id)
SELECT auth.uid() FROM auth.users
ON CONFLICT DO NOTHING;
