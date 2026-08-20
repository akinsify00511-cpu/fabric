import { describe, it, expect } from 'vitest'
import { deriveMembership, type MembershipState } from '../../../src/lib/AuthContext'
import { normalizeRateLimitRows, rateLimitMessage } from '../../../src/lib/authSecurity'
import { extractBusinessId } from '../../../src/lib/onboarding'

// The canonical membership state machine (Session 36). The contract:
// `staff === null` is never overloaded — ambiguous/errored lookups are
// distinct states, and routing decisions only fire on resolved states.

const memberStaff = { business_id: 'b-1', active: true }

function derive(overrides: Partial<Parameters<typeof deriveMembership>[0]>): MembershipState {
  return deriveMembership({
    authLoading: false,
    sessionPresent: true,
    staffChecked: true,
    staffError: false,
    staff: memberStaff,
    ...overrides,
  })
}

describe('deriveMembership — canonical state machine', () => {
  it('auth restoration pending -> loading', () => {
    expect(derive({ authLoading: true })).toBe('loading')
  })

  it('no session -> anonymous (never loading, never onboarding)', () => {
    expect(derive({ sessionPresent: false, staffChecked: false, staff: null })).toBe('anonymous')
    expect(derive({ sessionPresent: false, staffChecked: true, staff: null })).toBe('anonymous')
  })

  it('session present but membership unresolved -> loading (never onboarding_required)', () => {
    // THE regression guard: a returning user mid-fetch must never be
    // interpreted as a new user.
    expect(derive({ staffChecked: false, staff: null })).toBe('loading')
  })

  it('lookup failure after retries -> error (not onboarding, not logout)', () => {
    expect(derive({ staffError: true, staff: null })).toBe('error')
    expect(derive({ staffError: true, staff: memberStaff })).toBe('error')
  })

  it('resolved with no staff row -> onboarding_required', () => {
    expect(derive({ staff: null })).toBe('onboarding_required')
  })

  it('staff row without a business -> onboarding_required', () => {
    expect(derive({ staff: { business_id: null, active: true } })).toBe('onboarding_required')
  })

  it('deactivated member is distinct from a new user', () => {
    expect(derive({ staff: { business_id: 'b-1', active: false } })).toBe('deactivated')
  })

  it('active member with a business -> member', () => {
    expect(derive({})).toBe('member')
    // active may be absent on older schemas — absence is not deactivation
    expect(derive({ staff: { business_id: 'b-1' } })).toBe('member')
  })

  it('error does not mask a resolved session as anonymous', () => {
    expect(derive({ sessionPresent: true, staffError: true, staff: null })).toBe('error')
  })
})

describe('normalizeRateLimitRows — PostgREST TABLE shape', () => {
  it('reads the first row of the array (the shape that previously blocked every login)', () => {
    expect(normalizeRateLimitRows([{ allowed: true, attempts: 1, retry_after: 0 }]))
      .toEqual({ allowed: true, attempts: 1, retryAfterSeconds: 0 })
  })

  it('reads a denied verdict with retry_after', () => {
    const v = normalizeRateLimitRows([{ allowed: false, attempts: 5, retry_after: 900 }])
    expect(v?.allowed).toBe(false)
    expect(v?.retryAfterSeconds).toBe(900)
  })

  it('tolerates a bare object (non-setof variants)', () => {
    expect(normalizeRateLimitRows({ allowed: true, attempts: 0, retry_after: 0 })?.allowed).toBe(true)
  })

  it('returns null for unusable shapes (caller fails open)', () => {
    expect(normalizeRateLimitRows(null)).toBeNull()
    expect(normalizeRateLimitRows([])).toBeNull()
    expect(normalizeRateLimitRows([{ allowed: 'yes' }])).toBeNull()
    expect(normalizeRateLimitRows('ok')).toBeNull()
  })
})

describe('rateLimitMessage', () => {
  it('rounds retry seconds up to whole minutes', () => {
    expect(rateLimitMessage({ allowed: false, attempts: 5, retryAfterSeconds: 900 }, 'login'))
      .toBe('Too many login attempts. Try again in 15 minutes.')
    expect(rateLimitMessage({ allowed: false, attempts: 5, retryAfterSeconds: 30 }, 'signup'))
      .toBe('Too many signup attempts. Try again in 1 minute.')
  })
})

describe('extractBusinessId — RPC result shape', () => {
  it('extracts from the TABLE (array) shape', () => {
    expect(extractBusinessId([{ p_business_id: 'b-123', p_staff_id: 's-1' }])).toBe('b-123')
  })

  it('extracts from a bare object', () => {
    expect(extractBusinessId({ p_business_id: 'b-9' })).toBe('b-9')
  })

  it('accepts a bare UUID string (older scalar variants)', () => {
    expect(extractBusinessId('b-scalar')).toBe('b-scalar')
  })

  it('never fabricates an id from garbage', () => {
    expect(extractBusinessId(null)).toBeNull()
    expect(extractBusinessId([])).toBeNull()
    expect(extractBusinessId([{ unexpected: true }])).toBeNull()
    expect(extractBusinessId(42)).toBeNull()
  })
})
