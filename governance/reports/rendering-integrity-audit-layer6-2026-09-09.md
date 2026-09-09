# Avenize Rendering Integrity Audit — Layer 6

**Date:** 2026-09-09  
**Branch:** `audit/feature-operational-audit-2026-09-09`  
**Scope:** Projects/Jobs and final demand-chain consistency checks.  
**Mode:** Audit only. No product repairs performed.

## Confirmed findings

### 1. Jobs & Projects — headline metrics are lifetime loaded aggregates — P1 / PARTIAL

`ProjectsNigeria.tsx` calculates Total Jobs, Active, Total Value and Overdue from the full loaded `jobs` collection. Search/type/stage filters affect the visible list but not these headline cards. The UI does not label the cards as all-time/business-wide, so filtered evidence and headline context can diverge.

### 2. Jobs & Projects — job type fallback can render legacy labels as if current configuration — P1 / PARTIAL

When the configurable `job_types` read fails or has no rows, the page falls back to hard-coded type labels such as General, Restoration, Real Estate and Paint Production. This is acceptable as compatibility only if explicitly marked as fallback; currently the displayed label does not distinguish configured business taxonomy from legacy defaults.

### 3. Jobs & Projects — client-generated job number is not an authoritative sequence — P1 / PARTIAL

New jobs receive `JOB-${Date.now().slice(-6)}` in the browser. This is not a server-side sequence/unique business identifier and can collide under concurrency or clock anomalies. A displayed job number should be authoritative if it is used as a business reference.

### 4. Jobs & Projects — overdue status is derived from browser time — P1 / PARTIAL

The overdue metric compares job end dates with the browser's `new Date()`. The result can disagree with a server/business timezone boundary. Time-sensitive business-state calculations should use an explicit business timezone/server reference.

### 5. Demand client layer — best-effort empty fallbacks remain a cross-surface correctness hazard — P1 / NOT CERTIFIED

`fetchRequests`, `fetchOrders` and demand activity reads intentionally convert read failures to empty collections. This pattern is useful for avoiding crashes but violates the rendering standard unless every consuming page distinguishes unavailable from empty. The Requests and Orders pages currently do not.

## Closure priorities

- Define global metric scope (lifetime/current period/filter) directly in UI.
- Use server-generated business identifiers for jobs/orders/references.
- Standardize server/business-time calculations for overdue and period-sensitive metrics.
- Replace best-effort empty fallbacks with typed `loading/empty/error/unknown` state at UI boundaries.
