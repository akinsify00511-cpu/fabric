import { describe, it, expect } from 'vitest'
import { formatNaira } from '../../../src/lib/businessOS'

// The feature_discovery RPC (migration 20260818190000) ordering + estimate
// contract is mirrored here. The rules:
//   - A module is suggested only if the business is ENTITLED to it (current
//     plan tier >= module min_plan_tier) AND has NOT meaningfully used it
//     (not in feature_activation with reuse_label in reused/returning/activated;
//     view_only counts as unexplored).
//   - value_estimate is computed from the business's REAL data via the per-
//     module value_estimate_sql (§22 — never fabricated). NULL estimate is
//     fine (the module has no computable estimate, just the headline).
//   - Ordering: suggestions with a non-zero estimate FIRST (desc by value),
//     then the rest by display_order. Highest-impact unexplored tool surfaces
//     first — the directive's intent ("Inventory could help you find ₦X").

type Suggestion = {
  module_key: string
  value_estimate: number | null
  display_order: number
}

function orderSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => {
    const aHas = a.value_estimate != null && a.value_estimate > 0 ? 0 : 1
    const bHas = b.value_estimate != null && b.value_estimate > 0 ? 0 : 1
    if (aHas !== bHas) return aHas - bHas
    if (aHas === 0) return (b.value_estimate! - a.value_estimate!)
    return a.display_order - b.display_order
  })
}

describe('feature_discovery — P0 #13 autonomous trial experience', () => {
  it('surfaces the highest-impact unexplored tool first (non-zero estimate desc)', () => {
    const suggestions = orderSuggestions([
      { module_key: 'tasks', value_estimate: 0, display_order: 50 },
      { module_key: 'inventory', value_estimate: 125000, display_order: 10 },
      { module_key: 'finance', value_estimate: 45000, display_order: 20 },
      { module_key: 'approvals', value_estimate: null, display_order: 70 },
    ])
    expect(suggestions[0].module_key).toBe('inventory') // highest value
    expect(suggestions[1].module_key).toBe('finance')
    // tasks (0 estimate) and approvals (null) come after, by display_order
    expect(suggestions[2].module_key).toBe('tasks') // display_order 50 < 70
    expect(suggestions[3].module_key).toBe('approvals')
  })

  it('treats null and zero estimates identically (both go after non-zero)', () => {
    const suggestions = orderSuggestions([
      { module_key: 'a', value_estimate: null, display_order: 5 },
      { module_key: 'b', value_estimate: 0, display_order: 10 },
      { module_key: 'c', value_estimate: 1000, display_order: 100 },
    ])
    expect(suggestions[0].module_key).toBe('c') // only non-zero
    // null (order 5) before zero (order 10) among the no-estimate group
    expect(suggestions[1].module_key).toBe('a')
    expect(suggestions[2].module_key).toBe('b')
  })

  it('when all estimates are null, falls back to display_order', () => {
    const suggestions = orderSuggestions([
      { module_key: 'reports', value_estimate: null, display_order: 80 },
      { module_key: 'approvals', value_estimate: null, display_order: 70 },
      { module_key: 'tasks', value_estimate: null, display_order: 50 },
    ])
    expect(suggestions.map(s => s.module_key)).toEqual(['tasks', 'approvals', 'reports'])
  })

  it('a module with a real value estimate is never shown as zero (§22)', () => {
    // The estimate comes from a real query against the business's data — if
    // the query returns 0, the UI hides the estimate line (formatNaira returns
    // '' for 0/null). This is the anti-fabrication contract: we never show a
    // made-up "₦0" or a placeholder.
    expect(formatNaira(0)).toBe('')
    expect(formatNaira(null)).toBe('')
    expect(formatNaira(45000)).toBe('₦45,000')
    expect(formatNaira(1250000)).toBe('₦1,250,000')
  })
})

describe('formatNaira', () => {
  it('formats thousands with commas', () => {
    expect(formatNaira(1)).toBe('₦1')
    expect(formatNaira(1500)).toBe('₦1,500')
    expect(formatNaira(380000)).toBe('₦380,000')
  })

  it('rounds decimals (the estimate is a SUM, may be fractional)', () => {
    expect(formatNaira(45999.6)).toBe('₦46,000')
  })
})
