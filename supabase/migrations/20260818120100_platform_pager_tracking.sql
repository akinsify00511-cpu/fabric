-- Follow-up to 20260818120000: paging-dedup column + platform_pages audit log.
-- The proactive pager edge function (platform-pager) needs to know which
-- incidents it has already paged (so it doesn't re-page every run for an
-- incident that's still open). This adds paged_at to platform_incidents and a
-- platform_pages audit row for every page dispatched. Idempotent.

ALTER TABLE public.platform_incidents
  ADD COLUMN IF NOT EXISTS paged_at timestamptz;

CREATE TABLE IF NOT EXISTS public.platform_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.platform_incidents(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.platform_oncall_contacts(id) ON DELETE SET NULL,
  channel text NOT NULL,               -- 'email' | 'sms' | 'both'
  recipient text NOT NULL,            -- the email or phone paged
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_status text,               -- 'sent' | 'failed'
  error text
);

CREATE INDEX IF NOT EXISTS platform_pages_incident_idx
  ON public.platform_pages (incident_id, sent_at DESC);

ALTER TABLE public.platform_pages ENABLE ROW LEVEL SECURITY;
