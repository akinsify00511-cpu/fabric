# INTELLIGENCE_ROADMAP

The phased plan for Avenize's intelligence transformation, per the Master
Directive §31/§32. This documents what is DONE, what is NEXT, and what is
DEFERRED — honestly. Per §35, nothing aspirational is documented as implemented.

> North star (directive §40): "The objective is not to make Avenize bigger.
> The objective is to make Avenize understand the businesses using it."

---

## P0 — Stability (DONE, must remain green)

Authentication, authorization, RLS, database integrity, tenant isolation, core
workflows, payment/subscription integrity. Verified by `tsc` + `vite build` +
`vitest` + the production register (PRODUCTION_REGISTER.md).

- ✅ Cross-tenant RLS fix (migration 080) — the systemic leak is closed.
- ✅ FK cascade fixes (081) — businesses are deletable.
- ✅ MFA enforcement + audit-trail hardening (096).
- ✅ All intelligence callers are best-effort/non-blocking (§24) — an
  intelligence failure never breaks CRM/Finance/Projects/HR/Inventory.

## P1 — Intelligence foundation (DONE)

- ✅ Canonical business data model — see BUSINESS_DATA_MODEL.md
- ✅ Business event bus (058/059/090) — see BUSINESS_EVENT_CATALOG.md
- ✅ Metrics engine (086) + governance (§7) — see METRIC_DICTIONARY.md
- ✅ Data quality engine (089) — see DATA_QUALITY_MODEL.md
- ✅ Core intelligence / diagnosis (091 recommendation rules) — see INTELLIGENCE_RULE_CATALOG.md
- ✅ Recommendations (088 claims + 091 issuer)
- ✅ Outcome tracking (claims status → outcome_recorded; §15 loop)
- ✅ Business Health composite (093) — the keystone (§21)
- ✅ OKR engine (094) — objectives + metric-linked key results (§24-25)
- ✅ Risk register (095) — (§48)
- ✅ Scheduled freshness (092 pg_cron) — metrics/recommendations/health auto-refresh

## P2 — Executive experience + governance (DONE)

- ✅ Action integration — recommendations link to existing workflows (tasks/approvals/POs) (§14)
- ✅ Outcome tracking — recommendation accept/reject/acknowledge + outcome (§15)
- ✅ Executive intelligence — RecommendationsCard + BusinessHealthCard on Cockpit (§17)
- ✅ Monthly Performance Review (097) — board-ready, printable (§26)
- ✅ Trust & Recovery (096) — audit-trail integrity + DR posture (§50-51)
- ✅ Nav simplification to ≤5 groups (§14)
- ✅ Required documentation (§35/§36) — Metric Dictionary, Rule Catalog, Event Catalog, Data Quality Model, Business Data Model

## P3 — Advanced (DEFERRED per §31/§33)

These are explicitly NOT built yet. They require either live-DB validation or
deliberate commercial justification. Building them prematurely violates §33
("do not expand the feature surface until the foundation is stable").

- ⏳ **Advanced forecasting** — the 085 cash-flow forecast exists (deterministic
  90-day moving average). Richer forecasting (seasonality, confidence
  intervals) needs ≥ 12 months of clean historical data per business — most
  early businesses lack this (§21). Deferred until there's real history.
- ⏳ **Advanced anomaly detection** — beyond the 2× historical-average rule.
  Needs statistical baselines per business (§20 company-specific).
- ⏳ **Recommendation effectiveness** (§16) — the infrastructure exists (claims
  status + outcome), but calculating "recommendations of type X historically
  produced Y outcome" needs a meaningful volume of closed recommendations
  per business. The loop is wired; the learning will activate with data.
- ⏳ **Generative AI Copilot** — explicitly Phase 3 (§22/§33). Must NOT be built
  on partially-fake modules. Scoped to answer only from verified data
  (Fact-vs-Inference protocol). Deferred until core ERP modules have real
  paying customers and real transaction history.
- ⏳ **Business health expansion** — more dimensions + sub-scores as the
  underlying metrics mature (gross margin, retention, supplier performance).

## Blocked on live DB (needs user action)

- ⏳ Apply migrations 080–097 to live Supabase (project kgsgqvatyleetyquffya).
  The frontend degrades gracefully until then, but intelligence is dormant.
- ⏳ Enable `pg_cron` for the 092 scheduled jobs.
- ⏳ Golden test datasets (§30) + live failure testing (§60/§81) — need the DB.
- ⏳ DB-level transition constraints (§62) + anon-grant narrowing (§84) — need the DB.

## Anti-goals (explicitly NOT doing, per §33)

- ❌ No new modules until the foundation is stable.
- ❌ No chatbot / superficial AI for marketing.
- ❌ No unnecessary dashboards.
- ❌ No external AI/analytics APIs (§22) — all intelligence is deterministic SQL.
- ❌ No fabricated metrics, causality, or recommendations (§38).
