-- FABRIC: SMS Notifications via Termii
-- Multi-tenant SMS logging with Row-Level Security

-- ============================================
-- TABLES
-- ============================================

-- SMS Logs
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'rejected')),
  error_message TEXT,
  channel TEXT DEFAULT 'dnd',
  segments INTEGER DEFAULT 1,
  cost DECIMAL(10, 4) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Create index for faster queries
CREATE INDEX idx_sms_logs_business_id ON sms_logs(business_id);
CREATE INDEX idx_sms_logs_created_at ON sms_logs(created_at DESC);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);

-- OTP Requests (for 2FA via SMS)
CREATE TABLE otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  pin_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'verified', 'expired', 'failed')),
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Create index for faster queries
CREATE INDEX idx_otp_requests_pin_id ON otp_requests(pin_id);
CREATE INDEX idx_otp_requests_phone ON otp_requests(phone);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;

-- SMS Logs: Business members can view their business logs
CREATE POLICY "Business members can view SMS logs"
  ON sms_logs FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- SMS Logs: Service role can do everything
CREATE POLICY "Service role can manage SMS logs"
  ON sms_logs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- OTP Requests: Business members can view their business requests
CREATE POLICY "Business members can view OTP requests"
  ON otp_requests FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- OTP Requests: Service role can do everything
CREATE POLICY "Service role can manage OTP requests"
  ON otp_requests FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update SMS status
CREATE OR REPLACE FUNCTION update_sms_status(
  p_message_id TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE sms_logs
  SET
    status = p_status,
    error_message = p_error_message,
    sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END
  WHERE message_id = p_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record OTP verification
CREATE OR REPLACE FUNCTION record_otp_verification(
  p_pin_id TEXT,
  p_success BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE otp_requests
  SET
    status = CASE WHEN p_success THEN 'verified' ELSE 'failed' END,
    verified_at = CASE WHEN p_success THEN NOW() ELSE NULL END,
    attempts = attempts + 1
  WHERE pin_id = p_pin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE sms_logs IS 'Log of all SMS messages sent via Termii';
COMMENT ON TABLE otp_requests IS 'Log of OTP requests for SMS-based 2FA';
COMMENT ON COLUMN sms_logs.channel IS 'SMS channel: dnd, whatsapp, or generic';
COMMENT ON COLUMN sms_logs.segments IS 'Number of SMS segments (GSM-7: 160 chars, UCS-2: 70 chars per segment)';
