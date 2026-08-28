# Avenize Client Payment Gate — the deterministic launch definition

The sole definition of "launchable". **Nothing else gates mass marketing.**

Green only when **every** line below is true, verified against **production** (never inferred from local/Postgres results).

## Gate checklist (P0)

| # | Check | Production evidence required | Status |
|---|-------|------------------------------|--------|
| 1 | Frontend accessible | `curl -fs ${APP_URL}/` → 200, current SPA shell | |
| 2 | Auth healthy | `/auth/v1/health` → 200 | |
| 3 | Critical RPC contracts correct | `create_business_and_owner`, `business_brain`, `current_metrics`, `open_recommendations`, `my_payment_request` — wire-verify with real signatures | |
| 4 | Checkout deployed | `subscription-management` OPTIONS → non-404; server-side price | |
| 5 | Paystack webhook deployed | `paystack-webhook` OPTIONS → 204/200; HMAC-gated | |
| 6 | Paystack verify deployed | `paystack-verify` JWT-gated | |
| 7 | Live DB reconciliation | `Database/RPC` gate PASS; missing objects = 0; drift = 0 | |
| 8 | Email service deployed | `email-service` OPTIONS → non-404 | |
| 9 | Resend webhook deployed + configured | `resend-webhook` OPTIONS → non-404; `RESEND_WEBHOOK_SECRET` set | |
| 10 | Production secrets configured | `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `APP_URL` (+ optional cron secrets) | |
| 11 | Confirmed test account available | `E2E_EMAIL` / `E2E_PASSWORD` log in successfully | |
| 12 | Fresh-user journey passes | signup → confirmation → login → create_business_and_owner → membership → intelligence | |
| 13 | Returning-user journey passes | re-login → no re-onboarding → `resolve_current_user_context` agrees | |
| 14 | Real Paystack test payment passes end-to-end | checkout → provider transaction → webhook → verify → ledger → subscription | |
| 15 | Subscription/entitlement confirmed | paid customer has correct `plan_code`/`status`; product access works | |
| 16 | Email delivery confirmed | real queue_email → provider_message_id persisted → webhook status advances | |
| 17 | No-payment never grants | fresh/abandoned/failed payment exposes no paid entitlement | |
| 18 | Production gates GREEN | `verify-production.sh` → `PRODUCTION READY`; `e2e-production.sh` → `CLIENT PAYMENT GATE PASS` | |

**Final verdict:** `CLIENT PAYMENT GATE = GREEN` only when all 18 above hold, with the exact evidence appended (report artifact: `supabase/contract/verification_report.json` + `e2e-production.sh` output). Until then, the honest verdict is `NOT READY` — and every missing row names the exact object + its canonical migration.

## The P0 execution sequence (frozen)

```bash
export SUPABASE_DB_URL='postgresql://postgres:****@db.<ref>.supabase.co:5432/postgres'
export SUPABASE_ACCESS_TOKEN='sbp_****'
export PAYSTACK_SECRET_KEY='sk_live_****'
export RESEND_API_KEY='re_****'
export EMAIL_FROM='Avenize <hello@avenize.app>'
export RESEND_WEBHOOK_SECRET='whsec_****'
export APP_URL='https://avenize.riverwayse.com'
export E2E_EMAIL='...'
export E2E_PASSWORD='...'

bash scripts/apply_migrations_live.sh        # → Database/RPC gate
bash scripts/deploy_edge_functions.sh       # → Email + all edge fns
supabase secrets set ... --project-ref kgsgqvatyleetyquffya
bash scripts/verify-production.sh          # → PRODUCTION READY
bash scripts/e2e-production.sh            # → CLIENT PAYMENT GATE PASS
```

## Enhancements start only after gate green

P1 → P4 (product analytics, observability, conversational intelligence, UX/PWA/mobile, integrations) — each behind a `REQUIRED ENHANCEMENT REPORT` (ADOPT/ADAPT/STUDY/REJECT) per the master directive §32. No new recurring-cost dependency without explicit approval.