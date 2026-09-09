-- Production RPC surface hardening
-- Keep anonymous access only for deliberately public token/profile/auth flows.

REVOKE EXECUTE ON FUNCTION public.assert_posted_journal_entry_balanced() FROM anon;

-- Public portal, quote, signature, SSO discovery, currency and auth-rate-limit
-- functions remain executable by anon by design and are constrained by their
-- token/identifier inputs and internal authorization checks.
