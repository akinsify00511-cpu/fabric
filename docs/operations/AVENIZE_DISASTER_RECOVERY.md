# AVENIZE DISASTER RECOVERY

**Version:** 1.0 (2026-08-24). Honest scoping: Supabase manages database backups and
point-in-time recovery; Avenize owns the migration chain, deploy rollback, and
degraded-mode behavior. We never fabricate a backup status we don't control.

## 1. Backups

- Database: Supabase-managed (project kgsgqvatyleetyquffya). Point-in-time recovery
  per the Supabase plan. The app does NOT maintain its own dump schedule.
- Schema-as-code: the entire database is reconstructable from
  `supabase/migrations/` (201 files, filename-ordered, idempotent). This is the
  authoritative schema backup — verified by the CI full-chain apply on bare
  postgres:15.
- Code: GitHub (origin/main) + Vercel deployment history.

## 2. Recovery objectives

| Objective | Target | Mechanism |
|---|---|---|
| RPO (data) | Supabase PITR window | Supabase managed |
| RTO (schema rebuild) | < 1 hour | `scripts/apply_migrations_live.sh` (two-pass, per-file report) |
| RTO (frontend rollback) | < 10 minutes | Vercel redeploy of last-good deployment |
| RTO (edge functions) | < 15 minutes | `scripts/deploy_edge_functions.sh` |

## 3. Restore procedures (must be tested)

1. **Fresh-schema restore test:** spin postgres:15, apply the full chain with
   ON_ERROR_STOP=1, run the contract scan (expect 0 missing / 0 drift). This test
   runs in CI on every change — it IS the restore test for schema.
2. **Data restore:** Supabase dashboard PITR to a new project → repoint env → run
   verify-production.sh. (Requires Supabase dashboard access — user-credential-gated;
   schedule a live drill quarterly.)
3. **Frontend rollback:** Vercel deployments list → promote last-good. The service
   worker is max-age=0 + version-purged, so rollback actually reaches users.

## 4. Migration recovery

- A failed live apply: the two-pass apply script reports per-file status to
  `supabase/migration_apply_report.txt`; fix forward (migrations are idempotent —
  re-running is safe); never hand-edit production without a migration file.
- The contract reconciliation system detects post-incident drift:
  `run_integrity_scan()` classifies missing/drifted objects; findings for
  contract-pruned rules auto-resolve.

## 5. Data corruption response

- Reversal pattern: originals are never deleted — `action_reversals` records
  undo/void/correct/amend with provenance (who/when/why/snapshot).
- Audit triggers (`audit_row_change`, 056 + 096) on business + intelligence tables
  provide the tamper-evident trail to scope corruption.
- `trust_health(business_id)` detects audit gaps (writes without audit rows).

## 6. Service outage behavior (degraded mode)

- Supabase down: the SPA shows the offline banner (useOnlineStatus) and SW offline
  fallback; no writes are faked.
- Vercel down: Supabase APIs still live; status communicated via the ops console.
- Paystack down: checkout fails honestly; manual bank-transfer rail remains;
  the ledger is untouched (no false success).
- Resend down: emails queue in `email_events` (nothing lost; drain on recovery).
- Edge fn down: callers are best-effort — pages degrade to honest empty/degraded
  states, never crash (per-engine isolation, schema-availability breaker).

## 7. Never do

- Never restore by hand-editing production data outside a migration.
- Never declare recovery complete without the smoke gate green.
- Never auto-"repair" financial or authorization state without explicit rules
  (Constitution Article VI.4).
