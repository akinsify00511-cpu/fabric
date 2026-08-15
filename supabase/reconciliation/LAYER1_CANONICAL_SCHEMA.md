# Layer 1 Canonical Schema — The Database Contract

**Current product scope:** Sales/CRM + Inventory + Accounting + HR.

This document defines the authoritative set of tables required for Layer 1.
Derived from the current frontend behavior and existing migrations — not invented.

## Source-of-truth hierarchy

```
Current product scope (Layer 1)
  → Current frontend behavior
    → Canonical schema (this document)
      → Git migrations
        → Live Supabase
```

**Never** create a Supabase table just because the frontend references its name.
**Never** remove a frontend feature merely because its table is missing from the live DB.
First classify it (A–F per RECONCILIATION_MATRIX.md), then decide CREATE / DEFER / REMOVE / REFACTOR.

## The reconciliation finding

| Metric | Count |
|--------|-------|
| Frontend-referenced tables | 202 |
| Migration-defined tables+views | 393 |
| Layer 1 tables | 48 |
| Layer 1 tables with missing migrations | **0** |
| Frontend RPCs | 4 |
| RPCs without migration | **0** |
| Storage buckets | 3 |
| Buckets without migration | **0** |
| Class F (drift — no backing migration) | **0** |

**Key finding:** there is NO migration drift. Every frontend reference has a backing
migration. The "116 missing tables" gap (frontend 204 vs live 88) is **deployment
drift** — migrations exist in Git but haven't been applied to the live Supabase
(project `kgsgqvatyleetyquffya`). The fix is to apply pending migrations, not to
write new ones.

## Layer 1 tables (48)

### Core (10)
| Table | Purpose | Migration |
|-------|---------|-----------|
| businesses | Tenant root | 001 |
| staff | User→business mapping, roles | 001 |
| invites | Onboarding invitations | 001 |
| business_entitlements | Plan/tier/trial | 028, 049 |
| business_subscriptions | Payment state | 042 (merged) |
| business_branding | White-label config | 022 |
| settings | Key-value integration config | 046, 079 |
| notifications | User notifications | 036 |
| user_mfa | TOTP 2FA | 012 |
| api_keys | API key management | 015 |

### CRM / Sales (16)
| Table | Purpose | Migration |
|-------|---------|-----------|
| leads | Sales leads | 041 (merged) |
| contacts | Customers + contacts | 001 |
| deals | Opportunities/pipeline | 001 |
| activities | CRM activity log | 001 |
| pipelines | Sales pipelines | 001 |
| pipeline_stages | Pipeline stage definitions | 001 |
| customers | Customer records | 001 |
| quotes | Sales quotes | 048 |
| quote_items | Quote line items | 048 |
| social_media_accounts | Connected social accounts | 003 |
| social_media_posts | Scheduled/posted content | 003 |
| campaigns | Marketing campaigns | 003 |
| email_campaigns | Email campaign records | 003 |
| sms_campaigns | SMS campaign records | 003 |

### Inventory (12)
| Table | Purpose | Migration |
|-------|---------|-----------|
| products | Product catalog (has stock column) | 001 |
| inventory | Separate stock model | 001 |
| stock_movements | Stock in/out ledger | 001 |
| warehouses | Storage locations | 001 |
| suppliers | Supplier records | 001 |
| vendors | Vendor records (PO workflow) | 045 |
| purchase_orders | PO header | 045 |
| purchase_order_items | PO line items | 045 |
| branches | Business locations | 001 |
| assets | Fixed assets | 038 |
| asset_categories | Asset classification | 038 |
| equipment | Equipment register | 001 |

### Accounting (18)
| Table | Purpose | Migration |
|-------|---------|-----------|
| accounts | Chart of accounts | 010 |
| transactions | Financial transactions | 001 |
| transaction_items | Transaction line items | 001 |
| invoices | Sales invoices | 001 |
| invoice_items | Invoice line items | 001 |
| payments | Payment records | 001 |
| expenses | Expense records | 001 |
| expense_categories | Expense classification | 038 |
| journal_entries | Double-entry journal | 010 |
| journal_lines | Journal line items | 010 |
| account_balances | Account balance snapshots | 010 |
| bank_accounts | Bank account config | 010 |
| tax_rates | Tax rate definitions | 010 |
| budgets | Budget tracking | 001 |
| cashflow | Cash flow records | 046 |
| currencies | Currency definitions | 001 |
| currency_rates | FX rates | 001 |
| e_invoices | FIRS e-invoicing | 046 |

### HR (18)
| Table | Purpose | Migration |
|-------|---------|-----------|
| staff | Employee records (also core) | 001 |
| departments | Org departments | 023 (merged) |
| attendance | Check-in/out records | 031 (merged) |
| leave_requests | Leave applications | 031 (merged) |
| leave_types | Leave category config | 031 (merged) |
| leave_balances | Leave entitlement balances | 031 (merged) |
| payroll_runs | Payroll batch header | 031 (merged) |
| payroll_records | Per-employee payroll | 046 |
| training_records | Training completion | 046 |
| performance_reviews | Review cycles | 023 (merged) |
| merit_entries | Recognition/merit | 001 |
| jobs | Construction/job pipeline | 046 |
| recruitment_candidates | Recruitment candidates | 023 (merged) |
| job_postings | Open positions | 023 (merged) |
| job_applications | Applications | 023 (merged) |
| positions | Job positions | 023 (merged) |
| reporting_structure | Org hierarchy (ltree) | 023 (merged) |

## Intelligence/event infrastructure (Class B — PRESERVE)

These tables are part of the Session 13–14 intelligence transformation and the
Session 15 event-bus work. They must NOT be rolled back or removed:

- `business_events` — the central event bus (the brain's nerve signals)
- `business_event_handlers` — registered dispatch handlers
- `business_event_destinations` — capture→write routing
- `entity_freshness` / `entity_freshness_status` — staleness tracking
- `business_relationships` / `recursive_neighbors` / `link_entities` — context graph
- `claims` — recommendations (the recommendation IS a claim row)
- `metric_definitions` / `kpi_metrics` — governed metric engine
- `business_health_scores` / `health_metric_map` — composite health score
- `strategic_objectives` / `key_results` — OKR engine
- `business_risks` — risk register
- `self_audit_findings` / `data_quality_checks` — data quality scanner
- `action_reversals` — undo/void with provenance
- `decision_log` / `organizational_memory` — institutional learning
- `reality_gaps` — intended/recorded/actual/outcome divergences
- `usage_events` — telemetry
- `approvals` / `approval_actions` / `approval_requests` (view) — approval engine
- `audit_logs` — trigger-based audit trail

## Deployment gate

A database-dependent feature is only complete when:

```
Frontend
  → Supabase client
    → Table/RPC exists in migration
      → RLS policy defined
        → Tenant isolation enforced (get_current_staff pattern)
          → Triggers/events wired
            → Realtime where required
              → Applied to live database
                → Verified
```

**TypeScript compiles** and **Vite builds** are necessary but NOT sufficient.

## CI schema-drift check

`scripts/check_schema_drift.py` runs in CI on every PR. It scans the frontend for
all `supabase.from()`, `supabase.rpc()`, and `supabase.storage.from()` references
and verifies each has a backing migration. A new page that queries a table with no
migration will fail CI before merge — preventing the frontend from racing ahead
of Supabase again.

Current status: **0 drift** (202 tables, 4 RPCs, 3 buckets — all backed).

## What needs to happen next (blocked on live DB credentials)

1. **Apply pending migrations (080–109)** to live Supabase. All idempotent.
2. **Verify live RLS** on asset_categories, expense_categories, approvals, maintenance_records.
3. **Tenant-isolation testing** with two test businesses (SELECT/INSERT/UPDATE/DELETE/RPC).
4. **Verify auth→staff→business chain** (signup, login, refresh, onboarding, staff creation).
5. **Realtime publication audit** — only intentional tables in supabase_realtime.
