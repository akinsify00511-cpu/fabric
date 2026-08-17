import { describe, it, expect } from 'vitest'

// Self-instrumentation reuse classification (§29 testing / #14). Mirrors the
// reuse_label contract emitted by the feature_activation SQL RPC so the
// page/surfacing can lock the labels independently of the live DB.

function reuseLabel(params: { distinctActiveDays: number; anyActive: boolean }): string {
  const { distinctActiveDays, anyActive } = params
  if (distinctActiveDays >= 5) return 'reused'
  if (distinctActiveDays >= 2) return 'returning'
  if (anyActive) return 'activated'
  return 'view_only'
}

describe('Feature reuse classification (#14)', () => {
  it('labels a module touched 5+ distinct days as reused', () => {
    expect(reuseLabel({ distinctActiveDays: 5, anyActive: true })).toBe('reused')
    expect(reuseLabel({ distinctActiveDays: 30, anyActive: true })).toBe('reused')
  })
  it('labels a module touched 2-4 distinct days as returning', () => {
    expect(reuseLabel({ distinctActiveDays: 2, anyActive: true })).toBe('returning')
    expect(reuseLabel({ distinctActiveDays: 4, anyActive: true })).toBe('returning')
  })
  it('labels a module touched once as activated (not yet reused)', () => {
    expect(reuseLabel({ distinctActiveDays: 1, anyActive: true })).toBe('activated')
  })
  it('labels a module only ever viewed (no create/update/activate) as view_only', () => {
    expect(reuseLabel({ distinctActiveDays: 0, anyActive: false })).toBe('view_only')
  })
  it('never calls a view-only module activated (honest — a passive view is not feature adoption)', () => {
    expect(reuseLabel({ distinctActiveDays: 0, anyActive: false })).not.toBe('activated')
  })
})

describe('Onboarding abandonment is a FACT, not an inference (#14)', () => {
  // The onboarding_conversion RPC derives abandonment from auth.users → staff
  // gap (an authenticated user with no staff record = abandoned). This is a
  // stronger signal than tab-close guessing (§22). Lock the contract.
  function classifyOnboarding(hasStaff: boolean, hasCompleteEvent: boolean): string {
    if (hasStaff) return 'completed'
    // authenticated but no staff = abandoned (FACT)
    return 'abandoned'
    // hasCompleteEvent alone is not used for abandonment; it's the completion
    // signal. We intentionally ignore it here to assert abandonment = !hasStaff.
  }
  it('a user with a staff record completed onboarding', () => {
    expect(classifyOnboarding(true, true)).toBe('completed')
  })
  it('an authenticated user with no staff record abandoned (FACT)', () => {
    expect(classifyOnboarding(false, false)).toBe('abandoned')
  })
})
