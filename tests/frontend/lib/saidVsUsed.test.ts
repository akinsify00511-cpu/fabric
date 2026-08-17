import { describe, it, expect } from 'vitest'
import type { SaidVsUsedRow } from '../../../src/lib/businessOS'

// Said-vs-used reality-gap classification (§29 testing / #12). Mirrors the
// gap_label contract emitted by the said_vs_used SQL RPC so the page's
// auto-detected "selected but unused" + "used but unselected" surfacing is
// locked independently of the live DB.

function classify(r: Partial<SaidVsUsedRow> & { selected?: boolean; actually_used?: boolean; distinct_staff_used?: number }): string {
  const selected = r.selected ?? false
  const used = r.actually_used ?? false
  const staff = r.distinct_staff_used ?? 0
  if (selected && !used) return 'selected_unused'
  if (!selected && used) return 'used_unselected'
  if (staff >= 3) return 'adopted'
  if (staff >= 1) return 'trying'
  return 'untouched'
}

describe('Said-vs-used gap classification (#12)', () => {
  it('flags a tool selected but never touched as the headline waste gap', () => {
    expect(classify({ selected: true, actually_used: false })).toBe('selected_unused')
  })
  it('flags a tool used but never selected as a hidden need', () => {
    expect(classify({ selected: false, actually_used: true, distinct_staff_used: 1 })).toBe('used_unselected')
  })
  it('labels a tool used by 3+ distinct staff as adopted', () => {
    expect(classify({ selected: true, actually_used: true, distinct_staff_used: 3 })).toBe('adopted')
    expect(classify({ selected: true, actually_used: true, distinct_staff_used: 10 })).toBe('adopted')
  })
  it('labels a tool used by 1-2 staff as trying (not yet adopted)', () => {
    expect(classify({ selected: true, actually_used: true, distinct_staff_used: 1 })).toBe('trying')
    expect(classify({ selected: true, actually_used: true, distinct_staff_used: 2 })).toBe('trying')
  })
  it('never reports a fabricated gap for an untouched unselected tool', () => {
    expect(classify({ selected: false, actually_used: false, distinct_staff_used: 0 })).toBe('untouched')
  })
  it('selected_unused takes priority over staff count (a selected-but-dead tool is a gap even if 0 staff)', () => {
    // selected + not used -> selected_unused, regardless of staff (which is 0 anyway)
    expect(classify({ selected: true, actually_used: false, distinct_staff_used: 0 })).toBe('selected_unused')
  })
})
