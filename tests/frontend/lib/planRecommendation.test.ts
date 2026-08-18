import { describe, it, expect } from 'vitest'

// Mirrors the P0 #15 recommend_plan RPC logic (migration
// 20260818180000). The rule:
//   - Compute the MIN plan tier across every module the business ACTUALLY used
//     (the lowest tier that unlocks all their used tools).
//   - Map tier -> plan: 0=Free, 1=Starter, 2=Business, 3=Scale.
//   - should_upgrade = recommended_tier > current_tier.
//   - If they only used free-tier modules (min tier 0): recommend Free, no
//     upgrade, honest "keep exploring" nudge (never a bare "Upgrade now").
//   - Evidence lines cite REAL usage (reuse_label + distinct_active_days) —
//     never fabricated (§22).

type Activation = { module_key: string; distinct_active_days: number; reuse_label: string }
type TierMap = Record<string, number> // module_key -> min_plan_tier

const PLAN_FOR_TIER: Record<number, { plan: string; name: string; price: string }> = {
  0: { plan: 'free', name: 'Free', price: '₦0' },
  1: { plan: 'starter', name: 'Starter', price: '₦15,000/mo' },
  2: { plan: 'business', name: 'Business', price: '₦112,000/mo' },
  3: { plan: 'scale', name: 'Scale', price: '₦380,000/mo' },
}

function recommendPlan(
  activations: Activation[],
  tierMap: TierMap,
  currentPlan: string,
): {
  recommended_plan_name: string
  recommended_tier: number
  should_upgrade: boolean
  modules_used_count: number
  modules_requiring_higher_count: number
} {
  const currentTier: Record<string, number> = {
    free: 0, starter: 1, team: 2, growth: 2, professional: 2, pro: 2, business: 2, scale: 3, enterprise: 3,
  }
  const cTier = currentTier[currentPlan] ?? 0
  let minTier = 0
  let modulesRequiringHigher = 0
  for (const a of activations) {
    const needed = tierMap[a.module_key] ?? 0
    if (needed > minTier) minTier = needed
    if (needed > cTier) modulesRequiringHigher++
  }
  const rec = PLAN_FOR_TIER[minTier]
  return {
    recommended_plan_name: rec.name,
    recommended_tier: minTier,
    should_upgrade: minTier > cTier,
    modules_used_count: activations.length,
    modules_requiring_higher_count: modulesRequiringHigher,
  }
}

describe('recommend_plan — P0 #15 AI plan recommendation', () => {
  const TIERS: TierMap = {
    dashboard: 0, crm: 0, tasks: 0, people: 0,
    finance: 1, invoices: 1,
    projects: 2, inventory: 2, automations: 2,
    api: 3, sso: 3,
  }

  it('recommends Free when only free-tier modules were used (no upsell)', () => {
    const r = recommendPlan(
      [{ module_key: 'crm', distinct_active_days: 5, reuse_label: 'reused' },
       { module_key: 'tasks', distinct_active_days: 3, reuse_label: 'returning' }],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Free')
    expect(r.should_upgrade).toBe(false)
    expect(r.modules_used_count).toBe(2)
    expect(r.modules_requiring_higher_count).toBe(0)
  })

  it('recommends Starter when a tier-1 module (finance) was used', () => {
    const r = recommendPlan(
      [{ module_key: 'crm', distinct_active_days: 4, reuse_label: 'reused' },
       { module_key: 'finance', distinct_active_days: 2, reuse_label: 'returning' }],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Starter')
    expect(r.should_upgrade).toBe(true)
    expect(r.modules_requiring_higher_count).toBe(1)
  })

  it('recommends Business when a tier-2 module (projects) was used', () => {
    const r = recommendPlan(
      [{ module_key: 'projects', distinct_active_days: 6, reuse_label: 'reused' }],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Business')
    expect(r.should_upgrade).toBe(true)
  })

  it('recommends Scale when a tier-3 module (api) was used', () => {
    const r = recommendPlan(
      [{ module_key: 'api', distinct_active_days: 2, reuse_label: 'returning' }],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Scale')
    expect(r.should_upgrade).toBe(true)
  })

  it('recommends the HIGHEST needed tier across mixed usage (anti-churn)', () => {
    // Used crm (free), finance (1), projects (2), api (3) -> Scale.
    const r = recommendPlan(
      [
        { module_key: 'crm', distinct_active_days: 1, reuse_label: 'activated' },
        { module_key: 'finance', distinct_active_days: 2, reuse_label: 'returning' },
        { module_key: 'projects', distinct_active_days: 3, reuse_label: 'reused' },
        { module_key: 'api', distinct_active_days: 1, reuse_label: 'activated' },
      ],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Scale')
    expect(r.modules_requiring_higher_count).toBe(3) // finance, projects, api
  })

  it('does NOT recommend upgrade when current plan already covers all used modules', () => {
    // On Business (tier 2), used crm + projects (both <= tier 2).
    const r = recommendPlan(
      [{ module_key: 'crm', distinct_active_days: 5, reuse_label: 'reused' },
       { module_key: 'projects', distinct_active_days: 4, reuse_label: 'reused' }],
      TIERS, 'business',
    )
    expect(r.recommended_plan_name).toBe('Business')
    expect(r.should_upgrade).toBe(false)
  })

  it('recommends the MINIMUM tier, never upsells beyond usage (anti-gouging)', () => {
    // Used only free modules but is on free plan -> Free, not Starter.
    const r = recommendPlan(
      [{ module_key: 'dashboard', distinct_active_days: 7, reuse_label: 'reused' }],
      TIERS, 'free',
    )
    expect(r.recommended_tier).toBe(0)
    expect(r.should_upgrade).toBe(false)
  })

  it('treats unknown modules as free-tier (safe default, no false upgrade)', () => {
    const r = recommendPlan(
      [{ module_key: 'mystery_module', distinct_active_days: 2, reuse_label: 'returning' }],
      TIERS, 'free',
    )
    expect(r.recommended_plan_name).toBe('Free')
    expect(r.should_upgrade).toBe(false)
  })
})
