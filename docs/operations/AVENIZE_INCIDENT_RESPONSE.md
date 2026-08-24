# AVENIZE INCIDENT RESPONSE

**Version:** 1.0 (2026-08-24). Backed by the platform-ops subsystem
(`platform_error_events`, `platform_incidents`, `platform_alert_thresholds`,
`platform_oncall_contacts`, `platform_incident_investigations`).

## Severity levels

| Level | Name | Definition | Examples | Response target |
|---|---|---|---|---|
| P0 | Catastrophic | Platform unusable or data breach | auth down for all; tenant data exposure | immediate page, all hands |
| P1 | Critical | Core workflow broken for many tenants | payments failing; onboarding broken | page on-call, same-day fix |
| P2 | Major | Degraded core workflow, workaround exists | email delivery delayed; one edge fn down | triage < 24h |
| P3 | Moderate | Non-core feature degraded | analytics panel empty; digest skipped | next sprint |
| P4 | Minor | Cosmetic / single-tenant edge case | copy issue, rare UI glitch | backlog |

## Detection

- `log_platform_error` (authenticated, fire-and-forget, idempotent via
  client_event_id) ingests frontend window.onerror / unhandledrejection via
  `errorCapture.ts` (throttled 30s/signature) + Sentry (lazy, DSN-gated) mirrors.
- `evaluate_platform_alerts()` (pg_cron every 3 min) crosses tunable thresholds
  (`platform_alert_thresholds` — a business decision, data not code) and opens
  `platform_incidents` automatically; auto-resolves when the condition clears;
  never opens duplicates.
- `platform-health-check` edge fn (cron) records integration checks via
  `record_integration_check` (service-role only) — failure streaks reset on success.

## Escalation & ownership

- P0/P1 page the on-call contacts (`platform_oncall_contacts`) via Resend email +
  Termii SMS (push, not pull).
- Incident ownership: the operator who acknowledges in the Riverways console;
  tenant drill-down is an explicit audit-logged action
  (`investigate_business_incident` → `platform_incident_investigations`).

## Resolution & verification

- Mutations via gated RPCs: `update_platform_incident`, `resolve_platform_error`.
- An incident is resolved only after the failing check is green again AND
  (for P0/P1) the production smoke gate passes.

## Postmortem

- P0/P1 require a postmortem attached to the incident record: timeline, root cause,
  contributing factors, corrective actions with owners and dates.
- Critical incidents must be visible: the Riverways console shows open incidents and
  the live status strip; never silently close.

## Error grouping (anti-flood)

Errors group by signature (source + message fingerprint); the dashboard shows
occurrence counts, not one row per occurrence. Duplicate incidents are suppressed
by the idempotent open logic.
