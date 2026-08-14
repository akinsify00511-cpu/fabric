# BUSINESS_DATA_MODEL

The canonical conceptual model of Avenize's business data, per the Master
Directive §3. Avenize does NOT create dozens of new tables — it maps its
**existing** tables into this conceptual model. The database has 362 tables;
the ones that matter for intelligence are listed here, mapped to the canonical
entities.

> The principle (§0/§6): do not duplicate entities that already exist. Each
> conceptual entity below maps to a real table (or set of tables) that already
> stores the data. Intelligence reads these; it does not create parallel stores.

---

## Tenant / Company layer

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| COMPANY | `businesses` | id, name, industry, country | the tenant root (§15 tenant isolation) |
| USERS | `auth.users` (Supabase) + `staff.user_id` | id, email | auth identity; staff row maps user→business |
| EMPLOYEES | `staff` | id, business_id, user_id, role, job_title, department_id | one staff row per business membership |
| DEPARTMENTS | `departments` | id, business_id, name | org structure |

**Tenant isolation:** every business-scoped table carries `business_id` and is
RLS-protected via `business_id = (SELECT business_id FROM get_current_staff())`
(migration 080). This is the authoritative boundary (§15-19).

## People / CRM layer

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| CUSTOMERS / CONTACTS | `contacts` | id, business_id, name, email, phone | customers are contacts with deal/invoice history |
| LEADS | `leads` | id, business_id, contact_id, status, source | pipeline intake |
| DEALS | `deals` | id, business_id, contact_id, owner_id, stage, value, expected_close_date | stage = won/lost/etc (triggers DealWon/Lost) |

## Money / Finance layer

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| INVOICES | `invoices` | id, business_id, client_name, total, balance, status, due_date | status=overdue triggers InvoiceOverdue |
| PAYMENTS | `payments` | id, business_id, invoice_id, amount, status, provider_payment_id | status=success triggers PaymentReceived |
| EXPENSES | `expenses` | id, business_id, amount, category, status | approval-gated |
| REVENUE | derived from `payments` (collected) + `invoices` (billed) | — | not a table; a metric (see METRIC_DICTIONARY) |
| ACCOUNTS | `accounts` | id, business_id, code, type | chart of accounts |
| JOURNAL_ENTRIES | `journal_entries` | id, business_id, account_id, debit, credit | double-entry |
| BUDGETS | `budgets` + `budget_allocations` + `budget_transactions` | business_id, period, amount | actual vs budget (§27) |
| PAYROLL | `payroll_records` / `payroll_runs` | business_id, staff_id, gross, net | audit-triggered (056) |

## Operations layer

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| PROJECTS | `projects` | id, business_id, name, status, budget, due_date, owner_id | status=active+overdue triggers ProjectDelayed |
| TASKS | `tasks` | id, business_id, project_id, assignee_id, status, due_date | status=done triggers TaskCompleted |
| PRODUCTS | `products` | id, business_id, name, stock, reorder_point, price | stock≤reorder_point triggers InventoryLow |
| INVENTORY | `inventory` + `stock_movements` | business_id, product_id/inventory_id, qty | parallel stock model (see AGENTS.md) |
| PURCHASES / PROCUREMENT | `purchase_orders` + `purchase_requests` + `rfqs` | business_id, vendor_id, status | PO lifecycle |
| SUPPLIERS / VENDORS | `vendors` | id, business_id, name, payment_terms | |
| SERVICES | `services` | id, business_id, name, price | service catalog (public booking) |
| ASSETS | `assets` + `asset_assignments` + `asset_depreciation` | business_id, name, status | |

## Communication / Documents layer

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| COMMUNICATIONS | `channels` + `channel_members` + `messages` | business_id | internal team chat |
| ANNOUNCEMENTS | `announcements` | business_id, message, audience | |
| APPROVALS | `approvals` + `approval_actions` + `approval_rules` | business_id, entity_type, status | the control plane (039) |
| DOCUMENTS | `documents` + `document_folders` | business_id | |
| SIGNATURES | `signature_requests` + `signature_signers` | business_id, signing_token | audit-triggered (056) |

## Intelligence layer (the new surface)

| Conceptual entity | Real table(s) | Key columns | Notes |
|-------------------|----------------|-------------|-------|
| BUSINESS EVENTS | `business_events` + `business_event_handlers` | business_id, event_type, entity_type, entity_id, payload | the event bus (058) — see BUSINESS_EVENT_CATALOG |
| METRICS | `metric_definitions` + `kpi_metrics` | business_id, metric_key, current_value, target_value, period | governed metric registry (086) |
| DATA QUALITY | `self_audit_findings` (dimension='data_quality') | business_id, category, severity, resolved | scanner findings (089) — see DATA_QUALITY_MODEL |
| INSIGHTS / RECOMMENDATIONS | `claims` (claim_type='RECOMMENDATION') | business_id, rule_id, severity, status, evidence | the recommendation engine (091) — see INTELLIGENCE_RULE_CATALOG |
| ACTIONS | reuse existing — `tasks`, `approvals`, `purchase_orders` | — | recommendations link to existing workflows (§14) |
| OUTCOMES | `claims` status + `action_reversals` (07) | status→outcome_recorded | the outcome loop (§15) |
| HEALTH | `business_health_scores` + `health_metric_map` | business_id, overall_score, dimension_scores | the composite (093) |
| RISKS | `business_risks` | business_id, category, probability, impact, risk_score | the risk register (095) |
| OBJECTIVES / OKRs | `strategic_objectives` + `key_results` | business_id, scope, owner, progress | OKR engine (094) |
| AUDIT / TRUST | `audit_logs` | business_id, action, entity_type, old_values, new_values | trigger-based (056), extended to intelligence tables (096) |

---

## Cross-module relationship graph (§4)

Verified against the schema — these are real FK / join paths, not assumptions:

```
Customer (contacts)
  → Deals (deals.contact_id)        → owner: Staff
  → Invoices (invoices.client_name) → Payments (payments.invoice_id)
  → Revenue (payments) → Cost (expenses) → Margin (derived)

Customer (contacts)
  → Projects (projects.contact_id)  → Tasks (tasks.project_id) → Staff (assignee)
  → Materials (inventory/po lines)  → Expenses → Profitability

Supplier (vendors)
  → Purchase Orders (purchase_orders.vendor_id) → Inventory (po line items)
  → Cost → Project margin

Employee (staff)
  → Tasks (assignee_id) → Projects (owner_id)
  → Cost (payroll) → Output (task_completion_rate) → Capacity (OPS-001)
```

The context graph (087 `link_entities`) resolves these relationships from each
event's `related_entities` so the intelligence layer can traverse impact.

---

## What is NOT duplicated (§6)

- No separate "customer" table — customers are `contacts` with deal/invoice history.
- No separate "revenue"/"cost" tables — these are derived metrics, not stores.
- No separate "action" table for recommendations — actions reuse `tasks`/`approvals`/`purchase_orders`.
- No separate "insight" store — insights are `claims` rows (the 088 evidence system).
- The OKR engine extended `strategic_objectives` (063) rather than creating a new table (094).
- The health engine reads `kpi_metrics` rather than storing its own metric copies (093).
