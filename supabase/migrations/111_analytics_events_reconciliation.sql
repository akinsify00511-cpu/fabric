-- ============================================
-- 111: Analytics events reconciliation (close the 401)
-- ============================================
-- Root cause of the analytics 401: THREE competing definitions.
--   019 created analytics_events(event_category TEXT, event_properties, page_url, ...)
--       + a track_event() function (different name, unused by the client).
--   037 created analytics_events(category event_category, user_id, component, action, metadata, ...)
--       IF NOT EXISTS (no-op since 019 won) + record_analytics_event(p_category event_category).
--   998 defined record_analytics_event TWICE more with DIFFERENT signatures
--       (one inserts into event_type/properties/referrer columns that don't exist).
-- The live client (src/lib/eventTracker.ts) calls record_analytics_event with
-- named args p_business_id, p_user_id, p_event_name, p_category, p_page,
-- p_component, p_action, p_metadata, p_duration_ms, p_session_id and reads
-- columns category/action/event_name/user_id/created_at/business_id. On a live
-- DB where the wrong CREATE OR REPLACE FUNCTION won (or the enum type doesn't
-- exist because 037 failed), PostgREST returns a function-not-found / signature
-- mismatch / permission error surfaced as a 401 to the browser.
--
-- This migration makes ONE canonical table + ONE canonical RPC matching what
-- the client actually sends. Idempotent. Drops the conflicting function defs
-- first so the canonical one is unambiguous.

-- ── 1. Normalize the table to the columns the live caller uses ─────────
-- 019's table is the one that exists; add the columns the client reads/writes
-- and keep the legacy columns (no destructive ALTER — old data survives).
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS component TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS page TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Backfill the new columns from the legacy 019 columns where present so
-- historical events remain queryable under the new column names.
UPDATE analytics_events
  SET category = COALESCE(category, event_category),
      metadata = COALESCE(metadata, event_properties),
      page = COALESCE(page, page_url)
  WHERE (category IS NULL AND event_category IS NOT NULL)
     OR (metadata = '{}'::jsonb AND event_properties IS NOT NULL)
     OR (page IS NULL AND page_url IS NOT NULL);

-- Indexes the readers use.
CREATE INDEX IF NOT EXISTS idx_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON analytics_events(category);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at DESC);

-- ── 2. Drop the conflicting record_analytics_event definitions ───────
-- There are up to three overloads across 037 + 998. We enumerate the known
-- TEXT-signature overloads explicitly, then sweep any remaining overload by
-- name via pg_proc (robust against a signature we didn't predict). The
-- event_category-enum overload is dropped inside the DO block (guarded) so it
-- doesn't error if the enum TYPE never got created (037 may have failed).
DROP FUNCTION IF EXISTS record_analytics_event(
  UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT
);
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT pg_get_function_identity_arguments(oid)
    FROM pg_proc
    WHERE proname = 'record_analytics_event'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.record_analytics_event(%s)', sig);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'record_analytics_event cleanup: %', SQLERRM;
END $$;

-- ── 3. One canonical RPC matching the live client ────────────────────
-- SECURITY DEFINER so it bypasses RLS (the table has SELECT-only policies;
-- inserts must go through this function). p_category is TEXT (not the enum)
-- so any client string is accepted and stored; the enum from 037 caused
-- signature mismatches and required the event_category TYPE to exist.
CREATE OR REPLACE FUNCTION record_analytics_event(
  p_business_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_page TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_duration_ms INTEGER DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO analytics_events (
    business_id, user_id, event_name, category,
    page, component, action, metadata, duration_ms, session_id
  ) VALUES (
    p_business_id, p_user_id, p_event_name, p_category,
    p_page, p_component, p_action, p_metadata, p_duration_ms, p_session_id
  )
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_analytics_event TO authenticated;

-- ── 4. INSERT policy on the table (defense in depth) ──────────────────
-- The RPC is SECURITY DEFINER (bypasses RLS), but if a client ever inserts
-- directly, require the row's business_id to match the caller's staff.
DROP POLICY IF EXISTS "Users insert own analytics" ON analytics_events;
CREATE POLICY "Users insert own analytics"
  ON analytics_events FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- Ensure the existing SELECT policies cover the new user_id column path.
-- (019/037 already grant admin-business SELECT + own-user SELECT; no change.)

-- ── 5. Drop the unused track_event from 019 to avoid future confusion ─
-- (It is never called by the client; keeping a second insert path invites
--  the same drift to recur.)
DROP FUNCTION IF EXISTS track_event(TEXT, TEXT, JSONB, TEXT, TEXT);
