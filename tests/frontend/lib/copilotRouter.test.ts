import { describe, it, expect } from 'vitest'
import { routeQuestion, fallbackAnswer, type CopilotContext } from '../../../src/lib/copilotRouter'

const CTX: CopilotContext = {
  state: 'growing',
  healthScore: 82,
  metrics: [
    { key: 'revenue_total', name: 'Revenue', current_value: 1250000, change_percent: 8.4, target_value: 2000000 },
    { key: 'net_cashflow', name: 'Net cash flow', current_value: -45000, change_percent: -12.1 },
  ],
  recommendations: [
    { statement: 'Chase the 3 overdue invoices worth ₦210,000', severity: 'critical' },
  ],
  nextBestAction: { statement: 'Send a reminder on the ABC Ltd invoice', expectedImpact: '₦85,000' },
  overdueInvoices: 3,
}

const EMPTY: CopilotContext = {}

describe('copilotRouter — deterministic answers from real data', () => {
  it('business health question gets state + score + top priority', () => {
    const a = routeQuestion('How is my business doing?', CTX)
    expect(a?.intent).toBe('business_health')
    expect(a?.answer).toContain('82/100')
    expect(a?.answer).toContain('growing')
    expect(a?.answer).toContain('overdue invoices')
    expect(a?.confidence).toBe('high')
  })

  it('revenue question quotes the exact metric, never an invented one', () => {
    const a = routeQuestion('How much revenue have we made?', CTX)
    expect(a?.intent).toBe('revenue')
    expect(a?.answer).toContain('₦1,250,000')
    expect(a?.answer).toContain('up 8.4%')
    expect(a?.answer).toContain('63% of your ₦2,000,000 target')
    expect(a?.sources).toContain('metric:revenue_total')
  })

  it('cash question reports the negative cashflow honestly', () => {
    const a = routeQuestion('What is our cash position?', CTX)
    expect(a?.intent).toBe('cash')
    expect(a?.answer).toContain('₦-45,000')
    expect(a?.answer).toContain('down 12.1%')
  })

  it('overdue question cites the real count', () => {
    const a = routeQuestion('Do we have any overdue invoices?', CTX)
    expect(a?.intent).toBe('overdue')
    expect(a?.answer).toContain('3 overdue invoices')
  })

  it('next-action question surfaces the NBA with expected impact', () => {
    const a = routeQuestion('What should I focus on right now?', CTX)
    expect(a?.intent).toBe('next_action')
    expect(a?.answer).toContain('ABC Ltd invoice')
    expect(a?.answer).toContain('₦85,000')
  })

  it('unmatched question returns null (provider/fallback path)', () => {
    expect(routeQuestion('What is the capital of France?', CTX)).toBeNull()
  })

  it('empty question returns null', () => {
    expect(routeQuestion('   ', CTX)).toBeNull()
  })
})

describe('copilotRouter — anti-fabrication contract (no data => honest, never invented)', () => {
  it('health with no data: says so + suggests the fix, no score invented', () => {
    const a = routeQuestion('How is my business doing?', EMPTY)
    expect(a?.intent).toBe('business_health')
    expect(a?.answer).toContain("don't have enough data")
    expect(a?.answer).not.toMatch(/\d+\/100/)
    expect(a?.confidence).toBe('low')
    expect(a?.sources).toHaveLength(0)
  })

  it('revenue with no metric: honest zero-data answer, no number', () => {
    const a = routeQuestion('revenue?', EMPTY)
    expect(a?.answer).toContain('no revenue recorded')
    expect(a?.answer).not.toMatch(/₦\d/)
  })

  it('overdue with zero overdue: positive truthful answer', () => {
    const a = routeQuestion('any overdue invoices?', { ...EMPTY, overdueInvoices: 0 })
    expect(a?.answer).toContain('no overdue invoices')
  })

  it('overdue with null (invoices unreadable): honest, not zero', () => {
    const a = routeQuestion('overdue invoices?', { ...EMPTY, overdueInvoices: null })
    expect(a?.answer).toContain("can't see any invoice data")
  })

  it('next-action with no NBA and no recommendations: honest all-clear', () => {
    const a = routeQuestion('what should I do?', EMPTY)
    expect(a?.answer).toContain('Nothing urgent')
    expect(a?.confidence).toBe('low')
  })

  it('next-action falls back to top recommendation when NBA absent', () => {
    const a = routeQuestion('what should I do?', { ...CTX, nextBestAction: null })
    expect(a?.answer).toContain('overdue invoices')
    expect(a?.confidence).toBe('medium')
  })
})

describe('copilotRouter — fallback answer', () => {
  it('with data: summarises known facts only', () => {
    const a = fallbackAnswer(CTX)
    expect(a.answer).toContain('82/100')
    expect(a.answer).toContain('₦1,250,000')
    expect(a.answer).toContain('overdue invoices')
  })

  it('with no data: capability hint, never a fabricated summary', () => {
    const a = fallbackAnswer(EMPTY)
    expect(a.answer).toContain("I'm best at questions about")
    expect(a.answer).not.toMatch(/₦\d/)
    expect(a.confidence).toBe('low')
  })
})
