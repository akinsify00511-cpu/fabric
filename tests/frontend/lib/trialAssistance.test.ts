import { describe, it, expect } from 'vitest'

// Mirrors the P0 #16 trial_assistance RPC phase-selector (migration
// 20260818210000). The deterministic rules — given trial status + setup
// completeness + paid-modules-used + days-left, select the ONE nudge:
//   1. setup_incomplete      — NOT setup_complete (highest priority: churn risk)
//   2. trial_ending_no_usage — days_left <= 2 AND paid_modules_used < 2
//   3. trial_ending_healthy  — days_left <= 3 (with usage)
//   4. feature_unused        — paid_modules_used == 0 (trial ongoing, setup done)
//   5. trial_midpoint        — days_left <= 5
//   6. healthy               — none of the above (no nudge — don't nag)

type Phase = 'not_in_trial' | 'setup_incomplete' | 'trial_ending_no_usage' |
  'trial_ending_healthy' | 'feature_unused' | 'trial_midpoint' | 'healthy'

function selectPhase(
  inTrial: boolean,
  setupComplete: boolean,
  paidModulesUsed: number,
  daysLeft: number,
): Phase {
  if (!inTrial) return 'not_in_trial'
  if (!setupComplete) return 'setup_incomplete'
  if (daysLeft <= 2 && paidModulesUsed < 2) return 'trial_ending_no_usage'
  if (daysLeft <= 3) return 'trial_ending_healthy'
  if (paidModulesUsed === 0) return 'feature_unused'
  if (daysLeft <= 5) return 'trial_midpoint'
  return 'healthy'
}

describe('trial_assistance — P0 #16 phase selector', () => {
  it('not in trial -> no nudge (a paid user gets nothing from this RPC)', () => {
    expect(selectPhase(false, true, 5, 0)).toBe('not_in_trial')
  })

  it('setup incomplete is highest priority (overrides everything)', () => {
    // Even with 1 day left + no usage, setup_incomplete wins.
    expect(selectPhase(true, false, 0, 1)).toBe('setup_incomplete')
  })

  it('trial ending + no usage -> the highest-risk churn nudge', () => {
    expect(selectPhase(true, true, 1, 2)).toBe('trial_ending_no_usage')
    expect(selectPhase(true, true, 0, 1)).toBe('trial_ending_no_usage')
  })

  it('trial ending + healthy usage -> convert nudge (not the no-usage one)', () => {
    // 2 days left BUT used 3 paid modules -> healthy ending, not no-usage.
    expect(selectPhase(true, true, 3, 2)).toBe('trial_ending_healthy')
    expect(selectPhase(true, true, 2, 3)).toBe('trial_ending_healthy')
  })

  it('feature unused (trial ongoing, setup done, no paid modules) -> discovery nudge', () => {
    // 6 days left (not ending), setup done, 0 paid modules.
    expect(selectPhase(true, true, 0, 6)).toBe('feature_unused')
  })

  it('trial midpoint -> gentle nudge (not over-nagging)', () => {
    // 5 days left, setup done, used 1 paid module.
    expect(selectPhase(true, true, 1, 5)).toBe('trial_midpoint')
  })

  it('healthy trial (plenty of time + usage) -> NO nudge (don\'t nag)', () => {
    // 6 days left, setup done, used 2 paid modules.
    expect(selectPhase(true, true, 2, 6)).toBe('healthy')
    expect(selectPhase(true, true, 5, 7)).toBe('healthy')
  })

  it('priority ordering: setup_incomplete > trial_ending_no_usage > trial_ending_healthy', () => {
    // The same user at different states follows the priority chain.
    expect(selectPhase(true, false, 5, 1)).toBe('setup_incomplete') // setup wins
    expect(selectPhase(true, true, 1, 2)).toBe('trial_ending_no_usage') // then no-usage
    expect(selectPhase(true, true, 3, 2)).toBe('trial_ending_healthy') // then healthy-ending
  })
})
