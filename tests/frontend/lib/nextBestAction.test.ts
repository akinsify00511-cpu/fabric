import { describe, it, expect } from 'vitest'

// Mirrors the Next Best Action engine (next_best_action, migration
// 20260818220000). The score = impact × urgency × probability / effort + state_bonus.
// Returns the SINGLE top action (the directive: don't overwhelm).

type Action = {
  rule_id?: string
  severity: string
  expected_amount: number
  action_type: string
  outcome_recorded: number
  success_count: number
}

function scoreAction(a: Action, businessState: string | null): number {
  // Severity -> urgency.
  const urgency = a.severity === 'critical' ? 1.0 : a.severity === 'warning' ? 0.6 : 0.3
  // Impact: log scale (so ₦10M doesn't drown ₦50k).
  const impact = a.expected_amount > 0 ? Math.log10(a.expected_amount + 10) : 0
  // Probability: historical success rate, default 0.5.
  const prob = a.outcome_recorded > 0
    ? a.success_count / a.outcome_recorded
    : 0.5
  // Effort heuristic.
  const effort = a.action_type === 'create_task' ? 1.0
    : a.action_type === 'create_po' ? 2.0
    : a.action_type === 'route_approval' ? 1.5
    : a.action_type === 'send_reminder' ? 0.5
    : 1.0
  // State relevance bonus.
  let bonus = 0
  if (businessState === 'cash_constrained' && a.rule_id?.startsWith('FIN-AR')) bonus = 0.3
  if (businessState === 'sales_constrained' && a.rule_id?.startsWith('SAL')) bonus = 0.3
  if (businessState === 'capacity_constrained' && a.rule_id?.startsWith('OPS')) bonus = 0.3
  return (impact * urgency * prob / effort) + bonus
}

function pickBest(actions: Action[], businessState: string | null): Action | null {
  if (actions.length === 0) return null
  let best: Action | null = null
  let bestScore = -1
  for (const a of actions) {
    const s = scoreAction(a, businessState)
    if (s > bestScore) { bestScore = s; best = a }
  }
  return best
}

describe('Next Best Action — P0 #7 next_best_action', () => {
  it('returns the single highest-scoring action', () => {
    const actions: Action[] = [
      { rule_id: 'A', severity: 'warning', expected_amount: 50000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 },
      { rule_id: 'B', severity: 'critical', expected_amount: 500000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 },
    ]
    const best = pickBest(actions, null)
    expect(best?.rule_id).toBe('B') // critical + higher impact
  })

  it('returns null when there are no open actions (don\'t overwhelm with nothing)', () => {
    expect(pickBest([], null)).toBeNull()
  })

  it('state relevance bonus boosts actions matching the business state', () => {
    const actions: Action[] = [
      // A cash-related rule (FIN-AR) vs a sales rule (SAL), both otherwise equal.
      { rule_id: 'FIN-AR-001', severity: 'critical', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 },
      { rule_id: 'SAL-CONV-001', severity: 'critical', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 },
    ]
    // When cash-constrained, the FIN-AR action should win (state bonus).
    expect(pickBest(actions, 'cash_constrained')?.rule_id).toBe('FIN-AR-001')
    // When sales-constrained, the SAL action should win.
    expect(pickBest(actions, 'sales_constrained')?.rule_id).toBe('SAL-CONV-001')
  })

  it('log-scale impact: a ₦10M action doesn\'t completely drown a ₦50k one (equal effort)', () => {
    // Same effort (create_task) so only the impact log-scale differs.
    const big = scoreAction({ rule_id: 'X', severity: 'warning', expected_amount: 10_000_000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 }, null)
    const small = scoreAction({ rule_id: 'Y', severity: 'warning', expected_amount: 50_000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 }, null)
    // The big one scores higher, but not 200x higher (log scale).
    expect(big).toBeGreaterThan(small)
    expect(big / small).toBeLessThan(20) // not 200x — the log scale compresses
  })

  it('probability of success: a rule with 0% historical success scores lower', () => {
    const unproven = scoreAction({ rule_id: 'Z', severity: 'warning', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 }, null)
    const alwaysFails = scoreAction({ rule_id: 'Z', severity: 'warning', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 10, success_count: 0 }, null)
    // 0% success halves the score vs the 0.5 default.
    expect(alwaysFails).toBeLessThan(unproven)
  })

  it('effort: a low-effort reminder outscores a high-effort PO at equal impact', () => {
    const reminder = scoreAction({ rule_id: 'R', severity: 'warning', expected_amount: 100000, action_type: 'send_reminder', outcome_recorded: 0, success_count: 0 }, null)
    const po = scoreAction({ rule_id: 'P', severity: 'warning', expected_amount: 100000, action_type: 'create_po', outcome_recorded: 0, success_count: 0 }, null)
    expect(reminder).toBeGreaterThan(po) // effort 0.5 vs 2.0
  })

  it('critical severity outranks info at equal impact+effort', () => {
    const critical = scoreAction({ rule_id: 'C', severity: 'critical', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 }, null)
    const info = scoreAction({ rule_id: 'I', severity: 'info', expected_amount: 100000, action_type: 'create_task', outcome_recorded: 0, success_count: 0 }, null)
    expect(critical).toBeGreaterThan(info)
  })
})
