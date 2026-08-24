# AVENIZE EVENT ARCHITECTURE

**Version:** 1.0 (2026-08-24). Three buses, each with a distinct audience and boundary.
Operational detail: root `BUSINESS_EVENT_CATALOG.md`.

## Bus 1 — Business Events (tenant nervous system)

- **Table:** `business_events`. **Writer:** `emit_business_event` (058/059/090).
- **Processor:** `process_business_event` dispatches to registered handlers by
  `run_order` (propagation=5, relationship-derivation=6, freshness=10).
- **Catalog (real, emitted):** DealWon, DealLost, InvoiceOverdue, TaskCompleted,
  ProjectDelayed, CustomerInactive, InventoryLow, EmployeeExited, CampaignConverted,
  ContractExpiring, PayrollDue + AI-captured events from parse-intent.
- **Rules:** triggers are AFTER, idempotent (guards against re-emission), and
  best-effort; detectors (CustomerInactive/ContractExpiring/PayrollDue) are windowed
  and idempotent-per-day for pg_cron.
- **Invariants:** handlers are registered in the catalog; a handler failure never
  aborts the event (per-handler EXCEPTION); `business_events` carries `updated_at`
  (added after the trigger/column drift defect — keep them paired).

## Bus 2 — Platform Activity (operator nervous system)

- **Table:** `platform_activity_events`. **Writer:** `emit_platform_activity` — the
  ONLY client writer. SECURITY DEFINER fills actor server-side;
  `sanitize_platform_payload` strips credential-shaped keys (password/token/secret/
  credential/api_key/totp/session) BEFORE insert. RLS denies ALL clients.
- **Readers:** 10 Riverways RPCs, each gated by `is_riverways_admin()` returning
  `{authorized:false}` with NO payload otherwise: activity_feed, global_search,
  user/org activity, ai_activity (metadata only — contents never stored),
  billing_activity, security_center, error_center, self_healing, platform_analytics.
- **Event keys:** auth.sign_in/out, onboarding.completed, leads.imported/converted,
  meetings.scheduled, tasks.created, ai.completed/ai.failed (+duration_ms),
  checkout.started/failed, subscription.cancel, security.permission_changed.
- Emission is fire-and-forget; never blocks UX.

## Bus 3 — Transactional Email Events

- **Table:** `email_events` (internal delivery ledger). **Writer:** `queue_email` RPC
  (membership-guarded) + lifecycle triggers (payment.success → settle → queue email —
  never inline).
- **Delivery:** `email-service` edge fn (service-key/cron-secret auth) renders the
  template, delivers via Resend, writes `provider_message_id` back;
  `resend-webhook` (svix-verified) advances status FORWARD only
  (queued→sent→delivered/bounced/opened).
- Email failure can never break payment settlement.

## Cross-cutting rules

1. Events are structured, tenant-aware, timestamped, and idempotent where re-delivery
   is possible (`payment_webhook_events` unique(provider,event_id)).
2. Audit-sensitive domains ALSO write `audit_logs`/`security_audit_log` — events are
   for reaction, audit is for evidence. Never substitute one for the other.
3. New event types are added by extending the bus (trigger + handler registration),
   never by creating a new events table.
