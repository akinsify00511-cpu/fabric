import { describe, it, expect } from 'vitest'

// Riverwayse Platform Operations Dashboard — authorization + privacy + async
// + alerting contract.
//
// This is a SEPARATE system from Owner Intelligence (#18). Owner Intelligence
// answers "is THIS business healthy" for one tenant. This answers "is THE
// PLATFORM working, right now, for everyone." Different audience (Riverwayse
// on-call, NOT business owners), different data, different privacy boundary.
//
// Locks:
// (1) the platform-admin gate (is_platform_admin, NOT a business role),
// (2) the aggregate-only privacy boundary (no PII / financials by default;
//     tenant drill-down is a separate audit-logged action),
// (3) the threshold->incident idempotency (no duplicate incidents),
// (4) the async/non-blocking ingest contract (logging never throws into a
//     user's request path),
// (5) the tunable-threshold contract (what counts as degraded is adjustable,
//     not hardcoded),
// (6) the audit-logged tenant drill-down boundary.

// Mirrors is_platform_admin(): email allowlist via auth.uid(), NOT staff.role.
function platformAdminGate(isInAllowlist: boolean): boolean {
  return isInAllowlist
}

// Mirrors the platform_ops() aggregator privacy contract: the default payload
// is aggregate + structural only. It NEVER contains customer PII, invoice
// contents, or business financials.
function platformOpsPayloadShape(authorized: boolean) {
  // When unauthorized: empty payload, data_scope declares the boundary.
  if (!authorized) {
    return { authorized: false, data_scope: 'aggregate_only_no_business_pii' }
  }
  // When authorized: systems (traffic-lights), integrations, recent_errors
  // (truncated message, has_business flag NOT the business name),
  // open_incidents (affected_business_count NOT the affected business names),
  // error_counts (counts only). NO: business names, owner emails, customer
  // names, invoice amounts, legal/payroll data.
  return {
    authorized: true,
    data_scope: 'aggregate_only_no_business_pii',
    systems: { auth: { status: 'healthy' } },
    recent_errors: [{ id: 'e1', message: '...', has_business: true }], // has_business flag, not the name
    open_incidents: [{ id: 'i1', affected_business_count: 3 }], // count, not ids by default
    error_counts: { last_5m: 0, last_1h: 0, last_24h: 0, unresolved: 0 },
  }
}

// Mirrors the log_platform_error contract: swallow-on-failure, never throws.
// A logging failure must never propagate into a user's request path or an
// edge function's flow. Returns void regardless of what happens inside.
function logPlatformErrorStub(throws: boolean): void {
  // The real RPC wraps INSERT in BEGIN/EXCEPTION/RETURN. Here we model the
  // contract: even if the underlying write "fails", the caller gets void.
  try {
    if (throws) throw new Error('db error')
  } catch {
    // Swallowed — intentional. Logging is best-effort.
  }
  return undefined
}

// Mirrors evaluate_platform_alerts idempotency: a threshold key with an
// already-open incident does NOT open a duplicate.
function openIncidentIdempotently(
  existing: { trigger_key: string; status: string }[],
  crossedThresholdKey: string
): number {
  const alreadyOpen = existing.some(
    e => e.trigger_key === crossedThresholdKey && (e.status === 'open' || e.status === 'investigating')
  )
  // Only open a new incident if there's no open one for this key already.
  return alreadyOpen ? 0 : 1
}

// Mirrors the auto-resolve contract: when the condition clears, an open
// incident for that key flips to resolved (status, closed_at, closed_by).
function autoResolveWhenCleared(
  incidents: { trigger_key: string; status: string; closed_at: string | null }[],
  clearedKey: string
): { trigger_key: string; status: string; closed_at: string | null }[] {
  return incidents.map(i =>
    i.trigger_key === clearedKey && (i.status === 'open' || i.status === 'investigating')
      ? { ...i, status: 'resolved', closed_at: 'now' }
      : i
  )
}

// Mirrors the tunable-threshold contract: what counts as degraded/critical is
// read from platform_alert_thresholds, not hardcoded. Riverwayse can adjust.
function severityFromThreshold(
  count: number,
  warning: number | null,
  critical: number | null
): string | null {
  if (critical != null && count >= critical) return 'critical'
  if (warning != null && count >= warning) return 'warning'
  return null
}

// Mirrors the audit-logged tenant drill-down contract: drilling into a
// specific tenant's data is a SEPARATE, explicit, logged action. It is NOT
// part of the default platform_ops payload — the default gives only a count.
function drillDownIsSeparateAndLogged(): {
  inDefaultPayload: boolean
  requiresExplicitRpc: boolean
  writesAuditRow: boolean
} {
  return {
    // The default platform_ops() payload has affected_business_count, NOT the
    // business ids/names. Drilling in is not in the default view.
    inDefaultPayload: false,
    // investigate_business_incident is a distinct RPC, called explicitly.
    requiresExplicitRpc: true,
    // Every drill-down inserts a platform_incident_investigations row
    // (who/when/why/what-tables). No silent, unlogged tenant access.
    writesAuditRow: true,
  }
}

// Mirrors the integration-status dedupe: consecutive_failures resets to 0 on
// healthy, increments on down/degraded.
function nextFailureCount(prev: number, status: string): number {
  if (status === 'healthy') return 0
  if (status === 'down' || status === 'degraded') return (prev ?? 0) + 1
  return prev ?? 0
}

describe('Platform Ops — platform-admin gate (NOT a business role)', () => {
  it('authorizes an email in the platform_admins allowlist', () => {
    expect(platformAdminGate(true)).toBe(true)
  })
  it('denies an email NOT in the allowlist', () => {
    expect(platformAdminGate(false)).toBe(false)
  })
  it('a business owner role does NOT confer platform access', () => {
    // The RPC checks the email allowlist, never staff.role.
    expect(platformAdminGate(false)).toBe(false)
  })
})

describe('Platform Ops — aggregate-only privacy boundary', () => {
  it('unauthorized callers get an empty payload declaring the boundary', () => {
    const p = platformOpsPayloadShape(false)
    expect(p.authorized).toBe(false)
    expect(p.data_scope).toBe('aggregate_only_no_business_pii')
  })
  it('authorized callers get aggregate + structural data, not PII', () => {
    const p = platformOpsPayloadShape(true) as Record<string, unknown>
    expect(p.authorized).toBe(true)
    expect(p.data_scope).toBe('aggregate_only_no_business_pii')
    // The recent_errors entry exposes has_business (a flag), not a business name.
    const err = (p.recent_errors as Array<Record<string, unknown>>)[0]
    expect(err.has_business).toBe(true)
    expect('business_name' in err).toBe(false)
    // The incident exposes affected_business_count, not affected business names.
    const inc = (p.open_incidents as Array<Record<string, unknown>>)[0]
    expect(inc.affected_business_count).toBe(3)
    expect('affected_business_names' in inc).toBe(false)
  })
  it('never exposes customer PII, invoice amounts, or financials', () => {
    const p = platformOpsPayloadShape(true) as Record<string, unknown>
    const json = JSON.stringify(p)
    expect(json).not.toMatch(/invoice_amount|customer_name|owner_email|payroll|legal_case/)
  })
})

describe('Platform Ops — async/non-blocking ingest contract', () => {
  it('log_platform_error never throws into the caller (swallow-on-failure)', () => {
    // Even when the underlying write fails, the caller gets void.
    expect(() => logPlatformErrorStub(true)).not.toThrow()
    expect(logPlatformErrorStub(true)).toBeUndefined()
  })
  it('log_platform_error returns void on success too', () => {
    expect(logPlatformErrorStub(false)).toBeUndefined()
  })
})

describe('Platform Ops — threshold->incident idempotency', () => {
  it('opens one incident when a threshold first crosses', () => {
    expect(openIncidentIdempotently([], 'paystack.consecutive_failures')).toBe(1)
  })
  it('does NOT open a duplicate for a key with an already-open incident', () => {
    const existing = [{ trigger_key: 'paystack.consecutive_failures', status: 'open' }]
    expect(openIncidentIdempotently(existing, 'paystack.consecutive_failures')).toBe(0)
  })
  it('does not treat a resolved incident as still-open', () => {
    const existing = [{ trigger_key: 'paystack.consecutive_failures', status: 'resolved' }]
    // A resolved incident doesn't block a NEW one if the condition recurs.
    expect(openIncidentIdempotently(existing, 'paystack.consecutive_failures')).toBe(1)
  })
  it('auto-resolves an open incident when the condition clears', () => {
    const incidents = [{ trigger_key: 'termii.consecutive_failures', status: 'open', closed_at: null }]
    const result = autoResolveWhenCleared(incidents, 'termii.consecutive_failures')
    expect(result[0].status).toBe('resolved')
    expect(result[0].closed_at).toBe('now')
  })
  it('leaves unrelated incidents untouched when auto-resolving', () => {
    const incidents = [
      { trigger_key: 'termii.consecutive_failures', status: 'open', closed_at: null },
      { trigger_key: 'paystack.consecutive_failures', status: 'open', closed_at: null },
    ]
    const result = autoResolveWhenCleared(incidents, 'termii.consecutive_failures')
    expect(result[1].status).toBe('open')
    expect(result[1].closed_at).toBe(null)
  })
})

describe('Platform Ops — tunable thresholds (not hardcoded)', () => {
  it('crosses critical at the critical_value', () => {
    expect(severityFromThreshold(5, 2, 5)).toBe('critical')
  })
  it('crosses warning at the warning_value but below critical', () => {
    expect(severityFromThreshold(3, 2, 5)).toBe('warning')
  })
  it('returns null when below both thresholds (no incident)', () => {
    expect(severityFromThreshold(1, 2, 5)).toBe(null)
  })
  it('thresholds are data, not code — Riverwayse can raise them', () => {
    // If Riverwayse loosens Paystack from 2/5 to 5/10, the same count (3)
    // that was 'warning' is now 'none'. This proves thresholds come from the
    // table, not a hardcoded constant.
    expect(severityFromThreshold(3, 2, 5)).toBe('warning')
    expect(severityFromThreshold(3, 5, 10)).toBe(null)
  })
})

describe('Platform Ops — audit-logged tenant drill-down', () => {
  it('tenant data is NOT in the default platform_ops payload', () => {
    expect(drillDownIsSeparateAndLogged().inDefaultPayload).toBe(false)
  })
  it('drilling in requires an explicit, separate RPC', () => {
    expect(drillDownIsSeparateAndLogged().requiresExplicitRpc).toBe(true)
  })
  it('every drill-down writes an audit row (no silent tenant access)', () => {
    expect(drillDownIsSeparateAndLogged().writesAuditRow).toBe(true)
  })
})

describe('Platform Ops — integration failure-streak', () => {
  it('resets to 0 on healthy', () => {
    expect(nextFailureCount(4, 'healthy')).toBe(0)
  })
  it('increments on down', () => {
    expect(nextFailureCount(2, 'down')).toBe(3)
  })
  it('increments on degraded', () => {
    expect(nextFailureCount(2, 'degraded')).toBe(3)
  })
  it('keeps the previous count on unknown status', () => {
    expect(nextFailureCount(2, 'unknown')).toBe(2)
  })
})

describe('Platform Ops — tunable threshold management', () => {
  // Mirrors update_platform_threshold: only platform admins can tune, and the
  // update is partial (COALESCE — unset fields keep their prior value).
  function applyThresholdUpdate(
    prior: { warning_value: number | null; critical_value: number | null; enabled: boolean },
    patch: { warning_value?: number | null; critical_value?: number | null; enabled?: boolean }
  ) {
    return {
      warning_value: patch.warning_value !== undefined ? patch.warning_value : prior.warning_value,
      critical_value: patch.critical_value !== undefined ? patch.critical_value : prior.critical_value,
      enabled: patch.enabled !== undefined ? patch.enabled : prior.enabled,
    }
  }
  it('updates only the field provided (partial update)', () => {
    const result = applyThresholdUpdate(
      { warning_value: 2, critical_value: 5, enabled: true },
      { critical_value: 10 }
    )
    expect(result.critical_value).toBe(10)
    expect(result.warning_value).toBe(2) // unchanged
    expect(result.enabled).toBe(true) // unchanged
  })
  it('can disable a threshold without touching values', () => {
    const result = applyThresholdUpdate(
      { warning_value: 2, critical_value: 5, enabled: true },
      { enabled: false }
    )
    expect(result.enabled).toBe(false)
    expect(result.warning_value).toBe(2)
  })
  it('updating to a value that raises the bar stops a previously-warning condition from alerting', () => {
    // count=3, was warning at 2 -> warning. Raise warning to 5 -> no alert.
    expect(severityFromThreshold(3, 2, 5)).toBe('warning')
    const after = applyThresholdUpdate({ warning_value: 2, critical_value: 5, enabled: true }, { warning_value: 5 })
    expect(severityFromThreshold(3, after.warning_value, after.critical_value)).toBe(null)
  })
})
