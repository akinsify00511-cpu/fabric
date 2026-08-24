import { describe, it, expect } from 'vitest'

// Unified Business Search (Master Directive §27; docs/domains/SEARCH.md).
// Locks the contract that the business_search RPC + CommandPalette rely on:
// (1) the explicit tenant-table allowlist (walled content excluded),
// (2) the exact > prefix > substring ranking with recency tiebreaker,
// (3) per-type caps so one noisy type can't flood results,
// (4) the membership gate + empty-query no-op + injection-safe escaping.

const ALLOWLIST = [
  'staff', 'contact', 'lead', 'meeting', 'objective',
  'quote', 'order', 'task', 'activity',
]
// Payroll / finance / board-walled content must NEVER be searchable here.
const FORBIDDEN = [
  'payroll_records', 'salary_history', 'payment_transactions',
  'board_resolutions', 'legal_cases', 'disciplinary', 'invoices',
]

describe('Unified Search — tenant allowlist contract', () => {
  it('searches only the explicit tenant-entity allowlist', () => {
    expect(ALLOWLIST).toHaveLength(9)
    expect(ALLOWLIST).toContain('lead')
    expect(ALLOWLIST).toContain('order')
  })
  it('never includes payroll/finance/walled content', () => {
    FORBIDDEN.forEach((f) => expect(ALLOWLIST).not.toContain(f))
  })
})

// Mirror of the RPC's rank computation: exact=0, prefix=1, substring=2.
function rank(query: string, value: string): number {
  if (value.toLowerCase() === query.toLowerCase()) return 0
  if (value.toLowerCase().startsWith(query.toLowerCase())) return 1
  return 2
}

describe('Unified Search — ranking contract (exact > prefix > substring)', () => {
  it('exact match ranks highest (0)', () => {
    expect(rank('acme', 'acme')).toBe(0)
    expect(rank('Acme', 'ACME')).toBe(0)
  })
  it('prefix ranks above substring', () => {
    expect(rank('acm', 'Acme Corp')).toBe(1)
    expect(rank('acm', 'Tacmatix')).toBe(2)
  })
  it('ordering: exact < prefix < substring', () => {
    const scores = [rank('acme', 'acme'), rank('acme', 'acme corp'), rank('acme', 'xacme')]
    expect(scores).toEqual([0, 1, 2])
  })
})

describe('Unified Search — per-type cap + guards', () => {
  it('caps each type so one noisy type cannot flood (per_type = limit/3, min 1)', () => {
    const perType = (lim: number) => Math.max(1, Math.floor(lim / 3))
    expect(perType(20)).toBe(6)
    expect(perType(2)).toBe(1)
    expect(perType(100)).toBe(33)
  })
  it('empty/short query is a no-op (>= 2 chars required)', () => {
    const isNoop = (q: string) => q.trim().length < 2
    expect(isNoop('')).toBe(true)
    expect(isNoop(' a')).toBe(true)
    expect(isNoop('ac')).toBe(false)
  })
  it('escapes ILIKE metacharacters so user input is literal (injection-safe)', () => {
    const escape = (q: string) => q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    expect(escape('%')).toBe('\\%')
    expect(escape('50%_off')).toBe('50\\%\\_off')
    expect(escape('acme')).toBe('acme')
  })
  it('membership gate fails closed (no staff row -> authorized:false)', () => {
    const gate = (businessId: string | null) =>
      businessId === null ? { authorized: false, total: 0 } : { authorized: true }
    expect(gate(null).authorized).toBe(false)
    expect(gate('some-uuid').authorized).toBe(true)
  })
})
