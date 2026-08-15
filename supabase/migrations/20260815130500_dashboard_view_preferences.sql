-- Persist per-user dashboard representation choices across devices.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS dashboard_view_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_dashboard_view_preferences_object;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_dashboard_view_preferences_object
  CHECK (jsonb_typeof(dashboard_view_preferences) = 'object');
