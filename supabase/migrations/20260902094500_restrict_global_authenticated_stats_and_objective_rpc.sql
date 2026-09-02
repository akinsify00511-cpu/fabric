-- Prevent authenticated clients from invoking global/sensitive SECURITY DEFINER analytics RPCs.
-- These functions aggregate cross-business data or accept an object id without a
-- tenant boundary; internal/server paths retain access through their existing roles.

REVOKE EXECUTE ON FUNCTION public.get_campaign_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ticket_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.onboarding_conversion() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.objective_progress(uuid) FROM authenticated;
