# DOMAIN: IDENTITY

**Purpose:** authenticate users and prove who they are, securely, without ever
destroying a valid session.

**Responsibilities:** signup, login (password/OAuth/passkey), logout, password
recovery, email verification, MFA (TOTP + backup codes), session persistence and
recovery, membership resolution.

**Entities:** auth.users (Supabase), staff (membership), user_mfa,
webauthn_credentials / webauthn_challenges / webauthn_audit_log, auth_rate_limits,
security_audit_log.

**States:** MembershipState = loading | anonymous | member | onboarding_required |
deactivated | error (AuthContext is the ONLY membership authority — Login/Onboarding
defer to it; a failed onboarding never destroys a session).

**User flows:** signup → verify → onboarding; login → (MFA challenge) → membership
route; expired session → /login?redirect=<original> → back to the same page;
passkey login (discoverable credentials, counter-monotonic clone detection).

**Permissions:** pre-auth RPCs (check_auth_rate_limit, log_security_event) are NOT
membership-gated and are anon-callable by design; everything else requires a session.

**Database:** zzz_auth_protocol_repair.sql (canonical); rate-limit 3-function
protocol; webauthn registry (public key + counter only — nothing secret stored).

**APIs:** supabase auth client; webauthn edge fn; create_business_and_owner (onboarding
boundary); check/record/reset_auth_rate_limit.

**Events:** auth.sign_in / auth.sign_out → platform_activity_events.

**Notifications:** security-critical email templates (security alert) via the email
subsystem.

**Analytics:** onboarding_conversion (abandonment = auth.users minus staff — a FACT,
not tab-close inference).

**AI interaction:** none direct.

**Failure states:** rate-limit unavailable → fail OPEN (never block login on infra);
staff fetch failure → retry with backoff, membership 'error' state with retry-in-place
(never logout); MFA unavailable → honest message.

**Recovery:** reset_auth_rate_limit on success; orphaned-membership reconciliation in
LIVE_DB_APPLY_RUNBOOK.md.

**Security:** see security/AVENIZE_SECURITY_ARCHITECTURE.md layers 1–2; threat model
§1–2. MfaGate renders before RequireAuth; passkey registration requires an existing
session (passkeys attach to accounts, never create them).

**Accessibility:** labeled inputs, keyboard-complete flows, focus on errors,
WCAG 2.2 AA contrast.

**Performance:** membership fetch is a single staff read with monotonic fetchId
discarding stale fetches; no waterfall.

**Tests:** authProtocol vitest suite (18); session-persistence 7-scenario audit;
lockout/reset cycle on postgres:15.

**Definition of Done:** all 7 session scenarios verified; MFA gate enforced;
lockout proven; onboarding never bricks an existing user.
