# INTELLIGENCE_RULE_CATALOG

Every intelligence rule in Avenize, documented per the Master Directive §36
format. Rules are deterministic SQL (§22) — no external AI, no hallucination
surface. Each scans real business data and emits a RECOMMENDATION `claim`
(088/091) with evidence, confidence, and a specific action.

**Status:** ✅ implemented (091 migration) · ⏳ planned

> Rules never infer causation without evidence (§11). They use "associated
> with" / "appears related to" language. They are specific to the company's
> actual data — never "improve sales" (§13). They are small-data-guarded (§21):
> below the minimum evidence base, the rule does NOT fire.

---

## How rules run

- `run_recommendation_rules(business_id)` applies all rules sequentially (091).
- Each rule is best-effort (§24): a failure in one rule does not stop the others.
- Idempotent: a rule will not re-issue while an open recommendation with the
  same `rule_id` (+ optional `entity_id`) exists (partial unique index on claims).
- Scheduled hourly via pg_cron (`avenize-recommendation-rules`, 092), 5 minutes
  after the data-quality scan so DQ-001 sees fresh findings.
- Output is a `claim` row with `claim_type='RECOMMENDATION'`, `rule_id`,
  `severity`, `statement` (humanized), `evidence` (JSONB), `expected_impact`.

---

## FIN-AR-001 — Receivables Concentration Risk ✅

| Field | Value |
|-------|-------|
| **RULE ID** | FIN-AR-001 |
| **NAME** | Receivables Concentration Risk |
| **PURPOSE** | Identify excessive concentration of overdue receivables in a single customer. |
| **DATA SOURCES** | `invoices` (balance, due_date, client_name, status) |
| **INPUTS** | invoice total, invoice due date, payment status, customer, tenant, time period |
| **CALCULATION** | top customer overdue / total overdue receivables |
| **TRIGGER** | top customer > 40% of overdue AND ≥ 5 overdue invoices (min evidence base) |
| **CONFIDENCE REQUIREMENT** | HIGH (≥ 5 overdue invoices); below → does not fire |
| **OUTPUT** | critical-severity RECOMMENDATION naming the customer + their % share + amount |
| **EXPLANATION** | "Customer X represents 43% of your overdue receivables (₦Y across Z invoices)." |
| **RECOMMENDATION** | "Prioritize collection activity for Customer X this week." |
| **ACTION** | Create collection task (linked to the customer) |
| **OUTCOME** | Track payment recovery on the linked invoices |
| **FAILURE CONDITION** | < 5 overdue invoices or no single customer > 40% → no recommendation |
| **EXAMPLE** | "Adebayo Holdings represents 52% of overdue receivables (₦4.2M across 8 invoices). Prioritize collection." |

## FIN-AR-002 — Overdue Receivable Aging ✅

| Field | Value |
|-------|-------|
| **RULE ID** | FIN-AR-002 |
| **NAME** | Overdue Receivable Aging (per customer) |
| **PURPOSE** | Identify customers with invoices overdue beyond a threshold. |
| **DATA SOURCES** | `invoices` |
| **INPUTS** | balance, due_date, client_name, status |
| **CALCULATION** | per-customer sum of balance where due_date < now − 30 days and status ≠ paid |
| **TRIGGER** | customer has ≥ 1 invoice overdue > 30 days with balance > 0 |
| **CONFIDENCE REQUIREMENT** | MEDIUM (≥ 1 overdue invoice > 30d) |
| **OUTPUT** | warning-severity RECOMMENDATION per qualifying customer |
| **EXPLANATION** | "Customer X has ₦Y overdue across Z invoices, the oldest N days past due." |
| **RECOMMENDATION** | "Follow up with Customer X on overdue invoices." |
| **ACTION** | Create follow-up task |
| **OUTCOME** | Track payment |
| **FAILURE CONDITION** | no invoices overdue > 30 days → no recommendation |

## FIN-CF-001 — Negative Cash-Flow Trend ✅

| Field | Value |
|-------|-------|
| **RULE ID** | FIN-CF-001 |
| **NAME** | Negative Cash-Flow Trend |
| **PURPOSE** | Detect expenses exceeding revenue over a sustained window. |
| **DATA SOURCES** | `payments` (revenue), `expenses` (costs) |
| **INPUTS** | revenue collected, expenses incurred, 90-day window |
| **CALCULATION** | SUM(expenses) > SUM(revenue) over trailing 90 days |
| **TRIGGER** | expenses > revenue over 90 days AND ≥ 3 expense records (min evidence) |
| **CONFIDENCE REQUIREMENT** | HIGH (≥ 3 months of data) |
| **OUTPUT** | critical-severity RECOMMENDATION with the gap amount |
| **EXPLANATION** | "Over the last 90 days, expenses (₦X) exceeded revenue collected (₦Y) by ₦Z." |
| **RECOMMENDATION** | "Review expense categories and revenue collection." |
| **ACTION** | Open Finance / Expenses to investigate |
| **OUTCOME** | Track whether the trend reverses next period |
| **FAILURE CONDITION** | < 3 expense records or revenue ≥ expenses → no recommendation |

## SAL-CONV-001 — Sales Pipeline Stagnation ✅

| Field | Value |
|-------|-------|
| **RULE ID** | SAL-CONV-001 |
| **NAME** | Sales Pipeline Stagnation |
| **PURPOSE** | Identify deals stuck in the same stage beyond a normal cycle. |
| **DATA SOURCES** | `deals` |
| **INPUTS** | deal stage, updated_at/created_at, value |
| **CALCULATION** | deals where stage unchanged > 14 days and stage not in (won, lost) |
| **TRIGGER** | deal in pipeline unchanged > 14 days |
| **CONFIDENCE REQUIREMENT** | MEDIUM |
| **OUTPUT** | warning-severity RECOMMENDATION per stale deal (entity_id = deal id) |
| **EXPLANATION** | "Deal 'X' has been in the 'Proposal' stage for 21 days." |
| **RECOMMENDATION** | "Advance or close out stale deals to keep the pipeline moving." |
| **ACTION** | Open CRM → deal |
| **OUTCOME** | Track deal stage change |
| **FAILURE CONDITION** | no deals stale > 14 days → no recommendation |

## INV-001 — Low-Stock Reorder ✅

| Field | Value |
|-------|-------|
| **RULE ID** | INV-001 |
| **NAME** | Low-Stock Reorder |
| **PURPOSE** | Flag products at or below their reorder point. |
| **DATA SOURCES** | `products` (stock, reorder_point) |
| **INPUTS** | stock level, reorder_point |
| **CALCULATION** | stock <= reorder_point |
| **TRIGGER** | product stock <= reorder_point (and reorder_point is set) |
| **CONFIDENCE REQUIREMENT** | HIGH (deterministic inventory value) |
| **OUTPUT** | warning-severity RECOMMENDATION per product (entity_id = product id) |
| **EXPLANATION** | "Product X is at Y units, at or below its reorder point of Z." |
| **RECOMMENDATION** | "Reorder Product X to avoid stock-out." |
| **ACTION** | Create procurement request / purchase order |
| **OUTCOME** | Track stock level after reorder |
| **FAILURE CONDITION** | no products at/below reorder point, or reorder_point not configured → no recommendation |

## CUST-001 — Customer Inactivity ✅

| Field | Value |
|-------|-------|
| **RULE ID** | CUST-001 |
| **NAME** | Customer Inactivity |
| **PURPOSE** | Identify customers whose last purchase is significantly beyond their normal cycle. |
| **DATA SOURCES** | `invoices` (client_name, created_at), `customer_activity` baseline |
| **INPUTS** | last invoice date per customer, customer's historical avg days between purchases |
| **CALCULATION** | days since last invoice > customer's avg cycle × 1.5 (company-specific baseline — §20) |
| **TRIGGER** | days since last purchase > 1.5× the customer's own historical average (min 3 prior purchases for a baseline — §21) |
| **CONFIDENCE REQUIREMENT** | MEDIUM (needs ≥ 3 prior purchases to establish a personal baseline) |
| **OUTPUT** | info-severity RECOMMENDATION per inactive customer (entity_id = customer) |
| **EXPLANATION** | "Customer X has not purchased in N days, which is longer than their normal cycle of M days." |
| **RECOMMENDATION** | "Reach out to Customer X — they may be ready to re-engage." |
| **ACTION** | Create follow-up task |
| **OUTCOME** | Track whether the customer returns |
| **FAILURE CONDITION** | customer has < 3 prior purchases (no reliable baseline — §21) or within normal cycle → no recommendation |

## OPS-001 — Task Overload ✅

| Field | Value |
|-------|-------|
| **RULE ID** | OPS-001 |
| **NAME** | Task Overload |
| **PURPOSE** | Identify staff with an excessive open-task load relative to the team average. |
| **DATA SOURCES** | `tasks` (assignee, status), `staff` |
| **INPUTS** | open tasks per staff member, team average |
| **CALCULATION** | staff open tasks > team average × 1.5 AND ≥ 5 open tasks |
| **TRIGGER** | staff open-task count > 1.5× team average and ≥ 5 open tasks |
| **CONFIDENCE REQUIREMENT** | MEDIUM (≥ 5 open tasks, team has ≥ 3 members for an average) |
| **OUTPUT** | warning-severity RECOMMENDATION per overloaded staff (entity_id = staff) |
| **EXPLANATION** | "X has N open tasks, which is above the team average of M." |
| **RECOMMENDATION** | "Reassign or prioritize X's workload." |
| **ACTION** | Open Tasks → reassign |
| **OUTCOME** | Track task completion / reassignment |
| **FAILURE CONDITION** | team < 3 members (no reliable average) or no one above threshold → no recommendation |

## DQ-001 — Data-Quality Blocking ✅

| Field | Value |
|-------|-------|
| **RULE ID** | DQ-001 |
| **NAME** | Data-Quality Blocking Intelligence |
| **PURPOSE** | Warn when unresolved critical data-quality findings undermine metric reliability. |
| **DATA SOURCES** | `self_audit_findings` (audit_dimension='data_quality', severity, resolved) |
| **INPUTS** | count of unresolved critical findings |
| **CALCULATION** | count(*) WHERE severity='critical' AND resolved=false |
| **TRIGGER** | ≥ 1 unresolved critical data-quality finding |
| **CONFIDENCE REQUIREMENT** | HIGH |
| **OUTPUT** | warning-severity RECOMMENDATION (business-wide, not per-entity) |
| **EXPLANATION** | "There are N critical data-quality issues. Metrics depending on this data may be unreliable." |
| **RECOMMENDATION** | "Resolve data-quality issues to improve intelligence accuracy." |
| **ACTION** | Open Data Quality page → resolve findings |
| **OUTCOME** | Track finding resolution |
| **FAILURE CONDITION** | no unresolved critical findings → no recommendation |

---

## Planned rules (§31 — not yet implemented)

Documented as candidates only. Each will be added to `run_recommendation_rules`
and this catalog when the underlying data is reliable.

- **FIN-EXP-001** — Expense growth outpacing revenue growth (needs ≥ 3 months of both)
- **FIN-CONC-001** — Revenue concentration: single customer > X% of revenue (needs `customer_count` ≥ 5)
- **PROJ-001** — Project over budget / delayed (needs `projects.budget` + actual cost lines)
- **PROJ-002** — Project profitability deterioration (needs project-cost linkage)
- **INV-002** — Dead stock (inventory with no movement in N days — needs stock_movements history)
- **SUPP-001** — Supplier price increase (needs PO price history per supplier)
- **HR-001** — Employee cost vs output (needs time-tracking + payroll maturity)
- **HR-002** — Absence pattern anomaly (needs attendance history)

Until a rule is in `091_recommendation_issuer.sql` AND documented above with ✅,
it does NOT exist in the product. The MPR and Cockpit will simply show fewer
recommendations — they never fabricate them (§38).
