-- ============================================
-- SECURITY HARDENING MIGRATION
-- Apply this to fix critical security vulnerabilities
-- ============================================

-- ============================================
-- 1. RATE LIMITING FOR AUTH FUNCTIONS
-- ============================================

-- Create rate limiting table for auth attempts
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email, IP, etc.
  action TEXT NOT NULL, -- 'signup', 'login', 'password_reset'
  attempts INTEGER DEFAULT 1,
  last_attempted_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, action)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup ON auth_rate_limits(identifier, action);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expired ON auth_rate_limits(locked_until) WHERE locked_until IS NOT NULL;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_auth_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 300,
  p_lockout_seconds INTEGER DEFAULT 900
)
RETURNS TABLE(allowed BOOLEAN, attempts INTEGER, retry_after INTEGER) AS $$
DECLARE
  v_record RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_retry_after INTEGER := 0;
BEGIN
  -- Get or create rate limit record
  SELECT * INTO v_record FROM auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;

  IF NOT FOUND THEN
    -- First attempt, create record
    INSERT INTO auth_rate_limits (identifier, action, attempts, last_attempted_at)
    VALUES (p_identifier, p_action, 1, v_now);
    RETURN QUERY SELECT TRUE, 1, 0::INTEGER;
    RETURN;
  END IF;

  -- Check if locked out
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    v_retry_after := EXTRACT(EPOCH FROM (v_record.locked_until - v_now))::INTEGER;
    RETURN QUERY SELECT FALSE, v_record.attempts, v_retry_after;
    RETURN;
  END IF;

  -- Check if window has expired
  IF v_record.last_attempted_at < v_now - (p_window_seconds || ' seconds')::INTERVAL THEN
    -- Window expired, reset
    UPDATE auth_rate_limits SET
      attempts = 1,
      last_attempted_at = v_now,
      locked_until = NULL
    WHERE identifier = p_identifier AND action = p_action;
    RETURN QUERY SELECT TRUE, 1, 0::INTEGER;
    RETURN;
  END IF;

  -- Increment attempts
  IF v_record.attempts >= p_max_attempts THEN
    -- Lock out
    UPDATE auth_rate_limits SET
      attempts = attempts + 1,
      last_attempted_at = v_now,
      locked_until = v_now + (p_lockout_seconds || ' seconds')::INTERVAL
    WHERE identifier = p_identifier AND action = p_action;
    
    v_retry_after := p_lockout_seconds;
    RETURN QUERY SELECT FALSE, p_max_attempts + 1, v_retry_after;
  ELSE
    UPDATE auth_rate_limits SET
      attempts = attempts + 1,
      last_attempted_at = v_now
    WHERE identifier = p_identifier AND action = p_action;
    
    RETURN QUERY SELECT TRUE, v_record.attempts + 1, 0::INTEGER;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. SECURE INVITE TOKENS
-- ============================================

-- Add token hash column for secure comparison
ALTER TABLE invites ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Generate hash for existing tokens (one-way)
UPDATE invites SET token_hash = encode(sha256(token::bytea), 'hex');

-- Function to validate invite token securely
CREATE OR REPLACE FUNCTION validate_invite_token(p_token TEXT)
RETURNS TABLE(
  valid BOOLEAN,
  business_id UUID,
  role TEXT,
  email TEXT,
  invited_by_name TEXT
) AS $$
BEGIN
  -- Hash the provided token and compare with stored hash
  RETURN QUERY
  SELECT
    (NOT invites.used AND (invites.expires_at IS NULL OR invites.expires_at > now())) as valid,
    invites.business_id,
    invites.role,
    invites.email,
    COALESCE(staff.name, 'Admin') as invited_by_name
  FROM invites
  LEFT JOIN staff ON staff.id = invites.created_by
  WHERE invites.token_hash = encode(sha256(p_token::bytea), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. IMPROVED ERROR MESSAGES (Less Information Leakage)
-- ============================================

-- Create a function that returns generic error messages
CREATE OR REPLACE FUNCTION get_auth_error_message(p_error_code TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE p_error_code
    WHEN 'invalid_credentials' THEN 'Invalid email or password'
    WHEN 'user_not_found' THEN 'Invalid email or password'
    WHEN 'email_taken' THEN 'An account with this email already exists'
    WHEN 'weak_password' THEN 'Password does not meet requirements'
    WHEN 'invalid_invite' THEN 'This invitation is invalid or has expired'
    WHEN 'rate_limited' THEN 'Too many attempts. Please try again later'
    WHEN 'invalid_business' THEN 'Unable to process your request'
    ELSE 'An error occurred. Please try again'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 4. API KEY SECURITY
-- ============================================

-- Add last used timestamp and rate limit columns to api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_daily INTEGER DEFAULT 1000;

-- Function to check and update API key usage
CREATE OR REPLACE FUNCTION check_api_key_usage(p_key_id UUID)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER) AS $$
DECLARE
  v_key RECORD;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_key FROM api_keys WHERE id = p_key_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Check if key is active
  IF NOT v_key.is_active THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Reset count if new day
  IF v_key.last_used_at IS NULL OR v_key.last_used_at::date < v_today THEN
    UPDATE api_keys SET
      request_count = 1,
      last_used_at = NOW()
    WHERE id = p_key_id;
    RETURN QUERY SELECT TRUE, v_key.rate_limit_daily - 1;
  END IF;

  -- Check rate limit
  IF v_key.request_count >= v_key.rate_limit_daily THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Increment count
  UPDATE api_keys SET
    request_count = request_count + 1,
    last_used_at = NOW()
  WHERE id = p_key_id;

  RETURN QUERY SELECT TRUE, v_key.rate_limit_daily - v_key.request_count - 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. AUDIT LOGGING FOR SECURITY EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'login', 'logout', 'signup', 'password_change', 'failed_login'
  user_id UUID,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  business_id UUID,
  metadata JSONB DEFAULT '{}',
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON security_audit_log(created_at DESC);

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_business_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_success BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO security_audit_log (
    event_type, user_id, email, ip_address, user_agent, business_id, metadata, success
  ) VALUES (
    p_event_type, p_user_id, p_email, p_ip_address, p_user_agent, p_business_id, p_metadata, p_success
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CLEANUP OLD RATE LIMIT RECORDS
-- ============================================

-- Remove expired rate limit records (older than 24 hours)
DELETE FROM auth_rate_limits WHERE last_attempted_at < NOW() - INTERVAL '24 hours';

-- Create cleanup job (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_rate_limits WHERE last_attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Done
-- ============================================
SELECT 'Security hardening applied!' as status;
