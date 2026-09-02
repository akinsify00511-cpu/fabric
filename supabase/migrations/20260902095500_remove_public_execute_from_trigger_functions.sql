-- Trigger-only SECURITY DEFINER functions must not be directly callable by API roles.
-- queue_email remains callable by authenticated application flows; anonymous callers are denied.
revoke execute on function public.enqueue_meeting_capture_media() from public;
revoke execute on function public.fanout_email_event() from public;
revoke execute on function public.queue_payment_lifecycle_email() from public;
revoke execute on function public.queue_subscription_lifecycle_email() from public;
revoke execute on function public.queue_email(uuid,text,text,jsonb,uuid) from anon;
