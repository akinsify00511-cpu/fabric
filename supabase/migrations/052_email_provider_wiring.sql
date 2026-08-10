-- ============================================================================
-- Migration 052: Email provider wiring
-- ----------------------------------------------------------------------------
-- The send-email-notification edge function existed but was never invoked
-- automatically — notifications with channel 'email'/'both' sat in the
-- queue forever unless someone POSTed to the function manually. This
-- migration adds an AFTER INSERT trigger that fans email-channel
-- notifications out to the edge function via pg_net (now enabled in 051),
-- and a seed for the business-scoped email config keys the function reads.
-- ============================================================================

\set ON_ERROR_STOP on

-- ----------------------------------------------------------------------------
-- 1. notify_email_channel() — fire-and-forget POST to the edge function when
--    an email-channel notification is inserted. Runs as SECURITY DEFINER so
--    the trigger (which executes as the inserting role) can use net.http_post
--    across the public schema without hitting RLS on the http call itself.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_email_channel()
RETURNS trigger AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Only fan out notifications routed to email.
  IF NEW.channel IN ('email', 'both') AND NEW.email_sent IS DISTINCT FROM TRUE THEN
    v_edge_url := COALESCE(
      current_setting('app.avenize_edge_url', true),
      'https://avnenzpwqcnqvxwvtsqb.supabase.co/functions/v1/send-email-notification'
    );
    v_service_key := current_setting('app.avenize_service_key', true);

    -- Async HTTP POST; net.http_post returns immediately and the edge
    -- function does the actual Resend API call.
    PERFORM net.http_post(
      url := v_edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CASE WHEN v_service_key IS NOT NULL
                              THEN 'Bearer ' || v_service_key
                              ELSE to_jsonb(''::text) END
      ),
      body := jsonb_build_object('notificationId', NEW.id, 'userId', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop + recreate so re-running the migration is idempotent.
DROP TRIGGER IF EXISTS notifications_email_fanout ON public.notifications;
CREATE TRIGGER notifications_email_fanout
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_email_channel();

-- ----------------------------------------------------------------------------
-- 2. Seed default email config keys (Resend API key empty, branded from
--    address) so the settings table has the rows the edge function expects.
--    Each existing business gets a row; value is NULL until an admin sets it.
-- ----------------------------------------------------------------------------
INSERT INTO public.settings (business_id, key, value)
SELECT b.id, 'email_from_address', 'notifications@avenize.com'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s
  WHERE s.business_id = b.id AND s.key = 'email_from_address'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (business_id, key, value)
SELECT b.id, 'resend_api_key', NULL
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s
  WHERE s.business_id = b.id AND s.key = 'resend_api_key'
)
ON CONFLICT DO NOTHING;
