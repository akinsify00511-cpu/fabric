# Rendering Integrity Audit — Layer 2

Date: 2026-09-09
Branch: `audit/feature-operational-audit-2026-09-09`

This layer continues the semantic rendering audit after the initial dashboard/executive/intelligence findings.

## Confirmed findings

### P0 — Payments: reporting semantics

`src/pages/Payments.tsx` loads up to 100 payment rows and renders `Total Income`, `Total Expenses`, and `Net Balance` across the loaded dataset with no explicit reporting period. `This Month` is separately calculated using only the calendar month number and current year is not checked. A prior-year payment in the same month number can therefore be classified into the current month. The UI communicates financial state without an explicit period boundary.

### P1 — Payments: partial dataset can masquerade as complete totals

The query is limited to 100 rows, while headline totals are calculated from the returned rows. If a business has more than 100 payments, the displayed totals are not necessarily totals for the business. There is no indication that the summary is based on a truncated dataset.

### P1 — Payments: manual record vs verified payment

The surface calls the action `Record Payment` and displays the resulting amount as income/expense. The rendered ledger does not distinguish manually recorded entries from gateway-verified transactions. This can cause a user to interpret a bookkeeping record as externally verified money movement.

### P1 — Payments: pending semantics are inferred from missing reference

`pending` is derived from `!p.reference && p.type === 'income'`. A missing reference does not inherently mean a payment is pending. The UI therefore risks converting missing metadata into a financial status.

### P1 — Payments: tab/filter summary mismatch

The summary cards use the entire `payments` collection while the list can be filtered by type, method and search. A user viewing the filtered list can therefore see headline totals that do not correspond to the evidence immediately below them. The product should either make the summary explicitly global or recalculate it for the active filter context.

### P1 — Reality Gap: tenant scoping is implicit

`RealityGap` queries `reality_gaps` without an explicit `.eq('business_id', bid)`. Correct tenant rendering therefore depends entirely on RLS policy behavior. Because the screen is explicitly a business-level analytical surface, the rendered query should be business-scoped at the application layer as well as protected by RLS.

### P1 — Reality Gap: failure becomes empty

The main `reality_gaps` query does not expose its error state. `data || []` converts a failed query into an empty list, which can render the strong statement `No reality gaps recorded`. That is semantically different from `could not load reality gaps`.

### P1 — Reality Gap: auto-detection failure becomes no findings

`fetchSaidVsUsed` catches every error and sets `saidVsUsed` to `[]`. The auto-detected section then disappears. A failed telemetry/RPC dependency can therefore look identical to a business with no said-vs-used gaps.

### P1 — Reality Gap: resolution is not evidence-rich

Resolve writes a generic `resolution: 'Resolved'` and timestamp. The rendered card then tags the item FACT because it has `resolved_at`, but the UI does not capture who resolved it, what changed, or what evidence demonstrates that the underlying gap actually closed. `resolved_at` proves a state transition, not necessarily outcome closure.

### P2 — Reality Gap: critical count is only open critical count

The `Critical` headline counts only open critical gaps. This is reasonable if explicitly labelled, but the current label can be read as total critical gaps. The metric should say `Open critical` or equivalent.

### P1 — Reports: no period and no comparative context

The Reports surface presents `Deals won`, `Revenue closed`, `Invoices paid`, `Invoices outstanding`, and `Tasks completed` as business reports without a selected reporting period. These are lifetime/current-dataset aggregates rather than a defined reporting interval, while the user-facing page is named `Reports`.

### P1 — Reports: query failure renders zero facts

The page initializes every metric to zero. Query failures are logged and swallowed, after which the zero-initialized state can be displayed. This is a false-zero condition and must become an explicit error/unknown state.

### P2 — Reports: task completion is a ratio without period/filter semantics

`completedTasks/totalTasks` is displayed without defining the task population or time period. It is not a completion rate for a reporting period; it is a ratio over the loaded business task dataset.

## Layer 2 release conclusion

The audit continues to find the same systemic class of defect: the underlying database operations may be valid, but the **rendered claim is broader than the evidence actually loaded**. Avenize must make scope, period, provenance, status semantics, and failure state visible wherever a user is asked to make a business decision.

These findings remain audit-only; no product behavior is repaired in this layer.
