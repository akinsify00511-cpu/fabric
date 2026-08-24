# DOMAIN: INTEGRATIONS

**Purpose:** controlled integration architecture — no third-party service is added
casually; every integration defines auth, permissions, secrets, rate limits, retries,
webhooks, sync, conflict resolution, disconnect, and failure behavior.

## Approved integrations (the complete list)

| Provider | Purpose | Auth | Secrets location | Webhook | Failure behavior |
|---|---|---|---|---|---|
| Supabase | Postgres/Auth/Storage/Edge | publishable (browser) + service-role (edge only) | env vars | — | app degrades honestly; SW offline fallback |
| Vercel | hosting/deploy | CI secrets | GitHub secrets | deploy hooks | rollback via redeploy |
| Paystack | payments | secret key server-side | edge secret PAYSTACK_SECRET_KEY | HMAC-SHA512 + re-verify | ledger untouched; manual rail fallback |
| Resend | transactional email | API key server-side | RESEND_API_KEY + EMAIL_FROM | svix-verified, forward-only | queue retains; drain on recovery |
| Termii | SMS (paging + OTP) | API key server-side | settings (owner/manager RLS) / edge | — | send via edge fn only |
| OpenAI/Anthropic | optional LLM for copilot | API key server-side | edge secrets | — | deterministic fallback answers |
| Sentry | error reporting | DSN (public, client) | VITE_SENTRY_DSN (build-time; tree-shaken absent) | — | zero-cost when unset |
| Jitsi | meeting video | none (public embed) | none | — | lobby/chat still work |

**Outbound webhooks:** dispatch-webhooks edge fn (shared-secret auth, HMAC-signed
deliveries, delivery ledger).

**Public API:** api-gateway edge fn — hashed key verification, scope check
(data:read), read-only methods, explicit resource allowlist, business scoping from
the verified key. Key lifecycle: generate (shown once) → rotate (needs_rotation flag)
→ revoke.

**Platform integration registry:** platform_integrations rows (paystack/resend
seeded); integration health recorded via record_integration_check (service-role);
failure streaks drive alerting; reset on success.

## Rules

1. New integration → a row here + platform_integrations + a threat-model section +
   a failure-behavior statement BEFORE the first line of code.
2. Provider secrets are server-side only; the browser never holds them (settings RLS
   split + edge-fn mediation).
3. Every webhook verifies the provider signature BEFORE any state change, is
   idempotent, and (where the provider supports it) re-verifies against the provider.
4. Retries: exponential backoff where applicable (automation DLQ pattern); email
   queue drains rather than drops.
5. Disconnect: revoking a secret/key must degrade the feature honestly, not corrupt
   state.

**Tests:** paymentsCore, emailSubsystem, apiKeyGateway suites; unsigned-webhook 401
probes (paystack-webhook live-verified).

**Definition of Done:** the integration is observable (health checks), its failure
mode is honest, and its secrets are unreachable from the browser.
