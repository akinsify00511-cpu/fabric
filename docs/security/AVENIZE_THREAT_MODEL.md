# AVENIZE THREAT MODEL

**Version:** 1.0 (2026-08-24). Each threat: Prevention → Detection → Response → Test.
Tests named here exist in `tests/` or `supabase/tests/` unless marked (live) — those
run post-deploy against production.

## 1. Account takeover

- Prevent: MFA (TOTP + hashed backup codes, MfaGate enforced before app mount),
  WebAuthn passkeys, rate limiting (5 attempts / lockout), session hygiene
  (signOut clears caches + bumps generation refs).
- Detect: security_audit_log pre-auth failure counts; Riverways security_center.
- Respond: lockout window; reset on success; owner notified on critical changes.
- Test: vitest authProtocol suite (lockout/reset cycle); RLS attack suite.

## 2. Session theft / fixation

- Prevent: Supabase token refresh; detectSessionInUrl single-exchange (no manual
  double exchange); membership re-derived per session; MFA gate binds to session.
- Detect: anomalous pre-auth failures in security_center.
- Test: session-persistence audit scenarios (P0.3) — 7 scenarios verified.

## 3. Privilege escalation (intra-tenant)

- Prevent: staff role/member_kind immutability triggers; set_member_kind owner/admin
  gate + last-owner guard; module_status ready service-role only; platform allowlists
  client-denied.
- Test: memberKinds vitest suite + guard matrix on postgres:15 (employee→owner ERROR).

## 4. IDOR (insecure direct object reference)

- Prevent: membership-guarded SECURITY DEFINER RPCs (guards verify the caller's
  business before touching the requested row); token-scoped public RPCs
  (quote access_token, signing_token) are random, single-purpose, once-only where
  applicable.
- Test: cross-tenant smoke matrices (member vs outsider on every reader/writer).

## 5. Tenant escape (cross-business data access)

- Prevent: RLS `business_id IN (SELECT business_id FROM get_current_staff())`
  (post-080 rewrite); SECURITY DEFINER inventory generated guards; blanket EXECUTE
  grants revoked for brain-poisoning/cron/admin function classes.
- Detect: contract scanner + self-healing engine; schema-drift gate.
- Test: `supabase/tests/` RLS attack suite (SUITE_EXIT=0); cross-tenant denial smoke.

## 6. API abuse

- Prevent: api-gateway validates hashed keys, scope (`data:read`), IP allowlist,
  expiry, rotation flag; read-only methods; explicit resource allowlist; per-business
  scoping from the verified key (never user-supplied).
- Test: apiKeyGateway vitest suite (14 tests incl. all deny-paths, no-oracle contract).

## 7. Malicious uploads

- Prevent: server-side kind/mime/size caps in create-upload-path RPCs; private buckets;
  signed URLs; OCR/transcription never auto-commits business records (human confirm).
- Test: quickCaptureMultimodal suite (validation caps, mime allowlists).

## 8. Injection (SQL)

- Prevent: supabase-js parameterization; the one EXECUTE path (module value estimates)
  substitutes via format(%L) with server-stored SQL only — never client SQL.
- Test: schema-drift + migration apply gates; (live) failure testing pending DB access.

## 9. XSS

- Prevent: React escaping by default; DOMPurify for any HTML rendering; no
  dangerouslySetInnerHTML without sanitization (design-constitution slop scan also
  flags risky patterns).
- Test: oxlint + design gate; (live) UX test suite.

## 10. CSRF

- Prevent: token-based API (Authorization headers, no cookie-based mutation surface);
  SameSite cookies on Supabase auth; webhooks authenticated by HMAC not cookies.
- Test: edge-function auth matrix verified by unsigned-request probes (401).

## 11. Prompt injection (AI)

- Prevent: user question interpolated inside `<question>...</question>` marked
  untrusted + refusal rule; deterministic router answers from governed data first;
  LLM never gets service-role context (caller-JWT assembly).
- Test: copilotRouter anti-fabrication contract tests (15).

## 12. AI data leakage

- Prevent: ai_activity logs metadata only (contents never stored); copilot_messages
  business-scoped RLS; daily caps.
- Test: owner/outsider RLS fixtures on copilot tables.

## 13. Webhook manipulation

- Prevent: HMAC verification (Paystack SHA-512, Resend svix) BEFORE any state change;
  idempotency keys; provider re-verification; forward-only email status.
- Test: paymentsCore vitest suite; live-verified unsigned POST → 401.

## 14. Payment manipulation

- Prevent: server-side plan prices (browser never supplies amounts);
  payment_transactions ledger with trigger-enforced transitions; verify RPC is
  informational, ledger authoritative; webhook settles, never the redirect.
- Test: paymentsCore suite (state machine, amount-sufficiency, constant-time compare);
  (live) plan × billing-cycle smoke matrix pending secrets.

## 15. Insider access (platform operators)

- Prevent: platform surfaces aggregate-only by construction; tenant drill-down is an
  explicit audit-logged action; allowlist tables client-denied.
- Detect: platform_incident_investigations audit trail.
- Test: riverways gate matrix (tenant gets authorized:false + no payload).

## Standing rule

New threats discovered → add a section here FIRST (Prevention/Detection/Response/Test),
then implement. A threat without a test is an open risk, not a closed one.
