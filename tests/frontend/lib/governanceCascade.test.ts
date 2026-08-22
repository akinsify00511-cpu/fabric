import { describe, it, expect } from 'vitest'
import {
  deriveResolutionOutcome,
  deriveCascadeStatus,
  gapStatusTone,
  gapConstraintLabel,
  generateBoardPackHtml,
  BOARD_REPORT_EXCLUSIONS,
  COMMITTEE_TYPES,
  committeeTypeLabel,
  RESOLUTION_TYPE_LABELS,
  CASCADE_STATUS_LABELS,
} from '../../../src/lib/governance'

describe('governance — resolution vote outcomes', () => {
  it('ordinary passes with simple majority (for > against)', () => {
    expect(deriveResolutionOutcome('ordinary', 4, 1)).toBe('approved')
    expect(deriveResolutionOutcome('ordinary', 1, 4)).toBe('rejected')
  })
  it('ordinary rejects on a tie (not a majority)', () => {
    expect(deriveResolutionOutcome('ordinary', 2, 2)).toBe('rejected')
  })
  it('special requires two-thirds of cast votes', () => {
    expect(deriveResolutionOutcome('special', 6, 3)).toBe('approved') // 6 >= ceil(9*2/3)=6
    expect(deriveResolutionOutcome('special', 5, 4)).toBe('rejected') // 5 < 6
    expect(deriveResolutionOutcome('special', 2, 1)).toBe('approved') // 2 >= ceil(3*2/3)=2
  })
  it('special rejects when nobody voted (zero cast)', () => {
    expect(deriveResolutionOutcome('special', 0, 0)).toBe('rejected')
  })
})

describe('governance — cascade status (progress vs elapsed period)', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  it('unknown when progress is null (honest — never fabricate)', () => {
    expect(deriveCascadeStatus(null, '2026-01-01', '2026-12-31', now)).toBe('unknown')
  })
  it('unknown when the period is not set (no fabricated status)', () => {
    expect(deriveCascadeStatus(50, null, null, now)).toBe('unknown')
    expect(deriveCascadeStatus(50, '2026-01-01', undefined, now)).toBe('unknown')
  })
  it('unknown on an invalid period (end not after start)', () => {
    expect(deriveCascadeStatus(50, '2026-12-31', '2026-01-01', now)).toBe('unknown')
  })
  it('at_risk when progress trails elapsed time by more than the grace window', () => {
    // Mid-year (~46% elapsed), 20% progress → 20 + 15 < 46 → at_risk
    expect(deriveCascadeStatus(20, '2026-01-01', '2027-01-01', now)).toBe('at_risk')
  })
  it('on_track when progress keeps pace with elapsed time', () => {
    expect(deriveCascadeStatus(50, '2026-01-01', '2027-01-01', now)).toBe('on_track')
  })
  it('on_track inside the 15-point grace window', () => {
    // ~46% elapsed, 40% progress → 40 + 15 >= 46 → on_track
    expect(deriveCascadeStatus(40, '2026-01-01', '2027-01-01', now)).toBe('on_track')
  })
  it('before the period starts anything is on_track (elapsed 0)', () => {
    const early = new Date('2025-12-01T00:00:00Z')
    expect(deriveCascadeStatus(0, '2026-01-01', '2027-01-01', early)).toBe('on_track')
  })
  it('after the period ends low progress is at_risk (elapsed 100)', () => {
    const late = new Date('2027-06-01T00:00:00Z')
    expect(deriveCascadeStatus(80, '2026-01-01', '2027-01-01', late)).toBe('at_risk')
  })
})

describe('governance — board report visibility boundary (§contextual)', () => {
  it('excludes salaries, payroll, and PII domains by construction', () => {
    expect(BOARD_REPORT_EXCLUSIONS).toContain('payroll')
    expect(BOARD_REPORT_EXCLUSIONS).toContain('salary')
    expect(BOARD_REPORT_EXCLUSIONS).toContain('employee_pii')
    expect(BOARD_REPORT_EXCLUSIONS).toContain('customer_pii')
    expect(BOARD_REPORT_EXCLUSIONS).toContain('operational_row_detail')
  })
  it('the exclusion list is stable (a contract — do not silently widen scope)', () => {
    expect(BOARD_REPORT_EXCLUSIONS.length).toBe(6)
  })
})

describe('governance — committee types', () => {
  it('covers the standard board committee set', () => {
    expect(COMMITTEE_TYPES).toEqual([
      'audit', 'finance', 'risk', 'remuneration', 'strategy', 'nomination', 'other',
    ])
  })
  it('labels render for every type', () => {
    COMMITTEE_TYPES.forEach(t => expect(committeeTypeLabel(t).length).toBeGreaterThan(0))
  })
})

describe('governance — labels stay honest', () => {
  it('resolution types carry the voting threshold in the label', () => {
    expect(RESOLUTION_TYPE_LABELS.special).toContain('2/3')
  })
  it('unknown cascade status is labeled as a missing period, not a failure', () => {
    expect(CASCADE_STATUS_LABELS.unknown).toContain('No period')
  })
})

describe('governance — gap analysis display contract', () => {
  it('tone ladder: achieved/on_track good, at_risk warn, unlikely bad, else neutral', () => {
    expect(gapStatusTone('achieved')).toBe('good')
    expect(gapStatusTone('on_track')).toBe('good')
    expect(gapStatusTone('at_risk')).toBe('warn')
    expect(gapStatusTone('unlikely')).toBe('bad')
    expect(gapStatusTone('insufficient_data')).toBe('neutral')
    expect(gapStatusTone(undefined)).toBe('neutral')
  })
  it('constraint labels: pipeline/conversion/data named honestly', () => {
    expect(gapConstraintLabel('pipeline')).toBe('Pipeline constraint')
    expect(gapConstraintLabel('conversion')).toBe('Conversion constraint')
    expect(gapConstraintLabel('data')).toContain('Not enough')
    expect(gapConstraintLabel(null)).toBe('')
    expect(gapConstraintLabel(undefined)).toBe('')
  })
})

describe('governance — board pack (printable report)', () => {
  it('renders sections + totals and escapes HTML', () => {
    const html = generateBoardPackHtml({
      business_name: 'Acme <Ltd>',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      totals: { resolutions_approved: 2, resolutions_open: 1 },
      sections: [{ title: 'Finance', lines: ['Invoiced: 4.2K'] }],
    })
    expect(html).toContain('Acme &lt;Ltd&gt;')
    expect(html).toContain('2026-01-01')
    expect(html).toContain('Resolutions approved')
    expect(html).toContain('Finance')
    expect(html).toContain('Invoiced: 4.2K')
    expect(html).not.toContain('<Ltd>')
  })
  it('empty sections render honest "No items."', () => {
    const html = generateBoardPackHtml({ sections: [{ title: 'Empty', lines: [] }] })
    expect(html).toContain('No items.')
  })
})
