import { describe, it, expect } from 'vitest'

// Mirrors the Business Value Ledger (business_value_ledger, migration
// 20260818220000). Aggregates the recommendation -> action -> outcome loop
// into "Avenize helped recover ₦X / saved ₦X / generated ₦X."
//
// §22 contract: value is ONLY from REAL recorded outcomes (status =
// outcome_recorded + actual_impact.amount). NEVER fabricated. When no
// outcomes exist, total_value = 0 + an honest note.

type Claim = {
  rule_id: string
  status: string
  actual_amount: number
  expected_amount: number
}

function categorize(ruleId: string): 'recovered' | 'saved' | 'generated' {
  if (ruleId.startsWith('FIN-AR') || ruleId.startsWith('FIN-CF')) return 'recovered'
  if (ruleId.startsWith('SAL') || ruleId.startsWith('CUST')) return 'generated'
  if (ruleId.startsWith('INV') || ruleId.startsWith('OPS') || ruleId.startsWith('DQ')) return 'saved'
  return 'generated'
}

function aggregate(claims: Claim[]) {
  let recovered = 0, saved = 0, generated = 0, identified = 0
  let acted = 0, outcomes = 0, successful = 0
  for (const c of claims) {
    if (['accepted', 'acted', 'outcome_recorded'].includes(c.status)) {
      acted += 1
      identified += c.expected_amount
    }
    if (c.status === 'outcome_recorded' && c.actual_amount > 0) {
      outcomes += 1
      successful += 1
      const kind = categorize(c.rule_id)
      if (kind === 'recovered') recovered += c.actual_amount
      else if (kind === 'saved') saved += c.actual_amount
      else generated += c.actual_amount
    }
  }
  return {
    total_value: recovered + saved + generated,
    recovered, saved, generated, identified,
    recommendations_acted: acted,
    outcomes_recorded: outcomes,
    successful_outcomes: successful,
    note: outcomes === 0 ? 'No outcomes recorded yet. As you act on recommendations and record what happened, Avenize will total the value it has created here.' : null,
  }
}

describe('Business Value Ledger — P0 #9 business_value_ledger', () => {
  it('total_value is 0 when no outcomes recorded (never fabricated)', () => {
    const r = aggregate([])
    expect(r.total_value).toBe(0)
    expect(r.note).not.toBeNull() // honest empty state
  })

  it('total_value is 0 for accepted-but-not-outcome-recorded actions (no actual impact yet)', () => {
    const r = aggregate([
      { rule_id: 'FIN-AR-001', status: 'accepted', actual_amount: 0, expected_amount: 100000 },
    ])
    expect(r.total_value).toBe(0)
    expect(r.identified).toBe(100000) // expected, not actual
    expect(r.recommendations_acted).toBe(1)
    expect(r.outcomes_recorded).toBe(0)
  })

  it('a recovered outcome (FIN-AR) counts toward recovered', () => {
    const r = aggregate([
      { rule_id: 'FIN-AR-001', status: 'outcome_recorded', actual_amount: 75000, expected_amount: 80000 },
    ])
    expect(r.recovered).toBe(75000)
    expect(r.total_value).toBe(75000)
    expect(r.successful_outcomes).toBe(1)
  })

  it('a saved outcome (INV/OPS/DQ) counts toward saved', () => {
    const r = aggregate([
      { rule_id: 'INV-001', status: 'outcome_recorded', actual_amount: 50000, expected_amount: 60000 },
    ])
    expect(r.saved).toBe(50000)
    expect(r.recovered).toBe(0)
    expect(r.generated).toBe(0)
  })

  it('a generated outcome (SAL/CUST) counts toward generated', () => {
    const r = aggregate([
      { rule_id: 'SAL-CONV-001', status: 'outcome_recorded', actual_amount: 200000, expected_amount: 150000 },
    ])
    expect(r.generated).toBe(200000)
  })

  it('total_value sums all categories', () => {
    const r = aggregate([
      { rule_id: 'FIN-AR-001', status: 'outcome_recorded', actual_amount: 75000, expected_amount: 80000 },
      { rule_id: 'INV-001', status: 'outcome_recorded', actual_amount: 50000, expected_amount: 60000 },
      { rule_id: 'SAL-CONV-001', status: 'outcome_recorded', actual_amount: 200000, expected_amount: 150000 },
    ])
    expect(r.total_value).toBe(325000)
    expect(r.recovered).toBe(75000)
    expect(r.saved).toBe(50000)
    expect(r.generated).toBe(200000)
    expect(r.successful_outcomes).toBe(3)
  })

  it('identified = sum of expected across accepted/acted/outcome_recorded', () => {
    const r = aggregate([
      { rule_id: 'FIN-AR-001', status: 'accepted', actual_amount: 0, expected_amount: 100000 },
      { rule_id: 'SAL-CONV-001', status: 'acted', actual_amount: 0, expected_amount: 150000 },
      { rule_id: 'INV-001', status: 'outcome_recorded', actual_amount: 50000, expected_amount: 60000 },
    ])
    expect(r.identified).toBe(310000) // 100k + 150k + 60k
    expect(r.recommendations_acted).toBe(3)
    expect(r.total_value).toBe(50000) // only the recorded outcome
  })

  it('a zero-actual-amount outcome is not counted as value (no fabrication)', () => {
    const r = aggregate([
      { rule_id: 'FIN-AR-001', status: 'outcome_recorded', actual_amount: 0, expected_amount: 80000 },
    ])
    expect(r.total_value).toBe(0)
    expect(r.outcomes_recorded).toBe(0) // the actual_amount <= 0 guard
  })
})
