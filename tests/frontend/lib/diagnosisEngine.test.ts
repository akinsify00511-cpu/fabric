import { describe, it, expect } from 'vitest'

// Mirrors the Diagnosis Engine (diagnose_business, migration 20260818220000).
// A diagnosis fires when: the symptom moved significantly in the declared
// direction (>= trigger_threshold) AND the cause moved in its declared
// direction (the correlation). Impact = symptom's monthly exposure
// (current_value * |change%|).
//
// Evidence labelling (§20/§22): the SYMPTOM is a FACT (measured); the CAUSAL
// LINK is an INFERENCE (correlation, not proven causation).

type Metric = { metric_key: string; current_value: number | null; change_percent: number | null }
type Rule = {
  rule_id: string
  symptom_metric: string
  symptom_direction: 'up' | 'down'
  cause_metric: string
  cause_direction: 'up' | 'down'
  trigger_threshold_pct: number
  impact_method: string
  impact_metric?: string
}

function evaluateRule(rule: Rule, metrics: Metric[]) {
  const symptom = metrics.find(m => m.metric_key === rule.symptom_metric)
  const cause = metrics.find(m => m.metric_key === rule.cause_metric)
  if (!symptom || !cause) return null
  if (symptom.change_percent == null || cause.change_percent == null) return null

  const symChange = symptom.change_percent
  const causeChange = cause.change_percent

  // Symptom must move significantly in the declared direction.
  if (rule.symptom_direction === 'down' && !(symChange <= -rule.trigger_threshold_pct)) return null
  if (rule.symptom_direction === 'up' && !(symChange >= rule.trigger_threshold_pct)) return null
  // Cause must move in the declared direction (the correlation).
  if (rule.cause_direction === 'down' && !(causeChange < 0)) return null
  if (rule.cause_direction === 'up' && !(causeChange > 0)) return null

  // Impact: symptom_delta = current_value * |change%|.
  let impact: number | null = null
  if (rule.impact_method === 'symptom_delta' && symptom.current_value != null) {
    impact = Math.abs(symptom.current_value * symChange / 100)
  }

  return {
    rule_id: rule.rule_id,
    symptom_change_pct: symChange,
    cause_change_pct: causeChange,
    impact_amount: impact,
    evidence: { symptom: 'FACT', cause_link: 'INFERENCE' },
  }
}

const RULES: Rule[] = [
  { rule_id: 'DIAG-REV-001', symptom_metric: 'revenue', symptom_direction: 'down', cause_metric: 'conversion_rate', cause_direction: 'down', trigger_threshold_pct: 8, impact_method: 'symptom_delta' },
  { rule_id: 'DIAG-CASH-001', symptom_metric: 'cash_balance', symptom_direction: 'down', cause_metric: 'overdue_invoices', cause_direction: 'up', trigger_threshold_pct: 10, impact_method: 'symptom_delta' },
  { rule_id: 'DIAG-PROFIT-001', symptom_metric: 'revenue', symptom_direction: 'up', cause_metric: 'total_expenses', cause_direction: 'up', trigger_threshold_pct: 15, impact_method: 'symptom_delta' },
]

describe('Diagnosis Engine — P0 #6 diagnose_business', () => {
  it('fires when symptom + cause both move in declared directions', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 1000000, change_percent: -8 },
      { metric_key: 'conversion_rate', current_value: 0.15, change_percent: -11 },
    ]
    const result = evaluateRule(RULES[0], metrics)
    expect(result).not.toBeNull()
    expect(result!.rule_id).toBe('DIAG-REV-001')
    expect(result!.symptom_change_pct).toBe(-8)
    expect(result!.cause_change_pct).toBe(-11)
    // Impact = 1,000,000 * 8% = 80,000 monthly exposure.
    expect(result!.impact_amount).toBe(80000)
  })

  it('does NOT fire when symptom moved but cause did not (no correlation)', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 1000000, change_percent: -10 },
      { metric_key: 'conversion_rate', current_value: 0.15, change_percent: 5 }, // up, not down
    ]
    expect(evaluateRule(RULES[0], metrics)).toBeNull()
  })

  it('does NOT fire when symptom move is below the trigger threshold (noise)', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 1000000, change_percent: -3 }, // below 8%
      { metric_key: 'conversion_rate', current_value: 0.15, change_percent: -5 },
    ]
    expect(evaluateRule(RULES[0], metrics)).toBeNull()
  })

  it('does NOT fire when a required metric is missing', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 1000000, change_percent: -10 },
      // conversion_rate absent
    ]
    expect(evaluateRule(RULES[0], metrics)).toBeNull()
  })

  it('impact is NULL when the symptom current_value is null (never fabricated)', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: null, change_percent: -10 },
      { metric_key: 'conversion_rate', current_value: 0.15, change_percent: -12 },
    ]
    const result = evaluateRule(RULES[0], metrics)
    expect(result).not.toBeNull()
    expect(result!.impact_amount).toBeNull() // §22: no fabrication
  })

  it('the symptom is a FACT; the causal link is an INFERENCE (evidence labelling)', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 1000000, change_percent: -8 },
      { metric_key: 'conversion_rate', current_value: 0.15, change_percent: -11 },
    ]
    const result = evaluateRule(RULES[0], metrics)
    expect(result!.evidence.symptom).toBe('FACT')
    expect(result!.evidence.cause_link).toBe('INFERENCE')
  })

  it('cash diagnosis: cash down + overdue up -> critical ₦ exposure', () => {
    const metrics: Metric[] = [
      { metric_key: 'cash_balance', current_value: 500000, change_percent: -15 },
      { metric_key: 'overdue_invoices', current_value: 200000, change_percent: 30 },
    ]
    const result = evaluateRule(RULES[1], metrics)
    expect(result).not.toBeNull()
    expect(result!.impact_amount).toBe(75000) // 500k * 15%
  })

  it('profit-margin erosion: revenue up + expenses up faster -> fires (both up)', () => {
    const metrics: Metric[] = [
      { metric_key: 'revenue', current_value: 2000000, change_percent: 20 },
      { metric_key: 'total_expenses', current_value: 1500000, change_percent: 30 },
    ]
    const result = evaluateRule(RULES[2], metrics)
    expect(result).not.toBeNull()
    expect(result!.symptom_change_pct).toBe(20)
    expect(result!.cause_change_pct).toBe(30)
  })
})
