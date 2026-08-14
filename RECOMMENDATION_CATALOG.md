# RECOMMENDATION_CATALOG

The catalog of recommendation TYPES Avenize produces, per the Master Directive
§12/§13. Each recommendation carries the full §12 field set. Recommendations
are SPECIFIC to the company's actual data — never "improve sales" / "reduce
costs" / "monitor cash flow" (§13 anti-patterns).

> Recommendations are `claims` rows with `claim_type='RECOMMENDATION'`, emitted
> by `run_recommendation_rules` (091). The rule mechanics (trigger, threshold,
> failure condition) are in INTELLIGENCE_RULE_CATALOG.md; this catalog documents
> the recommendation's business framing per §12.

---

## Field mapping (§12 → `claims` columns)

| §12 field | `claims` column | How populated |
|-----------|-----------------|---------------|
| TITLE | `title` | rule sets a concise headline |
| PROBLEM | `statement` | humanized description of the condition |
| EVIDENCE | `evidence` (JSONB) | the actual numbers / entities / counts |
| WHY IT MATTERS | in `statement` | the business consequence |
| RECOMMENDED ACTION | `suggested_action` | the specific action to take |
| EXPECTED IMPACT | `expected_impact` (JSONB) | quantified where possible (₦X recoverable) |
| CONFIDENCE | `confidence` | high / medium / low / insufficient |
| DATA PERIOD | in `evidence` | the window examined |
| SOURCE DATA | in `evidence` | tables/rows the rule read |
| OWNER | `assignee_id` / `entity_id` | the responsible entity (customer/staff/product) |
| STATUS | `status` | issued → acknowledged/accepted/rejected → outcome_recorded |
| OUTCOME | `status='outcome_recorded'` + `evidence.outcome` | tracked after the action (§15) |
| RISK | in `statement` | what happens if no action (§17 "what if I do nothing") |
| RULE ID | `rule_id` | links to INTELLIGENCE_RULE_CATALOG.md |

---

## Recommendation types (✅ implemented)

### FIN-AR-001 — Receivables concentration
- **TITLE:** Receivables concentration requires attention
- **PROBLEM:** A single customer holds an excessive share of overdue receivables.
- **EVIDENCE:** "Customer X represents 43% of your overdue receivables (₦4.2M across 8 invoices)."
- **WHY IT MATTERS:** Cash is concentrated in a small number of accounts; recovery depends on them.
- **RECOMMENDED ACTION:** Prioritize collection activity for the named customer this week.
- **EXPECTED IMPACT:** Potential recovery of the customer's overdue balance.
- **RISK (if nothing):** The concentration persists; a single non-payment becomes a cash-flow event.
- **CONFIDENCE:** High (≥ 5 overdue invoices).
- **OWNER:** the named customer (entity_id).
- **ACTION:** Create a collection task linked to the customer.
- **OUTCOME:** Track payment recovery on the linked invoices.

### FIN-AR-002 — Overdue aging
- **TITLE:** Overdue receivables aging
- **PROBLEM:** Specific customers have invoices overdue beyond 30 days.
- **EVIDENCE:** "Customer X has ₦Y overdue across Z invoices, oldest N days past due."
- **WHY IT MATTERS:** Aging receivables reduce cash availability.
- **RECOMMENDED ACTION:** Follow up with the named customers.
- **EXPECTED IMPACT:** Recovery of the overdue balances.
- **RISK:** Balances may become uncollectable the longer they age.
- **CONFIDENCE:** Medium.
- **ACTION:** Create follow-up tasks.

### FIN-CF-001 — Negative cash-flow trend
- **TITLE:** Expenses are exceeding revenue
- **PROBLEM:** Over the last 90 days, expenses exceeded revenue collected.
- **EVIDENCE:** "Expenses (₦X) exceeded revenue (₦Y) by ₦Z over 90 days."
- **WHY IT MATTERS:** Sustained negative cash flow depletes reserves.
- **RECOMMENDED ACTION:** Review expense categories and revenue collection.
- **EXPECTED IMPACT:** Reversing the trend restores positive cash flow.
- **RISK:** Reserves deplete; the business may face a liquidity gap.
- **CONFIDENCE:** High (≥ 3 months of data).
- **ACTION:** Open Finance / Expenses to investigate.

### SAL-CONV-001 — Pipeline stagnation
- **TITLE:** Stale deals in your pipeline
- **PROBLEM:** Specific deals have not advanced in > 14 days.
- **EVIDENCE:** "Deal 'X' has been in 'Proposal' for 21 days."
- **WHY IT MATTERS:** Stalled deals reduce forecast reliability and tie up capacity.
- **RECOMMENDED ACTION:** Advance or close out the stale deals.
- **EXPECTED IMPACT:** A cleaner, more accurate pipeline.
- **RISK:** Stale deals inflate the forecast and hide real pipeline health.
- **CONFIDENCE:** Medium.
- **ACTION:** Open CRM → the deal.

### INV-001 — Low-stock reorder
- **TITLE:** Product at or below reorder point
- **PROBLEM:** A product's stock has reached its reorder level.
- **EVIDENCE:** "Product X is at Y units, at or below its reorder point of Z."
- **WHY IT MATTERS:** Risk of stock-out and lost sales.
- **RECOMMENDED ACTION:** Reorder the product.
- **EXPECTED IMPACT:** Avoid a stock-out.
- **RISK:** Stock-out → lost sales + customer disappointment.
- **CONFIDENCE:** High (deterministic).
- **ACTION:** Create a procurement request / purchase order.

### CUST-001 — Customer inactivity
- **TITLE:** A customer's purchase cycle has lapsed
- **PROBLEM:** A customer hasn't purchased in longer than their own normal cycle.
- **EVIDENCE:** "Customer X has not purchased in N days, vs their normal cycle of M days."
- **WHY IT MATTERS:** The customer may be churning or ready to re-engage.
- **RECOMMENDED ACTION:** Reach out to the customer.
- **EXPECTED IMPACT:** Re-engagement / retention.
- **RISK:** The customer migrates to a competitor.
- **CONFIDENCE:** Medium (needs ≥ 3 prior purchases for a personal baseline — §21).
- **ACTION:** Create a follow-up task.

### OPS-001 — Task overload
- **TITLE:** A team member is overloaded
- **PROBLEM:** A staff member's open tasks exceed 1.5× the team average.
- **EVIDENCE:** "X has N open tasks, vs the team average of M."
- **WHY IT MATTERS:** Overload delays delivery and risks burnout.
- **RECOMMENDED ACTION:** Reassign or prioritize the workload.
- **EXPECTED IMPACT:** Balanced delivery.
- **RISK:** Slipped tasks + quality decline.
- **CONFIDENCE:** Medium (team ≥ 3 members).
- **ACTION:** Open Tasks → reassign.

### DQ-001 — Data quality blocking intelligence
- **TITLE:** Data-quality issues may affect your metrics
- **PROBLEM:** Unresolved critical data-quality findings exist.
- **EVIDENCE:** "There are N critical data-quality issues."
- **WHY IT MATTERS:** Metrics depending on this data may be unreliable.
- **RECOMMENDED ACTION:** Resolve the data-quality findings.
- **EXPECTED IMPACT:** More reliable intelligence.
- **RISK:** Decisions based on unreliable metrics.
- **CONFIDENCE:** High.
- **ACTION:** Open the Data Quality page → resolve findings.

---

## Recommendation lifecycle (§15 outcome loop)

```
issued  →  acknowledged / accepted / rejected  →  outcome_recorded
```
- **issued:** the rule detected the condition; the recommendation is open.
- **accepted:** the user agrees and will act (an action is created).
- **rejected:** the user disagrees (noted; the rule will not re-issue while
  this is the latest status — idempotent).
- **acknowledged:** the user has seen it but not yet decided.
- **outcome_recorded:** the action completed; the result is captured in
  `evidence.outcome`. This is the learning signal (§16).

A recommendation is never deleted. It transitions status, preserving the trail
(audit-triggered since 096).

## Recommendation effectiveness (§16 — infrastructure ready, learning pending)

The loop is wired: claims status + outcome are captured. Calculating
"recommendations of type X historically produced outcome Y for this business"
requires a meaningful volume of closed recommendations per business. The
infrastructure activates the learning automatically as data accumulates — no
additional build needed, just usage (§40 flywheel).

## Planned recommendation types ⏳

Candidates (not yet issued). Each becomes a block in `run_recommendation_rules`
+ an entry here when the source data is reliable:

- FIN-EXP-001 — Expense growth outpacing revenue
- FIN-CONC-001 — Revenue concentration (single customer > X%)
- PROJ-001 — Project over budget / delayed
- PROJ-002 — Project profitability deterioration
- INV-002 — Dead stock
- SUPP-001 — Supplier price increase
- HR-001 — Employee cost vs output
- HR-002 — Absence pattern anomaly

Until a type is in `091_recommendation_issuer.sql` AND listed above with ✅, it
is NOT issued. The Cockpit/MPR simply show fewer recommendations — never
fabricated ones (§38).
