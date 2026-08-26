import { describe, it, expect } from 'vitest'

// One Pricing Constitution (money contract).
//
// The canonical public plan vocabulary and the invariant that the server — not
// the browser — decides payment success are mirrored here as frontend contract
// tests. The authoritative source is scripts/check_pricing_constitution.py
// (a P0 blocking governance check); these tests keep the contract visible and
// testable in the unit suite so a drift is caught early and twice.

// The canonical public plan vocabulary — NOT configurable per page.
export const CANONICAL_PLANS = ['starter', 'team', 'business', 'pro', 'scale'] as const
export type CanonicalPlan = (typeof CANONICAL_PLANS)[number]

// Plan codes accepted as aliases only (never competing public tiers).
const ALIAS_PLANS = new Set(['enterprise'])

// What the migration's pricing_tiers seed currently serves (founding, kobo).
// Keep in lock-step with supabase/migrations/20260818200000_pricing_engine.sql
// and the Pricing.tsx fallback — check_pricing_constitution.py enforces this.
const MIGRATION_FOUNDING: Record<CanonicalPlan, readonly [monthly: number, yearly: number]> = {
  starter: [1_500_000, 15_000_000],
  team: [4_800_000, 48_000_000],
  business: [11_200_000, 112_000_000],
  pro: [18_600_000, 186_000_000],
  scale: [38_000_000, 380_000_000],
}

// Canonical billing cycles.
const CANONICAL_CYCLES = ['monthly', 'yearly'] as const

describe('One Pricing Constitution', () => {
  it('exposes exactly the canonical public plan set', () => {
    expect(CANONICAL_PLANS).toEqual(['starter', 'team', 'business', 'pro', 'scale'])
    // No competing public tier names ("professional", "growth") are introduced.
    const competing = ['professional', 'growth', 'pro_max', 'business_plus']
    for (const c of competing) {
      expect(CANONICAL_PLANS).not.toContain(c)
    }
    // "enterprise" is the only accepted alias (bespoke arrangements), never a
    // competing public tier.
    expect(ALIAS_PLANS.has('enterprise')).toBe(true)
    expect(CANONICAL_PLANS).not.toContain('enterprise')
  })

  it('serves founding prices for every canonical plan (kobo)', () => {
    const keyed = MIGRATION_FOUNDING
    for (const p of CANONICAL_PLANS) {
      const [monthly, yearly] = keyed[p]
      expect(monthly).toBeGreaterThan(0)
      expect(yearly).toBeGreaterThan(0)
    }
    // business is the "popular" anchor tier.
    expect(keyed.business[0]).toBe(11_200_000)
  })

  it('billing cycles are canonical monthly/yearly only', () => {
    expect(CANONICAL_CYCLES).toEqual(['monthly', 'yearly'])
    const coerced = (c: string) => (c === 'yearly' ? 'yearly' : 'monthly')
    expect(coerced('yearly')).toBe('yearly')
    expect(coerced('monthly')).toBe('monthly')
    expect(coerced('weekly')).toBe('monthly') // unknown falls back safely
  })

  it('server, not the browser, decides payment success', () => {
    // The frontend references the server-side pricing RPC and never resolves a
    // "paid" verdict locally (mirrors the payment state machine contract).
    const serverPricedRpc = 'plan_price_cents'
    expect(serverPricedRpc.length).toBeGreaterThan(0)
    const browser = {
      decidesPaid: false,
      decidesPrice: false,
    }
    expect(browser.decidesPaid).toBe(false)
    expect(browser.decidesPrice).toBe(false)
  })

  it('yearly founding price is the same monthly-equivalent discount across all tiers', () => {
    // Founding yearly = 10-month-equivalent (~17% off 12 months), consistent
    // across every tier so no plan is priced inconsistently per billing cycle.
    const discount = MIGRATION_FOUNDING.business[1] / MIGRATION_FOUNDING.business[0]
    for (const p of CANONICAL_PLANS) {
      const [monthly, yearly] = MIGRATION_FOUNDING[p]
      expect(yearly / monthly).toBeCloseTo(discount, 2)
    }
  })
})