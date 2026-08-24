# AVENIZE CANONICAL DATA MODEL

**Version:** 1.0 (2026-08-24). **Subordinate to:** Master Product Architecture.
Every conceptual entity maps to exactly ONE canonical table. Building a second table
for a concept listed here violates Product Constitution Article II/III.
Operational detail: root `BUSINESS_DATA_MODEL.md`; live contract:
`supabase/contract/production_contract.json` (946 objects, generated).

## Conventions

- Tenant boundary: every business table carries `business_id` and RLS via
  `business_id IN (SELECT business_id FROM get_current_staff())`.
- PKs are `uuid DEFAULT gen_random_uuid()` unless noted.
- Deletion: default RESTRICT for staff references; CASCADE for business-owned children
  (per migration 081 reconciliation).
- Audit: high-sensitivity tables carry `audit_row_change()` triggers (056 + 096).

## Entity Map

| Concept | Canonical table(s) | Lifecycle | Notes |
|---|---|---|---|
| User | `auth.users` (Supabase) | created → verified → active → (deleted) | Identity owned by Supabase Auth; app never duplicates credentials |
| Business | `businesses` | active (slug, industry, org link) | `organization_id`, `parent_business_id`, `entity_type` for groups |
| Business Membership | `staff` (+ `organization_memberships` for org-level) | invited → active → deactivated | `staff.role` (owner/admin/manager/team_lead/staff) + `member_kind` (owner/staff/consultant/vendor/expert/partner) — identity/UX, never a grant |
| Department / Team | `departments`, `teams` | active → archived | business-scoped |
| Role / Permission | `staff.role` (security) + `functional_roles` (UX tooling) | — | TWO-AXIS by design; RLS reads `staff.role` only |
| Objective | `strategic_objectives` (+ `board_resolutions` provenance) | draft → active → achieved/abandoned | cascade via `parent_id`; board-seeded via `board_resolution_id` |
| Key Result | `key_results` | progress 0–100 (GENERATED) | optional `metric_key` link to governed KPIs |
| Work Item | `tasks` | pending → in_progress → completed/cancelled | meeting actions link here (no parallel task system) |
| Activity | `business_events` + `audit_logs` | append-only | event bus + audit trail |
| Meeting | `meetings` | scheduled → in_progress → completed/cancelled | TIMESTAMPTZ schedule + actual start/end |
| Participant | `meeting_participants` | invited → joined → left | staff_id OR guest_token (CHECK one-of) |
| Meeting evidence | `meeting_participant_events` | append-only | attendance proof |
| Meeting Capture / Media | `meeting_media`, `meeting_captures` | pending → available/failed → expired | private bucket, signed URLs |
| Transcript | `meeting_transcripts` + `transcript_segments` | processing → ready/failed | GIN full-text search |
| Meeting intelligence | `meeting_summaries`, `meeting_decisions`, `meeting_actions`, `meeting_reports` | per state machines doc | reports are immutable snapshots |
| Contact | `contacts` | active | customers = contacts (no separate table) |
| Lead | `leads` | new → contacted → qualified → converted/lost | capture→lead auto-advance |
| Request | `lead_requests` | new → reviewing → qualified → quoted → accepted → fulfilled (rejected/abandoned revivable) | demand is never lost |
| Quote | `quotes` (+ quote items in payload/lines) | draft → sent → viewed → accepted/rejected → converted; expired | public portal via `access_token` |
| Order | `sales_orders` | confirmed → in_fulfilment → fulfilled → completed/cancelled | requires accepted quote |
| Revenue | `invoices` + `transactions` (+ `transaction_items`) | invoice lifecycle + payment records | revenue is derived, never a stored counter |
| Plan | `pricing_tiers` | founding → future (activation via `founding_period_ends_at`) | single source of truth for price |
| Entitlement | `business_entitlements` + `module_plan_tiers` + `module_status` | per subscription | two-flag: entitled AND ready |
| Subscription | `business_subscriptions` | trialing → active → past_due/cancelled | `price_locked` honors founding price |
| Payment | `payment_transactions` (ONLY payment state) + `payment_webhook_events` (idempotency) | pending → processing → success/failed; success → refunded | trigger-enforced transitions |
| Invoice | `invoices` | draft → sent → part_paid/paid/overdue → void | totals computed server-side (create_invoice RPC) |
| Notification | `notifications` (+ `notification_templates`, `notification_preferences`) | created → read | bell; priority ordering client-side |
| Guidance | `module_value_propositions` + onboarding state + empty-state content | — | operator-tunable copy |
| AI Insight / Recommendation | `claims` | issued → acknowledged → accepted/rejected → acted → outcome_recorded (superseded/expired) | a recommendation IS a claim |
| AI Action | `claims.linked_action_id` → `tasks` | follows task lifecycle | human-approved |
| AI Evaluation | `recommendation_effectiveness` RPC over claims | — | by-rule success rates |
| System Event | `business_events` | emitted → processed | handlers by run_order |
| Platform Event | `platform_activity_events` | append-only | sanitized at boundary; clients denied; Riverways readers only |
| Audit Event | `audit_logs` + `security_audit_log` | append-only | auth_rate_limits + security events |
| Error | `platform_error_events` (+ Sentry mirror) | new → resolved | idempotent via client_event_id |
| Incident | `platform_incidents` (+ investigations, thresholds, oncall) | open → investigating → resolved + postmortem | auto-open on threshold; drill-down audited |
| Email | `email_events` + `transactional_email_templates` + `business_email_domains` | queued → sent → delivered/bounced/opened (forward-only) | Resend owns delivery |
| Capture attachment | `capture_attachments` | pending → available/failed | private `capture-attachments` bucket |
| File | storage objects + per-domain metadata tables | upload → validate → stored → signed-url access → retention → deletion | path convention carries tenant |

## Explicit non-entities (do NOT create)

- No `customers` table (use `contacts`). No `recommendations` table (use `claims`).
- No parallel meeting-task store (use `tasks`). No parallel notification store.
- No `user_preferences` table for workspace selection (use `user_workspace_selections`).
