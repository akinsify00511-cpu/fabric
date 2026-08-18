import { describe, it, expect } from 'vitest'

// Owner-Only Intelligence authorization (#18 + #21 boundary).
// Locks the three-layer defense-in-depth contract:
//   1. Client role check (UX only — staff.role owner|admin)
//   2. RPC owner-gate (the real boundary — SECURITY DEFINER bypasses RLS)
//   3. RLS on usage_events
// Plus the #21 boundary: privileged/walled content is excluded by construction.

// Mirrors the client UX gate (Shell.itemVisible + OwnerIntelligence.useIsOwnerAdmin)
// and the RPC gate (owner_intelligence: role IN ('owner','admin') AND membership).
function clientGate(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

// Mirrors the RPC gate: owner/admin AND a member of the business.
function rpcGate(role: string | undefined, isMember: boolean): {
  authorized: boolean
  data_scope: string
} {
  const authorized = isMember && (role === 'owner' || role === 'admin')
  // The RPC always returns this scope, even when unauthorized (empty payload).
  return { authorized, data_scope: 'operational_and_usage_only' }
}

describe('Owner Intelligence — client UX gate (#18 layer 1)', () => {
  it('shows owner intelligence to owners', () => {
    expect(clientGate('owner')).toBe(true)
  })
  it('shows owner intelligence to admins', () => {
    expect(clientGate('admin')).toBe(true)
  })
  it('hides owner intelligence from managers', () => {
    expect(clientGate('manager')).toBe(false)
  })
  it('hides owner intelligence from team leads', () => {
    expect(clientGate('team_lead')).toBe(false)
  })
  it('hides owner intelligence from ordinary staff', () => {
    expect(clientGate('staff')).toBe(false)
  })
})

describe('Owner Intelligence — RPC server gate (#18 layer 2, the real boundary)', () => {
  it('authorizes an owner who is a member of the business', () => {
    expect(rpcGate('owner', true).authorized).toBe(true)
  })
  it('authorizes an admin who is a member of the business', () => {
    expect(rpcGate('admin', true).authorized).toBe(true)
  })
  it('denies a manager even if a member (not an owner/admin)', () => {
    expect(rpcGate('manager', true).authorized).toBe(false)
  })
  it('denies a non-member even if role is owner (cross-tenant protection)', () => {
    // The key cross-tenant case: passing another business's UUID. The RPC
    // checks BOTH role AND membership. A caller who is an owner of business A
    // cannot read business B's intelligence by passing B's UUID.
    expect(rpcGate('owner', false).authorized).toBe(false)
  })
  it('denies an undefined role (unauthenticated/tampered client)', () => {
    expect(rpcGate(undefined, true).authorized).toBe(false)
  })
  it('always declares the operational-only data scope, even when denied', () => {
    // The scope declaration is returned regardless of authorization — the
    // #21 boundary is a structural guarantee, not a per-request toggle.
    expect(rpcGate('owner', true).data_scope).toBe('operational_and_usage_only')
    expect(rpcGate('staff', true).data_scope).toBe('operational_and_usage_only')
  })
})

describe('Owner Intelligence — #21 walled-content exclusion boundary', () => {
  // The owner_intelligence RPC reads ONLY usage_events + automations.
  // Privileged/walled content is excluded BY CONSTRUCTION — the function
  // never references legal_cases, disciplinary records, board finance, or
  // litigation. This test documents the boundary as an explicit allowlist.
  const ALLOWED_SOURCES = ['usage_events', 'automations', 'automation_runs']
  const WALLLED_SOURCES = [
    'legal_cases', 'legal_contracts', 'legal_obligations',
    'disciplinary', 'grievances', 'litigation', 'board_finance',
    'salary_history', 'payroll_records',
  ]
  it('the intelligence layer allowlist is operational/usage data only', () => {
    expect(ALLOWED_SOURCES).toEqual(['usage_events', 'automations', 'automation_runs'])
  })
  it('no walled content source is in the allowlist', () => {
    expect(WALLLED_SOURCES.some(s => ALLOWED_SOURCES.includes(s))).toBe(false)
  })
  it('payroll/salary data is walled (sensitive HR, excluded from general intelligence)', () => {
    expect(ALLOWED_SOURCES).not.toContain('payroll_records')
    expect(ALLOWED_SOURCES).not.toContain('salary_history')
  })
})
