import { describe, it, expect } from 'vitest'

// Mirrors the §7.3 is_approval_required RPC decision logic (migration
// 20260818170000). The rule precedence:
//   1. Business-level bypass_all_approvals → no approval (the sole-proprietor case)
//   2. Sole proprietor (1 active staff) → no approval (can't self-approve)
//   3. Category-level requires_approval=false → no approval
//   4. Category-level auto-approve-below threshold → no approval
//   5. Business-wide auto-approve-below → no approval
//   6. Default → require approval (fail-safe)
// On any error → fail-safe (require approval). §7.3: "never hardcoded globally".

type Config = { bypass_all_approvals: boolean; auto_approve_below: number | null }
type Category = { requires_approval: boolean; auto_approve_below: number | null } | null

function isApprovalRequired(
  config: Config | null,
  staffCount: number,
  amount: number | null,
  category: Category,
): { requires_approval: boolean; reason: string } {
  try {
    // 1. Business-level bypass.
    if (config?.bypass_all_approvals) {
      return { requires_approval: false, reason: 'Business-level bypass enabled (sole proprietor)' }
    }
    // 2. Sole proprietor (1 active staff) — can't self-approve.
    if (staffCount <= 1) {
      return { requires_approval: false, reason: 'Sole proprietor — no second approver available' }
    }
    // 3-4. Category-level config (more specific wins).
    if (category) {
      if (!category.requires_approval) return { requires_approval: false, reason: 'Category requires_approval = false' }
      if (category.auto_approve_below != null && amount != null && amount <= category.auto_approve_below) {
        return { requires_approval: false, reason: 'Below category auto-approve threshold' }
      }
      return { requires_approval: true, reason: 'Category requires approval' }
    }
    // 5. Business-wide floor.
    if (config?.auto_approve_below != null && amount != null && amount <= config.auto_approve_below) {
      return { requires_approval: false, reason: 'Below business-wide auto-approve threshold' }
    }
    // 6. Default — fail-safe require.
    return { requires_approval: true, reason: 'Default requires approval' }
  } catch {
    return { requires_approval: true, reason: 'fail-safe' }
  }
}

describe('is_approval_required — §7.3 configurable per-business thresholds', () => {
  it('bypasses for a sole proprietor (1 active staff) even without the config flag', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: null }, 1, 100000, null)
    expect(r.requires_approval).toBe(false)
    expect(r.reason).toContain('Sole proprietor')
  })

  it('bypasses when the business-level bypass flag is set (50-person business that opted in)', () => {
    const r = isApprovalRequired({ bypass_all_approvals: true, auto_approve_below: null }, 50, 1000000, null)
    expect(r.requires_approval).toBe(false)
    expect(r.reason).toContain('bypass')
  })

  it('requires approval for a team business by default (fail-safe)', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: null }, 10, 100000, null)
    expect(r.requires_approval).toBe(true)
  })

  it('skips approval below the business-wide auto-approve threshold', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: 5000 }, 10, 3000, null)
    expect(r.requires_approval).toBe(false)
    expect(r.reason).toContain('business-wide')
  })

  it('category-level requires_approval=false wins over business default', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: null }, 10, 100000, { requires_approval: false, auto_approve_below: null })
    expect(r.requires_approval).toBe(false)
    expect(r.reason).toContain('Category')
  })

  it('category-level auto-approve-below wins (more specific than business floor)', () => {
    // Business floor is 5000, category threshold is 50000, amount is 10000.
    // Business floor would require approval, but category says below 50000 = no approval.
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: 5000 }, 10, 10000, { requires_approval: true, auto_approve_below: 50000 })
    expect(r.requires_approval).toBe(false)
    expect(r.reason).toContain('category')
  })

  it('requires approval when the category says so and amount exceeds its threshold', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: null }, 10, 60000, { requires_approval: true, auto_approve_below: 50000 })
    expect(r.requires_approval).toBe(true)
  })

  it('never requires approval for a solo founder regardless of amount (the §7.3 promise)', () => {
    const r = isApprovalRequired({ bypass_all_approvals: false, auto_approve_below: null }, 1, 5000000, { requires_approval: true, auto_approve_below: 0 })
    // Sole-proprietor check fires before category — a solo founder needs none.
    expect(r.requires_approval).toBe(false)
  })
})
