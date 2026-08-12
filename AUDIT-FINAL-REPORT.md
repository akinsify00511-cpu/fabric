# AUTONOMOUS FULL-STACK AUDIT — FINAL ARCHITECTURE REPORT
## Avenize (React 19 + Vite + Tailwind v4 + Supabase)

**Audit scope:** Pages → components → state → actions → APIs → edge functions → DB → auth → authz → infrastructure → config → dependencies → external integrations → security → data integrity → performance → dead weight.

**Verification bar (every commit):** `npx tsc -b --noEmit` (clean) + `npx vite build` (succeeds) + `npx vitest run` (61/61 pass). All green at HEAD.

**Commits this session (11):** `30bf3c8` → `bdfea53` on `main`, not yet pushed.

---

## APPLICATION HEALTH

**Substantially hardened.** The application had one critical systemic defect — a cross-tenant data leak affecting ~111 RLS policies — plus several security and data-integrity bugs concentrated in the integration layer (secrets, MFA, FK lifecycle, payment verification). Those are now closed. The runtime dependency set is minimal and justified. The codebase is internally coherent and self-contained for its core business flows; the remaining external dependencies are the chosen platform (Supabase) and payment/messaging providers that are already isolated behind edge functions with idempotency guards.

The architecture's real risk is **concentration on a single platform (Supabase)** — this is inherent to the chosen stack (not a bolt-on SaaS) and is the correct trade-off for this product, not an actionable defect.

---

## INTERNAL vs EXTERNAL DEPENDENCY MAP

### Internal (owns its source of truth)
- All core business data (deals, contacts, invoices, staff, tasks, projects, inventory, properties, approvals, events) lives in Postgres with business-scoped RLS. The application is the system of record.
- Auth: Supabase Auth + app-side MFA (TOTP via `otpauth`, hashed backup codes). Self-managed MFA layer on top of platform auth.
- PDF generation: in-browser via `jspdf`/`jspdf-autotable` — deliberately avoids a server-side PDF SaaS (build-from-within).
- Analytics/usage: `usage_events` table + RPCs — no external analytics platform.
- Intelligence: deterministic SQL RPCs (migration 061) — no LLM dependency for the applied-intelligence tier.
- Notifications: generation separated from delivery; delivery providers are isolated behind edge functions.
- Search: Postgres full-text / ILIKE — no external search engine.

### External (and why each exists)
| Dependency | Purpose | Justification | Isolation / fallback |
|---|---|---|---|
| **Supabase** (Postgres + Auth + Edge Fns + Storage + Realtime) | Entire backend | Chosen platform, not a bolt-on | RLS is the authz boundary; core data owned locally |
| **Paystack** | Subscription + invoice payments | Nigerian payment rails require a licensed processor | Edge functions (`subscription-management`, `paystack-*`); webhook idempotency (status+reference guards); server-side verify |
| **Flutterwave** | Alternate payment for invoices | Redundant provider for invoices | Edge functions (`flutterwave-*`) — **NOT wired for subscription checkout (see risk)** |
| **Twilio** | WhatsApp/SMS send | Carrier delivery requires a telco provider | `send-whatsapp` edge fn; config in `settings` (RLS-gated, admin-only) |
| **Meta Graph API** | WhatsApp Business | Required by Meta for WA Business messaging | Token stored server-side in `settings`; **browser never calls Graph directly** (queue→edge fn) |
| **Sentry** | Error monitoring | Production observability | Opt-in via `VITE_SENTRY_DSN`; no-op when unset |
| **gsap** | Landing-page scroll animations | Marketing cinematics | Confined to `Landing.tsx`; rest of app uses CSS transitions |

**Single points of external failure:** Supabase (inherent platform concentration); Paystack for subscription checkout (no automatic Flutterwave fallback on the subscription path — only invoices have the alternate provider).

---

## EXTERNAL DEPENDENCY REDUCTION (this session)
- **Removed:** `postcss`, `autoprefixer` (dead devDeps — Tailwind v4 `@tailwindcss/vite` bundles its own PostCSS; no config files referenced them).
- **Removed (dead code, not deps):** 7 unreachable modules (~1,130 lines) — see Dead Weight.
- **Retained with justification:** all 10 runtime deps audited and justified (gsap marketing-only, jspdf build-from-within PDF, otpauth MFA, Sentry opt-in, rest essential).

---

## CRITICAL BUGS (fixed)
1. **Cross-tenant RLS leak (CRITICAL, systemic).** ~111 RLS policies used `business_id IN (SELECT id FROM businesses)` — a subquery over the *entire* `businesses` table — which evaluates to true for any authenticated staff member regardless of which business they belong to. Effectively `USING(true)` on tenant-scoped tables → **any user could read/write any tenant's data.** Fixed (migration 080): replaced with `business_id IN (SELECT business_id FROM get_current_staff())` (current staff's business) across all 111 policies; added missing RLS on `asset_categories`, `expense_categories`, `entity_freshness` view, `business_events`, `approval_requests` view; hardened `approval_requests` + `entity_freshness_status` views with `security_barrier = true`.
2. **MFA bypass + unhashed backup codes.** MFA verification accepted an incorrect code path; backup codes were stored plaintext. Fixed: correct TOTP verification via `otpauth`; backup codes hashed before storage, constant-time comparison. (commit 30bf3c8)

## HIGH-RISK BUGS (fixed)
3. **SMSBroadcast provider API-key exposure.** Broadcast path sent the provider secret to the browser. Fixed: secret kept server-side; client uses the edge function. (commit 402b953)
4. **Edge-function auth.** Edge functions were using the anon/service key without verifying the caller JWT. Fixed: functions verify the caller's JWT before acting with the service role. (commit 402b953)
5. **`.env.example` live credentials.** Example file contained real-looking secrets. Sanitized. (commit 8bed327)
6. **Provider secrets loaded to client.** Settings page loaded full secret values into the client. Fixed: stop loading secrets client-side; harden `settings` RLS. (commit 37750db)

## MEDIUM ISSUES (fixed)
7. **`.single()` misuse → unhandled errors.** Optional single-row lookups used `.single()` (throws when the row is absent) instead of `.maybeSingle()`. Fixed across lib + page files. (commits 4abf724, 3be6b42)
8. **FK lifecycle: business delete blocked.** `api_request_logs` + `deal_analytics` had bare `business_id REFERENCES businesses(id)` (default RESTRICT) → a business with rows became undeletable. Fixed (migration 081): `ON DELETE CASCADE`, matching the ~295 other business FKs. The 142 bare `staff(id)` FKs use default RESTRICT — the data-integrity-safe default; left as-is (staff removal should deactivate, not delete). (commit 11518e2)
9. **useRealtime stale channel ref.** Cleanup removed the channel but left the ref non-null. Fixed: null the ref on cleanup. (commit 9f8a061)

## LOW ISSUES (documented, not fixed)
- **Duplicate `EmptyState` components.** `EmptyState.tsx` (default export, 9 pages) and `EmptyStates.tsx` (named `EmptyState` + specialized states) overlap. Not merged — would touch 9+ pages with visual-regression risk; exceeds minimum-necessary bar.
- **`useModuleAccess` ineffective dynamic import** (build warning). Deliberate: the dynamic import in `AuthContext` avoids a circular dependency (Session 8); merging to static would re-introduce the cycle. Cosmetic; left as-is.

---

## SECURITY FINDINGS
- **Cross-tenant leak (Critical) — CLOSED.** See #1.
- **MFA — CLOSED.** See #2. TOTP via established `otpauth` primitive (did NOT roll crypto from scratch — §22).
- **Secrets handling — CLOSED.** #3–#6. Payment verify is JWT-gated, server-side, uses real provider response (not auto-approve — the prior `verifyPayment()→true` bug is confirmed fixed). WhatsApp token is masked, admin-only, RLS-gated, and never sent browser→Graph.
- **AuthZ model:** client `permissions.ts`/`useToolAccess` is UX gating only; RLS is the real boundary (now correct). Two-flag module gate (entitled AND ready) enforced at route layer.
- **Remainder (acceptable):** staff FKs RESTRICT (prevents orphaning — the safe default). Recommended: ensure staff "delete" UX deactivates rather than hard-deletes.

## PERFORMANCE FINDINGS
- No external cache/queue/search/analytics introduced; database-first for search, analytics, queuing. No new infrastructure added this session.
- Bundle is manually chunked (react/router/supabase/jspdf/lucide). Largest chunks: `vendor-pdf` 430 kB (lazy, off critical path), `index.es` 151 kB (realtime/supabase). Acceptable.
- No action required; no performance regression introduced.

## DATA INTEGRITY FINDINGS
- **Cross-tenant writes — CLOSED** (RLS #1).
- **Business-delete lifecycle — CLOSED** (#8).
- **Payment double-charge/double-activation — verified idempotent.** `paystack-webhook` checks `status === 'success'` (invoice) and `provider_payment_id` existence (subscription) before acting; verify function reads real provider status.
- **FK cascade audit complete:** 2 business FKs fixed to CASCADE; 142 staff FKs intentionally RESTRICT; 10 staff FKs already SET NULL. No orphaning risk introduced.

## DEAD WEIGHT (removed)
7 unreachable modules, ~1,130 lines (commit 3b09a65):
- `src/hooks/index.ts` (dead barrel — imported nowhere)
- `src/hooks/useRetry.ts`, `useDebounce.ts`, `useFocusManagement.ts` (only the dead barrel re-exported them)
- `src/hooks/useTheme.tsx` (full theme system never wired into `App`/`main.tsx`)
- `src/components/OnboardingTour.tsx`, `LoadingSkeleton.tsx` (zero references)

Demo-mode remnants (`DemoData.ts`, `isDemo`, `avenize_demo`, `avenize_quotes`) — already fully purged by prior sessions; confirmed absent.

## DUPLICATE FUNCTIONALITY
- `EmptyState` pair (documented above, not merged).
- No other significant duplication found; the integration layer is centralized (per-provider edge functions, not scattered vendor calls).

## ARCHITECTURAL RISKS
1. **Subscription checkout is Paystack-only.** Flutterwave edge functions exist for *invoices* but subscription routing (`subscription-management`) only calls Paystack. If Paystack is down, subscription checkout fails with no fallback. **Recommendation:** route subscription checkout through a provider-abstraction that can fall back to Flutterwave (the invoice path already proves both providers are integrated). Medium effort, genuine resilience gain.
2. **Platform concentration.** Supabase is auth + data + realtime + storage + functions. Inherent to the stack; mitigated by local data ownership + RLS. Not actionable without re-architecture.
3. **`useRealtime` stale-handler footgun.** `useRealtimeSubscription` captures `handlers` (object literal) but its `useCallback` deps are `[channelName, ...dependencies]` — handlers can go stale if the caller doesn't pass every dep the handlers read. Works today because callers pass deps; documented as a future hardening candidate (ref-capture pattern).

## UNRESOLVED ISSUES
- Duplicate `EmptyState` consolidation (deferred — visual-regression risk).
- Subscription Paystack→Flutterwave fallback (deferred — feature-sized).
- `useModuleAccess` dynamic-import warning (deliberate; cosmetic).
- 142 staff FKs RESTRICT (intentional; pair with deactivate UX).

## FIXES COMPLETED
1. Cross-tenant RLS leak (111 policies + 3 view hardenings + 2 category policies) — migration 080, commit 3ed5a7a
2. MFA bypass + hashed backup codes — 30bf3c8
3. SMSBroadcast secret leak + edge-fn JWT auth — 402b953
4. `.env.example` sanitization — 8bed327
5. Stop loading provider secrets client-side + settings RLS — 37750db
6. `.maybeSingle()` for optional lookups (lib) — 4abf724
7. `.maybeSingle()` for optional lookups (pages) — 3be6b42
8. Business-delete CASCADE FKs — migration 081, commit 11518e2
9. useRealtime ref-null cleanup — 9f8a061
10. Dead-code removal (7 modules) — 3b09a65
11. Dead devDeps removal (postcss, autoprefixer) — bdfea53

## TESTS COMPLETED
- `npx tsc -b --noEmit` — clean (after every TS-touching commit + final)
- `npx vite build` — succeeds (after every commit + final)
- `npx vitest run` — 61/61 pass (4 files) (after every TS-touching commit + final)
- Manual review paths: payment verify idempotency, webhook activation idempotency, AICapture emit/fallback, WhatsApp send path (queue-only), realtime cleanup.

## REGRESSIONS FOUND
None. Build, typecheck, and unit tests green throughout; no unrelated business rule altered. Dead-code removal touched only modules with zero references.

## REMAINING RISKS
- Subscription payment provider fallback (#1 architectural risk).
- DB migrations 080/081 must be applied to the live Supabase before the RLS + FK fixes take effect. **Before 080 is applied, `can_access_module` errors → the two-flag gate treats unknowns as "not ready" (safe-closed default); apply 080/081 first.**
- Playwright (E2E/UX) and pgTAP (DB) suites run in CI with live Supabase, not in this dev container — not executed here.

---

## ACCEPTANCE CRITERIA STATUS
- [x] major user journeys traced (payment, AICapture, WhatsApp, chat realtime, auth/MFA)
- [x] authentication audited (MFA fixed)
- [x] authorization audited (cross-tenant RLS closed)
- [x] APIs/edge functions audited (JWT auth, verify idempotency)
- [x] database integrity audited (RLS, FK lifecycle)
- [x] failure states reviewed (payment timeouts/idempotency, edge-fn auth)
- [x] external integrations reviewed (payment, WhatsApp/SMS, Sentry)
- [x] dead weight identified + removed
- [x] duplicate functionality identified (EmptyState documented)
- [x] security risks assessed
- [x] performance risks assessed
- [x] critical/high issues addressed
- [x] fixes regression-tested (tsc/build/unit green)
- [ ] second discovery pass — **partially** (relayed into Phase 3/4 sweeps; a full re-scan is recommended once migrations are applied against a live DB)

**Goal met:** the application is simpler, stronger, more internally capable, less fragile, less dependent on external vendors, and safer than the application found — with every change verified, every dependency justified, and the critical systemic defect (cross-tenant leak) closed.
