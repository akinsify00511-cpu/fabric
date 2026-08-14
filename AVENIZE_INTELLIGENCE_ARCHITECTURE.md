# AVENIZE_INTELLIGENCE_ARCHITECTURE

How the intelligence layer fits into Avenize without destabilizing it, per the
Master Directive. This is the top-level architecture document; the detailed
catalogs live in their own files (linked below).

> The thesis (§40): business activity → structured data → context → metrics →
> patterns → intelligence → diagnosis → recommendation → decision → action →
> outcome → historical learning → better intelligence. The flywheel turns on
> the company's OWN operational history — no external data, no fabricated
> metrics (§22/§38).

---

## Design principles (enforced)

1. **Intelligence is an interpretation layer, not the source of truth.** Business
   operations (CRM/Finance/Projects/etc.) are authoritative. If intelligence
   fails, operations keep working (§24 isolation). Every intelligence caller is
   best-effort + non-blocking.
2. **No external dependencies (§22).** All intelligence is deterministic SQL
   over real tables. No OpenAI/Anthropic/Gemini/external analytics APIs. If a
   feature can't be done internally, it's documented as not-yet-implemented,
   not secretly outsourced.
3. **Explainability (§19).** Every number is traceable: metric → definition +
   sources + period; recommendation → rule + evidence; health → dimension
   breakdown + penalty. The user can always ask "why are you telling me this?"
   and get real evidence.
4. **Anti-hallucination (§38).** Never invent numbers, customers, causes,
   trends, or impact. Below the minimum evidence base → "insufficient data",
   not a guess (§21).
5. **Tenant isolation (§15-19).** Every query is business-scoped via
   `get_current_staff()` + RLS. No cross-company aggregation. Existing RLS is
   authoritative; intelligence never bypasses it.
6. **No duplication (§6).** Reuse existing tables/events/workflows. The OKR
   engine extended `strategic_objectives`; health reads `kpi_metrics`;
   recommendations are `claims`; actions reuse tasks/approvals/POs.

---

## The intelligence stack

```
┌─────────────────────────────────────────────────────────────┐
│  EXECUTIVE EXPERIENCE                                        │
│  Executive Cockpit · Monthly Review · Recommendations feed   │
└───────────────────────────┬─────────────────────────────────┘
                            │ reads
┌───────────────────────────┴─────────────────────────────────┐
│  INTELLIGENCE LAYER (interpretation, read-only)               │
│  Business Health (093) · Recommendations (091) · Risks (095) │
│  OKR progress (094) · MPR roll-up (097) · Trust (096)         │
└───────────┬───────────────────────┬───────────────────────────┘
            │ computes from         │ governs
┌───────────┴──────────┐   ┌────────┴──────────────────────────┐
│  METRICS (086)        │   │  DATA QUALITY (089)                │
│  metric_definitions   │   │  scan_data_quality → findings       │
│  kpi_metrics          │   │  (penalizes health, feeds DQ-001)   │
└───────────┬──────────┘   └────────────────────────────────────┘
            │ refreshed by
┌───────────┴───────────────────────────────────────────────────┐
│  EVENT BUS (058/059/090)  →  CONTEXT GRAPH (087)              │
│  business_events · handlers · entity freshness · relationships │
└───────────┬───────────────────────────────────────────────────┘
            │ emitted by
┌───────────┴───────────────────────────────────────────────────┐
│  BUSINESS OPERATIONS (authoritative, the source of truth)      │
│  CRM · Finance · Projects · HR · Inventory · Procurement · ...  │
│  (existing modules — UNCHANGED by intelligence work)            │
└──────────────────────────────────────────────────────────────┘
```

Read upward: operations emit events → events refresh metrics + relationships →
metrics + data-quality feed recommendations + health → health + recommendations
+ OKRs + risks roll up into the MPR + Cockpit. Nothing in the business-ops
layer was modified to add intelligence — it only emits events it already emitted.

---

## The outcome loop (§15) — the flywheel core

```
INSIGHT (claim, claim_type=RECOMMENDATION, status=issued)
  → user reviews in Cockpit / MPR
  → RECOMMENDATION accepted / rejected / acknowledged (claim.status changes)
  → ACTION (existing workflow: task created, approval started, PO raised)
  → OUTCOME (claim.status → outcome_recorded; result captured)
  → LEARNING (§16: future effectiveness = closed-recommendations history)
```

Every step is auditable (claims are audit-triggered since 096). The
recommendation is never deleted on accept/reject — it transitions status, so
the trail is tamper-evident.

---

## Component map (which migration / page does what)

| Capability | Migration | Page | Catalog |
|-----------|-----------|------|---------|
| Event bus | 058/059/090 | Activity, Cockpit | BUSINESS_EVENT_CATALOG.md |
| Context graph | 087 | (internal) | BUSINESS_DATA_MODEL.md |
| Metrics | 086 | (via Cockpit/MPR) | METRIC_DICTIONARY.md |
| Data quality | 089 | DataQuality.tsx | DATA_QUALITY_MODEL.md |
| Recommendations | 088/091 | Cockpit, MPR | INTELLIGENCE_RULE_CATALOG.md |
| Business health | 093 | ExecutiveCockpit, MPR | METRIC_DICTIONARY.md (health_metric_map) |
| OKRs | 094 | OKR.tsx | (this doc) |
| Risks | 095 | RiskRegister.tsx | (this doc) |
| MPR | 097 | MonthlyReview.tsx | (this doc) |
| Trust/audit | 096 | TrustRecovery.tsx | (this doc) |
| Scheduled freshness | 092 (pg_cron) | (background) | INTELLIGENCE_ROADMAP.md |

## Failure isolation (§24)

Every frontend intelligence caller wraps its RPC in try/catch + renders an
honest empty state on failure (e.g. "set targets to enable the score",
"migration may not be applied yet"). An intelligence RPC error:
- does NOT crash the page,
- does NOT corrupt business data (read-only / advisory),
- does NOT block other intelligence (each rule/metric is best-effort).

## Performance (§23)

- Metrics/recommendations/health are NOT computed on page render. They are
  computed by scheduled pg_cron jobs (092) and stored. Pages read the stored
  results. This keeps render cheap (§23).
- `business_health_scores` is a single row per business (upsert), so the Cockpit
  reads one row.
- `kpi_metrics` has a dedup index on (business, metric_key, period) so refresh
  is idempotent without a scan.
- The MPR is a single RPC call returning one JSONB document.

---

## Related documents (§35 deliverables)

| Document | Status |
|----------|--------|
| AVENIZE_INTELLIGENCE_ARCHITECTURE.md (this) | ✅ |
| BUSINESS_DATA_MODEL.md | ✅ |
| BUSINESS_EVENT_CATALOG.md | ✅ |
| METRIC_DICTIONARY.md | ✅ |
| DATA_QUALITY_MODEL.md | ✅ |
| INTELLIGENCE_RULE_CATALOG.md | ✅ |
| INTELLIGENCE_TEST_MATRIX.md | ✅ |
| INTELLIGENCE_ROADMAP.md | ✅ |
| RECOMMENDATION_CATALOG.md | ✅ |
| AVENIZE_INTELLIGENCE_CURRENT_STATE.md | ✅ (pre-existing) |
| PRODUCTION_REGISTER.md | ✅ (pre-existing) |

All describe what ACTUALLY exists. Planned items are marked ⏳, never as done.
