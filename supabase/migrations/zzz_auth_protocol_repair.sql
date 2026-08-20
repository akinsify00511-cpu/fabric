-- =============================================================================
-- AUTH PROTOCOL REPAIR (Session 36)
-- =============================================================================
-- Repairs the auth/onboarding database contract. This file is named zzz_ so it
-- applies AFTER 998/999/zz_* and its definitions are final.
--
-- Fixed defects (each verified against a fully-migrated postgres:15 chain):
--
-- 1. create_business_and_owner ALWAYS FAILED on a migrated DB:
--    a. businesses.organization_id is NOT NULL (20260817150000) but the RPC
--       never set it -> not-null violation on every call.
--    b. staff.email is NOT NULL (001) but no version of the RPC inserted it.
--    The function now creates the organization, links the business to it,
--    grants the founder a group_owner org membership, and backfills
--    staff.email from auth.users.
--
-- 2. log_security_event was re-declared by zz_rpc_tenant_guards_closure with a
--    business-membership guard. The login page calls it PRE-AUTH with
--    p_business_id = NULL, so the guard silently dropped every security event.
--    The function now accepts NULL business (pre-auth events) and keeps the
--    membership guard for business-scoped events.
--
-- 3. check_auth_rate_limit counted EVERY check as an attempt, including
--    successful logins -- 5 successful logins in 5 minutes locked a legitimate
--    user out. Split into a read-only check + explicit failure recording +
--    reset on success:
--      check_auth_rate_limit  -> read-only "may I try?" (no increment)
--      record_auth_failure    -> increments the counter, applies lockout
--      reset_auth_rate_limit  -> clears the counter after a successful auth
--
-- 4. create_business_and_owner was callable by PUBLIC (Postgres default
--    grant). It now fails cleanly for anonymous callers and is revoked from
--    PUBLIC/anon; only authenticated users may call it.
--
-- Idempotent: drops known overloads, CREATE OR REPLACE, IF NOT EXISTS tables.
-- =============================================================================

\set ON_ERROR_STOP on

-- =============================================================================
-- 1. Rate-limit + security-audit tables (self-contained; 999 also creates
--    them with IF NOT EXISTS, so order does not matter).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempts INTEGER DEFAULT 1,
  last_attempted_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, action)
);

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  business_id UUID,
  metadata JSONB DEFAULT '{}',
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup ON public.auth_rate_limits(identifier, action);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at DESC);

-- RLS: these tables are written only through the SECURITY DEFINER functions
-- below; clients get no direct access.
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. check_auth_rate_limit — READ-ONLY. Answers "may this identifier attempt
--    <action> right now?" without counting the attempt. Attempts are recorded
--    by record_auth_failure and cleared by reset_auth_rate_limit, so a
--    successful login never moves a user closer to lockout.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(
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
BEGIN
  SELECT * INTO v_record FROM public.auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;

  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, 0, 0::INTEGER;
    RETURN;
  END IF;

  -- Active lockout.
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    RETURN QUERY SELECT FALSE, v_record.attempts,
      EXTRACT(EPOCH FROM (v_record.locked_until - v_now))::INTEGER;
    RETURN;
  END IF;

  -- Window expired -> the counter is stale; treat as fresh.
  IF v_record.last_attempted_at < v_now - (p_window_seconds || ' seconds')::INTERVAL THEN
    RETURN QUERY SELECT TRUE, 0, 0::INTEGER;
    RETURN;
  END IF;

  -- At/over the threshold inside the window -> start the lockout.
  IF v_record.attempts >= p_max_attempts THEN
    UPDATE public.auth_rate_limits SET locked_until = v_now + (p_lockout_seconds || ' seconds')::INTERVAL
    WHERE identifier = p_identifier AND action = p_action;
    RETURN QUERY SELECT FALSE, v_record.attempts, p_lockout_seconds;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, v_record.attempts, 0::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 3. record_auth_failure — the ONLY writer of attempt counts. Called after a
--    failed authentication attempt. Returns the post-failure state so the
--    caller can message an immediate lockout.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_auth_failure(
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
  v_attempts INTEGER;
BEGIN
  SELECT * INTO v_record FROM public.auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;

  IF NOT FOUND THEN
    INSERT INTO public.auth_rate_limits (identifier, action, attempts, last_attempted_at)
    VALUES (p_identifier, p_action, 1, v_now);
    RETURN QUERY SELECT TRUE, 1, 0::INTEGER;
    RETURN;
  END IF;

  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    RETURN QUERY SELECT FALSE, v_record.attempts,
      EXTRACT(EPOCH FROM (v_record.locked_until - v_now))::INTEGER;
    RETURN;
  END IF;

  -- Window expired -> restart the count at 1.
  IF v_record.last_attempted_at < v_now - (p_window_seconds || ' seconds')::INTERVAL THEN
    UPDATE public.auth_rate_limits SET attempts = 1, last_attempted_at = v_now, locked_until = NULL
    WHERE identifier = p_identifier AND action = p_action;
    RETURN QUERY SELECT TRUE, 1, 0::INTEGER;
    RETURN;
  END IF;

  v_attempts := v_record.attempts + 1;

  IF v_attempts >= p_max_attempts THEN
    UPDATE public.auth_rate_limits
    SET attempts = v_attempts, last_attempted_at = v_now,
        locked_until = v_now + (p_lockout_seconds || ' seconds')::INTERVAL
    WHERE identifier = p_identifier AND action = p_action;
    RETURN QUERY SELECT FALSE, v_attempts, p_lockout_seconds;
  ELSE
    UPDATE public.auth_rate_limits SET attempts = v_attempts, last_attempted_at = v_now
    WHERE identifier = p_identifier AND action = p_action;
    RETURN QUERY SELECT TRUE, v_attempts, 0::INTEGER;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 4. reset_auth_rate_limit — called after a SUCCESSFUL authentication so past
--    failures don't linger against a legitimate user.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_auth_rate_limit(p_identifier TEXT, p_action TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.auth_rate_limits WHERE identifier = p_identifier AND action = p_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 5. log_security_event — pre-auth aware. A NULL business_id means a pre-auth
--    event (login_failed, signup_attempt) where no membership can exist yet;
--    those are always recorded. Business-scoped events keep the membership
--    guard from the Session-33 tenant-guard closure.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_security_event(
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
  IF p_business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.security_audit_log (
    event_type, user_id, email, ip_address, user_agent, business_id, metadata, success
  ) VALUES (
    p_event_type, p_user_id, p_email, p_ip_address, p_user_agent, p_business_id, p_metadata, p_success
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- These must be callable BEFORE a session exists (login/signup) and by
-- authenticated users. Explicit grants because the 20260818290000 guard ran
-- before 999 created the functions, so its grants never landed.
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_failure(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_rate_limit(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, TEXT, UUID, JSONB, BOOLEAN) TO anon, authenticated;

-- =============================================================================
-- 6. create_default_channel — tolerate a missing owner. The businesses AFTER
--    INSERT trigger runs before create_business_and_owner has inserted the
--    owner staff row, so v_owner_id was NULL and the channel_members insert
--    (staff_id NOT NULL) violated the constraint, failing the ENTIRE business
--    creation. Create the channel without the member row; the RPC joins the
--    owner explicitly after the staff row exists.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_default_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_owner_id FROM public.staff WHERE business_id = NEW.id AND role = 'owner' LIMIT 1;

  INSERT INTO public.channels (business_id, name, description, type, created_by)
  VALUES (NEW.id, 'general', 'Company-wide announcements and updates', 'public', v_owner_id)
  RETURNING id INTO v_channel_id;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.channel_members (channel_id, staff_id, role)
    VALUES (v_channel_id, v_owner_id, 'owner');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- 7. create_business_and_owner — the canonical onboarding RPC. Fixes the
--    organization_id / staff.email not-null violations and hardens auth.
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_business_and_owner(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_business_and_owner(
  p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_org_id UUID;
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Callable only with a real session. The businesses/staff inserts key off
  -- auth.uid(); without this guard an anonymous call failed deep inside the
  -- inserts with a raw constraint error.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- One user, one business through this path. Repeat onboarding attempts are
  -- recoverable client-side (the caller refreshes membership and enters /app).
  IF EXISTS (SELECT 1 FROM public.staff WHERE staff.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;

  -- staff.email is NOT NULL; backfill from the auth account.
  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;
  v_user_email := COALESCE(v_user_email, auth.jwt() ->> 'email', '');

  -- Every business belongs to an organization (organization_id NOT NULL). A
  -- founder-led business gets its own organization and the founder becomes
  -- its group_owner, matching the multi-entity foundation backfill shape.
  INSERT INTO public.organizations (name)
  VALUES (p_business_name)
  RETURNING id INTO v_org_id;

  INSERT INTO public.businesses (name, industry, organization_id, entity_type)
  VALUES (p_business_name, p_industry, v_org_id, 'company')
  RETURNING businesses.id INTO v_business_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org_id, v_user_id, 'group_owner', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.staff (business_id, user_id, name, full_name, email,
                            role, job_title, member_kind, onboarding_completed)
  VALUES (v_business_id, v_user_id, COALESCE(NULLIF(TRIM(p_staff_name), ''), v_user_email),
          NULLIF(TRIM(p_staff_name), ''), v_user_email, 'owner',
          COALESCE(NULLIF(TRIM(p_job_title), ''), 'Owner'), 'owner', TRUE)
  RETURNING id INTO v_staff_id;

  -- The on_business_created trigger ran before this staff row existed, so the
  -- owner was not auto-joined to #general. Join them now that the row exists.
  INSERT INTO public.channel_members (channel_id, staff_id, role)
  SELECT c.id, v_staff_id, 'owner' FROM public.channels c
  WHERE c.business_id = v_business_id AND c.name = 'general'
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only authenticated users may create their own business. Postgres grants
-- EXECUTE to PUBLIC by default, so revoke it explicitly.
REVOKE EXECUTE ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) IS
  'Create a business (inside a new organization) and its owner staff row. One business per user; founder is group_owner + member_kind owner. Session-36: sets organization_id and staff.email (both NOT NULL).';

-- Reload PostgREST so the final signature is visible immediately.
NOTIFY pgrst, 'reload schema';
