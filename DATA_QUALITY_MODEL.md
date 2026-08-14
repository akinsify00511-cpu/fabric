# DATA_QUALITY_MODEL

How Avenize protects intelligence from bad data, per the Master Directive §8.
Intelligence is only as good as the data behind it — so Avenize runs
**deterministic data-quality checks** that surface findings WITHOUT silently
modifying business data (§14: advisory only).

> The scanner (migration 089) is set-based, best-effort per check, and only
> WRITES findings rows into `self_audit_findings`. It never mutates the
> business data it inspects. Findings are resolvable by users in the Data
> Quality page.

**Status:** ✅ implemented (089 scanner + 089 Data Quality page) · ⏳ planned

---

## Architecture

| Layer | Object | Purpose | Migration |
|-------|--------|---------|-----------|
| Scanner | `scan_data_quality(business_id)` | runs all checks, upserts findings | 089 |
| Findings store | `self_audit_findings` | one row per finding (severity, category, entity, remediation) | 068 (extended 089) |
| Dedup | unique index on (business, dimension, category, entity, title) | same finding isn't re-inserted | 089 |
| Read API | `data_quality_findings(business_id)` | UI read helper, ordered by severity | 089 |
| Schedule | `avenize-data-quality-scan` (pg_cron, hourly) | keeps findings fresh | 092 |
| Health penalty | `compute_business_health` | −2/critical (max −10), −1/warning (max −5) | 093 |
| Recommendation | DQ-001 rule | warns when critical findings block intelligence | 091 |

The scanner extends `self_audit_findings.audit_dimension` to allow
`'data_quality'` (alongside the existing `system_health` dimension from 068).

---

## Implemented checks ✅

| Category | Severity | Check | Source table | Remediation |
|----------|----------|-------|-------------|-------------|
| `orphaned_invoice` | warning | invoice with no `client_name` / customer link | invoices | Associate invoice with a valid customer |
| `missing_due_date` | warning | invoice with no `due_date` (can't age) | invoices | Set a due date on the invoice |
| `invalid_amount` | critical | invoice `total` ≤ 0 | invoices | Correct the invoice amount |
| `incomplete_deal` | warning | deal missing value or owner | deals | Complete the deal record |
| `unassigned_task` | warning | open task with no assignee | tasks | Assign the task |
| `duplicate_contact` | warning | contacts with the same name/email | contacts | Merge the duplicate |
| `unreconciled_payment` | warning | payment not linked to an invoice | payments | Reconcile the payment |

Each finding row carries: `title`, `detail`, `entity_type`, `entity_id`,
`suggested_remediation`, and is `resolved=false` until a user resolves it.

## Scanner return (summary)

`scan_data_quality` returns a summary JSON: per-category counts, an `ok`/`stale`
status flag, and a message. The Data Quality page reads findings via
`data_quality_findings` for the per-row view.

---

## How data quality feeds intelligence

1. **Health score penalty (093):** unresolved critical findings reduce the
   Business Health score (−2 each, max −10); warnings −1 each (max −5). This
   means a data-quality problem visibly degrades the health score — the
   business owner sees that fixing data improves their score.
2. **Recommendation DQ-001 (091):** any unresolved critical finding emits a
   "Data-Quality Blocking Intelligence" recommendation so the owner is told
   explicitly that metrics depending on that data may be unreliable.
3. **MPR section (097):** the Monthly Performance Review surfaces open
   critical/warning counts + resolved total so the board sees data posture.
4. **Metric `data_quality_score` (086):** a governed metric
   (100 − critical×5 − warning×2, floored at 0) — itself a tracked KPI.

This closes the loop: bad data → finding → penalty + recommendation → user
resolves → score improves → recommendation closes. No fabrication (§38).

---

## What the scanner does NOT do (§8/§14)

- ❌ It does NOT modify business data. It only writes `self_audit_findings` rows.
- ❌ It does NOT delete or "fix" records. Resolution is a user action.
- ❌ It does NOT block operations. A finding is advisory; the CRM/Finance/etc.
  keep working regardless (§24 intelligence failure isolation).
- ❌ It does NOT infer causation. It reports a factual condition (e.g. "invoice
  X has total = 0"), not a diagnosis.

## Planned checks ⏳

Candidates (not yet implemented). Each will be a set-based SELECT block in
`scan_data_quality` + this table when added:

- Orphaned records (FK present but parent deleted / soft-deleted)
- Impossible states (invoice paid but balance > 0; deal won but no close date)
- Inconsistent dates (payment before invoice; task completed before created)
- Stale records (no activity in N days where activity is expected)
- Missing ownership (project with no owner; budget with no department)
- Missing project relationships (task not linked to a project it references)
- Negative/invalid inventory values (stock < 0)

Until a check is in `089_data_quality_scanner.sql` AND listed above with ✅, it
does NOT run. The Data Quality page shows whatever findings the scanner has
written — never fabricated ones (§38).
