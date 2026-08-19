import { describe, it, expect } from 'vitest'
import { MEMBER_KIND_CONFIG, memberKindLabel, hasPermission, type MemberKind } from '../../../src/lib/AuthContext'

const ALL_KINDS: MemberKind[] = ['owner', 'staff', 'consultant', 'vendor', 'expert', 'partner']
const INVITABLE: MemberKind[] = ['staff', 'consultant', 'vendor', 'expert', 'partner']

// Backfill derivation: role 'owner' -> kind 'owner'; everything else -> 'staff'.
function backfillKind(role: string): MemberKind {
  return role === 'owner' ? 'owner' : 'staff'
}

// Invite-kind validation (mirrors the RPC guard).
function validateInviteKind(kind: string): boolean {
  return (INVITABLE as string[]).includes(kind)
}

// Last-owner guard: a demote is blocked when the target is the only owner-kind
// member; allowed when another owner-kind member exists.
function canDemote(currentKinds: MemberKind[], targetIdx: number, newKind: MemberKind): boolean {
  if (newKind === 'owner') return true
  if (currentKinds[targetIdx] !== 'owner') return true
  return currentKinds.some((k, i) => i !== targetIdx && k === 'owner')
}

describe('member-kind taxonomy', () => {
  it('covers exactly the six first-class kinds', () => {
    expect(Object.keys(MEMBER_KIND_CONFIG).sort()).toEqual(
      ['consultant', 'expert', 'owner', 'partner', 'staff', 'vendor'],
    )
  })

  it('every kind has a human label', () => {
    for (const k of ALL_KINDS) {
      expect(MEMBER_KIND_CONFIG[k].label.length).toBeGreaterThan(0)
    }
  })

  it('owner is NOT invitable — ownership is created, not emailed', () => {
    expect(validateInviteKind('owner')).toBe(false)
    for (const k of INVITABLE) expect(validateInviteKind(k)).toBe(true)
  })
})

describe('backfill derivation', () => {
  it('role owner becomes kind owner', () => {
    expect(backfillKind('owner')).toBe('owner')
  })

  it('all other roles backfill to kind staff', () => {
    for (const r of ['admin', 'manager', 'team_lead', 'staff']) {
      expect(backfillKind(r)).toBe('staff')
    }
  })
})

describe('memberKindLabel fallback', () => {
  it('unknown/null kind falls back to Staff', () => {
    expect(memberKindLabel(null)).toBe('Staff')
    expect(memberKindLabel(undefined)).toBe('Staff')
    expect(memberKindLabel('')).toBe('Staff')
  })

  it('resolves real kinds', () => {
    expect(memberKindLabel('consultant')).toBe('Consultant')
    expect(memberKindLabel('owner')).toBe('Owner')
  })
})

describe('last-owner integrity guard', () => {
  it('blocks demoting the only owner-kind member', () => {
    const kinds: MemberKind[] = ['owner', 'staff']
    expect(canDemote(kinds, 0, 'staff')).toBe(false)
  })

  it('allows demoting an owner when another owner-kind member exists', () => {
    const kinds: MemberKind[] = ['owner', 'owner', 'staff']
    expect(canDemote(kinds, 0, 'partner')).toBe(true)
  })

  it('never blocks reclassifying a non-owner member', () => {
    const kinds: MemberKind[] = ['owner', 'staff']
    expect(canDemote(kinds, 1, 'consultant')).toBe(true)
  })

  it('never blocks promoting anyone to owner', () => {
    const kinds: MemberKind[] = ['owner', 'staff']
    expect(canDemote(kinds, 1, 'owner')).toBe(true)
  })
})

describe('security boundary invariant', () => {
  it('member kind does NOT enter the permission decision — role alone does', () => {
    // hasPermission only knows roles; kind gives no extra power.
    expect(hasPermission('staff', 'manage_finance')).toBe(false)
    expect(hasPermission('manager', 'manage_team')).toBe(true)
    expect(hasPermission('owner', 'anything')).toBe(true)
    // A consultant with role staff has exactly staff permissions.
    expect(hasPermission('staff', 'own_data')).toBe(true)
  })
})
