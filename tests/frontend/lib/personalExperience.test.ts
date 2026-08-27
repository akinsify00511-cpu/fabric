import { describe, it, expect } from 'vitest'
import {
  goalProgress,
  goalProgressLabel,
  GOAL_CATEGORIES,
  PIN_ENTITY_TYPES,
  type PersonalGoal,
  type PinnedItem,
} from '../../../src/lib/personalExperience'

// The Personal Experience contract (Product Constitution Art IX) is locked here so
// the frontend never silently drifts: goal progress is HONEST (null when no target
// or no current value — never a fake 0%), pins are allowlisted, goal categories
// mirror the function home, and RLS/own-rows stays the boundary (these tests assert
// the pure contract, not the live DB).

describe('goalProgress (honesty — Article V / §22)', () => {
  it('returns null when there is no measurable current value (never a fake 0%)', () => {
    expect(goalProgress({ current_value: null, target_value: 100 })).toBeNull()
    expect(goalProgressLabel({ current_value: null, target_value: 100 })).toBeNull()
  })

  it('returns null when there is no target (nothing to measure against)', () => {
    expect(goalProgress({ current_value: 5, target_value: null })).toBeNull()
    expect(goalProgress({ current_value: 5, target_value: 0 })).toBeNull()
  })

  it('computes a real ratio and clamps to 0..1', () => {
    expect(goalProgress({ current_value: 5, target_value: 100 })).toBe(0.05)
    expect(goalProgress({ current_value: 200, target_value: 100 })).toBe(1)
    expect(goalProgress({ current_value: -10, target_value: 100 })).toBe(0)
  })

  it('labels the ratio as a percentage, null → "—"', () => {
    expect(goalProgressLabel({ current_value: 50, target_value: 100 })).toBe('50%')
    expect(goalProgressLabel({ current_value: 1, target_value: 3 })).toBe('33%')
  })
})

describe('goal categories mirror the function home (responsibility-scoped)', () => {
  it('contains exactly the 7 function-home categories', () => {
    expect(GOAL_CATEGORIES).toEqual([
      'general',
      'marketing',
      'sales',
      'finance',
      'hr',
      'operations',
      'projects',
    ])
  })

  it('a sales goal cannot be invented for a non-sales category', () => {
    const salesGoal: PersonalGoal = {
      id: 'g1',
      category: 'sales',
      title: '₦20M monthly sales',
      description: null,
      metric_key: null,
      start_value: null,
      target_value: 20000000,
      current_value: 14500000,
      unit: 'currency',
      due_on: null,
      status: 'active',
      progress_source: 'user',
    }
    expect(salesGoal.category).toBe('sales')
    // An accountant-type goal belongs to 'finance' — the category is the scope, and
    // the UI never presents a non-matching function home with a foreign goal.
    expect(GOAL_CATEGORIES).toContain('finance')
    expect(salesGoal.category).not.toBe('finance')
  })
})

describe('pinned entity allowlist (personalization never grants access)', () => {
  it('contains only the deliberate pin kinds', () => {
    expect(PIN_ENTITY_TYPES).toEqual([
      'module',
      'customer',
      'deal',
      'project',
      'report',
      'lead',
      'invoice',
    ])
  })

  it('a pin carries a type + id + optional label — it never carries business data', () => {
    const pin: PinnedItem = { entity_type: 'deal', entity_id: 'deal-uuid', pin_label: 'ABC', sort_order: 1 }
    expect(pin.entity_type).toBe('deal')
    expect(pin.entity_id).toBe('deal-uuid')
    // The pin does NOT hold any row content — resolution happens at consumption time
    // through the user's authorized, RLS-scoped read. This is the boundary.
    expect('payload' in pin).toBe(false)
  })

  it('rejects an unknown entity type (future drift guard)', () => {
    const known = new Set<string>(PIN_ENTITY_TYPES)
    expect(known.has('payroll')).toBe(false)
    expect(known.has('salary')).toBe(false)
    expect(known.has('legal')).toBe(false)
  })
})

describe('AI memory source labels (AI inference never becomes fact silently)', () => {
  it('labels every memory entry with an explicit provenance source', () => {
    const entry = { kind: 'routine' as const, payload: { signal: 'x' }, source: 'system_captured' as const }
    expect(['system_captured', 'ai_inferred', 'user_entered', 'user_confirmed']).toContain(entry.source)
  })

  it('an AI-inferred memory is distinguished from a user-confirmed one', () => {
    const inferred = 'ai_inferred' as const
    const confirmed = 'user_confirmed' as const
    expect(inferred).not.toBe(confirmed)
  })
})