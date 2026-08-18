import { describe, it, expect } from 'vitest'

// Mirrors the Business State Engine (classify_business_state, migration
// 20260818220000). The deterministic classifier — given overall health +
// per-dimension scores + metric MoM trends, classify into one state.
//
// The classifier is PRIORITY-ORDERED: the first matching condition wins.
// at_risk (overall < 40) is checked BEFORE cash/sales/capacity constraints
// because a business scoring < 40 is in trouble regardless of which dimension.

type State = 'at_risk' | 'cash_constrained' | 'sales_constrained' |
  'capacity_constrained' | 'operationally_constrained' | 'stressed' |
  'recovering' | 'growing' | 'scaling' | 'opportunity_rich' | 'stable' |
  'insufficient_data'

function classify(args: {
  overall?: number | null
  fin?: number | null
  sales?: number | null
  ops?: number | null
  people?: number | null
  revenueChange?: number | null
  cashChange?: number | null
  pipelineChange?: number | null
}): State {
  const { overall, fin, sales, ops, people, revenueChange, cashChange, pipelineChange } = args
  if (overall == null) return 'insufficient_data'

  if (overall < 40) return 'at_risk'
  if (fin != null && fin < 50 && cashChange != null && cashChange < 0) return 'cash_constrained'
  if (sales != null && sales < 50 && ((revenueChange != null && revenueChange < 0) || (pipelineChange != null && pipelineChange < 0))) return 'sales_constrained'
  if (((ops != null && ops < 55) || (people != null && people < 55)) && revenueChange != null && revenueChange > 10) return 'capacity_constrained'
  if (ops != null && ops < 50 && (fin == null || fin >= 50)) return 'operationally_constrained'
  if (overall < 56) return 'stressed'
  if (overall < 70 && revenueChange != null && revenueChange > 0) return 'recovering'
  // scaling (>25% growth) checked before growing (>10%) — both >= 70 health.
  if (overall >= 75 && revenueChange != null && revenueChange > 25) return 'scaling'
  if (overall >= 70 && revenueChange != null && revenueChange > 10) return 'growing'
  if (overall >= 70 && pipelineChange != null && pipelineChange > 15) return 'opportunity_rich'
  if (overall >= 70) return 'stable'
  return 'insufficient_data'
}

describe('Business State Engine — P0 #4 classify_business_state', () => {
  it('no health score -> insufficient_data (honest, not a guess)', () => {
    expect(classify({ overall: null })).toBe('insufficient_data')
  })

  it('overall < 40 -> at_risk (highest priority override)', () => {
    // Even with growing revenue, a 30-score business is at risk.
    expect(classify({ overall: 30, revenueChange: 50 })).toBe('at_risk')
  })

  it('weak financial + declining cash -> cash_constrained', () => {
    expect(classify({ overall: 60, fin: 40, cashChange: -15 })).toBe('cash_constrained')
  })

  it('weak sales + declining revenue -> sales_constrained', () => {
    expect(classify({ overall: 60, sales: 40, revenueChange: -12 })).toBe('sales_constrained')
  })

  it('ops/people lagging + revenue growing >10% -> capacity_constrained', () => {
    expect(classify({ overall: 65, ops: 50, revenueChange: 20 })).toBe('capacity_constrained')
    expect(classify({ overall: 65, people: 50, revenueChange: 15 })).toBe('capacity_constrained')
  })

  it('weak ops + healthy finance -> operationally_constrained', () => {
    expect(classify({ overall: 60, ops: 45, fin: 70 })).toBe('operationally_constrained')
  })

  it('overall 40-55 -> stressed', () => {
    expect(classify({ overall: 45 })).toBe('stressed')
    expect(classify({ overall: 50 })).toBe('stressed')
  })

  it('overall 56-69 + revenue rising -> recovering', () => {
    expect(classify({ overall: 60, revenueChange: 5 })).toBe('recovering')
  })

  it('overall >= 70 + revenue >25% -> scaling (checked before growing)', () => {
    expect(classify({ overall: 80, revenueChange: 30 })).toBe('scaling')
  })

  it('overall >= 70 + revenue >10% -> growing', () => {
    expect(classify({ overall: 75, revenueChange: 15 })).toBe('growing')
  })

  it('overall >= 70 + pipeline >15% -> opportunity_rich', () => {
    expect(classify({ overall: 75, revenueChange: 0, pipelineChange: 20 })).toBe('opportunity_rich')
  })

  it('overall >= 70 + no strong growth -> stable', () => {
    expect(classify({ overall: 80, revenueChange: 0 })).toBe('stable')
    expect(classify({ overall: 85 })).toBe('stable')
  })

  it('priority: at_risk beats cash_constrained beats stressed', () => {
    // A 35-score business with declining cash is at_risk, not cash_constrained.
    expect(classify({ overall: 35, fin: 40, cashChange: -20 })).toBe('at_risk')
  })
})
