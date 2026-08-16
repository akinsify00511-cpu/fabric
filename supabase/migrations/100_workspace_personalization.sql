-- 100_workspace_personalization.sql
-- User-driven workspace selection (the "selected" axis of the access model).
--
-- Access model (three intersecting gates; selection can NEVER grant access):
--   entitled  (plan)        — business_entitlements.features  [DB source of truth]
--   role      (functional)  — staff_functional_roles          [DB source of truth]
--   selected  (user)        — user_workspace_selections       [this migration]
-- A tool is visible/usable only when ALL three permit it. "Selected" is a
-- *removal* filter: an empty selection means "show everything I'm authorized
-- for" (sensible default — no overwhelming). A user can only deselect tools
-- they are already entitled+role-allowed to see; they cannot self-grant.
--
-- Degrades gracefully: if this table is absent on the live DB (deployment
-- drift), callers treat "no row / error" as "no selection made" and fall
-- back to the entitled+role set — identical to pre-migration behavior.

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.user_workspace_selections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- The tool keys (useToolAccess.TOOLS[].key) the user has chosen to keep
  -- visible. NULL or empty array = "no curation — show all I'm authorized
  -- for". A tool absent from this array is hidden from that user's nav.
  selected_tools TEXT[] NOT NULL DEFAULT '{}',
  -- When the user explicitly finished the onboarding selection step. Lets us
  -- distinguish "hasn't curated yet" (show all) from "curated to a subset".
  selection_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One selection row per user (a user belongs to one business at a time).
  CONSTRAINT user_workspace_selections_user_key UNIQUE (user_id)
);

-- updated_at maintenance trigger (reuses the helper from 007 if present;
-- defined inline here so this migration is self-contained if 007's helper
-- is unavailable on a fresh DB).
CREATE OR REPLACE FUNCTION public.touch_workspace_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_selections_updated ON public.user_workspace_selections;
CREATE TRIGGER trg_workspace_selections_updated
  BEFORE UPDATE ON public.user_workspace_selections
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_selections_updated_at();

-- RLS: a user manages only their own selection row. The business_id column is
-- denormalized for analytics/queries but is always the user's own business
-- (a user belongs to one business), so the user_id check is sufficient and
-- tight. Service role bypasses RLS for cross-business analytics.
ALTER TABLE public.user_workspace_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_workspace_selections_self_select ON public.user_workspace_selections;
CREATE POLICY user_workspace_selections_self_select
  ON public.user_workspace_selections
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Grant to authenticated (app users). anon gets nothing — this is personal
-- user state, never public.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace_selections TO authenticated;
