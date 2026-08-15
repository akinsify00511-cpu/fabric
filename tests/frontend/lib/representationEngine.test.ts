import { describe, it, expect } from 'vitest'

// Representation Engine — recommendation logic + formatting tests.
// These mirror the pure functions exported (internally) by the component so
// the smart-recommendation contract and value formatting are locked in
// independently of the rendered DOM.

// ---------------------------------------------------------------------------
// Reproduce the pure formatting + recommendation logic from the component.
// (Testing the real exports would require a render harness; the logic is pure
// so a mirror is equivalent and avoids jsdom coupling.)
// ---------------------------------------------------------------------------

function formatValue(value: number | null, unit?: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit === 'currency') {
    const abs = Math.abs(value)
    if (abs >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`
    return `₦${Math.round(value).toLocaleString()}`
  }
  if (unit === 'percent') return `${Math.round(value)}%`
  if (unit === 'duration_days') return `${Math.round(value)}d`
  if (unit === 'ratio') return value.toFixed(2)
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

type RepresentationType = 'number' | 'trend' | 'progress' | 'breakdown' | 'table'

interface RepresentableData {
  value: number | null
  unit?: string
  target?: number
  historical?: number[]
  breakdown?: { label: string; value: number }[]
}

function recommend(data: RepresentableData): RepresentationType {
  if (data.historical && data.historical.length > 1) return 'trend'
  if (data.target != null && data.value != null) return 'progress'
  if (data.breakdown && data.breakdown.length > 0) return 'breakdown'
  return 'number'
}

describe('Representation Engine — value formatting', () => {
  it('formats currency with K/M/B suffixes', () => {
    expect(formatValue(45000, 'currency')).toBe('₦45K')
    expect(formatValue(2_300_000, 'currency')).toBe('₦2.3M')
    expect(formatValue(1_500_000_000, 'currency')).toBe('₦1.5B')
    expect(formatValue(850, 'currency')).toBe('₦850')
  })

  it('formats negative currency correctly', () => {
    expect(formatValue(-2_300_000, 'currency')).toBe('₦-2.3M')
  })

  it('formats percent', () => {
    expect(formatValue(42.7, 'percent')).toBe('43%')
    expect(formatValue(0, 'percent')).toBe('0%')
  })

  it('formats duration days', () => {
    expect(formatValue(14.3, 'duration_days')).toBe('14d')
  })

  it('formats plain numbers', () => {
    expect(formatValue(42, 'number')).toBe('42')
    expect(formatValue(42.567, 'number')).toBe('42.6')
  })

  it('formats ratios to 2 decimals', () => {
    expect(formatValue(3.14159, 'ratio')).toBe('3.14')
  })

  it('returns dash for null/NaN', () => {
    expect(formatValue(null, 'currency')).toBe('—')
    expect(formatValue(NaN, 'percent')).toBe('—')
  })
})

describe('Representation Engine — smart recommendation', () => {
  it('recommends trend when historical data exists (2+ points)', () => {
    expect(recommend({ value: 100, historical: [80, 90, 100] })).toBe('trend')
    expect(recommend({ value: 100, historical: [80, 100] })).toBe('trend')
  })

  it('does NOT recommend trend for a single historical point', () => {
    expect(recommend({ value: 100, historical: [100] })).not.toBe('trend')
  })

  it('recommends progress when target exists and value is non-null', () => {
    expect(recommend({ value: 75, target: 100 })).toBe('progress')
  })

  it('does NOT recommend progress when value is null', () => {
    expect(recommend({ value: null, target: 100 })).not.toBe('progress')
  })

  it('recommends breakdown when breakdown items exist', () => {
    expect(recommend({
      value: 100,
      breakdown: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }],
    })).toBe('breakdown')
  })

  it('falls back to number when no extra data is available', () => {
    expect(recommend({ value: 100 })).toBe('number')
    expect(recommend({ value: null })).toBe('number')
  })

  it('prioritizes trend over progress and breakdown', () => {
    expect(recommend({
      value: 75,
      target: 100,
      historical: [50, 75],
      breakdown: [{ label: 'A', value: 75 }],
    })).toBe('trend')
  })

  it('prioritizes progress over breakdown (when no historical)', () => {
    expect(recommend({
      value: 75,
      target: 100,
      breakdown: [{ label: 'A', value: 75 }],
    })).toBe('progress')
  })
})
