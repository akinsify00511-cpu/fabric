# BUSINESS_EVENT_CATALOG

The canonical catalog of every business event Avenize emits, per the Master
Directive §5. Avenize does NOT have a competing event architecture — there is
one event bus (`business_events`, migration 058) with one emitter
(`emit_business_event`) and a registered handler dispatch
(`process_business_event` → `business_event_handlers`). New events extend
this; they do not create a parallel system.

**Status legend:** ✅ emitted (trigger/RPC writes to business_events) · 📋 catalogued handler only · ⏳ planned

> Every event carries: tenant (`business_id`), actor (`actor_id` + `source`),
> entity (`entity_type` + `entity_id`), `event_type`, `occurred_at`, and a
> `payload`. Events are idempotent (md5 hash dedup) so a retried capture or a
> re-fired trigger does not double-count (§14 never corrupt business data).

---

## The event bus (migration 058)

| Component | Object | Purpose |
|-----------|--------|---------|
| Event store | `business_events` | append-only log of every business event |
| Emitter | `emit_business_event(...)` | the single entry point (RPC) |
| Dispatch | `process_business_event(event_id)` | runs all registered handlers in `run_order` |
| Handler registry | `business_event_handlers` | (event_type, handler_fn, run_order) |
| Freshness handler | `handler_update_entity_freshness` | marks related entities stale so intelligence recomputes (run_order 10) |
| Capture propagation | `handler_propagate_capture` | performs the real writes for AI-captured events (run_order 5, 071) |
| Context graph | `link_entities` + `process_business_event` wiring (087) | resolves entity relationships from `related_entities` |

`source` is one of: `staff`, `system` (trigger), `automation`, `ai_gateway`,
`integration`. `capture_mode` records how the event entered (form, nlp, import).

---

## Emitted events ✅

| Event type | Trigger | Entity | Related entities | Source | Migration |
|------------|---------|--------|------------------|--------|-----------|
| `DealWon` | deal `stage` → `won`/`closed_won` | deal | deal, customer, sales_owner | system (trigger) | 059/090 |
| `DealLost` | deal `stage` → `lost`/`closed-lost` | deal | deal, customer, sales_owner | system (trigger) | 090 |
| `InvoiceOverdue` | invoice `status` → `overdue` | invoice | invoice, customer | system (trigger) | 090 |
| `PaymentReceived` | payment inserted (status=success) | payment | payment, invoice, customer | system (trigger) | 090 |
| `TaskCompleted` | task `status` → `done`/`completed` | task | task, assignee | system (trigger) | 090 |
| `ProjectDelayed` | project `status=active` + `due_date < today` | project | project, owner | system (trigger) | 090 |
| `InventoryLow` | product stock ≤ reorder_point (UPDATE) | product | product | system (trigger) | 090 |
| `EmployeeJoined` | staff row created | staff | staff | system (trigger) | 090 |
| `EmployeeExited` | staff status → inactive/exited | staff | staff | system (trigger) | 090 |
| `CustomerInactive` | scheduled: customer idle beyond their baseline cycle | customer | customer | system (cron) | 090 |

## AI-captured events (via `emit_business_event` from the client) ✅

The AICapture flow (natural-language) parses intent and emits one of the above
event types via `emit_business_event` with `source='staff'`, `capture_mode='nlp'`,
`confidence` (0..1), and `payload._destinations` (the structured writes the
capture implies). `handler_propagate_capture` (071) then performs those writes:
- `DealWon` → upsert deal + customer, draft invoice, backfill `entity_id`
- `PaymentReceived` → mark matching invoice paid, backfill `entity_id`
- `EmployeeJoined` → create staff record, backfill `entity_id`

If a destination write is impossible (missing optional table), the handler
records a processing error but does NOT fail the whole event (best-effort, §24).

## Catalogued-handler events (handler registered, event emitted by capture) 📋

These have a freshness handler registered in `business_event_handlers` so if a
capture emits them the freshness layer reacts, but no DB trigger auto-emits them
yet — they fire only via explicit capture/AI:

| Event type | Handler | Note |
|------------|---------|------|
| `CampaignConverted` | handler_update_entity_freshness | campaign freshness |
| `TaskOverdue` | handler_update_entity_freshness | task freshness (separate from TaskCompleted) |
| `ContractExpiring` | handler_update_entity_freshness | contract freshness |
| `PayrollDue` | handler_update_entity_freshness | payroll freshness |

---

## What each event feeds (the intelligence flywheel)

```
business_events
  ├─ process_business_event
  │    ├─ handler_propagate_capture (071)  → real writes (deals/invoices/staff)
  │    └─ handler_update_entity_freshness  → entity_freshness_status (stale flag)
  │         └─ refresh_business_metrics (086, cron 092) → kpi_metrics
  │              └─ run_recommendation_rules (091, cron 092) → claims (recommendations)
  │                   └─ compute_business_health (093, cron 092) → business_health_scores
  │                        └─ monthly_review (097) → MPR document
  └─ context graph (087) → link_entities → entity relationships
```

This is the §40 intelligence flywheel: business activity → event → structured
data → metrics → intelligence → recommendation → action → outcome → learning.

---

## Planned events (§5 examples — not yet emitted) ⏳

The directive lists candidate events. Those below are NOT yet wired (no trigger
emits them). They will be added as triggers/RPCs when the source tables mature,
and this catalog updated with ✅. Until then they do NOT exist.

- `user_created`, `company_created`, `onboarding_completed` (auth-flow events)
- `lead_created`, `deal_created`, `invoice_created`, `invoice_sent`
- `payment_failed`, `expense_created/approved/rejected`
- `project_created`, `project_completed`
- `task_created`, `task_overdue`
- `inventory_received`, `inventory_depleted`
- `purchase_created`, `purchase_approved`, `supplier_created`
- `customer_returned`
- `subscription_started`, `subscription_cancelled`

Adding one = a trigger function (like the 090 pattern) + a row in
`business_event_handlers` if a handler should react. No new architecture.
