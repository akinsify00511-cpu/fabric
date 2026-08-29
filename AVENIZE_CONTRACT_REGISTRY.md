# Avenize Contract Registry

The canonical, single-source-of-truth registry for every business concept. A
second competing interpretation of any of these = a contract violation and a
release blocker per the Contract Constitution.

Source of truth for object existence/signatures: `supabase/contract/production_contract.json`
(machine-generated, CI-gated deterministic). Frontend types live in `src/lib/businessOS.ts`
(and domain modules).

## Ownership spine (the invariant every tenant check derives from)

| Concept | Canonical |
|---|---|
| User | `auth.users` (Supabase-managed) |
| Membership | `staff` row (`user_id` FK → auth.users) |
| Business | `businesses` (`id` PK; `organization_id` FK) |
| Organization | `organizations` (only for multi-tenant groups/subsiaries) |
| Current staff resolver | `get_current_staff()` → returns the staff row(s) for `auth.uid()`; base of nearly all RLS |
| Accessible businesses | `get_current_accessible_businesses()` (staff rows + org memberships) |
| Tenant isolation | every business-scoped policy: `business_id IN (SELECT business_id FROM get_current_staff())` |
| Platform operator | `is_platform_admin()` (email allowlist `platform_admins`; service-role managed) |
| Riverways operator | `is_riverways_admin()` (email allowlist; RLS-denied to all clients) |

## Canonical entities

| Concept | Canonical table | Canonical ID | Ownership |
|---|---|---|---|
| Business | `businesses` | `id` | owner staff row |
| Staff / member | `staff` | `id` | `business_id` |
| Customer/contact | `contacts` | `id` | `business_id` |
| Deal | `deals` | `id` | `business_id` |
| Lead | `leads` | `id` | `business_id` |
| Lead request | `lead_requests` | `id` | `business_id` |
| Quote | `quotes` | `id` (+`access_token` public portal) | `business_id` |
| Sales order | `sales_orders` | `id` | `business_id` |
| Invoice | `invoices` | `id` | `business_id` |
| Payment | `payments` (legacy) / `payment_transactions` (ledger, authoritative) | `id` / `provider_payment_id` | `business_id` |
| Subscription | `business_subscriptions` | `id` | `business_id` |
| Entitlement | `business_entitlements` | `business_id` (1:1) | owner/admin manage |
| Product | `products` | `id` | `business_id` |
| Inventory item | `inventory` | `id` | `business_id` |
| Task | `tasks` | `id` | `business_id` |
| Project | `projects` | `id` | `business_id` |
| Meeting | `meetings` | `id` | `business_id` |
| Meeting participant | `meeting_participants` | `(meeting_id, staff_id) or guest_token` | business-scoped |
| Meeting media | `meeting_media` | `id` | `business_id` (private bucket) |
| Capture attachment | `capture_attachments` | `id` | `business_id` (private bucket) |
| Business event | `business_events` | `id` | `business_id` |
| Recommendation | `claims` (INFERENCE kind) | `id` | `business_id` |
| Governed metric | `kpi_metrics` | `(business_id, name)` | business-scoped |
| Health score | `business_health_scores` | `business_id` | business-scoped |
| Risk | `business_risks` | `id` | `business_id` |
| Objective | `strategic_objectives` | `id` | `business_id` |
| Key result | `key_results` | `id` | `business_id` |
| Notification | `notifications` | `id` | `user_id` (+business) |
| Email event | `email_events` | `id` | business-scoped ledger |
| Audit row-change | `audit_logs` (via `audit_row_change()` triggers) | `id` | business-scoped |
| Reversal | `action_reversals` | `id` | business-scoped |
| Incident | `platform_incidents` | `id` | platform (RLS denied) |
| Error event | `platform_error_events` | `id` (+`correlation_id`) | platform (RLS denied) |

## Canonical state machines

| Entity | States (apply order enforced server-side) |
|---|---|
| Lead | `new → contacted → qualified → converted / lost` (+revivable abandoned) |
| Request | `new → processing → quoted → accepted / rejected` |
| Quote | `draft → sent → viewed → accepted / rejected → expired` (+ converted on order) |
| Order | `pending → confirmed → processing → completed / cancelled` |
| Invoice | draft/pending → `sent → paid / overdue / void` (server-derived totals) |
| Payment transaction | `pending → processing → success / failed`; `success → refunded` (trigger-guarded, idempotent) |
| Subscription | `trial → active → past_due→grace → cancelled / expired`; cancel sets `cancel_at_period_end` |
| Recommendation (claim) | `issued → acknowledged → accepted / rejected → acted → outcome_recorded` (superseded/expired) |
| Meeting | `scheduled → in_progress → completed / cancelled` (+participant evidence trail) |

## Canonical RPCs (critical nodes; full list in the manifest)

| Concept | Canonical RPC(s) |
|---|---|
| Onboarding | `create_business_and_owner` (canonical auth write path; manual inserts blocked by RLS) |
| Membership | `get_current_staff`, `get_current_accessible_businesses`, `resolve_current_user_context` |
| CRM chain | `create_lead_request`, `create_quote`, `create_sales_order`, `transition_demand`, `respond_to_quote`, `get_quote_by_token` |
| Payment | `subscription-management` createCheckout (edge, server-side price); `paystack-webhook`, `paystack-verify` (edge; ledger authoritative) |
| Brain | `business_brain`, `classify_business_state`, `diagnose_business`, `next_best_action`, `business_value_ledger` |
| Metrics | `refresh_business_metrics`, `current_metrics`, `compute_business_health`, `current_business_health` |
| Recommendations | `run_recommendation_rules`, `run_behavior_recommendation_rules`, `open_recommendations`, `recommendation_effectiveness` |
| Meeting | `create_meeting`, `start_meeting`, `join_meeting`, `leave_meeting`, `end_meeting`, `generate_meeting_token`, `send_meeting_chat(_guest)` |
| Capture | `create_capture_attachment`, `finalize_capture_attachment`, `generate_capture_attachment_url`, `save_capture_transcript`, `save_capture_ocr`, `link_capture_to_event/_entity` |
| Search | `business_search` |
| Email | `queue_email` (write), `email-service` process (edge), `resend-webhook` (edge) |
| Admin | `is_riverways_admin`, `is_platform_admin`, `riverways_payment_investigation`, `platform_ops`, `evaluate_platform_alerts` |

## Canonical events (event bus `business_events` + `emit_business_event`)

| Event | Emitted by | Consumed to |
|---|---|---|
| `DealWon` / `DealLost` | stage-change triggers | CRM analytics, recommendations |
| `InvoiceOverdue` | trigger | notifications, health |
| `TaskCompleted` | trigger | activity |
| `ProjectDelayed` | trigger | activity, risk |
| `InventoryLow` | trigger | recommendations, notifications |
| `CampaignConverted` | trigger | attribution, revenue |
| `EmployeeExited` | active→false trigger | offboarding |
| `CustomerInactive` | windowed detector | recommendations |
| `ContractExpiring` / `PayrollDue` | scheduled detectors | notifications |
| `ai.completed/failed` | `ask-avenize` edge | analytics, Brain |
| `checkout.*` | `subscription-management` edge | analytics |
| demo `onboarding_complete` | client (after canonical RPC success) | onboarding funnel |

## Canonical frontend types (mirror of the DB contract)

Authoritative type surface: `src/lib/businessOS.ts` + domain modules
(`src/lib/demand.ts`, `payments.ts`, `meetings.ts*`, `captureAttachments.ts`,
`discoveryIntel.ts`, etc.)。 These are consumed by both pages and tests; a type
diverging from the migration DDL = a contract drift the drift gate catches at
the object level,and this registry at the semantic level.

## Contract-enforcing automation (in CI/gates)

- `generate_contract_manifest.py` — 0 unbacked frontend refs (229 tables,
  222 RPCs all canonical)
- `check_schema_drift.py` — every `.from()`/`.rpc()` backing migration exists.
- `avenize_governance.py` — 17 gates incl. money pricing constitution),
  migration naming (duplicate-number blocker), semantic drift.
- `verify-production.sh` / `e2e-production.sh` — live contract sentinel
- `pricing-constitution` gate — one pricing vocabulary across tiers seed/
  fallback/edge/Payments core。


## Do-not (anti-contract rules)

- Do NOT introduce a second business identifier (`business_id` is canonical).
- Do NOT define a second “active subscription” signal (`business_subscriptions.status
  = 'active'` is the only truth for paid entitlement checks)。
- Do NOT treat `payments` (legacy) as authoritative; `payment_transactions` is.
- Do NOT define a second quote/lead/order status vocabulary (`transition_demand`
  is the only writer outside the portal token path）。
- Do NOT bypass `create_business_and_owner`/`accept_invite` with raw inserts(invites
  are RPC-gated for a reason)。