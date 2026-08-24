# AVENIZE TESTING STANDARD

**Version:** 1.0 (2026-08-24). Current verified state: vitest 723/723 (59 files),
tsc 0 errors, deno check 12/12 edge functions, full migration chain applies clean +
idempotent on bare postgres:15.

## Layers (all required where applicable)

### 1. Unit (vitest, `tests/frontend/`)
- Pure logic is extracted into testable modules (`_shared/paymentsCore.ts`,
  `copilotRouter.ts`, `discoveryIntel.ts`, etc.) so the SAME module is tested that
  ships — no mirror-copy drift.
- Contract tests lock behavior: state machines, guard matrices, anti-fabrication
  contracts, classification rules.
- Mocks are not used for real code paths unless strictly necessary (justified in the
  test file). We test real logic, not mock theater.

### 2. Database (postgres:15 Docker + ci_shim)
- Every migration applies clean AND idempotently (twice, ON_ERROR_STOP=1).
- RPC smoke tests CALL the function with membership fixtures (member vs outsider) —
  never just assert the migration applied. (Lesson: the CI that only smoke-tested
  SELECT counts missed a broken create_business_and_owner for weeks.)
- Cross-tenant denial is asserted, not assumed (SET ROLE authenticated; the postgres
  superuser bypasses RLS).
- `supabase/tests/`: RLS attack suite, golden dataset validation (7 profiles).

### 3. API / contract
- `scripts/generate_contract_manifest.py` + schema-drift gates: a frontend reference
  with no backing migration fails CI before merge.
- Live probes distinguish truly-missing (PGRST202 / "no matches" + "schema cache"
  fragments — never match a full error sentence, wording varies by version) from
  signature mismatches.

### 4. Security
- Threat-model tests per `docs/security/AVENIZE_THREAT_MODEL.md` — every threat has a
  named test or an explicitly-open risk.
- Edge-function auth matrix probed: unsigned requests must 401 (paystack-webhook
  live-verified).

### 5. End-to-end (Playwright, `tests/e2e/`, `tests/ux/`)
- Browsers: chromium AND webkit (a chromium-only install silently breaks the Mobile
  Safari project — install both).
- `scripts/e2e-production.sh`: the production journey (signup → onboarding →
  membership → dashboard → payment rails → email rail) — honestly reports NOT READY
  until the live gates pass.

### 6. Browser / accessibility
- axe-core in UX suite; Lighthouse CI (accessibility 100 standing bar); keyboard,
  tap-target, empty-state, visual-regression specs.

### 7. Production verification
- `scripts/verify-production.sh` — the deploy is not done until this passes.
- Golden datasets (supabase/tests/golden_dataset_validation.sql) assert the
  intelligence engines against known scenarios on live-like data.

## Hard rules

1. A new RPC ships with a membership-fixture smoke test (member OK / outsider denied).
2. A new state machine ships with invalid-transition rejection tests.
3. A generated artifact must be deterministic — regenerate → `git diff` empty.
4. Test env quirks are codified (ci_shim GUC is `request.jwt.claims` JSON with `sub`;
   psql set_config transaction-locality; docker exec needs `-i`).
5. A flaky or environment-only failure is documented as such — never silently skipped.
