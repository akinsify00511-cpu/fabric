# AVENIZE — Intelligence Current-State & Architecture Analysis

> **Status: READ-ONLY ANALYSIS — no code modified. Produced per the Master
> AI Developer Instruction §41 ("DO NOT START CODING YET").**
>
> Verification method: every claim below was checked against the live repo —
> `supabase/migrations/*.sql` (104 files, ~357 tables, 238 RPCs), `src/`
> (129 pages, 135 routes), and the session logs in `AGENTS.md`. Baseline per
> `AGENTS.md`: `tsc -b --noEmit` clean, `vite build` succeeds, 61/61 tests
> pass. (node_modules is not installed in this analysis environment, so the
> build was not re-run here; the committed baseline is authoritative.)

---

## 0. Executive summary (read this first)

The single most important finding is that **Avenize has *already* built most of
the intelligence spine the Master Instruction describes — but most of it is
dormant**: the tables exist, the RPCs exist, and the evidence model exists,
yet they are largely unwired, unscanned, unpopulated, and unread by the
frontend. The transformation the instruction asks for is therefore **not a
greenfield build; it is an activation, completion, and connection effort.**

Concretely, the repo already contains:

- A **Business Event Bus** (`business_events`, 058) with idempotent emission
  (`emit_business_event`), a handler registry, an auto-propagation handler
  (`handler_propagate_capture`, 071), and trigger wiring for 5 canonical
  events (059: DealWon, PaymentReceived, EmployeeJoined, EmployeeExited,
  InventoryLow).
- A **Business Context Graph** (`entity_relationships` + `recursive_neighbors`,
  060) and a **Canonical Ontology** (`business_ontology` + `resolve_canonical`,
  060).
- A **Fact/Inference/Estimate/Recommendation/Decision evidence model**
  (`claims` + `record_outcome`, 060) and the `<ClaimTag>`/`<ClaimNote>` UI
  primitives (`src/components/Evidence.tsx`).
- A **Data Quality / Reconciliation** layer (`data_quality_checks` +
  `record_reconciliation` + `data_integrity_scores`, 060/068).
- A **Cross-domain Exception feed** (`attention_exceptions` + `scan_exceptions`,
  061) with severity, entity pointer, suggested action, and resolve-on-clear.
- **Three parallel families of intelligence RPCs**:
  1. `063_intelligence_domains.sql` — `capacity_intelligence`,
     `process_bottleneck_intelligence`, `risk_anomaly_intelligence`,
     `revenue_forecast`, `early_warnings`, `opportunity_intelligence`,
     `strategic_alignment`, `market_intelligence` (the IntelligenceHub page
     consumes these).
  2. `20260101000006_applied_intelligence.sql` — a *second*, near-identical
     set: `intelligence_process_bottlenecks`, `intelligence_risk_anomalies`,
     `intelligence_capacity`, `intelligence_early_warnings`,
     `intelligence_sales_performance`, `intelligence_cashflow_forecast`.
  3. `061_observer_exceptions_indexes.sql` — `observer_snapshot`,
     `people_index`/`sales_index`/`financial_health_index`/
     `operational_index`/`trust_index`, `intelligence_indexes`.
- A **Decision + Learning Loop** (`decisions` + `record_decision_learning` +
  `similar_decisions`, 064) and **Organizational Memory**
  (`organizational_memory`, surfaced by a page).
- A **Control Plane** (066), **AI Guardrails / Authority ladder** (067),
  **Self-Audit** (`run_system_health_audit`/`run_business_health_audit`, 068),
  **Four-Reality** (`reality_gaps` + page), **Work Routing / SLA / Handoffs**
  (066), **Action Protocol** runs (066), and **Usage Telemetry**
  (`usage_events`, `20260101000007`).
- An **AI Capture** natural-language gateway (page + `parse-intent` edge fn +
  local fallback) that parses intent, proposes destinations, confirms, and
  raises a business event whose handler performs the real writes.

What is **missing or dormant** (the real work):

1. **No canonical Metric registry / engine.** A `kpi_metrics` table exists
   (019) but has **no writer and no frontend reader** — every dashboard
   independently re-derives metrics inline (e.g. `deriveMetrics` in
   ExecutiveCockpit). There is no metric dictionary, no shared definition, no
   tenant/time-period governance, no "insufficient data" guard.
2. **No Recommendation entity or outcome loop.** There is **no
   `recommendations` table**. The `claims` table *can* hold a
   `RECOMMENDATION` claim, and `record_outcome` closes a *forecast/estimate*
   claim's loop, but nothing emits recommendation claims and nothing tracks
   accepted → acted → outcome for a recommendation. The instruction's
   §12–§16 loop is unbuilt.
3. **The data-quality, reconciliation, context-graph, and ontology machinery is
   dormant in the frontend** — `data_quality_checks`, `claims`,
   `entity_relationships`, `business_ontology`, and `scan_exceptions` have
   **zero or near-zero frontend readers/writers**. The triggers that *would*
   populate them are not installed.
4. **`scan_exceptions` is never called.** It is defined (061) but has no
   pg_cron schedule and no page that triggers it. The Observer view reads
   `attention_exceptions` directly, so the feed is empty unless someone calls
   the scanner.
5. **Two duplicate intelligence families** (063 vs `20260101000006`) with
   overlapping but not identical rules — a "duplicate metric definition /
   contradictory calculation" risk that §7 explicitly warns against.
6. **No scheduled recomputation.** pg_cron is wired for automations (051) but
   not for intelligence scans / metric refreshes. Everything is computed live
   on read, which risks the §23 performance concern at scale and means
   notifications (§25) are never generated from intelligence.
7. **Intelligence does not write notifications.** `create_notification` (036)
   exists, but no intelligence RPC or exception scanner calls it. The §25
   notification integration is absent.
8. **No small-data / confidence guard is enforced.** RPCs return numbers with
   no sample-size or "insufficient data" classification. The `claims.confidence`
   column exists but intelligence RPCs largely hard-code `type:'INFERENCE'`.

**Headline recommendation:** the intelligence layer is ~70% built by schema
and ~25% wired. The highest-leverage, lowest-risk work is to *activate the
dormant machinery* (metric registry, recommendation + outcome loop, scheduled
scans, notification emission, frontend wiring of claims/data-quality/context
graph) rather than to build new tables. This matches the instruction's north
star: *"the objective is not to make Avenize bigger; it is to make Avenize
understand the businesses using it."*

---

## A. CURRENT STATE

### A.1 Stack & architecture (verified)
- **Stack:** Vite 8 + React 19 + TypeScript 6, Tailwind v4, Supabase (Postgres
  + RLS + Edge Functions). No dedicated backend server; the SPA talks to
  Postgres directly via the Supabase SDK. **RLS is the real authorization
  boundary**; client `permissions.ts`/`hasPermission` is UX gating only.
- **Scale:** 104 migrations, ~357 tables, 238 `CREATE OR REPLACE FUNCTION`
  RPCs, 129 page components, 135 routes, 18 edge functions.
- **Migrations:** numbered `0NN_name.sql` plus a `2026010100000N_*` series
  (Session 8/9 work) and legacy `99x_*`. Idempotent via `CREATE TABLE IF NOT
  EXISTS` / `CREATE OR REPLACE FUNCTION`. Helper `update_updated_at()`.
- **Auth:** Supabase Auth (email/password + OAuth) + MFA gate (Session 10/S1).

### A.2 RLS posture (verified)
- All 378 created tables have `ENABLE ROW LEVEL SECURITY` (migration 078
  backfilled).
- **Two coexisting RLS patterns** (the biggest latent security note):
  - **OLD/vulnerable:** `business_id IN (SELECT id FROM businesses)` — a
    subquery over the *whole* businesses table, true for ANY authenticated
    staff member. **~103 policies still use this.** Migration **080**
    rewrites them to the correct `business_id IN (SELECT business_id FROM
    get_current_staff())`, but **080 has NOT been applied to the live DB yet**
    (per AGENTS.md Session 10). Until it is applied, ~111 policies are a
    cross-tenant read/write leak. This is the #1 security risk and is already
    fixed in code — it only needs deployment.
  - **NEW/correct:** `business_id IN (SELECT business_id FROM get_current_staff())`
    (88 policies), plus role-restricted variants (e.g. 32 policies gating to
    `owner/manager`).
- `get_current_staff()` (001) is `SECURITY DEFINER`, returns the current
  staff row via `auth.uid()`. Every new intelligence table MUST use this
  pattern. **Per the Master Instruction §15–§19, no intelligence query may
  bypass this.**

### A.3 Intelligence surfaces today (verified)
- **IntelligenceHub** (`/app/intelligence`) — 9 panels calling 063 RPCs +
  `salary_affordability`/`compensation_review_recommendation`, each `ClaimTag`ged.
- **ObserverView** (`/app/observer`) — `observer_snapshot` +
  `intelligence_indexes` + direct `attention_exceptions` read.
- **ExecutiveCockpit** (`/app/cockpit`) — CEO/CFO/COO lenses, inline metric
  derivation + early-warnings + risk.
- **MarketIndex** (`/app/market`) — `market_intelligence` RPC.
- **OrganizationalMemory** (`/app/memory`) — `organizational_memory` +
  `decision_log` CRUD.
- **RealityGap** (`/app/reality-gap`) — `reality_gaps` CRUD.
- **SelfAudit** (`/app/self-audit`) — `run_system_health_audit` + fallback.
- **AICapture** (`/app/capture`) — NL → parse-intent edge fn → emit
  business event → `handler_propagate_capture` writes.

---

## B. EXISTING CAPABILITIES (reuse map)

| Capability | DB artifact (migration) | Wired in frontend? | Reuse verdict |
|---|---|---|---|
| Business event bus | `business_events`, `emit_business_event`, `business_event_handlers`, `process_business_event` (058) | AICapture, businessOS, FreshnessBadge | ✅ **Reuse as the event spine** — the instruction's §5 "unified event model" already exists. |
| Event triggers | 059 emits DealWon/PaymentReceived/EmployeeJoined/EmployeeExited/InventoryLow | (server-side, no UI) | ✅ Extend (add InvoiceOverdue, ProjectDelayed, CustomerInactive, etc.) |
| Capture propagation | `handler_propagate_capture` (071) | (handler) | ✅ The "insight→action" write path exists. |
| Entity freshness | `entity_freshness` + `entity_freshness_status` view (058) + `handler_update_entity_freshness` | FreshnessBadge, SelfAudit, businessOS | ✅ Reuse for "stale record" intelligence. |
| Context graph | `entity_relationships` + `recursive_neighbors` + `link_entities` (060) | **None** | 🟡 **Dormant — wire it.** The instruction's §4 relationship graph exists but is unpopulated. |
| Canonical ontology | `business_ontology` + `resolve_canonical` (060) | **None** | 🟡 Dormant — wire into capture/imports. |
| Evidence model | `claims` (FACT/INFERENCE/ESTIMATE/RECOMMENDATION/DECISION) + `record_outcome` (060) | `<ClaimTag>`/`<ClaimNote>` UI only; **claims table unused** | 🟡 **Dormant — this is the recommendation/outcome vehicle.** |
| Data quality / reconciliation | `data_quality_checks` + `record_reconciliation` + `data_integrity_scores` (060/068) | **None** | 🟡 Dormant — wire a scanner. |
| Exception feed | `attention_exceptions` + `scan_exceptions` (061) | ObserverView (read only) | 🔴 **`scan_exceptions` never called** — schedule it. |
| Intelligence indexes | people/sales/financial_health/operational/trust `_index` + `intelligence_indexes` (061) | ObserverView | ✅ Reuse for §26 health model (needs a "drivers" breakdown). |
| Intelligence RPCs (063) | capacity/process/risk/forecast/early-warning/opportunity/strategy/market | IntelligenceHub, ExecutiveCockpit | ✅ Reuse — but consolidate with the duplicate family below. |
| Intelligence RPCs (`…06`) | near-duplicate `intelligence_*` set + `intelligence_sales_performance` + `intelligence_cashflow_forecast` | **Unused by any page** | 🔴 **Duplicate** — pick one family, retire the other. |
| Decision/learning loop | `decisions` + `record_decision_learning` + `similar_decisions` (064) | GovernanceHub (read) | 🟡 Partial — wire as the outcome-loop backbone. |
| Org memory | `organizational_memory` + `decision_log` (064) | OrganizationalMemory (CRUD) | ✅ Reuse for "what worked" history. |
| Control plane | `control_plane_objects`, work routes, SLA, handoffs (066) | (server-side) | ✅ Reuse for §14 action routing. |
| AI guardrails | `ai_capability_authorities` + authority ladder (067) | AICapture guardrail check | ✅ Reuse — recommendations must respect max-rung. |
| Self-audit | `run_system_health_audit`/`run_business_health_audit`, `self_audit_findings` (068) | SelfAudit (with fallback) | ✅ Reuse for data-quality findings. |
| Four-reality | `reality_gaps` (20260101000004) + `four_reality_assessments` (069) | RealityGap (CRUD) | ✅ Reuse for "intended vs recorded vs actual vs outcome". |
| Notifications | `notifications` + `create_notification` (036) | Automations, WorkflowBuilder | 🟡 **Intelligence never calls it** — wire (§25). |
| KPI metrics table | `kpi_metrics` (019) — name, value, target, query_definition, last_calculated_at | **No reader, no writer** | 🔴 **Dormant** — repurpose as the Metric registry (§6/§7). |
| Audit log | `audit_logs` + trigger-based `audit_row_change` (056) | AuditLog page | ✅ Reuse for recommendation provenance. |
| Usage telemetry | `usage_events` + `usage_module_adoption` (…07) | Shell (log view) | ✅ Reuse for adoption / "is this module used" intelligence. |
| Action reversal | `action_reversals` (gap-fill) | `useReversal` hook (Session 7) | ✅ Reuse for "outcome = reversed" feedback. |

---

## C. DATA SOURCES (real domain tables, verified present)

Core business entities (each business-scoped, RLS-protected):
- **Identity/org:** `businesses`, `staff`, `departments`, `functional_roles`.
- **CRM:** `contacts` (customers), `leads`, `deals`, `quotes`.
- **Finance:** `invoices`, `payments`, `payment_refunds`, `transactions`,
  `expense_claims`, `budgets`, `budget_transactions`, `cashflow`,
  `cashflow_entries`, `payroll_runs`, `sales_targets`, `payment_gateways`.
- **Operations:** `tasks`, `tickets`, `projects`, `products`, `inventory`,
  `stock_movements`, `vendors`, `purchase_orders`, `purchase_requests`,
  `rfqs`, `assets`/`equipment`.
- **People:** `leave_requests`, `timesheets`, `appraisals`, `training_records`,
  `merit_entries`.
- **Comms:** `channels`, `messages`, `chat_conversations`, `chat_messages`,
  `notifications`, `announcements`.
- **Property:** `properties`, `property_owners`, `property_sales`,
  `lease_management`.
- **Legal:** `legal_contracts`, `legal_cases`, `legal_obligations`.
- **Documents:** `documents`, `document_folders`, `signature_requests`,
  `signature_signers`.
- **Knowledge:** `kb_pages`, `kb_spaces`, `organizational_memory`.
- **Intelligence/meta:** `business_events`, `entity_relationships`,
  `business_ontology`, `claims`, `data_quality_checks`, `attention_exceptions`,
  `decisions`, `decision_log`, `reality_gaps`, `action_reversals`,
  `self_audit_findings`, `usage_events`, `module_status`.

**Data quality note:** many intelligence RPCs assume specific column shapes
(e.g. `invoices.status ∈ {sent,overdue,paid}`, `deals.stage ∈
{won,closed_won,closed-won}`). The codebase already documents stage-name drift
as "the highest-risk defect class" (AGENTS.md). Any new metric MUST defend
against the multiple accepted spellings (see `intelligence_sales_performance`
which already unions `'won','closed_won','closed-won'`).

---

## D. EXISTING INTELLIGENCE (what actually computes today)

All deterministic, Postgres-only, no LLM (consistent with §22):

1. **`capacity_intelligence`** (063) — headcount vs open/overdue tasks; overload flag.
2. **`process_bottleneck_intelligence`** (063) — avg task age per status + bottleneck stage.
3. **`risk_anomaly_intelligence`** (063) — anomaly list (note-style).
4. **`revenue_forecast`** (063) — monthly collection avg → projected next N months + confidence + assumptions.
5. **`early_warnings`** (063) — overdue receivables, inventory shortage.
6. **`opportunity_intelligence`** (063) — opportunity list + action.
7. **`strategic_alignment`** (063) — OKR alignment.
8. **`market_intelligence`** (063) — benchmark w/ provenance (FACT/INFERENCE/ESTIMATE).
9. **`salary_affordability`** / **`compensation_review_recommendation`** (062).
10. **`intelligence_process_bottlenecks`** etc. (…06) — **duplicate family**, currently unused.
11. **`intelligence_cashflow_forecast`** (…06) — 90-day moving average (needs ≥7 days).
12. **`observer_snapshot`** + 5 indexes (061).
13. **`scan_exceptions`** (061) — overdue invoices / low stock / overdue tasks / unpaid payroll → `attention_exceptions` (but **never scheduled**).
14. **`run_system_health_audit`** / **`run_business_health_audit`** (068).
15. **`data_integrity_scores`** (068) — completeness/duplication/validity/freshness (hard-coded sub-scores except freshness).
16. **`record_outcome`** (060) — closes a forecast/estimate claim's loop with accuracy.

**Gap:** none of the above produces a persisted, tenant/time-period-governed
metric row, none emits a `RECOMMENDATION` claim, and none writes a
notification. They are stateless read functions.

---

## E. GAPS (vs the Master Instruction)

| # | Instruction section | Gap | Severity |
|---|---|---|---|
| E1 | §6/§7 | **No Metric registry/engine.** `kpi_metrics` is an empty shell; each dashboard re-derives metrics inline → duplicate/contradictory formulas (exactly what §7 warns against). | P1 |
| E2 | §12–§16 | **No recommendation entity + outcome loop.** No `recommendations` table; `claims` RECOMMENDATION rows never emitted; accepted/rejected/acted/outcome untracked; no effectiveness calc. | P1 |
| E3 | §8 | **Data-quality engine dormant.** `data_quality_checks`/`record_reconciliation` have no scanner; no "orphaned invoice / impossible state / unreconciled tx" detector running. | P1 |
| E4 | §4 | **Context graph unpopulated.** `entity_relationships` empty; `link_entities` uncalled; no Customer→Deal→Invoice→Payment edges derived. Cross-module diagnosis (§11) cannot work without edges. | P1 |
| E5 | §25 | **Intelligence → notifications not wired.** No intelligence RPC / scanner calls `create_notification`. | P2 |
| E6 | §23 | **No scheduled recomputation.** pg_cron wired for automations only; metrics/scans computed live on every read. | P2 |
| E7 | §10/§21 | **No confidence/sample-size guard.** RPCs return numbers regardless of sample size; no "INSUFFICIENT DATA" classification. | P1 |
| E8 | §9/§11 | **No diagnosis engine.** Single-domain signals exist; cross-module "revenue↓ associated with conversion↓ + cycle↑" diagnosis does not. | P2 |
| E9 | §13/§18 | **Recommendations not humanized/company-specific.** Existing RPCs emit generic strings ("Consider hiring…"). No company-baseline comparison. | P2 |
| E10 | §17 | **No "what needs my attention?" prioritized executive briefing** beyond the flat exception list. | P2 |
| E11 | §26 | **No explainable business-health model with drivers.** Indexes give a score but not "+8 revenue / −12 cash" driver breakdown. | P2 |
| E12 | §20 | **No company-specific baselines** (collection period, sales cycle). All thresholds are absolute. | P2 |
| E13 | §5 | **Event catalog incomplete.** Only 5 canonical events trigger; InvoiceOverdue, ProjectDelayed, CustomerInactive, DealLost, etc. are named in the bus header but not emitted. | P1 |

---

## F. DUPLICATES

1. **Two intelligence RPC families (063 vs `20260101000006`).** `capacity_intelligence` ↔ `intelligence_capacity`, `process_bottleneck_intelligence` ↔ `intelligence_process_bottlenecks`, etc. **Rules differ** (e.g. 063's capacity uses `>10 tasks/person`; …06 uses `>1.5× business avg`). This is the exact "contradictory calculation" risk from §7. **Action: choose one canonical family, retire the other, keep both callable only behind a deprecation note until frontend migrates.**
2. **Three "business health" audits** — `run_business_health_audit` (068, 2 rules), `run_system_health_audit` (068, broader), and the `intelligence_indexes` health proxies. Scope overlaps.
3. **Two EmptyState components** (`EmptyState.tsx` default + `EmptyStates.tsx` named) — cosmetic, flagged in AGENTS.md, not intelligence-relevant.
4. **`intelligence_sales_performance`** (…06, uses `deals.stage`) overlaps with sales `sales_index` (061, uses invoices as proxy) — different definitions of "sales performance."

---

## G. ARCHITECTURAL RISKS

1. **Two RLS patterns coexist; 080 undeployed.** Until migration 080 is applied to live Supabase, ~111 policies use the cross-tenant subquery. Any new intelligence table must use `get_current_staff()` and must not be deployed before 080. (AGENTS.md Session 10.)
2. **Stateless-on-read intelligence.** Every page calls multiple RPCs that
   re-scan domain tables on each render. No materialization, no caching. At
   a few hundred invoices/deals this is fine; at scale it degrades. §23.
3. **Dual status vocabularies.** `deals.stage` accepts multiple "won" spellings; `invoices.status` differs from `payments.status`. New metrics must union these or they silently return 0. Documented high-risk defect class.
4. **`claims` is a generic evidence table with no enforced link to the emitting rule.** Without a `rule_id`, the outcome loop cannot compute "recommendations of type X historically produced outcome Y."
5. **No intelligence failure isolation tested.** §24 requires CRM/Finance/etc. to keep working if intelligence fails. Today, a failing RPC surfaces as an empty panel (pages use `Promise.allSettled`) — acceptable — but the *capture propagation handler* (071) is best-effort and must never block the event; verify this holds for any new handlers.
6. **`isAdmin`/`admin` role drift** (AGENTS.md Session 10 follow-up): some pages gate on `role === 'admin'`, a role absent from the DB constraint (`owner|manager|staff`). Intelligence access gating must use `owner|manager`, not `admin`.

---

## H. SECURITY RISKS (intelligence-specific)

1. **Cross-tenant leak via old RLS (pre-080).** Highest priority. Deploy 080 before any intelligence goes live.
2. **Blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated`** (998). 235 SECURITY DEFINER functions are executable by unauthenticated users. Any new intelligence RPC must be explicitly granted to `authenticated` only and must include an `auth.uid()` / `get_current_staff()` tenant check, or it leaks across tenants. (AGENTS.md Session 11 §84 — needs live DB to narrow safely.)
3. **`claims` / `data_quality_checks` / `attention_exceptions` carry entity pointers and may embed amounts/notes.** They are RLS-gated to own business (correct pattern in 060/061), but ensure new scanners never insert a row with another business's `business_id`.
4. **No cross-company aggregation must be visible.** §28. The `usage_cross_business_adoption` RPC correctly revokes `authenticated` (service-role only) — keep that precedent: any builder-wide intelligence must be service-role only.
5. **Provider secrets** — already addressed (Session 10/S3: secrets no longer sent to client). Intelligence must never re-introduce a `select('*')` on `settings`/`payment_gateways`.

---

## I. PERFORMANCE RISKS

1. **Live re-scan on every page load** (see G2). Mitigation: materialize
   metrics into `kpi_metrics` via a scheduled `refresh_business_metrics()`
   pg_cron job; pages read the materialized row + an `as_of` timestamp.
2. **`scan_exceptions` is a per-row loop** (`FOR r IN SELECT … LOOP INSERT … ON
   CONFLICT DO NOTHING`). For a business with thousands of invoices this is
   slow. Convert to set-based `INSERT … SELECT … ON CONFLICT` when scheduling.
3. **`recursive_neighbors`** is a recursive CTE over `entity_relationships`;
   with no edges today it's trivial, but a fully-populated graph + depth 3
   could be expensive. Cap depth and index `(business_id, source_type,
   source_id)` (index already exists).
4. **`intelligence_cashflow_forecast`** calls `generate_series` for `p_days`
   rows even when the moving average is a single constant — wasteful but cheap.

---

## J. DATA QUALITY RISKS (what the data-quality engine must itself check)

1. **Orphaned invoices** — `invoices.contact_id IS NULL` (already flagged by
   `run_business_health_audit`). Blocks customer-exposure intelligence.
2. **Status vocabulary drift** — multiple "won"/"paid" spellings silently
   zero-out metrics. A data-quality rule should assert a closed set per table.
3. **Negative/impossible values** — no CHECK on `invoices.total >= 0`,
   `payments.amount >= 0`. A reconciliation rule should flag negatives.
4. **Unreconciled transactions** — `transactions` vs `payments` vs
   `cashflow_entries` can disagree (the `record_reconciliation` design exists
   for exactly this; it is uncalled).
5. **Stale entities** — `entity_freshness` exists and is populated by the
   event bus; a data-quality rule should surface entities with no event in
   >30d.
6. **Missing ownership** — `tasks.assigned_to NULL`, `deals.assigned_to NULL`
   blocks capacity + sales-performance intelligence.
7. **Future-dated / back-dated** records (timezone) — §29 requires testing date
   boundaries; no CHECK exists.
8. **Duplicate entities** — same customer in `contacts` twice; no dedup rule.

---

## K. PROPOSED INTELLIGENCE ARCHITECTURE

**Principle:** activate the dormant spine; add only the three missing load-bearing pieces. No external dependencies. No new modules. RLS-first.

```
            ┌─────────────────────────────────────────────────────────────┐
            │            EXISTING DOMAIN MODULES (unchanged)               │
            │  CRM · Finance · Projects · HR · Inventory · Procurement …    │
            └───────────────┬─────────────────────────────────────────────┘
                            │ (already wired by 059 triggers)
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  BUSINESS EVENT BUS (058) — the spine, ALREADY EXISTS        │
            │  emit_business_event → process_business_event → handlers    │
            └───────┬────────────────┬───────────────┬───────────────────┘
                    │                │               │
          (extend)  │       (wire)  │        (wire) │
                    ▼                ▼               ▼
        ┌──────────────────┐ ┌────────────────┐ ┌──────────────────────┐
        │ MORE EVENT       │ │ CONTEXT GRAPH  │ │ ENTITY FRESHNESS     │
        │ TRIGGERS (new)   │ │ (060, wire)    │ │ (058, exists)        │
        │ InvoiceOverdue,  │ │ link_entities  │ │                      │
        │ ProjectDelayed,  │ │ on every emit  │ │                      │
        │ CustomerInactive │ │                │ │                      │
        └────────┬─────────┘ └────────┬───────┘ └──────────┬───────────┘
                 │                    │                    │
                 └──────────┬─────────┴────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  METRIC ENGINE (NEW, thin) — repurpose `kpi_metrics` (019)   │
            │  • metric_definitions (name, formula, sources, period,       │
            │    min_sample, unit)  — registry, §6/§7                       │
            │  • refresh_business_metrics(business_id) — pg_cron scheduled │
            │  • writes kpi_metrics rows + as_of + sample_size + confidence│
            │  • "INSUFFICIENT DATA" guard when sample < min_sample, §21   │
            └───────────────┬─────────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  INTELLIGENCE ENGINE (consolidate 063 + …06)                 │
            │  • trends / anomalies / risks / opportunities / concentrations│
            │  • diagnosis: cross-module via context graph + event history  │
            │  • each finding emits a `claims` row (claim_type, evidence,   │
            │    confidence, rule_id) — §10/§19/§38                          │
            └───────────────┬─────────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  RECOMMENDATION ENGINE (NEW) — persisted in `claims`         │
            │  • recommendation = claims row w/ claim_type='RECOMMENDATION' │
            │    + rule_id + title + evidence + recommended_action + owner  │
            │  • status: issued→acknowledged→accepted/rejected→acted→      │
            │    outcome→measured        (§12–§16)                           │
            │  • action: route to EXISTING workflows (create task / PO /    │
            │    approval) via control_plane route_work (066), §14           │
            └───────────────┬─────────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  OUTCOME LOOP (NEW) — record_outcome (060) + effectiveness    │
            │  • on action completion, record actual_outcome + accuracy     │
            │  • recommendation_effectiveness(rule_type) — §16              │
            │  • feeds org memory (064) as a learned lesson                 │
            └───────────────┬─────────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  EXECUTIVE EXPERIENCE (upgrade existing pages)               │
            │  • "What needs my attention?" = prioritized recommendations  │
            │    + critical exceptions (attention_exceptions, 061) §17       │
            │  • Business health model w/ drivers (upgrade intelligence_   │
            │    indexes, 061) §26                                          │
            │  • every insight inspectable → evidence drill-down §19         │
            └───────────────┬─────────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────────┐
            │  NOTIFICATIONS (wire) — create_notification (036), §25        │
            │  • scanner emits a notification only for material/actionable/ │
            │    threshold-crossing findings; dedup on unresolved issue     │
            └─────────────────────────────────────────────────────────────┘
```

**Failure isolation (§24):** the metric/recommendation layers are read-only
interpretation over the domain tables. A failure in `refresh_business_metrics`
or in a diagnosis RPC surfaces as "intelligence unavailable — here's the raw
number" and never blocks CRM/Finance/HR. New handlers registered with the
event bus MUST be best-effort (sub-block + `EXCEPTION`) like
`handler_propagate_capture`.

---

## L. TABLES THAT CAN BE REUSED (do NOT create new)

- `business_events`, `business_event_handlers` (058) — event spine.
- `entity_freshness` / `entity_freshness_status` (058) — staleness.
- `entity_relationships` (060) — context graph edges.
- `business_ontology` (060) — alias→canonical.
- `claims` (060) — **the recommendation + evidence + outcome vehicle.**
- `data_quality_checks` (060) — quality findings.
- `attention_exceptions` (061) — exception feed.
- `decisions` / `decision_log` / `organizational_memory` (064) — learning loop.
- `control_plane_objects`, `work_routes`, `handoffs`, `sla_*` (066) — action routing.
- `notifications` (036) — alert delivery.
- `audit_logs` (056) — provenance.
- `self_audit_findings`, `reconciliation_runs` (068) — audit.
- `usage_events` (…07) — adoption.
- `kpi_metrics` (019) — **repurpose as the materialized metric store.**
- `reality_gaps` (gap-fill) — intended/recorded/actual/outcome.
- `action_reversals` (gap-fill) — undo feedback.

---

## M. TABLES THAT ARE ACTUALLY NECESSARY (new — minimal)

Only **three** new artifacts, all thin, all RLS-gated via `get_current_staff()`:

1. **`metric_definitions`** (registry — the §7 governance table). Columns:
   `key, name, definition, formula, sources (text[]), unit, period, min_sample,
   is_active, version`. Seed rows for the ~25 prioritized metrics (§6). This is
   the single source of truth that both `refresh_business_metrics` and the UI
   read; prevents duplicate/contradictory formulas.
   - *Alternative considered:* store definitions in code. Rejected — §7
     requires inspectable, versioned, non-silent changes; a table is auditable
     and tenant-overrideable.
2. **`recommendation_states`** (or reuse `claims` + a status column). Leanest
   path: **extend `claims`** with `status TEXT` (`issued/acknowledged/accepted/
   rejected/acted/outcome_recorded`), `rule_id TEXT`, `owner_id UUID`,
   `linked_action_id UUID`, `action_type`, `expected_impact JSONB`,
   `actual_impact JSONB`. This avoids a new table and keeps recommendations
   inside the existing evidence model — **preferred**.
3. **`recommendation_effectiveness`** (materialized view, not a base table) —
   `rule_id, issued, accepted, acted, successful, avg_impact`, refreshed by
   pg_cron. Could be a `STABLE` function instead — **prefer the function** to
   avoid a new materialized-view refresh job.

**Verdict:** realistically **1 new table** (`metric_definitions`) + **2 columns
+ 1 status enum on `claims`** + **a handful of new functions**. This is the
"smallest safe change" per the instruction §34.

---

## N. BUSINESS EVENTS THAT ALREADY EXIST (verified)

Emitted by triggers (059) and the capture handler:
- `DealWon`, `PaymentReceived`, `EmployeeJoined`, `EmployeeExited`,
  `InventoryLow` (triggers).
- `CampaignConverted`, `TaskOverdue`, `ContractExpiring`, `PayrollDue` —
  named in the handler registry (058) but **no trigger emits them**; only
  registered as freshness-handler subscribers.

---

## O. BUSINESS EVENTS THAT ARE MISSING

Per §5 and the diagnosis needs:
- `InvoiceCreated`, `InvoiceSent`, `InvoiceOverdue` (no trigger; overdue is
  only detected on read by `scan_exceptions`/`early_warnings`).
- `DealLost` (only DealWon is emitted).
- `LeadCreated`, `CustomerCreated`, `CustomerInactive`, `CustomerReturned`.
- `ExpenseCreated`, `ExpenseApproved`, `ExpenseRejected`.
- `ProjectCreated`, `ProjectDelayed`, `ProjectCompleted`.
- `TaskCreated`, `TaskCompleted` (TaskOverdue is registered but not emitted).
- `InventoryDepleted`, `PurchaseCreated`, `PurchaseApproved`, `SupplierCreated`.
- `SubscriptionStarted`, `SubscriptionCancelled`.

**Implementation note:** each new event = one `AFTER` trigger (059-style) +
one `business_event_handlers` row (freshness) and, where the event should
*write*, a propagation handler like 071. Keep events append-only and
idempotent (the bus dedups on payload hash).

---

## P. METRICS THAT ALREADY EXIST (as inline calculations, not governed)

- Revenue collected, cash in/out, net cash — ExecutiveCockpit `deriveMetrics`.
- Receivables, overdue receivables, collection coverage — `financial_health_index`.
- Pipeline value, deal count — ExecutiveCockpit.
- Open/overdue/completed tasks, completion rate — `operational_index`.
- Headcount, active staff — `people_index`.
- Capacity utilisation, tasks/person — `capacity_intelligence`.
- Stage avg days, bottleneck — `process_bottleneck_intelligence`.
- Sales target attainment — `intelligence_sales_performance`.
- 90-day cash moving average — `intelligence_cashflow_forecast`.
- Revenue forecast (monthly) — `revenue_forecast`.

**Problem:** none are registered, none carry a definition/formula/source/period,
none carry `min_sample`, none are versioned. This is the §7 violation to fix.

---

## Q. METRICS THAT ARE MISSING (prioritized — §6)

Tier 1 (material to decisions, derivable from existing tables today):
1. **Revenue (period)** + **Revenue growth (PoP)** — invoices paid, period-over-period.
2. **Gross profit / gross margin** — needs a cost source; `expense_claims` + COGS from `products.cost` × `invoice` lines (invoice lines may need a join table — check).
3. **Net profit** — revenue − expenses (cashflow_entries).
4. **Expense ratio** — expenses / revenue.
5. **Receivables (outstanding)** + **Overdue receivables %**.
6. **Average collection period (DSO)** — days from invoice to payment.
7. **Payables** — vendor/purchase orders unpaid.
8. **Sales conversion / win rate** — deals won / deals closed (won+lost).
9. **Average deal value** + **Sales cycle (days)** — deal created→closed.
10. **Customer retention / inactivity** — repeat customers; days since last invoice per customer vs that customer's own baseline (§20).
11. **Receivables concentration** — top-N customer share of overdue (§37 rule FIN-AR-001).
12. **Revenue concentration** — top-N customer share of revenue.
13. **Project profitability** — project revenue − project costs.
14. **Project budget variance** + **Project delay rate**.
15. **Task completion rate** (exists) — keep, govern it.
16. **Inventory turnover** + **Stock-out rate** + **Dead stock** (no movement > N days).
17. **Supplier performance** — on-time delivery / price variance (needs PO receipt dates — check `purchase_orders`).
18. **Employee cost** + **Resource utilisation** (exists as capacity — govern).
19. **Payroll affordability** (exists — `salary_affordability`).

Tier 2 (defer until Tier 1 governed): churn, LTV, CAC, runway.

**"Insufficient data" rule (§21):** every metric stores `sample_size` and a
`min_sample` in `metric_definitions`; below `min_sample` the value is `NULL`
and the UI shows *"Not enough [invoices/deals] yet to establish this."*

---

## R. FIRST 20 INTELLIGENCE RULES (Rule ID format per §36)

| ID | Name | Sources | Trigger (sketch) | Confidence floor |
|----|------|---------|------------------|------------------|
| FIN-AR-001 | Receivables concentration risk | invoices, contacts | top-5 customers > 50% of overdue & ≥10 overdue invoices | HIGH (≥20 invoices) |
| FIN-AR-002 | DSO deteriorating | invoices, payments | DSO this period > 1.3× business's own 90d baseline | MEDIUM (≥3 periods) |
| FIN-CF-001 | Cash runway shrinking | cashflow_entries | 90d moving avg net < 0 for ≥14d | HIGH |
| FIN-EX-001 | Expense growth outpacing revenue | transactions | expense growth % > revenue growth % + 10pts, ≥3 mo | MEDIUM |
| FIN-IN-001 | Overdue invoice aging | invoices | invoice overdue > 30/60/90d | HIGH |
| SAL-CV-001 | Sales conversion falling | deals | win rate down ≥20% PoP, ≥20 closed deals | MEDIUM |
| SAL-CY-001 | Sales cycle lengthening | deals | avg cycle up ≥25% vs baseline, ≥10 won | MEDIUM |
| SAL-DV-001 | Average deal value declining | deals | avg value down ≥15% PoP | MEDIUM |
| CUS-RT-001 | Customer inactivity vs own baseline | invoices, contacts | days-since-last > 2× customer's own median gap | MEDIUM (≥4 prior purchases) |
| CUS-CC-001 | Revenue concentration (single customer) | invoices | top customer > 40% revenue, ≥6 mo | HIGH |
| OPS-PJ-001 | Project budget overrun | projects, expenses | actual cost > budget × 1.1 | HIGH |
| OPS-PJ-002 | Project delay | projects, tasks | >25% tasks overdue or end-date passed | MEDIUM |
| OPS-TK-001 | Task overdue concentration | tasks | top-3 owners hold >60% overdue | MEDIUM |
| INV-TN-001 | Inventory turnover low | products, stock_movements | no movement > 90d & value > threshold | HIGH |
| INV-ST-001 | Stock-out / low stock | products | stock ≤ reorder (exists — govern) | HIGH |
| INV-DS-001 | Dead stock | products, stock_movements | zero outbound movement > 180d | MEDIUM |
| PPL-CAP-001 | Capacity overload (exists — govern) | staff, tasks | tasks/person > 1.5× business avg | MEDIUM |
| PPL-PAY-001 | Payroll unpaid near due | payroll_runs | status draft/calculated & paydate ≤ 3d | HIGH |
| SUP-PF-001 | Supplier price increasing | purchase_orders, vendors | unit price up > 15% PoP, ≥3 POs | MEDIUM |
| DQ-OR-001 | Orphaned invoice (no contact) | invoices | contact_id IS NULL | HIGH (data-quality, not business) |

Each rule will be fully documented per §36 (RULE ID / NAME / PURPOSE /
DATA SOURCES / INPUTS / CALCULATION / TRIGGER / CONFIDENCE REQUIREMENT /
OUTPUT / EXPLANATION / RECOMMENDATION / ACTION / OUTCOME / FAILURE
CONDITION / EXAMPLE / TEST).

---

## S. FIRST 10 RECOMMENDATION TYPES (§12/§13)

1. **Prioritize collections** — top-N customers hold X% of overdue (FIN-AR-001) → action: create collection tasks assigned to deal owner.
2. **Follow up inactive customer** — customer's gap > 2× their baseline (CUS-RT-001) → action: create CRM follow-up task.
3. **Diversify revenue concentration** — one customer > 40% (CUS-CC-001) → action: create a sales target for new-logo outreach.
4. **Restock low item** — stock ≤ reorder (INV-ST-001) → action: create purchase request (existing PO workflow).
5. **Review dead stock** — no movement 180d (INV-DS-001) → action: create a markdown/clearance task.
6. **Intervene on at-risk project** — budget overrun / delay (OPS-PJ-001/2) → action: open project + create intervention task + optional approval.
7. **Re-baseline overdue task load** — concentration (OPS-TK-001) → action: reassign tasks (control plane `route_work`).
8. **Approve/fund payroll** — unpaid near due (PPL-PAY-001) → action: route to approval workflow.
9. **Review expense growth** — expenses outpacing revenue (FIN-EX-001) → action: create a budget review approval.
10. **Renegotiate supplier** — price up (SUP-PF-001) → action: create a vendor review task.

Each must carry specific numbers from the business's own data (never
"improve sales"), an evidence drill-down, an expected impact, a confidence
class, and a linked action in an existing workflow.

---

## T. TEST STRATEGY (§29/§30)

1. **Golden datasets (§30):** 6 synthetic businesses (A healthy, B cash-stressed,
   C sales-declining, D high-growth, E inventory-heavy, F project-heavy),
   each with seeded `invoices/deals/tasks/products/staff/payments` shaped to
   trigger known rules. Assert the engine emits the expected findings and
   *no others* (anti-hallucination).
2. **pgTAP unit tests per rule** (the repo already has `tests/database/*.sql`
   pgTAP infra): correct data, incorrect data (negative amounts), missing data
   (null contact), small dataset (<min_sample → INSUFFICIENT), zero values,
   duplicate data, tenant isolation (two businesses, assert no cross-bleed).
3. **Edge/boundary:** date boundaries (period rollover), timezone (UTC vs
   WAT), empty business, single-record business, very large business.
4. **Failure isolation (§24):** force a scanner exception; assert domain pages
   still load and show "intelligence unavailable."
5. **Outcome-loop test:** issue → accept → act → record outcome → assert
   `recommendation_effectiveness` increments and accuracy computed.
6. **Frontend (vitest, existing infra):** metric panels render
   "Insufficient data" when sample < min; recommendation card shows evidence
   drill-down; nothing crashes when RPC errors (Promise.allSettled already
   used — keep the pattern).
7. **E2E (Playwright, existing `tests/ux`):** the executive briefing surfaces
   the expected finding for golden business B; the action button routes to
   the right existing workflow.

---

## U. IMPLEMENTATION ORDER (§31/§32 priority)

**P0 (stability — do first, do not skip):**
- U0. **Deploy migration 080** (cross-tenant RLS) + 081 (FK cascade) to live
  Supabase. Intelligence must not ship on the pre-080 leak. (Already written;
  needs ops action.)

**P1 (foundation — the dormant-spine activation):**
- U1. **Consolidate the two intelligence RPC families** (063 vs …06). Choose
  063 as canonical (it has the broader domain set + is consumed by
  IntelligenceHub); port the unique `intelligence_sales_performance` and
  `intelligence_cashflow_forecast` into 063 names, mark …06 RPCs deprecated.
  Risk: low (read functions); verify both pages still resolve.
- U2. **`metric_definitions` registry** + `refresh_business_metrics(business_id)`
  function (writes governed `kpi_metrics` rows with sample_size + confidence
  + as_of). pg_cron schedule (reuse 051's pg_cron). Seed Tier-1 metrics (Q1–Q19).
  Risk: medium (new writes; ensure RLS + best-effort).
- U3. **Wire the context graph.** Add `link_entities` calls inside
  `handler_propagate_capture` and the 059 triggers so Customer→Deal→Invoice→
  Payment edges are derived on every emit. Risk: low (append-only).
- U4. **Extend `claims` with recommendation status/rule_id/owner/linked_action/
  expected/actual impact** (alter table, additive). Risk: low (nullable cols).
- U5. **Data-quality scanner.** New `scan_data_quality(business_id)` (set-based)
  covering J1–J8; schedule via pg_cron; persist into `data_quality_checks`/
  `self_audit_findings`. Risk: medium.
- U6. **Complete the event catalog (O).** Add triggers for InvoiceOverdue,
  DealLost, ProjectDelayed, TaskCompleted, CustomerInactive (a scheduled
  check, not a trigger, for "inactive"). Risk: medium (new triggers — test
  for re-entrancy + idempotency).

**P2 (loop + experience):**
- U7. **Recommendation engine.** A `generate_recommendations(business_id)`
  function that runs the Tier-1 rules, emits `RECOMMENDATION` claims, dedups
  against unresolved ones. Risk: medium.
- U8. **Action layer (§14).** Each recommendation's action calls existing
  workflows: create task / PO / approval via `route_work` (066) or direct
  inserts. Record `linked_action_id` on the claim. Risk: medium.
- U9. **Outcome loop (§15/§16).** On action completion (task done / PO
  received / payment received), call `record_outcome` on the linked claim;
  `recommendation_effectiveness(rule_id)` aggregates. Feed a learned lesson
  into `organizational_memory` when an outcome is recorded. Risk: medium.
- U10. **Executive briefing page/upgrade (§17).** "What needs my attention?"
  = prioritized recommendations + critical `attention_exceptions`. Risk: low
  (read + render).
- U11. **Business health model w/ drivers (§26).** Upgrade `intelligence_indexes`
  to return `{ score, drivers: [{dim, delta, why}] }`. Risk: low.
- U12. **Notification integration (§25).** Scanner emits `create_notification`
  only for severity≥warning & unresolved; dedup on (business, rule_id,
  entity_id). Risk: low.

**P3 (advanced — defer):** company-specific baselines auto-learning (§20
beyond static 90d), advanced forecasting, generative copilot (explicitly NOT
this phase — §22/Session 9 decision).

---

## V. ESTIMATED RISK PER CHANGE

| Step | Touches | Risk | Mitigation |
|---|---|---|---|
| U0 deploy 080/081 | live DB | High if misapplied, but code is done | Apply in staging; verify with the existing pgTAP RLS tests |
| U1 consolidate RPCs | read functions + 2 pages | Low | keep deprecated aliases for one release |
| U2 metric registry + refresh | 1 new table + new fn + cron | Medium | best-effort refresh; reads unaffected if refresh fails |
| U3 context graph wiring | handlers/triggers | Low | append-only edges; idempotent upsert |
| U4 claims extension | alter table | Low | additive, nullable |
| U5 data-quality scanner | new fn + cron | Medium | set-based; never mutates domain data |
| U6 more events | new triggers | Medium | AFTER triggers; idempotent bus; test re-entrancy |
| U7 recommendation engine | new fn + claims writes | Medium | dedup; never blocks domain ops |
| U8 action layer | calls existing workflows | Medium | respect AI authority ladder (067); approval-gated writes |
| U9 outcome loop | record_outcome + effectiveness | Low | read-only aggregation |
| U10 exec briefing | new/upgrade page | Low | Promise.allSettled; "unavailable" fallback |
| U11 health drivers | upgrade indexes | Low | backward-compatible JSON |
| U12 notifications | scanner + create_notification | Low | dedup + severity gate |

---

## WAITING FOR APPROVAL

Per Master Instruction §41, **no code has been modified.** This report is the
required A–V analysis. The recommended next step is approval to begin **P0 (U0:
deploy 080/081)** and **P1 (U1–U6)**, executed incrementally with `tsc` + build
+ vitest green after each step, exactly as prior sessions have done.

The objective is not to make Avenize bigger. The objective is to make the
dormant intelligence spine it already owns actually understand the businesses
using it.

---

## IMPLEMENTATION STATUS (P1 U1–U6 executed after user approval "yes proceed")

Approval received. P1 implementation executed incrementally; baseline held green
after every step (final: `tsc -b --noEmit` clean, `vite build` succeeds,
`vitest run` 73/73 pass — was 61, +12 new tests). No working module was
rewritten; no external dependency introduced; all changes are internal SQL + a
thin client wrapper layer in `src/lib/businessOS.ts`. Six new idempotent
migrations (085–090, ~1,574 lines).

### Drift discovered during implementation (and fixed, not papered over)
- **`invoices` has no `contact_id`** (base 001 + 002 use `client_name`/`client_email`/`deal_id`), yet the `…06` and 068/…06 RPCs referenced `invoices.contact_id` — they would error on a live DB. The governed metric engine (086) uses the real `client_name` for customer attribution instead.
- **`deals` uses `stage` (won/lost/…), not `status`**, and has `owner_id` (not `assigned_to`) and **no `closed_at`**. The 059 `emit_deal_won` trigger checked `NEW.status = 'closed_won'` → **DealWon never fired**. Fixed in 090. The entire `…06` family referenced `deals.assigned_to`/`closed_at` (non-existent) — confirmed dead+broken, hence deprecated.
- **`tasks` uses `assignee_id`** (not `assigned_to`) and `status ∈ {todo,in_progress,done,cancelled}`. The data-quality scanner (089) uses the real column.

### What was built (per U-item)
| Item | Migration(s) | What |
|------|--------------|------|
| U1 — consolidate dup RPC families | 085 | 063 family is canonical; `…06` twins deprecated (kept callable one release); added `sales_performance_intelligence` + `cashflow_forecast_intelligence` (JSONB, insufficient-data guard). Replaces a twin that referenced a non-existent column. |
| U2 — metric registry + engine | 086 | `metric_definitions` registry (§7) seeded with 20 governed metrics (definition/formula/sources/period/min_sample/insufficient_note); `refresh_business_metrics` is the ONLY writer of governed `kpi_metrics` rows, emits `sample_size`+`confidence`, NULL below min_sample (§21); `current_metrics` read helper; `GovernedMetricsCard` in ExecutiveCockpit surfaces them honestly. |
| U3 — wire context graph | 087 | New best-effort handler `handler_derive_relationships` (run_order 6, after propagation) derives Customer→Deal→Invoice→Payment edges via the existing `link_entities` (060). Existing triggers untouched. `business_relationships` read helper for impact analysis. |
| U4 — recommendation + outcome loop | 088 | Extended `claims` additively with lifecycle (status/rule_id/severity/owner/action_type/linked_action_id/expected_impact/actual_impact). Lifecycle RPCs (acknowledge/decide/acted/outcome) + `recommendation_effectiveness` (§16) + `open_recommendations` (§17 feed). A recommendation IS a `claims` row — no parallel table. |
| U5 — data-quality scanner | 089 | `scan_data_quality` set-based scanner: orphaned invoice, missing due date, negative amounts, deal w/o owner, unassigned task, stale entity, duplicate contact, unreconciled payment. Writes findings into `self_audit_findings` (audit_dimension extended to `data_quality`) + summary into `data_quality_checks`. Never mutates business data (§14). |
| U6 — complete event catalog | 090 | Fixed drifted `emit_deal_won` (stage not status); added `DealLost`, `InvoiceOverdue`, `TaskCompleted`, `ProjectDelayed` triggers + `detect_customer_inactive`/`_all` windowed detectors (idempotent per day). |

### Client layer
`src/lib/businessOS.ts` gained thin, best-effort wrappers (non-blocking on failure, §24): `fetchCurrentMetrics`/`refreshBusinessMetrics`, `fetchRelationships`, recommendation lifecycle (`fetchOpenRecommendations`/`decideRecommendation`/`acknowledgeRecommendation`/`markRecommendationActed`/`recordRecommendationOutcome`/`fetchRecommendationEffectiveness`), data-quality (`fetchDataQualityFindings`/`scanDataQuality`). ExecutiveCockpit renders a `GovernedMetricsCard` that shows real numbers, change %, confidence, and the honest "insufficient data" note — never a fabricated value.

### Tests (§29/§30)
New `tests/frontend/lib/governedMetrics.test.ts` (12 tests) locks the confidence contract (§10: high→FACT, medium/low→INFERENCE, insufficient/error→UNKNOWN) and the small-data formatting (§21: null→"—", currency/percent/duration/number/ratio). The recommendation lifecycle union is asserted against the DB CHECK constraint.

### Still PENDING — requires live DB (U0, flagged to user)
- **Deploy migrations 080 + 081 + 082 + 083 + 085–090 to live Supabase** (project kgsgqvatyleetyquffya). Migrations are written, idempotent (`CREATE OR REPLACE` / `IF NOT EXISTS` / `ON CONFLICT`), and safe to apply. Until applied, the new RPCs are not callable — but the frontend degrades gracefully (governed panel stays empty, recommendations empty, data-quality empty) because every caller is best-effort and non-blocking (§24). This is the safe-failure state the instruction requires.
- **pg_cron jobs:** schedule `refresh_business_metrics(business_id)` per business + `detect_customer_inactive_all()` daily, once pg_cron is enabled.
- Golden test datasets (§30) and live DB failure testing (§60/§81) — tracked follow-ups, need the live DB.

### What was deliberately NOT done (per §22/§31/§33)
- No external AI/analytics APIs. All intelligence is deterministic SQL over real tables.
- No new modules, no chatbot, no superficial dashboards. The governed metric panel and recommendation feed reuse the existing ExecutiveCockpit/claims infra.
- No forecast narrative ("why") — that stays with a future generative layer (Phase 3); only the deterministic moving-average number + assumptions are produced (085).
