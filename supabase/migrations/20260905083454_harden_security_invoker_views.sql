-- Security hardening: views must enforce the querying user's RLS context.
-- Without security_invoker, these views can execute with the view owner's
-- privileges and bypass tenant policies on their underlying tables.
alter view public.entity_freshness_status set (security_invoker = true);
alter view public.approval_requests set (security_invoker = true);
