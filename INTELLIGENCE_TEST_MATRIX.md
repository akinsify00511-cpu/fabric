# INTELLIGENCE_TEST_MATRIX

The testing strategy for the intelligence layer, per the Master Directive §29/§30.
Every intelligence feature must be tested against correct, incorrect, missing,
small, large, boundary, null, duplicate, and tenant-isolation cases (§29).

**Status legend:** ✅ has automated coverage · 📋 manual/golden-dataset only · ⏳ needs live DB

> Most intelligence is deterministic SQL in migrations (metric refreshers,
> recommendation rules, health computation, data-quality scans, MPR roll-up).
  These cannot be unit-tested in the dev container (no Postgres runtime) — they
  require the live Supabase DB or golden-dataset fixtures. The frontend wrappers
  have type + build coverage; the SQL has documented expected behavior + a
  golden-dataset plan. This matrix tracks what is covered and what is not.

---

## Unit-testable (TypeScript, run in CI) ✅

| Component | Coverage | Test file | Status |
|-----------|---------|-----------|--------|
| Frontend builds / type-checks | `tsc -b --noEmit` | — | ✅ 73 tests pass |
| Production build | `vite build` | — | ✅ |
| Frontend wrapper types | type-checked | `src/lib/businessOS.ts`, `Evidence.tsx` | ✅ (types) |

## SQL intelligence (needs live DB / golden datasets) 📋

These are documented with expected behavior so that when the DB is available they
can be validated against the golden test datasets (§30). Each has a "known
expected scenario" per §29.

### Metrics engine (086) — `refresh_business_metrics`

| Scenario | Expected | Status |
|----------|----------|--------|
| Correct data (≥ min_sample) | value + change_percent computed | 📋 |
| Missing data (no rows) | INSUFFICIENT_DATA, null value (§21) | 📋 |
| Small dataset (< min_sample) | INSUFFICIENT_DATA, no value | 📋 |
| Zero values | 0 where meaningful, INSUFFICIENT_DATA where not | 📋 |
| Null values | excluded from aggregation | 📋 |
| Duplicate rows | idempotent refresh (ON CONFLICT) | 📋 |
| Tenant isolation | only the business's own rows counted (RLS) | 📋 |
| Date boundaries | period_start/end inclusive/exclusive as documented | 📋 |
| Timezone | occurred_at/period_end are TIMESTAMPTZ | 📋 |

### Recommendation issuer (091) — `run_recommendation_rules`

| Rule | Scenario | Expected | Status |
|------|----------|----------|--------|
| FIN-AR-001 | top customer > 40% overdue, ≥5 invoices | critical recommendation issued, names customer + % + amount | 📋 |
| FIN-AR-001 | < 5 overdue invoices | NO recommendation (min evidence) | 📋 |
| FIN-AR-001 | already an open rec for this rule | NO duplicate (idempotent) | 📋 |
| FIN-CF-001 | expenses > revenue 90d, ≥3 records | critical, names the gap | 📋 |
| FIN-CF-001 | < 3 expense records | NO recommendation | 📋 |
| CUST-001 | customer < 3 prior purchases | NO recommendation (no baseline, §21) | 📋 |
| CUST-001 | customer > 1.5× own avg cycle, ≥3 purchases | info recommendation, names customer + days | 📋 |
| OPS-001 | team < 3 members | NO recommendation (no reliable average) | 📋 |
| DQ-001 | 0 unresolved critical findings | NO recommendation | 📋 |
| All rules | rule failure (e.g. missing table) | does NOT stop other rules (§24) | 📋 |
| All rules | tenant isolation | only the business's own data scanned | 📋 |

### Business Health (093) — `compute_business_health`

| Scenario | Expected | Status |
|----------|----------|--------| 📋 |
| All dimensions have target-backed metrics | overall = weighted avg of dimensions | 📋 |
| A dimension has no target-backed data | flagged `insufficient_data`, excluded from overall | 📋 |
| Critical DQ findings present | penalty applied (−2 each, max −10) | 📋 |
| No metrics at all | overall = NULL, all dimensions insufficient | 📋 |
| Open critical recommendations | surfaced as flag (no double-penalty) | 📋 |
| Higher-is-better metric | score = clamp(actual/target×100) | 📋 |
| Lower-is-better metric | score = clamp(1 − actual/target×100) | 📋 |

### Data Quality (089) — `scan_data_quality`

| Scenario | Expected | Status |
|----------|----------|--------|
| Invoice with total ≤ 0 | critical `invalid_amount` finding | 📋 |
| Invoice with no due_date | warning `missing_due_date` finding | 📋 |
| Task with no assignee | warning `unassigned_task` finding | 📋 |
| Already-resolved finding re-scanned | not re-inserted (dedup index) | 📋 |
| Scanner never mutates business data | only writes findings rows (§14) | 📋 |

### MPR (097) — `monthly_review`

| Scenario | Expected | Status |
|----------|----------|--------|
| Business with full data | all sections populated | 📋 |
| New business (no metrics/OKRs/risks) | empty arrays + NULL health, no fabrication | 📋 |
| Window with no metrics in period | metrics = [] (not zeros) | 📋 |
| OKR whose period overlaps window | included | 📋 |

### Trust (096) — `trust_health`

| Scenario | Expected | Status |
|----------|----------|--------|
| Audited table with writes but no audit rows | reported as a gap | 📋 |
| No audit entries | audit_healthy = false (latest = none) | 📋 |
| All audited tables covered | audit_healthy = true | 📋 |
| Table not yet migrated | skipped (EXCEPTION handler) | 📋 |

---

## Golden test datasets (§30) ⏳

To validate the SQL intelligence end-to-end, the plan is to create controlled
synthetic businesses (NOT real customer data) once the live DB is available:

| Dataset | Profile | Expected intelligence output |
|---------|---------|------------------------------|
| Business A — Healthy | steady revenue, low overdue, on-time projects, good data quality | health 80+, few/no recommendations |
| Business B — Cash-flow stressed | expenses > revenue, rising overdue | FIN-CF-001 + FIN-AR-002 fire, health drops on financial dimension |
| Business C — Sales declining | won deals falling, stale pipeline, lengthening cycle | SAL-CONV-001 fires, sales dimension red |
| Business D — High-growth | many new customers, inventory churn | CUST-001 (returning) suppressed; INV-001 may fire |
| Business E — Inventory-heavy | low stock, dead stock, supplier dependency | INV-001 fires, inventory dimension red |
| Business F — Project-heavy | over-budget/delayed projects | (PROJ rules — planned), project dimension red |
| Business G — Empty/new | < 3 of everything | all rules NO-OP (small-data safety, §21), health = insufficient |

Each golden dataset is a SQL seed (INSERT) that, after `refresh_business_metrics`
+ `run_recommendation_rules` + `compute_business_health`, should produce the
expected output. This is the §30 validation gate. **Blocked on live DB.**

---

## Live failure testing (§60/§81) ⏳

| Test | Method | Status |
|------|--------|--------|
| RLS denial | query another tenant's table as this tenant → expect 0 rows | ⏳ |
| Constraint violation | insert invalid transition → expect rejected | ⏳ |
| Duplicate request | re-emit same event → expect idempotent (no dup) | ⏳ |
| Timeout | slow query → expect graceful (best-effort) | ⏳ |
| Intelligence failure | drop a metric table → expect app still works (§24) | ⏳ |

Blocked on live DB credentials (project kgsgqvatyleetyquffya).
