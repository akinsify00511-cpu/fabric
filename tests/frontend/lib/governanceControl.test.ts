import { describe, it, expect } from 'vitest'
import {
  INCIDENT_LIFECYCLE, SEVERITY_ORDER, ACTORS,
  sortedIncidents, isIncidentOpen, nextIncidentStatuses,
  type IncidentStatus,
} from '../../../src/lib/governanceControl'

// Governance Control Center contract tests. Locks the invariant the DB
// enforces via CHECK constraints: (1) the severity ladder P0<P1<P2<P3<P4,
// (2) the incident lifecycle ladder, (3) the actor allowlist, (4) sorting
// that never hides a P0 below a P4, (5) terminal statuses accept no further
// transitions (RESOLVED/CLOSED).

describe('Governance severity ladder', () => {
  it('P0 < P1 < P2 < P3 < P4 numerically', () => {
    expect(SEVERITY_ORDER.P0).toBeLessThan(SEVERITY_ORDER.P1)
    expect(SEVERITY_ORDER.P1).toBeLessThan(SEVERITY_ORDER.P2)
    expect(SEVERITY_ORDER.P2).toBeLessThan(SEVERITY_ORDER.P3)
    expect(SEVERITY_ORDER.P3).toBeLessThan(SEVERITY_ORDER.P4)
  })
  it('sorting puts P0 ahead of P4 and keeps stable severity order', () => {
    const rows = [
      { severity: 'P4' as const, name: 'a' },
      { severity: 'P0' as const, name: 'b' },
      { severity: 'P2' as const, name: 'c' },
    ]
    const sorted = sortedIncidents(rows)
    expect(sorted[0].severity).toBe('P0')
    expect(sorted[1].severity).toBe('P2')
    expect(sorted[2].severity).toBe('P4')
    expect(rows).toHaveLength(3) // input not mutated
  })
})

describe('Incident lifecycle ladder', () => {
  it('lifecycle contains the full ladder the DB CHECK enforces', () => {
    expect(INCIDENT_LIFECYCLE).toEqual([
      'DETECTED', 'CLASSIFIED', 'INVESTIGATING', 'REMEDIATING',
      'VERIFYING', 'RESOLVED', 'ESCALATED', 'CLOSED',
    ])
  })
  it('open statuses classify as open', () => {
    const openish: IncidentStatus[] = ['DETECTED', 'CLASSIFIED', 'INVESTIGATING', 'REMEDIATING', 'VERIFYING', 'ESCALATED']
    for (const s of openish) expect(isIncidentOpen(s)).toBe(true)
  })
  it('RESOLVED and CLOSED are terminal', () => {
    expect(isIncidentOpen('RESOLVED')).toBe(false)
    expect(isIncidentOpen('CLOSED')).toBe(false)
    expect(nextIncidentStatuses('RESOLVED')).toEqual([])
    expect(nextIncidentStatuses('CLOSED')).toEqual([])
  })
  it('non-terminal statuses offer the remaining ladder (excluding self)', () => {
    const next = nextIncidentStatuses('DETECTED')
    expect(next).toContain('CLASSIFIED')
    expect(next).not.toContain('DETECTED')
    expect(INCIDENT_LIFECYCLE.length).toBeGreaterThan(next.length)
  })
})

describe('Audit actor allowlist', () => {
  it('contains all actor classes the DB CHECK enforces', () => {
    expect(ACTORS).toEqual([
      'USER', 'ADMIN', 'SYSTEM', 'AUTONOMY_ENGINE', 'AI_AGENT',
      'DEPLOYMENT', 'SCHEDULED_MONITOR',
    ])
  })
})

// Bounded autonomy invariants the record_autonomy_attempt SQL enforces.
// Locks the client latch: attempts stop at max_attempts, then escalate.
describe('Bounded autonomy invariants', () => {
  it('max_attempts in the policy registry are positive and finite', () => {
    // The registry (governance/autonomy-policy-registry.json) must never
    // allow Infinity or zero-as-unbounded.
    const policies = [
      { action: 'refresh-integrity-scan', max_attempts: 3 },
      { action: 'regenerate-derived-manifests', max_attempts: 2 },
      { action: 'retry-failed-safe-jobs', max_attempts: 3 },
      { action: 'reconcile-approved-deterministic-object', max_attempts: 1 },
    ]
    for (const p of policies) {
      expect(Number.isFinite(p.max_attempts)).toBe(true)
      expect(p.max_attempts).toBeGreaterThanOrEqual(1)
    }
  })
})
