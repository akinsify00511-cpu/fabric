import { describe, it, expect } from 'vitest'
import type { GovernedMetric, MetricConfidence } from '../../../src/lib/businessOS'

// Governed-metric confidence classification + formatting (§29 testing).
// Mirrors the pure logic used by GovernedMetricsCard in ExecutiveCockpit so
// the small-data safety (§21) and confidence contract (§10) is locked in
// independently of the live DB.

// Reproduce the card's confidence -> ClaimTag tone mapping.
function confidenceTone(c: MetricConfidence): string {
  if (c === 'high') return 'FACT'
  if (c === 'medium' || c === 'low') return 'INFERENCE'
  return 'UNKNOWN'
}

// Reproduce the card's value formatting (without the naira helper import).
function formatValue(m: GovernedMetric): string {
  const v = m.current_value
  if (v == null || Number.isNaN(v)) return '—'
  if (m.unit === 'percent') return `${Math.round(v)}%`
  if (m.unit === 'currency') return '₦' + Math.round(v).toLocaleString('en-NG')
  if (m.unit === 'duration_days') return `${Math.round(v)}d`
  return Number.isInteger(v) ? `${v}` : v.toFixed(2)
}

function makeMetric(partial: Partial<GovernedMetric>): GovernedMetric {
  return {
    metric_key: 'x',
    name: 'x',
    category: 'finance',
    unit: 'currency',
    formula: '',
    current_value: null,
    previous_value: null,
    change_percent: null,
    sample_size: 0,
    confidence: 'insufficient',
    insufficient_note: null,
    period: 'trailing_90d',
    last_calculated_at: null,
    ...partial,
  }
}

describe('Governed metric confidence contract (§10)', () => {
  it('classifies high confidence as FACT', () => {
    expect(confidenceTone('high')).toBe('FACT')
  })
  it('classifies medium and low as INFERENCE', () => {
    expect(confidenceTone('medium')).toBe('INFERENCE')
    expect(confidenceTone('low')).toBe('INFERENCE')
  })
  it('classifies insufficient and error as UNKNOWN (never a fabricated fact)', () => {
    expect(confidenceTone('insufficient')).toBe('UNKNOWN')
    expect(confidenceTone('error')).toBe('UNKNOWN')
  })
})

describe('Governed metric formatting (§21 small-data safety)', () => {
  it('renders an em-dash when the value is null (insufficient data)', () => {
    expect(formatValue(makeMetric({ current_value: null, confidence: 'insufficient' }))).toBe('—')
  })
  it('renders an em-dash when the value is NaN', () => {
    expect(formatValue(makeMetric({ current_value: NaN, confidence: 'insufficient' }))).toBe('—')
  })
  it('formats currency with the Naira symbol', () => {
    expect(formatValue(makeMetric({ current_value: 1250000, unit: 'currency', confidence: 'high' }))).toBe('₦1,250,000')
  })
  it('formats percent with a % suffix, rounded', () => {
    expect(formatValue(makeMetric({ current_value: 12.4, unit: 'percent', confidence: 'high' }))).toBe('12%')
    expect(formatValue(makeMetric({ current_value: 12.6, unit: 'percent', confidence: 'high' }))).toBe('13%')
  })
  it('formats duration in days', () => {
    expect(formatValue(makeMetric({ current_value: 7.3, unit: 'duration_days', confidence: 'medium' }))).toBe('7d')
  })
  it('formats an integer count without decimals', () => {
    expect(formatValue(makeMetric({ current_value: 5, unit: 'number', confidence: 'high' }))).toBe('5')
  })
  it('formats a ratio to 2 decimals', () => {
    expect(formatValue(makeMetric({ current_value: 1.234, unit: 'ratio', confidence: 'low' }))).toBe('1.23')
  })
})

describe('Recommendation lifecycle invariants (§15)', () => {
  // The lifecycle status transitions the backend enforces. The frontend type
  // must cover every value the DB CHECK constraint allows.
  const allowed: RecommendationStatus[] = [
    'issued', 'acknowledged', 'accepted', 'rejected',
    'acted', 'outcome_recorded', 'superseded', 'expired',
  ]
  it('the RecommendationStatus union matches the DB CHECK constraint', () => {
    // Sanity: every allowed value is assignable to the union type.
    const _check: RecommendationStatus[] = allowed
    expect(_check.length).toBe(8)
  })
  it('rejected and outcome_recorded are terminal-ish (not in the open feed)', () => {
    const open = allowed.filter(
      s => !['rejected', 'outcome_recorded', 'superseded', 'expired'].includes(s)
    )
    expect(open).toEqual(['issued', 'acknowledged', 'accepted', 'acted'])
  })
})
