# Avenize Rendering Integrity Audit — Layer 3

**Date:** 2026-09-09  
**Branch:** `audit/feature-operational-audit-2026-09-09`  
**Scope:** Monitoring/system health, subscription/billing, workspace configuration, quote workflow, audit log and adjacent user-facing state semantics.  
**Mode:** Audit only. No product repairs performed.

## Standard

A rendered claim must be supported by authoritative data for the current business, user, entitlement, status and reporting period. Failure, unavailable, unknown and empty states must not be rendered as healthy/zero/empty success states. An action label must not promise an operation that the implementation does not perform.

## Confirmed findings

### 1. Monitoring — overall system health is hard-coded — P0 / FAIL

`src/pages/Monitoring.tsx` initializes `overallStatus` to `operational` and never derives it from monitors, incidents, heartbeats or a server-side health source. The page therefore renders **“All Systems Operational”** regardless of actual observed system state.

### 2. Monitoring — 7-day uptime chart is fabricated — P0 / FAIL

The “7-Day Uptime” visualization renders the fixed values `99.9, 99.8, 99.95, 99.7, 99.99, 100, 99.98`. No historical uptime series is queried. This is a time-sensitive operational metric presented as real telemetry without evidence.

### 3. Monitoring — response time is fabricated — P0 / FAIL

The page displays a fixed **127ms** average response time and a fixed **-12% from last week** trend. Monitor rows themselves map `response_time_ms` to `0` rather than a measured value. The surface therefore presents both a synthetic aggregate and synthetic trend.

### 4. Monitoring — uptime defaults to 100% when no monitors exist — P1 / FAIL

`avgUptime` falls back to `100` when `monitors.length === 0`. An absence of monitor data therefore renders as perfect uptime rather than `unknown`/`not configured`/`empty`.

### 5. Monitoring — missing timestamps default to current time — P1 / FAIL

Missing `last_check_at` and `last_heartbeat_at` are replaced with `new Date().toISOString()`. A monitor/heartbeat without an observed check can consequently appear freshly checked.

### 6. Monitoring — query failures are swallowed into empty operational collections — P1 / FAIL

Monitor, incident and heartbeat query errors are not captured. Each result is mapped from `data || []`, allowing database/network failure to render as no incidents, no monitors or no heartbeats instead of an explicit error state.

### 7. Subscription — available plans are hard-coded in the client — P0 / FAIL

`useSubscriptionData()` returns `getDefaultPlans()` containing fixed Starter/Team/Business/Pro/Scale prices and savings. The billing UI therefore treats client constants as current commercial pricing rather than an authoritative pricing/plan catalog. Any pricing change outside this bundle can leave checkout and displayed prices inconsistent.

### 8. Subscription — individual Supabase query failures are not surfaced — P1 / FAIL

Subscription, subscription-payment and subscription-invoice queries do not inspect their returned `error` values. Supabase errors can therefore produce `subscription=null` and empty payment/invoice arrays without the hook's `error` state being set. The page can then render a legitimate-looking Free Plan/no-history state after a data failure.

### 9. Subscription — success message overclaims receipt delivery — P1 / PARTIAL

After server payment verification, the UI says **“a receipt is on its way to your email.”** Verification establishes the payment verdict, not successful transactional-email delivery. The rendered guarantee needs a delivery/evidence state or narrower wording.

### 10. Workspace Settings — “Saved” does not prove DB persistence — P1 / PARTIAL

`handleToggle()` awaits `toggleTool()`, but `useWorkspaceSelection.persist()` writes the local cache first and swallows database errors. The settings page then unconditionally sets `saved=true`. A user can therefore see **“Saved.”** when the authoritative `user_workspace_selections` row was not persisted; the local browser cache can mask the failure.

### 11. Workspace Settings — cache can preserve stale curation after DB failure — P1 / PARTIAL

The workspace selection hook treats a DB error as non-blocking and retains cached selections. This is acceptable as a UX fallback only if the UI explicitly labels the state as locally cached/unconfirmed. Current rendering presents the selection as authoritative and saved.

### 12. Quotes — send operation is status-only, not delivery — P0 / FAIL

The quote page's send path updates quote status to `sent` but does not perform an observed customer email/portal dispatch or delivery tracking operation. The rendered “Send Quote” workflow therefore overstates the completed business operation.

### 13. Quotes — quote mutation errors can be followed by success-like state — P1 / PARTIAL

The observed quote paths do not consistently surface errors from status/item mutations before updating the UI. A failed persistence step can leave the user with a state transition that looks completed without authoritative confirmation.

### 14. Audit Log — log history is capped at 100 without truncation disclosure — P1 / PARTIAL

`AuditLog.tsx` queries audit logs with `.limit(100)` and exposes the resulting length as **Total Logs**. There is no pagination or “showing latest 100” disclosure. For businesses with more than 100 matching records, the statistic and visible history are incomplete while the label implies a total.

### 15. Audit Log — query failure can render “No audit logs found” — P1 / FAIL

The audit-log loader catches failures only to console-log them and leaves `logs=[]`. The UI then renders **“No audit logs found”**. Database/network failure is therefore indistinguishable from a genuinely empty audit log.

### 16. Onboarding — workspace selection persistence is silently best-effort — P1 / PARTIAL

Onboarding persists selected tools through an upsert but intentionally catches/ignores failures. The flow then continues to the app. Because the selection is rendered as completed configuration later, the user can believe their chosen workspace was saved when only the client state succeeded.

## Additional audit conclusions

- **Monitoring is not a trustworthy operational command center in its current rendering path.** The most prominent health claims are synthetic rather than telemetry-derived.
- **Billing has a commercial-source-of-truth defect:** plan pricing is duplicated in client code.
- **Failure-to-empty conversion remains a systemic rendering defect** across operational, finance and audit surfaces.
- **Action completion semantics remain a major risk:** “Send”/“Saved”/“Operational” must mean the authoritative downstream operation has succeeded, not merely that local UI state changed.

## Required closure checks

1. Replace Monitoring synthetic health/uptime/response metrics with authoritative telemetry and explicit `unknown/not configured/error` states.
2. Make pricing/plan catalog authoritative and versioned; do not treat client constants as commercial truth.
3. Surface individual Supabase errors distinctly from zero/empty data.
4. Require confirmed persistence before rendering mutation success.
5. Add pagination/truncation disclosure to audit logs and all bounded analytical datasets.
6. Certify quote delivery separately from quote status mutation.
7. Reconcile onboarding/workspace cached state against authoritative persistence before declaring configuration saved.
