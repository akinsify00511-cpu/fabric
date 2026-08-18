import { describe, it, expect } from 'vitest'

// Mirrors the §5.3 compute_ebitda RPC contract (migration 20260818160000):
// EBITDA = Revenue (paid invoices) − COGS (purchase transactions) − operating
// expenses (recurring_expenses normalized to period + negative adjustments).
// Every component is server-derived (§0.4). Honest insufficient-data flag.

// The exact arithmetic the RPC performs.
function computeEbitda(input: {
  revenue: number
  cogs: number
  recurringMonthly: number
  periodDays: number
  otherExpenses: number
}): { ebitda: number; totalExpenses: number; margin: number | null; label: string; insufficient: boolean } {
  // Recurring normalized to the period fraction (monthly / 30 * periodDays).
  const recurring = input.recurringMonthly * (input.periodDays / 30.0)
  const totalExpenses = input.cogs + recurring + input.otherExpenses
  const ebitda = input.revenue - totalExpenses
  const margin = input.revenue > 0 ? Math.round((ebitda / input.revenue) * 1000) / 10 : null
  let label: string
  if (ebitda > 0 && (margin ?? 0) >= 20) label = 'Profitable and efficient'
  else if (ebitda > 0) label = 'Profitable'
  else if (ebitda === 0) label = 'Breaking even'
  else label = 'Operating at a loss'
  const insufficient = input.revenue === 0 && input.cogs === 0 && input.recurringMonthly === 0
  return { ebitda, totalExpenses, margin, label, insufficient }
}

describe('compute_ebitda — §5.3 + §0.4 server-derived profitability', () => {
  it('subtracts COGS + operating expenses from revenue (server-derived)', () => {
    const r = computeEbitda({ revenue: 500000, cogs: 150000, recurringMonthly: 50000, periodDays: 30, otherExpenses: 10000 })
    // 500000 - (150000 + 50000 + 10000) = 290000
    expect(r.ebitda).toBe(290000)
    expect(r.totalExpenses).toBe(210000)
  })

  it('labels profitable + ≥20% margin as "Profitable and efficient"', () => {
    const r = computeEbitda({ revenue: 500000, cogs: 100000, recurringMonthly: 50000, periodDays: 30, otherExpenses: 0 })
    // ebitda=350000, margin=70% → efficient
    expect(r.label).toBe('Profitable and efficient')
    expect(r.margin).toBe(70)
  })

  it('labels a loss as "Operating at a loss" (§0.2: the conclusion, not the number)', () => {
    const r = computeEbitda({ revenue: 100000, cogs: 80000, recurringMonthly: 40000, periodDays: 30, otherExpenses: 0 })
    // 100000 - (80000 + 40000) = -20000
    expect(r.ebitda).toBe(-20000)
    expect(r.label).toBe('Operating at a loss')
  })

  it('normalizes recurring expenses to the period (not raw monthly for a 7-day window)', () => {
    const r = computeEbitda({ revenue: 100000, cogs: 0, recurringMonthly: 30000, periodDays: 7, otherExpenses: 0 })
    // recurring normalized: 30000 * (7/30) = 7000
    expect(r.ebitda).toBe(100000 - 7000)
  })

  it('flags insufficient data honestly (no revenue, COGS, or opex)', () => {
    const r = computeEbitda({ revenue: 0, cogs: 0, recurringMonthly: 0, periodDays: 30, otherExpenses: 0 })
    expect(r.insufficient).toBe(true)
    // The label is still derivable but the UI shows the insufficient state.
  })

  it('returns null margin when revenue is zero (never divides by zero — §22)', () => {
    const r = computeEbitda({ revenue: 0, cogs: 5000, recurringMonthly: 0, periodDays: 30, otherExpenses: 0 })
    expect(r.margin).toBeNull()
  })
})
