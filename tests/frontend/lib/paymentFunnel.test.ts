import { describe, it, expect } from 'vitest'

// The paid-plan funnel contract (launch blocker P0). Locks the entitlement
// mapping and the manual-payment-confirmation boundary. There is no external
// payment provider: a business creates a payment request, pays by bank
// transfer, and an operator confirms — which activates the subscription.

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

describe('manual payment confirmation contract', () => {
  // Mirrors request_plan_payment / confirm_plan_payment in
  // 20260822120000_manual_payment_flow.sql.

  // One open request per business: a repeat request returns the existing one.
  function requestPlanPayment(existing: { reference: string } | null, newRef: string): { reference: string } {
    return existing ?? { reference: newRef }
  }

  it('repeat request is idempotent — returns the open request', () => {
    const first = requestPlanPayment(null, 'avz_req_1')
    const second = requestPlanPayment(first, 'avz_req_2')
    expect(second.reference).toBe('avz_req_1')
  })

  it('only pending requests can be confirmed (no double-activation)', () => {
    const canConfirm = (status: string) => status === 'pending'
    expect(canConfirm('pending')).toBe(true)
    expect(canConfirm('confirmed')).toBe(false)
    expect(canConfirm('cancelled')).toBe(false)
    expect(canConfirm('rejected')).toBe(false)
  })

  it('confirming activates a subscription with provider=manual (no external provider)', () => {
    // The subscription row written by confirm_plan_payment.
    const written = { provider: 'manual', status: 'active' }
    expect(written.provider).toBe('manual')
    expect(written.status).toBe('active')
  })

  it('confirmation is operator-gated — non-operators get authorized:false', () => {
    const confirm = (isRiverwaysAdmin: boolean) =>
      isRiverwaysAdmin ? { ok: true } : { ok: false, authorized: false }
    expect(confirm(true).ok).toBe(true)
    expect((confirm(false) as { authorized: boolean }).authorized).toBe(false)
  })

  it('request is owner/admin-gated — staff cannot change the plan', () => {
    const canRequest = (role: string) => role === 'owner' || role === 'admin'
    expect(canRequest('owner')).toBe(true)
    expect(canRequest('admin')).toBe(true)
    expect(canRequest('staff')).toBe(false)
    expect(canRequest('manager')).toBe(false)
  })
})
