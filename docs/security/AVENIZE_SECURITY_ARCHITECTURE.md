# AVENIZE SECURITY ARCHITECTURE

**Version:** 1.0 (2026-08-24). Subordinate to Product Constitution Article IV.

## Defense-in-depth layers

```text
1. Supabase Auth (email/password, OAuth, TOTP MFA via MfaGate, WebAuthn passkeys)
2. Rate limiting (check_auth_rate_limit read-only / record_auth_failure /
   reset_auth_rate_limit — pre-auth callable, NOT membership-gated)
3. Postgres RLS via get_current_staff() — the ONLY authorization boundary
4. SECURITY DEFINER RPCs with explicit membership guards (zz_rpc_tenant_guards_closure)
5. Edge-function auth matrix (per-function JWT policy — see below)
6. Client UX gates (permissions.ts, RequireModule, itemVisible) — NEVER security
```

## Privilege-escalation hardening (Session 33b closures — regression-tested)

- `enforce_staff_role_immutability` trigger: role/member_kind mutation requires the
  CALLER to be owner/admin in the same business. An employee cannot self-promote.
- Claims write policies dropped: intelligence ledger writes only via members-only
  SECURITY DEFINER RPCs (brain-poisoning vector closed).
- `enforce_business_structural_immutability`: organization_id/parent_business_id/
  entity_type changes require owner/admin (organization-move vector closed).
- Last-owner guard in `set_member_kind`.

## Credential handling

- Browser holds ONLY the publishable key (RLS is the boundary; it is embedded in the
  bundle by design). No service-role key, no provider secret in client code.
- Provider secrets (Paystack, Resend, Termii) live in Edge Function secrets or
  owner/manager-only settings rows (settings RLS split: non-secret business-readable,
  type='secret' owner/manager only).
- TOTP secrets and API keys: API keys are SHA-256 hashed (`verify_api_key` re-hashes
  server-side; legacy plaintext rows flagged `needs_rotation`). TOTP secret is
  user-scoped plaintext by TOTP's nature — compensated by MFA enforcement.
- Payment gateway secret columns are never SELECTed to the client.

## Edge-function auth matrix (verified per function; enforced by deploy script)

| Function | Platform JWT | Caller auth |
|---|---|---|
| ask-avenize, parse-intent, paystack-verify, subscription-management | ON | browser JWT + membership/owner checks |
| paystack-webhook, resend-webhook | OFF | provider HMAC signature |
| execute-automation, platform-health-check, email-service, dispatch-webhooks | OFF | shared secret |
| api-gateway | OFF | self-authed (API key via verify_api_key) |
| webauthn | OFF | ceremony-scoped (pre-auth by design) |

`scripts/deploy_edge_functions.sh` encodes this matrix — do not hand-deploy with
different flags.

## Webhook security

- Paystack: HMAC-SHA512 signature → idempotency insert → RE-VERIFY against Paystack
  API → settle ledger. Constant-time comparison. (Shared logic in
  `_shared/paymentsCore.ts`, vitest-tested — no mirror-copy drift.)
- Resend: svix signature verification; status advances forward-only.
- dispatch-webhooks: HMAC-signed outbound; delivery ledger.

## Storage security

- Buckets are PRIVATE. Access via short-lived signed URLs minted after a
  membership-verifying RPC (`generate_recording_signed_url`,
  `generate_capture_attachment_url`). `getPublicUrl` on a private bucket = violation.
- Upload validation is server-side in the create-upload-path RPCs (kind/mime/size
  caps: image ≤15MB image/*, audio ≤50MB, file ≤25MB document allowlist).
- Storage RLS keys off the path convention `{business_id}/...` with TEXT segment
  comparison (no uuid cast that could error the query).

## Platform surfaces

- `platform_admins` / `riverways_admins` allowlist tables are RLS-denied to ALL
  clients (service-role managed). Gates return `{authorized:false}` with no payload.
- Tenant drill-down from the ops console is an explicit, audit-logged action
  (`platform_incident_investigations`).

## AI security

See `docs/ai/AVENIZE_AI_GOVERNANCE.md`: caller-JWT context assembly (never
service-role aggregates), fenced untrusted input, daily caps, metadata-only AI
activity logging.
