# AVENIZE PRODUCTION READINESS

**Version:** 1.0 (2026-08-24). The quality gate is executable, not aspirational.
"Deployed" means the smoke gate passed, not that Vercel built.

## The AVENIZE QUALITY GATE (current verified state)

```text
Architecture ........ PASS  (contract reconciliation system; 946-object manifest)
Constitution ........ PASS  (this docs/ hierarchy; root constitutions)
Design .............. PASS  (design-constitution CI: hex 1076/1214 burn-down)
Security ............ PASS  (red-team closures regression-tested; RLS suite EXIT=0)
RLS ................. PASS  (schema-drift + attack suites; cross-tenant smoke)
Schema .............. PASS  (201 migrations; full-chain bare-pg15 apply + idempotent)
Tests ............... PASS  (vitest 723/723, 59 files; deno check 12/12)
Accessibility ....... PASS  (Lighthouse a11y 100 local; axe in UX suite)
Performance ......... PASS  (Session 50 hardening; immutable asset caching; lazy Sentry)
Observability ....... PASS  (platform ops + Riverways + Sentry lazy DSN-gated)
Production .......... FAIL  (honestly — live DB apply + edge deploys + secrets pending;
                             verify-production.sh reports the exact missing objects)
```

A critical failure fails the gate. The Production row is the only FAIL and it is
credential-gated, not code-gated.

## CI gates (ci.yml / schema-drift.yml / deploy.yml)

1. typecheck (`tsc -b --noEmit`) — must be 0 errors.
2. unit tests (`vitest run`) — currently 723/723.
3. schema-drift — every frontend `.from/.rpc/.storage.from/.functions.invoke` has a
   backing migration; FAILS merge otherwise.
4. contract-manifest — regenerates `production_contract.json`; FAILS on any diff
   (artifact is deterministic; no timestamps).
5. migration-test — full chain applies with ON_ERROR_STOP=1 on bare postgres:15
   (+ ci_shim), twice (idempotency).
6. edge-functions — `deno check` all 12 functions (`--node-modules-dir=none`).
7. design-constitution — baseline ratchet (no growth, burn-down only).
8. build (`vite build`) — 0 warnings tolerated.

## Production smoke gate (deploy.yml final step)

`scripts/verify-production.sh` → `scripts/verify_production_contract.py`:
- self-calibrates the publishable URL + key from the deployed bundle (by design;
  never requires a service-role key);
- probes auth health, per-object PostgREST availability (table HEAD 200/404; RPC
  POST {} → PGRST202 = missing; NEVER probe /rest/v1/ root — it 401s publishable
  keys), payment + email edge-function probes, SPA-shell check;
- prints PRODUCTION READY or fails the run with the exact missing objects.

## Standing production blockers (user-credential-gated)

1. Live DB migration apply: `scripts/apply_migrations_live.sh` with SUPABASE_DB_URL.
2. Edge-function deploy: `scripts/deploy_edge_functions.sh` (per-function JWT matrix).
3. Secrets: PAYSTACK_SECRET_KEY, RESEND_API_KEY + EMAIL_FROM, RESEND_WEBHOOK_SECRET,
   APP_URL (+ WEBAUTHN_RP_ID/ORIGINS for passkeys; OPENAI/ANTHROPIC optional).
4. Then: `scripts/verify_live_db.sh` + `scripts/e2e-production.sh` must pass.

Runbook: `LIVE_DB_APPLY_RUNBOOK.md`. Definition of done: both gates green on production.
