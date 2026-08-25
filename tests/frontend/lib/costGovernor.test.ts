import { describe, it, expect } from 'vitest'
import { marginStatus, marginStatusLabel, usageFraction, overageLabel, formatCents, type LedgerMonth, type ProviderLimit } from '../../../src/lib/costGovernor'

const month = (over: Partial<LedgerMonth>): LedgerMonth => ({
  business_id: 'b',
  month: '2026-08-01',
  revenue_cents: 10000,
  priced_cost_cents: 3000,
  gross_margin_cents: 7000,
  unpriced_units: 0,
  notes: [],
  computed_at: 'x',
  ...over,
})

const len = (over: Partial<ProviderLimit>): ProviderLimit => ({
  provider: 'ai', plan: 'starter', month: '2026-08-01',
  used_units: 80, limit_units: 400, overage_action: 'notify',
  blocked: false, throttled: false, over_limit: false,
  ...over,
})

describe('margin classification', () => {
  it('healthy when margin positive and >50% of revenue', () => {
    expect(marginStatus(month({}))).toBe('healthy')
  })
  it('negative when margin <= 0 (costs exceed revenue)', () => {
    expect(marginStatus(month({ gross_margin_cents: -100 }))).toBe('negative')
    expect(marginStatus(month({ gross_margin_cents: 0 }))).toBe('negative')
  })
  it('thin when margin is below 50% of revenue', () => {
    expect(marginStatus(month({ revenue_cents: 10000, gross_margin_cents: 4000 }))).toBe('thin')
  })
  it('labels map to sentences', () => {
    expect(marginStatusLabel('healthy')).toContain('Healthy')
    expect(marginStatusLabel('thin')).toContain('Thin')
    expect(marginStatusLabel('negative')).toContain('exceed')
  })
})

describe('usage fraction', () => {
  it('computes used/limit capped at 1', () => {
    expect(usageFraction(len({}))).toBeCloseTo(0.2)
    expect(usageFraction(len({ used_units: 500 }))).toBe(1)
  })
  it('null when unmetered (no limit)', () => {
    expect(usageFraction(len({ limit_units: null }))).toBeNull()
    expect(usageFraction(len({ limit_units: 0 }))).toBeNull()
  })
})

describe('overage labels', () => {
  it('maps the four actions to UI copy', () => {
    expect(overageLabel('block')).toBe('blocked')
    expect(overageLabel('throttle')).toBe('throttled')
    expect(overageLabel('notify')).toBe('over limit')
    expect(overageLabel('allow')).toBe('unmetered')
  })
})

describe('formatCents', () => {
  it('NGN renders with naira sign and two groups max', () => {
    expect(formatCents(1500000)).toBe('₦15,000')
    // cents->naira with bankless rounding: 80.5c = 0.805n -> ₦0.81 (2 dp max)
    expect(formatCents(80.5)).toBe('₦0.81')
  })
  it('other currencies suffix the code', () => {
    expect(formatCents(1234, 'USD')).toBe('12.34 USD')
  })
})
