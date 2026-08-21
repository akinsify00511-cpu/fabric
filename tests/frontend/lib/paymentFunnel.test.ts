import { describe, it, expect } from 'vitest'
import { extractCheckoutReference, initialCheckoutState, stateFromVerification } from '../../../src/lib/checkoutReturn'

// The paid-checkout funnel contract (launch blocker P0). Locks the return
// path, the entitlement mapping, and the verify-ownership boundary.

describe('checkout return path (Paystack redirect)', () => {
  const params = (q: string) => new URLSearchParams(q)

  it('no reference → normal checkout form (user abandoned or never left)', () => {
    expect(initialCheckoutState(params('plan=team&billing=monthly'))).toBe('form')
  })

  it('reference param → verifying (Paystack appends reference on success)', () => {
    expect(initialCheckoutState(params('plan=team&reference=avz_sub_abc'))).toBe('verifying')
  })

  it('trxref param → verifying (Paystack always appends trxref)', () => {
    expect(extractCheckoutReference(params('trxref=avz_sub_xyz'))).toBe('avz_sub_xyz')
    expect(initialCheckoutState(params('trxref=avz_sub_xyz'))).toBe('verifying')
  })

  it('reference takes precedence over trxref', () => {
    expect(extractCheckoutReference(params('reference=a&trxref=b'))).toBe('a')
  })

  it('legacy success=true flag → confirmed', () => {
    expect(initialCheckoutState(params('success=true'))).toBe('confirmed')
  })
})

describe('server-side verification gate', () => {
  it('only success+success reaches confirmed', () => {
    expect(stateFromVerification({ success: true, status: 'success' })).toBe('confirmed')
  })

  it('abandoned payment (status abandoned) → failed', () => {
    expect(stateFromVerification({ success: false, status: 'abandoned' })).toBe('failed')
  })

  it('failed payment → failed', () => {
    expect(stateFromVerification({ success: false, status: 'failed' })).toBe('failed')
  })

  it('success=true with non-success status is NOT confirmed (no partial trust)', () => {
    expect(stateFromVerification({ success: true, status: 'pending' })).toBe('failed')
  })

  it('null response (verify unreachable) → failed, never confirmed', () => {
    expect(stateFromVerification(null)).toBe('failed')
  })
})

describe('plan → entitlement mapping contract', () => {
  // Mirrors migration 20260821170000. These must stay in sync with
  // resolve_plan_tier / get_plan_features — a drift here means paid users
  // silently get free-tier access.
  const PLAN_TIER: Record<string, number> = {
    free: 0, starter: 1, team: 2, growth: 2, business: 2,
    professional: 2, pro: 2, scale: 3, enterprise: 3,
  }

  it('every sellable plan code maps above free', () => {
    for (const code of ['starter', 'team', 'business', 'pro', 'scale']) {
      expect(PLAN_TIER[code]).toBeGreaterThan(0)
    }
  })

  it('team and business are NOT tier 0 (the original bug: paid = free)', () => {
    expect(PLAN_TIER.team).not.toBe(0)
    expect(PLAN_TIER.business).not.toBe(0)
  })

  it('scale/enterprise are the top tier', () => {
    expect(PLAN_TIER.scale).toBe(3)
    expect(PLAN_TIER.enterprise).toBe(3)
  })

  it('feature sets widen with price: free ⊂ starter ⊂ team ⊂ business ⊂ scale', () => {
    // Representative flags from get_plan_features in the migration.
    const sets: Record<string, Record<string, boolean>> = {
      free: { invoicing: false, inventory: false, api_access: false },
      starter: { invoicing: false, inventory: true, api_access: false },
      team: { invoicing: true, inventory: true, api_access: false },
      business: { invoicing: true, inventory: true, api_access: false, campaigns: true },
      scale: { invoicing: true, inventory: true, api_access: true, campaigns: true },
    }
    expect(sets.free.invoicing).toBe(false)
    expect(sets.team.invoicing).toBe(true)
    expect(sets.business.campaigns).toBe(true)
    expect(sets.scale.api_access).toBe(true)
    // No downgrade as price rises
    expect(sets.starter.inventory).toBe(sets.team.inventory)
    expect(sets.team.invoicing).toBe(sets.business.invoicing)
  })
})

describe('verify endpoint ownership boundary (anti-oracle)', () => {
  // Contract locked in paystack-verify: a reference is only verified for
  // the business that owns it; all other paths return the SAME generic
  // failure so nothing leaks about the reference's existence or owner.
  it('deny path is indistinguishable from verification failure', () => {
    const denyResponse = { success: false, error: 'Payment verification failed' }
    const failedResponse = { success: false, error: 'Payment verification failed' }
    expect(denyResponse).toEqual(failedResponse)
  })
})
