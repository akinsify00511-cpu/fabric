-- Reconcile the notifications body/message split brain.
-- The table has `body` (003/036) but several client writers insert `message`
-- (GamificationContext, businessNotifications, some page helpers). PostgREST
-- rejects unknown columns -> those inserts silently failed (recurring
-- "column notifications.message does not exist" errors seen in the log).
-- Keep the column both write paths expect and sync them with a trigger so
-- readers of either column always see the text.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;

CREATE OR REPLACE FUNCTION public.sync_notification_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.message IS NULL OR btrim(NEW.message) = '' THEN
    NEW.message := NEW.body;
  END IF;
  IF NEW.body IS NULL OR btrim(NEW.body) = '' THEN
    NEW.body := NEW.message;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notifications_sync_message ON public.notifications;
CREATE TRIGGER trg_notifications_sync_message
  BEFORE INSERT OR UPDATE OF body, message ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_notification_message();

UPDATE public.notifications SET message = body WHERE message IS NULL;
