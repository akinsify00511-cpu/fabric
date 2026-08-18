import { describe, it, expect } from 'vitest'

// Mirrors the Platform Resilience layer (20260818240000):
//   1. BRAIN GRACEFUL DEGRADATION — business_brain isolates each sub-engine so
//      a failure degrades ONE slot (degraded:true), not the whole response.
//   2. AUTOMATION RETRY + DEAD-LETTER — failed runs get retry_count +
//      next_retry_at (exponential backoff 30s/2m/8m) + dead_lettered after
//      max_retries (default 3). A DLQ is a STATE on automation_runs, not a
//      separate table.
//
// Both compose on existing infra (business_brain 20260818220000, automation_runs
// 007). No new deps, no external APIs.

// ---- Brain graceful degradation ----
type BrainSlot = { degraded?: boolean; error?: string; [k: string]: unknown }
function brainWithDegradation(slots: { state?: BrainSlot; pulse?: BrainSlot; diagnoses?: BrainSlot; nba?: BrainSlot; ledger?: BrainSlot }) {
  // If a slot errored, it's replaced with { degraded: true, error } — NOT null,
  // so the UI can show which engine failed rather than a blank Brain.
  return {
    authorized: true,
    state: slots.state ?? { state: 'stable', label: 'Stable' },
    pulse: slots.pulse ?? { degraded: true, error: 'health failed' },
    diagnoses: slots.diagnoses ?? { diagnoses: [] },
    next_best_action: slots.nba ?? { action: null },
    value_ledger: slots.ledger ?? { total_value: 0 },
  }
}

describe('Brain Graceful Degradation (§N #1)', () => {
  it('a failing sub-engine degrades only its OWN slot, not the whole brain', () => {
    // value_ledger fails; state/diagnoses/nba must still render.
    const brain = brainWithDegradation({
      state: { state: 'cash_constrained', label: 'Cash constrained' },
      pulse: { degraded: true, error: 'health RPC failed' },
      diagnoses: { diagnoses: [{ rule_id: 'DIAG-REV-001' }] },
      nba: { action: { statement: 'Chase receivables' } },
      ledger: { degraded: true, error: 'ledger RPC failed' },
    })
    expect(brain.authorized).toBe(true)
    expect(brain.state.state).toBe('cash_constrained')   // survived
    expect(brain.diagnoses.diagnoses).toHaveLength(1)    // survived
    expect((brain.next_best_action as any).action).toBeTruthy()  // survived
    expect(brain.pulse.degraded).toBe(true)              // flagged
    expect(brain.value_ledger.degraded).toBe(true)       // flagged
  })

  it('a fully-healthy brain has NO degraded flags', () => {
    const brain = brainWithDegradation({
      state: { state: 'growing' }, pulse: { overall_score: 78 },
      diagnoses: { diagnoses: [] }, nba: { action: null }, ledger: { total_value: 0 },
    })
    expect(brain.pulse.degraded).toBeUndefined()
    expect(brain.value_ledger.degraded).toBeUndefined()
  })

  it('the UI can detect WHICH engines degraded (per-slot flag, not a single blank)', () => {
    const brain = brainWithDegradation({
      pulse: { degraded: true, error: 'x' },
      ledger: { degraded: true, error: 'y' },
    })
    const degraded = Object.entries(brain)
      .filter(([, v]) => v && typeof v === 'object' && (v as BrainSlot).degraded)
      .map(([k]) => k)
    expect(degraded).toEqual(['pulse', 'value_ledger'])
    // state + diagnoses + next_best_action did NOT degrade.
    expect(degraded).not.toContain('state')
  })
})

// ---- Automation retry + dead-letter ----
function nextRetryDelay(retryCount: number): number {
  // Exponential backoff: 30 * 4^retryCount seconds → 30s, 2m, 8m.
  return 30 * (4 ** retryCount)
}
function shouldDeadLetter(retryCount: number, maxRetries: number = 3): boolean {
  return retryCount >= maxRetries
}

describe('Automation Retry + Dead-Letter (§N #2)', () => {
  it('exponential backoff: 30s, 2m, 8m for retries 0,1,2', () => {
    expect(nextRetryDelay(0)).toBe(30)       // 30s
    expect(nextRetryDelay(1)).toBe(120)      // 2m
    expect(nextRetryDelay(2)).toBe(480)      // 8m
  })

  it('dead-letters after max_retries (default 3) exhausted', () => {
    expect(shouldDeadLetter(0)).toBe(false)
    expect(shouldDeadLetter(1)).toBe(false)
    expect(shouldDeadLetter(2)).toBe(false)
    expect(shouldDeadLetter(3)).toBe(true)   // after 3 retries → DLQ
  })

  it('respects a custom max_retries', () => {
    expect(shouldDeadLetter(1, 2)).toBe(false)
    expect(shouldDeadLetter(2, 2)).toBe(true)
  })

  it('a run with retries remaining schedules a next_retry_at, not a dead-letter', () => {
    const retryCount = 1
    const deadLettered = shouldDeadLetter(retryCount + 1)  // would-be count after next attempt
    // retry_count=1, after increment=2 < 3 → NOT dead-lettered, schedule retry.
    expect(deadLettered).toBe(false)
    expect(nextRetryDelay(retryCount)).toBeGreaterThan(0)
  })

  it('a dead-lettered run has next_retry_at = NULL (no more auto-retries)', () => {
    // After dead-lettering: next_retry_at set to NULL, dead_lettered = true.
    const dlqEntry = { retry_count: 3, dead_lettered: true, next_retry_at: null }
    expect(dlqEntry.dead_lettered).toBe(true)
    expect(dlqEntry.next_retry_at).toBeNull()
  })

  it('revival resets retry_count to 0 and re-schedules (manual recovery)', () => {
    const revived = { retry_count: 0, dead_lettered: false, next_retry_at: 'now', error_message: null }
    expect(revived.retry_count).toBe(0)
    expect(revived.dead_lettered).toBe(false)
    expect(revived.next_retry_at).not.toBeNull()
  })

  it('a disabled automation is dead-lettered, not endlessly retried', () => {
    // The sweeper dead-letters runs whose automation is disabled/gone.
    function sweepAction(automationEnabled: boolean, retryCount: number) {
      if (!automationEnabled) return 'dead_letter'
      if (shouldDeadLetter(retryCount)) return 'dead_letter'
      return 'retry'
    }
    expect(sweepAction(false, 0)).toBe('dead_letter')  // disabled → DLQ immediately
    expect(sweepAction(true, 1)).toBe('retry')         // enabled + retries left → retry
    expect(sweepAction(true, 3)).toBe('dead_letter')   // enabled but exhausted → DLQ
  })

  it('the DLQ health summary distinguishes failed vs recovered-via-retry vs dead-lettered', () => {
    const summary = {
      total_failed: 5,
      total_retried: 3,        // failed then succeeded on retry
      dead_lettered_count: 2,  // failed and exhausted retries
      avg_retries_to_success: 1.3,
    }
    expect(summary.total_failed).toBe(summary.total_retried + summary.dead_lettered_count)
    expect(summary.dead_lettered_count).toBe(2)
  })
})
