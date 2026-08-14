# METRIC_DICTIONARY

The canonical, authoritative registry of every business metric Avenize computes.
Per the Master Directive §6/§7, no dashboard may independently calculate an
important metric — they all read from this registry so the definition is
singular, governed, and inspectable.

**Status legend:** ✅ implemented (migration applied) · 📋 defined (schema ready) · ⏳ planned

> Every metric here is computed by deterministic SQL over real business tables
> (§22). No metric is invented. When sample size is below `min_sample`, the
> metric reports `INSUFFICIENT_DATA` rather than a misleading number (§21/§38).

---

## How metrics are governed

| Layer | Table | Purpose | Migration |
|-------|-------|---------|-----------|
| Definition registry | `metric_definitions` | name / formula / sources / unit / min_sample / insufficient_note — the single source of truth | 086 |
| Per-business values | `kpi_metrics` | current_value / previous_value / change_percent / target_value / period / confidence / sample_size | 086 |
| Health mapping | `health_metric_map` | metric → health dimension + direction (higher/lower better) + weight | 093 |
| Refresh | `refresh_business_metrics(business_id)` | recomputes all metrics from source tables | 086 |
| Read API | `metric_definitions_with_values(business_id)` | joins definition + latest value for UI | 086 |

A metric is "governed" (`metric_key IS NOT NULL`) only when it has a backing
definition in `metric_definitions`. Non-governed rows are legacy/manual and
excluded from health + MPR.

---

## Finance

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `revenue_collected` | Revenue (collected) | SUM(payments.amount) where status=success | payments | currency | 1 | ✅ |
| `revenue_billed` | Revenue (billed) | SUM(invoices.total) | invoices | currency | 1 | ✅ |
| `receivables_outstanding` | Receivables outstanding | SUM(invoices.balance) where status≠paid | invoices | currency | 1 | ✅ |
| `overdue_receivables` | Overdue receivables | SUM(balance) where due_date < now and status≠paid | invoices | currency | 1 | ✅ |
| `overdue_receivables_pct` | Overdue receivables % | overdue / receivables_outstanding | invoices | % | 1 | ✅ |
| `collection_rate` | Collection rate | revenue_collected / revenue_billed | payments, invoices | % | 1 | ✅ |
| `avg_collection_period_days` | Avg collection period | AVG(payment_date − invoice_date) | payments, invoices | days | 3 | ✅ |
| `revenue_concentration_top1` | Revenue concentration (top customer) | top customer revenue / total revenue | invoices | % | 5 | ✅ |

## Sales / CRM

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `pipeline_value` | Pipeline value | SUM(deals.value) where stage not in (won, lost) | deals | currency | 1 | ✅ |
| `win_rate` | Win rate | won / (won + lost) in period | deals | % | 3 | ✅ |
| `avg_deal_value` | Avg deal value | AVG(value) where stage=won | deals | currency | 3 | ✅ |
| `sales_cycle_days` | Sales cycle | AVG(close_date − created_at) for won deals | deals | days | 3 | ✅ |

## Customers

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `customer_count` | Active customers | COUNT(DISTINCT client identifier) with activity | invoices | count | 1 | ✅ |

## Operations / Tasks

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `task_completion_rate` | Task completion rate | completed / total in period | tasks | % | 1 | ✅ |
| `task_overdue_count` | Overdue tasks | COUNT(*) where due_date < now and status≠done | tasks | count | 1 | ✅ |

## Inventory

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `inventory_low_count` | Low-stock items | COUNT(*) where stock <= reorder_point | products / inventory | count | 1 | ✅ |
| `inventory_turnover_proxy` | Inventory turnover (proxy) | sold units / avg stock level | stock_movements, products | ratio | 1 | ✅ |

## People

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `headcount` | Headcount | COUNT(*) active staff | staff | count | 1 | ✅ |

## Projects

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `project_active_count` | Active projects | COUNT(*) where status=active | projects | count | 1 | ✅ |

## Data Quality

| Key | Name | Formula (summary) | Sources | Unit | Min sample | Status |
|-----|------|-------------------|---------|------|------------|--------|
| `data_quality_score` | Data quality score | 100 − (critical×5 + warning×2), floored at 0 | self_audit_findings | score | 1 | ✅ |

---

## Metric governance checklist (§7)

Every governed metric answers:

- **What does this number mean?** → `metric_definitions.name` + `definition`
- **Where does the data come from?** → `sources` (named tables)
- **What period?** → `kpi_metrics.period_start` / `period_end`
- **What's the calculation?** → `formula` (human-readable) + the SQL in `refresh_business_metrics`
- **What if data is missing / sample too small?** → `min_sample` gate; below it → `INSUFFICIENT_DATA`, no value emitted (§21)
- **Confidence?** → `confidence` field (high/medium/low based on sample size)
- **Can the user inspect the evidence?** → yes, via `metric_definitions_with_values` + the MPR "Metric Movers" section

## Anti-patterns prevented (§7)

- ❌ No duplicate metric definitions (single `metric_definitions` registry)
- ❌ No dashboard-specific formulas (all read `kpi_metrics`)
- ❌ No silent formula changes (formula is in version-controlled migrations)
- ❌ No fabricated values (insufficient data → null, not zero)
- ❌ No unexplained values (every value has a definition + sources + period)

---

## Planned metrics (§31 — not yet implemented)

These are documented as candidates, NOT as existing. They will be added only
when the source data is reliable and the min_sample gate is meaningful.

- Gross profit / gross margin (needs COGS data — `purchase_orders` line costs)
- Net profit (needs expense categorization completeness)
- Expense ratio (needs `expenses` maturity)
- Customer retention / churn (needs repeat-purchase history — min_sample 10+)
- Inventory turnover (true, not proxy — needs consistent stock_movement records)
- Supplier performance (needs `purchase_orders` delivery-vs-expected data)
- Resource utilization (needs `time` tracking adoption)
- Project profitability (needs project-cost line items linked to projects)
- Project budget variance (needs `projects.budget` populated + actuals)

Each will be added to `metric_definitions` + `refresh_business_metrics` + this
dictionary when implemented. Until then it does NOT exist in the product.
