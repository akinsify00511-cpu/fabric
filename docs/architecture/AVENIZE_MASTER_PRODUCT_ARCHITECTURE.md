# AVENIZE MASTER PRODUCT ARCHITECTURE

**Status:** Canonical architecture specification. **Version:** 1.0 (2026-08-24)
**Subordinate to:** `docs/constitution/AVENIZE_PRODUCT_CONSTITUTION.md`.
**Verified against:** repository tree at origin/main `93ed1b0` (2026-08-24).

---

## 1. System Shape

Avenize is a single-page application talking directly to Postgres through Supabase.
There is NO dedicated backend server.

```text
Browser SPA (Vite + React 19 + TypeScript, Tailwind v4)
   │  supabase-js (publishable key only — RLS is the boundary)
   ▼
Supabase project kgsgqvatyleetyquffya
   ├── Postgres + Row-Level Security (the ONLY authorization boundary)
   ├── 201 migrations (supabase/migrations/, filename-ordered, idempotent)
   ├── 12 Edge Functions (Deno) + _shared modules
   ├── Storage buckets (private; signed URLs only)
   └── Auth (email/password + OAuth + TOTP MFA + WebAuthn passkeys)
Vercel — SPA hosting + deploy pipeline (deploy.yml)
Paystack — payments (server-side checkout + HMAC webhook; browser never decides success)
Resend — transactional email (queued ledger + webhook-advanced delivery status)
Sentry — runtime error reporting (lazy-loaded, DSN-gated, tree-shaken when unset)
```

Delegation philosophy (standing decision, Session 51): Avenize owns intelligence,
business logic, orchestration, and monitoring; commodity infrastructure is delegated
to proven providers (Supabase, Vercel, Paystack, Resend). No other external
dependency is added casually (see docs/domains/INTEGRATIONS.md).

## 2. Authoritative Boundaries

| Concern | Authority | NOT the authority |
|---|---|---|
| Authorization | Postgres RLS via `get_current_staff()` | permissions.ts, RequireModule, nav gating (UX only) |
| Membership | AuthContext `MembershipState` | Login/Onboarding components (they never decide) |
| Payment state | `payment_transactions` ledger | browser callbacks, provider redirects |
| Pricing | `pricing_tiers` table | any hardcoded plan map |
| Module access | `can_access_module` (entitled AND ready) | nav visibility |
| Contract truth | migration chain → `production_contract.json` (generated) | hand-maintained lists |
| Time/lifecycle | server-side triggers + state machines | client-side timers (e.g. localStorage trial) |

## 3. The Intelligence Organism

The product is one organism: a Brain coordinating a body of modules.

- **Event bus:** `business_events` + `emit_business_event` (058/059/090) — the nervous
  system. Handlers (propagation → relationship derivation → freshness) run in
  `run_order`. Emission is best-effort; telemetry never breaks a business write.
- **Governed metrics:** `metric_definitions` → `refresh_business_metrics` (only writer)
  → `kpi_metrics` with sample_size + confidence. Insufficient data = NULL, never a guess.
- **Brain:** `business_brain(business_id)` aggregates state (classify_business_state),
  pulse (compute_business_health), diagnoses (diagnose_business + diagnosis_rules),
  next-best-action (next_best_action), and value ledger (business_value_ledger).
  Per-engine EXCEPTION isolation — one engine's failure degrades one card, not the page.
- **Recommendations:** a recommendation IS a `claims` row with a full lifecycle
  (issued→acknowledged→accepted/rejected→acted→outcome_recorded). Effectiveness feeds
  back (`recommendation_effectiveness`) — the outcome loop closes.
- **Home:** `/app` = BusinessHome (intelligence-first, Function × Seniority windows).
  Role/function personalization is UX emphasis ONLY; RLS stays the boundary.

## 4. Platform vs Business Surfaces

- `/app/*` — tenant surfaces, business-scoped, RLS-bounded.
- `/builder`, `/platform-ops`, `/riverways-admin` — platform-operator surfaces gated by
  `is_platform_admin()` / `is_riverways_admin()` (email-allowlist tables that are
  RLS-denied to all clients; service role only). These return `{authorized:false}` with
  NO payload to non-admins. A business owner is NOT a platform admin.
- Public surfaces: `/`, `/pricing`, `/signup`, `/book`, `/quote/:token`, `/sign/:token`.
  Everything else is private (robots + RouteMeta enforce the boundary for crawlers).

## 5. Production Contract Reconciliation (the anti-drift system)

- `scripts/generate_contract_manifest.py` extracts the canonical contract from the
  migration chain (string-literal-aware parser; honors DROP) + scans the frontend for
  every `.from/.rpc/.storage.from/.functions.invoke` reference. Fails CI if any frontend
  reference lacks a canonical definition. Emits `supabase/contract/production_contract.json`
  (946 objects) + the generated seed migration (one integrity_rules row per object).
- `run_integrity_scan()` (DB) generalizes the scan to the live database; findings for
  pruned rules auto-resolve; security-sensitive drift raises SECURITY_REPAIR_REQUIRED.
- `scripts/verify-production.sh` + `verify_production_contract.py` are the production
  smoke gate — the FINAL step of deploy.yml. A deploy is successful when the contract
  check passes, not when Vercel builds.
- Type-alias normalization lives in THREE places (SQL normalizer, generator, live
  comparator) with word-boundary matching — keep them in sync when editing one.

## 6. Data & State

- Canonical data model: `docs/data/AVENIZE_CANONICAL_DATA_MODEL.md`.
- State machines: `docs/data/AVENIZE_STATE_MACHINES.md` — invalid transitions are
  rejected server-side (trigger-enforced where critical, e.g. payments).
- Events: `docs/data/AVENIZE_EVENT_ARCHITECTURE.md`.
- Entitlements: `docs/data/AVENIZE_ENTITLEMENTS.md` (two-flag gate: entitled AND ready).

## 7. Deployment & Gates

CI (ci.yml): typecheck → unit tests → schema-drift → contract-manifest (deterministic
diff) → migration-test (bare postgres:15 full-chain apply + idempotency) →
edge-functions (deno check, `--node-modules-dir=none`) → design-constitution → build.
deploy.yml: Vercel deploy → verify-production.sh smoke gate (self-calibrates the
publishable URL+key from the deployed bundle; never requires a service-role key).

**Standing deploy gate (user-credential-gated):** live DB migration apply
(`scripts/apply_migrations_live.sh` with SUPABASE_DB_URL) + edge-function deploy
(`scripts/deploy_edge_functions.sh` with correct per-function JWT policy) + secrets
(PAYSTACK_SECRET_KEY, RESEND_API_KEY + EMAIL_FROM, RESEND_WEBHOOK_SECRET, APP_URL).
Until then the frontend degrades gracefully and the production gate honestly FAILS.
See `LIVE_DB_APPLY_RUNBOOK.md`.

## 8. Invariants Future Developers Must Preserve

1. RLS is the boundary; SECURITY DEFINER + business param ⇒ membership guard.
2. Browser never holds privileged credentials; never trusts client-reported payment state.
3. No parallel systems; compose on canonical tables/RPCs.
4. No fabricated numbers; insufficient data is shown honestly.
5. Every migration idempotent; full chain applies clean on bare postgres:15.
6. Generated artifacts are deterministic; edit generators, not artifacts.
7. Telemetry is fire-and-forget; a telemetry failure never breaks a business write.
8. New `.from()`/`.rpc()` references must have backing migrations BEFORE merge
   (schema-drift gate). New SECRET handling never reaches the client.
9. The Journey Rule: no feature is complete until its entire user journey works from entry
   point to business outcome, proven by an executable acceptance suite — never inferred from
   pages existing (Excellence Constitution, Article I).

Subsystem target architectures (grounded in verified current state):
- Meetings: `docs/architecture/AVENIZE_MEETING_SYSTEM_ARCHITECTURE.md` (unified Meeting
  workspace: video/audio/chat/capture in-meeting; the meeting record as the central object;
  gap list G1–G9 + phased closure M1–M6).
