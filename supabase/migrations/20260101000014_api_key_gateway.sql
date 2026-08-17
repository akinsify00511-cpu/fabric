-- 20260101000014_api_key_gateway.sql
-- #extensibility: make API keys actually usable + secure.
--
-- Two defects closed:
--   1. API keys were stored PLAINTEXT (APIKeys.tsx did keyHash = rawKey with a
--      "in production, hash this" comment). The key_hash column was named as if
--      hashed but held the raw key. Now the client hashes (SHA-256) before
--      insert, and this migration adds a server-side verify_api_key() RPC so
--      the gateway validates the hash, never the raw key.
--   2. No gateway existed — created keys were unusable (module_status.api =
--      "key issuance/gating not enforced server-side"). This adds verify_api_key()
--      + the api-gateway edge function reads it. Keys now gate a real (read-
--      only) public API surface.
--
-- Security:
--   - verify_api_key() is SECURITY DEFINER (reads api_keys which is RLS-locked
--     for the gateway's service-role context). It takes the RAW presented key,
--     hashes it server-side (digest('sha256'), pgcrypto), and matches key_hash.
--     The raw key is never stored or logged.
--   - Enforces: is_active, not expired, IP allowlist (if configured), updates
--     use_count + last_used_at. Returns the business_id + scopes on success,
--     NULL on failure (no leak of which check failed).
--   - Backfill: existing plaintext keys (key_hash starting with 'avenize_')
--     are flagged needs_rotation=true so the owner regenerates them hashed.
--
-- Idempotent. No external API.

-- pgcrypto for digest() (already available via 998/Supabase, ensure here).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. needs_rotation column — flags plaintext-stored keys for regeneration.
-- ============================================================================
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS needs_rotation BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any key whose key_hash looks like a raw key (starts with the
-- avenize_ prefix) was stored plaintext and must be rotated to a hashed form.
UPDATE api_keys
SET needs_rotation = true
WHERE key_hash LIKE 'avenize_%';

COMMENT ON COLUMN api_keys.needs_rotation IS 'True for legacy keys stored plaintext (pre-20260101000014). The owner should regenerate them so the hash is stored, not the raw key.';

-- ============================================================================
-- 2. verify_api_key(p_raw_key, p_ip) — the gateway's validator.
--    SECURITY DEFINER so it can read api_keys (RLS-locked for clients).
--    Hashes the presented key with sha256, matches key_hash. Enforces
--    active/expiry/IP-allowlist. Returns business_id + scopes on success,
--    NULL on any failure (no distinguishable error → no oracle).
--
--    NOTE: migration 015 declared a verify_api_key(p_key TEXT) that returned the
--    FULL api_keys row (including key_hash — a security smell). We DROP that
--    overload and replace it with this one, which returns only business_id +
--    scopes (never the hash). The signature differs (adds p_ip), so a plain
--    CREATE OR REPLACE would error on non-unique name; DROP first.
-- ============================================================================
DROP FUNCTION IF EXISTS verify_api_key(TEXT);
DROP FUNCTION IF EXISTS verify_api_key(TEXT, INET);

CREATE OR REPLACE FUNCTION verify_api_key(p_raw_key TEXT, p_ip INET DEFAULT NULL)
RETURNS TABLE (
  api_key_id UUID,
  business_id UUID,
  scopes TEXT[],
  permissions JSONB
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hash TEXT;
  v_row RECORD;
BEGIN
  IF p_raw_key IS NULL OR p_raw_key = '' THEN
    RETURN;
  END IF;

  -- Hash the presented key server-side. Never compare raw keys.
  v_hash := encode(digest(p_raw_key, 'sha256'), 'hex');

  SELECT id, business_id, scopes, permissions, allowed_ips, expires_at, is_active, needs_rotation
  INTO v_row
  FROM api_keys
  WHERE key_hash = v_hash
  LIMIT 1;

  -- No match, inactive, expired, or needs rotation (plaintext) → deny.
  IF NOT FOUND
     OR v_row.is_active = false
     OR v_row.needs_rotation = true
     OR (v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW()) THEN
    RETURN;
  END IF;

  -- IP allowlist (if configured).
  IF v_row.allowed_ips IS NOT NULL AND array_length(v_row.allowed_ips, 1) > 0 THEN
    IF p_ip IS NULL OR NOT (p_ip = ANY(v_row.allowed_ips)) THEN
      RETURN;
    END IF;
  END IF;

  -- Success: update usage stats (best-effort).
  UPDATE api_keys
  SET use_count = use_count + 1, last_used_at = NOW()
  WHERE id = v_row.id;

  RETURN QUERY
  SELECT v_row.id, v_row.business_id, v_row.scopes, v_row.permissions;
END;
$$;

-- Granted to anon so the public gateway (no user session) can call it.
-- The function itself is the gate — it returns NULL for any invalid key.
GRANT EXECUTE ON FUNCTION verify_api_key(TEXT, INET) TO anon, authenticated;

COMMENT ON FUNCTION verify_api_key IS 'Gateway key validator (#extensibility). Hashes the presented raw key (sha256, pgcrypto) and matches api_keys.key_hash. Enforces active/expiry/IP-allowlist/needs_rotation. Returns business_id+scopes on success, NULL on any failure (no oracle). SECURITY DEFINER so it can read the RLS-locked api_keys table. The raw key is never stored or logged. Replaces the 015 overload that returned the full row (including key_hash).';
