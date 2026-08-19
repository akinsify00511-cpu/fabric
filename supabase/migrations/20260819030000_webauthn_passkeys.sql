-- Internal WebAuthn / Passkeys (Avenize-first: no external auth provider).
--
-- Browser WebAuthn API -> Avenize webauthn edge function (server-side
-- cryptographic verification via @simplewebauthn/server, running in our own
-- Supabase Edge runtime) -> credential storage here in Postgres.
--
-- Security model:
--   - ONLY the public key + signature counter are stored (never anything
--     secret — passkeys are asymmetric by design).
--   - Challenges are single-use and short-lived (5 min TTL enforced in the
--     edge function; expires_at recorded here for audit).
--   - Challenges table is denied to clients entirely; only the edge function
--     (service role) reads/writes it.
--   - Credential counter monotonicity is verified server-side — a cloned
--     authenticator is rejected when its counter regresses.
--   - Every ceremony (register/authenticate/revoke) is written to
--     webauthn_audit_log. Rate limiting reuses check_auth_rate_limit (999).

-- =============================================================================
-- 1. webauthn_credentials — the passkey registry.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,        -- base64url credential ID from the authenticator
  public_key TEXT NOT NULL,                  -- base64url COSE public key
  counter BIGINT NOT NULL DEFAULT 0,         -- signature counter (clone detection)
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_name TEXT,                          -- user-given friendly name ("My iPhone")
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,  -- synced passkey (iCloud/Google) vs device-bound
  aaguid TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ                     -- soft revoke: keeps the audit trail
);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webauthn_credentials_own ON public.webauthn_credentials;
CREATE POLICY webauthn_credentials_own ON public.webauthn_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND revoked_at IS NULL);

DROP POLICY IF EXISTS webauthn_credentials_own_revoke ON public.webauthn_credentials;
CREATE POLICY webauthn_credentials_own_revoke ON public.webauthn_credentials
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user
  ON public.webauthn_credentials (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.webauthn_credentials IS
  'Passkey registry: public key + counter only (asymmetric — nothing secret). user_id has NO FK to auth.users (bare-postgres shim has none); enforced logically by the edge function.';

-- =============================================================================
-- 2. webauthn_challenges — single-use, short-lived ceremony challenges.
--    CLIENT-DENIED: only the service-role edge function may read/write.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL UNIQUE,
  user_id UUID,                            -- NULL for pre-login authentication ceremonies
  email TEXT,                              -- passwordless login hint (discoverable credentials)
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Deny all client access (no policies granted) — service role bypasses RLS.
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry
  ON public.webauthn_challenges (expires_at) WHERE used_at IS NULL;

COMMENT ON TABLE public.webauthn_challenges IS
  'Single-use WebAuthn ceremony challenges. 5-minute TTL enforced in the edge function. RLS denies all client access — service role only.';

-- =============================================================================
-- 3. webauthn_audit_log — every passkey ceremony, for security review.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.webauthn_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  credential_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'registration_started', 'registration_verified', 'registration_failed',
    'authentication_started', 'authentication_verified', 'authentication_failed',
    'credential_revoked', 'counter_regression_detected'
  )),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webauthn_audit_own ON public.webauthn_audit_log;
CREATE POLICY webauthn_audit_own ON public.webauthn_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_webauthn_audit_user ON public.webauthn_audit_log (user_id, created_at DESC);

COMMENT ON TABLE public.webauthn_audit_log IS
  'Passkey ceremony audit trail. Written by the edge function (service role); users can read their own.';

-- =============================================================================
-- 4. revoke_my_passkey — client-callable soft revoke (own credentials only).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revoke_my_passkey(p_credential_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  UPDATE public.webauthn_credentials
  SET revoked_at = now()
  WHERE credential_id = p_credential_id
    AND user_id = auth.uid()
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.webauthn_audit_log (user_id, credential_id, event_type)
  VALUES (auth.uid(), p_credential_id, 'credential_revoked');

  RETURN TRUE;
END
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_my_passkey(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_my_passkey(TEXT) TO authenticated;
