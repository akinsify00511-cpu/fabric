-- Production RPC surface hardening follow-up.
-- This helper/trigger assertion must never be exposed through the PostgREST API.
REVOKE EXECUTE ON FUNCTION public.assert_posted_journal_entry_balanced() FROM PUBLIC, anon, authenticated;
