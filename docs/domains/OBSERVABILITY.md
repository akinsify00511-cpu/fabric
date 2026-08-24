# DOMAIN: OBSERVABILITY

**Purpose:** errors visible, incidents visible, critical workflows traceable — at both
tenant level (business health) and platform level (ops).

**Entities:** platform_error_events (idempotent via client_event_id),
platform_incidents + thresholds + oncall + investigations, integrity_rules +
findings (contract scanner), business_events (traceability), audit_logs.

**Responsibilities:** frontend error capture (errorCapture.ts: window.onerror +
unhandledrejection → logPlatformError, throttled 30s/signature), Sentry mirror
(lazy-loaded, DSN-gated, tree-shaken when unconfigured), health checks
(platform-health-check cron), integrity scanning (run_integrity_scan), alert
evaluation (evaluate_platform_alerts, 3-min cron), live status strip, realtime
feeds.

**States:** error new → resolved; integration status with failure streaks;
contract findings open → auto-resolved when pruned/fixed.

**User flows:** platform-ops dashboard (/platform-ops, platform-admin gated);
Riverways errors/security/self-healing tabs; tenant-facing BusinessHome degraded
notices (honest, per-engine).

**Permissions:** platform-admin / riverways-admin gates; log_platform_error is
authenticated + fire-and-forget + swallow-on-failure (never breaks a user request).

**Database:** 20260818120000 (platform ops), 20260821141000 (scanner activation),
20260822140000 (contract scan extension), 20260822160000 (integrity seed, generated).

**APIs:** log_platform_error, record_integration_check, evaluate_platform_alerts,
platform_ops, resolve_platform_error, update_platform_incident,
investigate_business_incident, run_integrity_scan.

**Events:** SYSTEM_ERROR / INCIDENT_CREATED / INCIDENT_RESOLVED on the platform bus.

**Notifications:** P0/P1 page on-call (email + SMS); digest surfaces health lines.

**Analytics:** error rates, occurrence counts (grouped by signature — never one row
per occurrence), latency/health trends.

**AI interaction:** self-healing findings feed the Riverways console; AI failures
instrumented (ai.failed with duration).

**Failure states:** the observability path itself never throws into user flows
(swallow-on-failure); Sentry absence = zero-cost (tree-shaken).

**Recovery:** incidents auto-resolve when the condition clears; errors resolvable
individually; contract findings auto-resolve on repair.

**Security:** error payloads sanitized (no credential-shaped keys); tenant drill-down
audit-logged.

**Accessibility:** status indicators have text labels.

**Performance:** client capture throttled; realtime instead of polling.

**Tests:** platformOps suite (24) — gates, privacy boundary, ingest contract,
threshold idempotency, drill-down audit.

**Definition of Done:** any P0/P1 is visible to an operator within one cron cycle,
grouped, attributed, and resolvable with verification.
