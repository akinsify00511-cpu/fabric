# AVENIZE SUBSYSTEM INVENTORY (Master Directive §4)

**Audit date:** 2026-08-24. **Verified against:** origin/main `93ed1b0`.
**Method:** direct tree inspection + gate execution (tsc 0 errors; vitest 723/723;
schema-drift OK: 225 tables / 19 RPCs / 4 buckets backed; design-constitution PASS;
contract manifest 946 objects). Live-production state is separately gated — see the
BLOCKED section of the session report and `LIVE_DB_APPLY_RUNBOOK.md`.

Legend: COMPLETE (code-complete + verified) / PARTIAL / BROKEN / MISSING / DUPLICATED /
DEPRECATED / UNKNOWN. "Code-complete, deploy-gated" means verified in repo + CI but
awaiting the live-DB/edge deploy step that requires user credentials.

## Inventory

| Subsystem | Classification | Evidence / anchor |
|---|---|---|
| Auth (signup/login/logout/recovery/OAuth) | COMPLETE | AuthContext membership state machine; zzz_auth_protocol_repair.sql; session-persistence audit (P0.3) |
| MFA (TOTP) | COMPLETE | MfaGate before RequireAuth; otpauth; backup codes hashed |
| Passkeys (WebAuthn) | COMPLETE code-side, deploy-gated | webauthn edge fn + credential registry; needs edge deploy + RP secrets |
| Rate limiting (auth) | COMPLETE | check/record/reset protocol; Login+Signup wired; fails open if undeployed |
| Onboarding | COMPLETE | create_business_and_owner repaired; tool-selection step; industry seeding |
| Organization & governance | COMPLETE code-side, deploy-gated | org hierarchy + subsidiaries + board governance layer (20260822120000) |
| Permissions / RLS | COMPLETE | 080 cross-tenant rewrite; RPC tenant-guard closure (zz_); red-team suite SUITE_EXIT=0 |
| Entitlements (module gate) | COMPLETE | two-flag entitled×ready; can_access_module; 8 plan codes unified |
| Meetings lifecycle | COMPLETE code-side, deploy-gated | lifecycle RPCs, participants evidence, private recordings, transcript/summary/decisions/actions/reports/analytics (Phases A–E) |
| Capture (multimodal) | COMPLETE code-side, deploy-gated | text/voice/image/file; capture-process edge fn; OCR "null, don't fabricate" |
| CRM (leads/deals/contacts) | COMPLETE | role-gated, per-subsidiary scoping |
| Demand chain (lead→request→quote→order→revenue) | COMPLETE | zzzaaa_demand_capture; public quote portal; funnel/revenue RPCs |
| Payments (Paystack) | COMPLETE code-side, deploy-gated | payment_transactions ledger + HMAC webhook + re-verify; PR #25 unified checkout; needs PAYSTACK_SECRET_KEY + edge deploys |
| Email (Resend) | COMPLETE code-side, deploy-gated | email_events ledger, 19 templates, queue_email, webhook |
| Notifications | COMPLETE | notifications + templates + preferences; bell with priority ordering; anti-spam |
| Guidance (onboarding/empty states/NBA) | COMPLETE | ToolOnboardingPopup, gamified EmptyState, feature_discovery, trial_assistance |
| Analytics / self-instrumentation | COMPLETE | usage_events + funnel RPCs; owner_intelligence; builder_dashboard |
| AI / Business Brain | COMPLETE code-side, deploy-gated | business_brain aggregator; ask-avenize edge fn (deterministic router → optional LLM → honest fallback) |
| Admin control plane (Riverways) | COMPLETE code-side, deploy-gated | 20260821150000/160000; 10 tabs; fails closed |
| Observability / platform ops | COMPLETE | platform_error_events + incidents + thresholds + paging; Sentry lazy/DSN-gated (PR #26) |
| Search | PARTIAL | transcript FTS + Riverways global search + command palette exist; no unified cross-tenant-scoped business search RPC (see docs/domains/SEARCH.md) |
| Files / storage | COMPLETE | private buckets + signed-URL pattern + validation caps |
| Integrations | COMPLETE (Paystack, Resend, API gateway) | platform_integrations; api-gateway with hashed keys; dispatch-webhooks |
| Discovery (SEO/GEO/AEO/AIO) | COMPLETE | robots.txt + RouteMeta + sitemap + llms.txt + truthful JSON-LD + discovery_intelligence layer |
| Design system | COMPLETE (burning down) | token-only rule + CI baseline ratchet (hex 1076/1214) |
| Mobile app | PARTIAL | Expo app builds green in CI (unsigned APK, simulator iOS); 5 screens; Supabase env via GH secrets |
| Production DB sync | BLOCKED (credentials) | contract gate honestly FAILS until live DB apply + edge deploys + secrets |

## Duplicates / drift found during THIS audit

1. **DUPLICATED migration number — RESOLVED (2026-08-24):**
   `20260822140000_governance_meeting_scheduling.sql` was renumbered to
   `20260822141000` (collided with `20260822140000_contract_scan_extension.sql`).
   Verified unapplied to live DB before renumbering; contract manifest + integrity
   seed regenerated (deterministic); full chain applies clean on postgres:15; zero
   numeric duplicates remain.
2. **DEPRECATED — RESOLVED:** `MeetingsV2.tsx` was removed on origin/main by a
   parallel session; only the `/app/meetings-new → /app/meetings` redirect remains
   (the correct final state).
3. Root-level doc sprawl (30+ governance .md files at repo root) — consolidated by
   reference into `docs/`; root files kept as operational detail, not deleted, to avoid
   breaking CI references (`check_design_constitution.py` reads the root baseline JSON).

## NOT rebuilt (verified already-complete; do not duplicate)

Feature discovery, plan recommendation, function×seniority homes, workspace
personalization, adaptive dashboard, self-instrumentation, sector benchmarks,
automation health + scheduled executor, API key gateway, platform ops dashboard,
demand capture chain, receipt OCR, WebAuthn, generative copilot shell.
