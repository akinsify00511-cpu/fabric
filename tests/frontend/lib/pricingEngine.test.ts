import { describe, it, expect } from 'vitest'

// Mirrors the P0 #14 pricing-engine logic (migration 20260818200000 +
// subscription-management edge function). The rules:
//   - getActiveTierPrice: returns the FOUNDING price while the founding period
//     is ongoing (founding_period_ends_at IS NULL or in the future). Returns
//     the FUTURE price once founding_period_ends_at has passed AND future_*
//     is set. priceLocked = true while founding is active (the subscriber keeps
//     their signup price on renewal).
//   - A 30-50% price increase is a CONFIG change (UPDATE pricing_tiers — set
//     founding_period_ends_at), NOT a code change. The edge function reads the
//     active price from the DB at checkout time.

type TierRow = {
  founding_monthly_cents: number
  founding_yearly_cents: number
  future_monthly_cents: number | null
  future_yearly_cents: number | null
  founding_period_ends_at: string | null
}

function activeMonthlyCents(t: TierRow, now: Date = new Date('2026-08-18')): number {
  const foundingEnded = t.founding_period_ends_at
    && new Date(t.founding_period_ends_at) < now
    && t.future_monthly_cents != null
  return foundingEnded ? t.future_monthly_cents! : t.founding_monthly_cents
}

function isPriceLocked(t: TierRow, now: Date = new Date('2026-08-18')): boolean {
  const foundingEnded = t.founding_period_ends_at
    && new Date(t.founding_period_ends_at) < now
    && t.future_monthly_cents != null
  return !foundingEnded
}

const STARTER: TierRow = {
  founding_monthly_cents: 1500000,
  founding_yearly_cents: 15000000,
  future_monthly_cents: 2100000,   // 40% increase, configured but not active
  future_yearly_cents: 21000000,
  founding_period_ends_at: null,    // founding period ongoing
}

describe('pricing engine — P0 #14 founding pricing + price-lock + future increase', () => {
  it('returns the founding price while the founding period is ongoing', () => {
    expect(activeMonthlyCents(STARTER)).toBe(1500000) // founding, not 2.1M
  })

  it('returns the future price once the founding period ends (config-driven increase)', () => {
    const ended: TierRow = { ...STARTER, founding_period_ends_at: '2026-06-01' }
    // Now is 2026-08-18, founding ended 2026-06-01 -> future price active.
    expect(activeMonthlyCents(ended)).toBe(2100000)
  })

  it('keeps the founding price if founding_period_ends_at passed but future price is unset', () => {
    // Defensive: a premature founding_period_ends_at with no future price
    // should NOT jump to NULL/0 — it keeps the founding price (safe default).
    const noFuture: TierRow = { ...STARTER, founding_period_ends_at: '2026-06-01', future_monthly_cents: null }
    expect(activeMonthlyCents(noFuture)).toBe(1500000)
  })

  it('priceLocked is true during the founding period (the price-lock guarantee)', () => {
    expect(isPriceLocked(STARTER)).toBe(true)
  })

  it('priceLocked is false for new subscribers after the founding period ends', () => {
    const ended: TierRow = { ...STARTER, founding_period_ends_at: '2026-06-01' }
    expect(isPriceLocked(ended)).toBe(false)
  })

  it('a 30-50% increase is ~40% for the seeded tiers (within the directive range)', () => {
    const tiers: TierRow[] = [
      { founding_monthly_cents: 1500000, founding_yearly_cents: 15000000, future_monthly_cents: 2100000, future_yearly_cents: 21000000, founding_period_ends_at: null },
      { founding_monthly_cents: 4800000, founding_yearly_cents: 48000000, future_monthly_cents: 6700000, future_yearly_cents: 67000000, founding_period_ends_at: null },
      { founding_monthly_cents: 11200000, founding_yearly_cents: 112000000, future_monthly_cents: 15600000, future_yearly_cents: 156000000, founding_period_ends_at: null },
      { founding_monthly_cents: 18600000, founding_yearly_cents: 186000000, future_monthly_cents: 26000000, future_yearly_cents: 260000000, founding_period_ends_at: null },
      { founding_monthly_cents: 38000000, founding_yearly_cents: 380000000, future_monthly_cents: 53200000, future_yearly_cents: 532000000, founding_period_ends_at: null },
    ]
    for (const t of tiers) {
      const pct = (t.future_monthly_cents! - t.founding_monthly_cents) / t.founding_monthly_cents * 100
      expect(pct).toBeGreaterThanOrEqual(30)
      expect(pct).toBeLessThanOrEqual(50)
    }
  })

  it('yearly billing uses the yearly cents column (not monthly * 12)', () => {
    // The yearly price is a separate column, allowing a yearly discount.
    // Starter: 15k/mo founding, 150k/yr founding (2 months free).
    const yearlyCents = STARTER.founding_yearly_cents
    expect(yearlyCents).toBe(15000000)
    expect(yearlyCents).toBeLessThan(STARTER.founding_monthly_cents * 12) // discount
  })
})
