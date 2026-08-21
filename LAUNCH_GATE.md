# Avenize Launch Gate — GO / NO-GO Audit

Objective production-readiness scorecard. Every item is marked with how it
was verified: **[code]** = verified in the repository, **[db]** = verified
against postgres:15 with the migration chain, **[live]** = requires a run
against production Supabase/Vercel — cannot be closed from the codebase.

Verdict rule: **GO for controlled beta** when all P0 rows are ✅.
**GO for paid acquisition** only when every row is ✅.

## P0 — Money (the funnel: Pricing → /upgrade → Paystack → webhook → entitlement)

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 1 | No free-trial path in paid checkout | ✅ | [code] Pricing.tsx + Premium.tsx — all plans paid, explicit "No free trial" |
| 2 | Checkout creation works | ✅ | [code+db] `subscription-checkout` edge fn; `subscription_provider_attempts` table created 20260821170000 (was missing → every checkout would 500) |
| 3 | Server-side pricing (client can't set amount) | ✅ | [code] Edge fn reads `pricing_tiers`/FALLBACK server-side |
| 4 | Payment → entitlement | ✅ | [db] `sync_entitlement_from_subscription` trigger (20260821170000): pay→plan+features+tier sync; lifecycle matrix passed |
| 5 | Failed payment → no entitlement | ✅ | [code] Webhook `charge.failed` closes attempt, no activation; activation is webhook-only |
| 6 | Return path shows real status | ✅ | [code] Premium verifies reference via `paystack-verify`; verifying/confirmed/failed states; browser claims never trusted |
| 7 | Cancellation (immediate + period-end) | ✅ | [db] `cancel_subscription` + trigger: immediate → free; period-end keeps access |
| 8 | Idempotent webhook (no double-activation) | ✅ | [code] `subscription_payments.provider_payment_id` dedupe guard |
| 9 | Verify endpoint not an oracle | ✅ | [code] `paystack-verify` scoped to caller's business; generic deny |
| 10 | Webhook signature verification | ✅ | [code] HMAC SHA-512 + timing-safe compare |
| 11 | Live checkout with real Paystack keys | ⬜ | [live] Run one real ₦ transaction end-to-end |

## P0 — Auth & onboarding matrix

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 1 | New password signup → onboarding → dashboard | ✅ | [code] Signup → AuthCallback → createBusinessAndOwner → refreshStaff → /app |
| 2 | Existing signin → dashboard | ✅ | [code] Login defers routing to membership state |
| 3 | Existing user NEVER re-onboarded | ✅ | [code] RequireAuth + OnboardingGate gate on `staff.business_id`; already-member recovery |
| 4 | OAuth → onboarding → dashboard | ✅ | [code] AuthCallback OAuth branch + prefill consumption (fixed this session: `avenize_oauth_pending` was written but never read) |
| 5 | Refresh stays authenticated | ✅ | [code] getSession + staffChecked gating; fetch retry with backoff |
| 6 | Logout → login | ✅ | [code] signOut clears session/staff/caches |
| 7 | Password reset chain | ✅ | [code] ForgotPassword → callback?type=recovery → UpdatePassword |
| 8 | Rate limiting on login/signup | ✅ | [code] check_auth_rate_limit + record_auth_failure wired (fails open if RPC missing) |
| 9 | Public-surface matrix in CI | ✅ | [code] tests/ux/auth-matrix.spec.ts wired into ux-tests workflow |
| 10 | Live matrix with real users | ⬜ | [live] Run the 7-leg matrix against production |

## P0 — Tenant & security isolation

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 1 | Cross-tenant RLS (all business tables) | ✅ | [code] 080 rewrote 111 policies to get_current_staff(); 33b sweep found zero leaks |
| 2 | Role self-escalation blocked | ✅ | [db] Role immutability trigger (20260819060000) |
| 3 | SECURITY DEFINER RPCs membership-guarded | ✅ | [code] zz closure migration; owner_intelligence/business_brain/riverways_* all gated |
| 4 | Live RLS attack suite against production | ⬜ | [live] tests/database/04_rls_attack_suite.sql against live DB |

## P1 — Observability, analytics, discoverability, mobile

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 1 | Error monitoring (platform feed) | ✅ | [code] errorCapture → Riverways Error Center |
| 2 | Launch funnel analytics (landing→signup→pay) | ✅ | [code] usage_events + attribution.ts + platform activity stream |
| 3 | SEO/GEO/AEO/AIO | 🟡 | [code] robots.txt, sitemap, llms.txt, RouteMeta, truthful JSON-LD shipped; final content audit pending |
| 4 | Mobile UX production pass | 🟡 | [code] Responsive shell + mobile app builds green; device pass pending |
| 5 | Support/help readiness | 🟡 | [code] Help Guide + support tickets module exist; launch runbook pending |

## Current verdict

- **Controlled beta (10–30 ICP users): GO** — once the two `[live]` P0 rows
  (real Paystack transaction + live auth matrix) are executed.
- **Paid acquisition: NO-GO** until every row above is ✅.

### How to close the remaining live rows
1. Apply pending migrations to production Supabase (`scripts/apply_migrations_live.sh`).
2. Run one real Paystack transaction (small amount, refund after) and watch:
   checkout → attempt row → webhook → subscription active → entitlement plan
   → module gate opens.
3. Run the 7-leg auth matrix in an incognito window against production.
4. Re-run `tests/database/04_rls_attack_suite.sql` against the live DB.
