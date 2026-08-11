-- ============================================
-- USAGE TELEMETRY (infrastructure, not a sellable feature)
-- ============================================
-- Lightweight logging of which modules/features a business actually opens.
-- Purpose (per roadmap): tells the BUILDER empirically which of the 61 L2
-- modules deserve the next sprint and which are dead weight nobody asked for.
-- This is not gated by entitlements — it's instrumentation for our own decisions.
--
-- Design: append-only, RLS lets a business read only its own events; writes
-- are open to authenticated (the client logs its own view events). A nightly
-- pg_cron job (to be added with the automations infra) can aggregate into
-- usage_daily for fast dashboarding without scanning the raw table.
-- ============================================

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  module_key TEXT NOT NULL,           -- e.g. 'crm', 'finance', 'tasks'
  route TEXT,                         -- e.g. '/app/crm'
  action TEXT,                        -- 'view', 'create', 'update' (optional)
  session_id TEXT,                     -- groups a login session
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_business_time ON usage_events(business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_module ON usage_events(module_key, occurred_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
-- A business can read only its own usage; writes are open to authenticated
-- (the client logs its own events). Aggregation is read-only via the RPC below.
CREATE POLICY usage_events_read_own ON usage_events
  FOR SELECT TO authenticated USING (business_id = (auth.jwt() ->> 'business_id')::UUID);
CREATE POLICY usage_events_insert_own ON usage_events
  FOR INSERT TO authenticated WITH CHECK (business_id = (auth.jwt() ->> 'business_id')::UUID);

-- Aggregate RPC: module adoption for a business over a window.
-- Returns per-module counts so the builder/customer can see what's actually used.
CREATE OR REPLACE FUNCTION usage_module_adoption(p_business_id UUID, p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days')
RETURNS TABLE (
  module_key TEXT,
  distinct_staff INT,
  event_count BIGINT,
  last_seen TIMESTAMPTZ,
  adoption_label TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT module_key,
         COUNT(DISTINCT staff_id)::INT,
         COUNT(*)::BIGINT,
         MAX(occurred_at),
         CASE
           WHEN COUNT(DISTINCT staff_id) >= 3 THEN 'adopted'
           WHEN COUNT(DISTINCT staff_id) >= 1 THEN 'trying'
           ELSE 'untouched'
         END
  FROM usage_events
  WHERE business_id = p_business_id AND occurred_at >= p_since
  GROUP BY module_key
  ORDER BY event_count DESC;
$$;

-- Builder-facing aggregate (service-role only, via dashboard): which modules
-- are touched across ALL businesses — the empirical "is this module dead weight?" answer.
CREATE OR REPLACE FUNCTION usage_cross_business_adoption()
RETURNS TABLE (
  module_key TEXT,
  businesses_touching INT,
  total_events BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT module_key,
         COUNT(DISTINCT business_id)::INT,
         COUNT(*)::BIGINT
  FROM usage_events
  WHERE occurred_at >= NOW() - INTERVAL '30 days'
  GROUP BY module_key
  ORDER BY businesses_touching DESC;
$$;
REVOKE EXECUTE ON FUNCTION usage_cross_business_adoption FROM authenticated, anon;
-- Intended for the service role (builder dashboard) only.

GRANT EXECUTE ON FUNCTION usage_module_adoption(UUID, TIMESTAMPTZ) TO authenticated;

COMMENT ON TABLE usage_events IS
  'Usage telemetry — infrastructure for builder decisions (which modules get touched), not a sellable feature. Independent of entitlements.';
