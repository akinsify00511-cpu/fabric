import { describe, it, expect } from 'vitest'
import { deriveComplexity, COMPLEXITY_LABELS } from '../../../src/lib/useExperienceContext'

// Progressive-complexity derivation (PRD: complexity reveals itself as a
// business adds people and modules). The pure function is the contract every
// screen relies on, so it's locked independently of the live DB.

describe('deriveComplexity', () => {
  it('returns solo for a one-person business regardless of module count', () => {
    expect(deriveComplexity(0, 0)).toBe('solo')
    expect(deriveComplexity(1, 0)).toBe('solo')
    expect(deriveComplexity(1, 12)).toBe('solo')
  })

  it('returns small for 2-10 people with a modest operational surface', () => {
    expect(deriveComplexity(2, 0)).toBe('small')
    expect(deriveComplexity(5, 3)).toBe('small')
    expect(deriveComplexity(10, 7)).toBe('small')
  })

  it('nudges a small headcount up to mid when the operational surface is broad', () => {
    expect(deriveComplexity(5, 8)).toBe('mid')
    expect(deriveComplexity(10, 12)).toBe('mid')
  })

  it('returns mid for 11-50 people', () => {
    expect(deriveComplexity(11, 0)).toBe('mid')
    expect(deriveComplexity(25, 5)).toBe('mid')
    expect(deriveComplexity(50, 20)).toBe('mid')
  })

  it('returns enterprise for >50 people', () => {
    expect(deriveComplexity(51, 0)).toBe('enterprise')
    expect(deriveComplexity(200, 5)).toBe('enterprise')
  })

  it('exposes a human label for every tier', () => {
    expect(COMPLEXITY_LABELS.solo).toBe('Solo')
    expect(COMPLEXITY_LABELS.small).toBe('Small team')
    expect(COMPLEXITY_LABELS.mid).toBe('Mid-size')
    expect(COMPLEXITY_LABELS.enterprise).toBe('Enterprise')
  })
})
