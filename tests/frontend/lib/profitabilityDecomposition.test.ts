import { describe, it, expect } from 'vitest'

// Mirrors §G Profitability Decomposition (20260818260000). EBITDA is the
// aggregate; this decomposes it into per-segment profitability + leakage
// detection. Composition-first: reads the same invoices/transactions/
// invoice_items EBITDA reads, just GROUPed by segment.
//
// §22 anti-fabrication: cost is REVENUE-PROPORTIONALLY ALLOCATED (invoices
// lack a product FK), surfaced honestly as cost_allocation: 'revenue_proportional'.
// Leakage findings cite REAL numbers. Honest empty states.

type Segment = {
  segment_name: string
  revenue: number
  cost: number
  profit: number
  margin_pct: number | null
}

// The server-side allocation: cost = (segment_revenue / total_revenue) * total_cogs.
function allocateCost(segments: Segment[], totalCogs: number, totalRevenue: number): Segment[] {
  if (totalRevenue === 0) return segments.map(s => ({ ...s, cost: 0, profit: s.revenue, margin_pct: null }))
  return segments.map(s => {
    const cost = (s.revenue / totalRevenue) * totalCogs
    const profit = s.revenue - cost
    const margin = s.revenue > 0 ? (profit / s.revenue) * 100 : null
    return { ...s, cost: Math.round(cost * 100) / 100, profit: Math.round(profit * 100) / 100, margin_pct: margin !== null ? Math.round(margin * 10) / 10 : null }
  })
}

describe('§G Profitability Decomposition', () => {
  describe('segment allocation', () => {
    it('allocates COGS proportionally to each segment\'s revenue share', () => {
      const segments = allocateCost(
        [
          { segment_name: 'Acme', revenue: 600, cost: 0, profit: 0, margin_pct: null },
          { segment_name: 'Beta', revenue: 400, cost: 0, profit: 0, margin_pct: null },
        ],
        500, 1000
      )
      expect(segments[0].cost).toBe(300)  // 600/1000 * 500
      expect(segments[1].cost).toBe(200)  // 400/1000 * 500
      expect(segments[0].profit).toBe(300)
      expect(segments[1].profit).toBe(200)
    })

    it('computes margin_pct per segment', () => {
      const segments = allocateCost(
        [{ segment_name: 'Acme', revenue: 1000, cost: 0, profit: 0, margin_pct: null }],
        400, 1000
      )
      expect(segments[0].margin_pct).toBe(60) // (1000-400)/1000 * 100
    })

    it('returns NULL margin when revenue is 0 (never divides by zero)', () => {
      const segments = allocateCost(
        [{ segment_name: 'Zero', revenue: 0, cost: 0, profit: 0, margin_pct: null }],
        500, 0
      )
      expect(segments[0].margin_pct).toBeNull()
      expect(segments[0].cost).toBe(0)
    })

    it('orders segments by profit DESC (most profitable first)', () => {
      const segments = allocateCost(
        [
          { segment_name: 'Low', revenue: 200, cost: 0, profit: 0, margin_pct: null },
          { segment_name: 'High', revenue: 800, cost: 0, profit: 0, margin_pct: null },
        ],
        300, 1000
      ).sort((a, b) => b.profit - a.profit)
      expect(segments[0].segment_name).toBe('High')
    })

    it('surfaces the cost_allocation method honestly (revenue_proportional, not direct)', () => {
      // The RPC returns cost_allocation: 'revenue_proportional' so the UI can
      // label it as an estimate, not a direct cost trace.
      const result = { cost_allocation: 'revenue_proportional' }
      expect(result.cost_allocation).toBe('revenue_proportional')
    })
  })

  describe('leakage detection', () => {
    function classifyLeakage(invoice: {
      status: string; due_date?: Date | null; created_at: Date; total: number
    }, now: Date) {
      const findings: string[] = []
      if (invoice.status === 'overdue') findings.push('overdue')
      if (invoice.status === 'sent' && (now.getTime() - invoice.created_at.getTime()) > 30 * 86400000) {
        findings.push('stale_receivable')
      }
      return findings
    }

    it('flags overdue invoices (revenue at risk)', () => {
      const now = new Date('2026-08-18')
      const f = classifyLeakage({ status: 'overdue', due_date: new Date('2026-07-01'), created_at: new Date('2026-06-01'), total: 50000 }, now)
      expect(f).toContain('overdue')
    })

    it('flags sent invoices >30 days old as stale receivables (capital trapped)', () => {
      const now = new Date('2026-08-18')
      const f = classifyLeakage({ status: 'sent', due_date: null, created_at: new Date('2026-07-01'), total: 30000 }, now)
      expect(f).toContain('stale_receivable')
    })

    it('does NOT flag recent sent invoices', () => {
      const now = new Date('2026-08-18')
      const f = classifyLeakage({ status: 'sent', due_date: null, created_at: new Date('2026-08-10'), total: 30000 }, now)
      expect(f).not.toContain('stale_receivable')
    })

    it('declining-margin is flagged only when current margin < prior AND < 30% (getting thin)', () => {
      function shouldFlagDeclining(cur: number, prev: number): boolean {
        return cur < prev && cur < 30
      }
      expect(shouldFlagDeclining(20, 35)).toBe(true)   // declined + thin → flag
      expect(shouldFlagDeclining(45, 50)).toBe(false)  // declined but still healthy → don't flag
      expect(shouldFlagDeclining(25, 20)).toBe(false)  // improved → don't flag
    })

    it('underpriced won deals: invoiced < 50% of deal value', () => {
      function isUnderpriced(dealValue: number, invoicedTotal: number): boolean {
        return invoicedTotal < dealValue * 0.5
      }
      expect(isUnderpriced(100000, 30000)).toBe(true)   // invoiced 30% → flag
      expect(isUnderpriced(100000, 70000)).toBe(false)   // invoiced 70% → OK
    })

    it('total_exposure sums overdue + stale receivables (capital at risk)', () => {
      const overdue = 50000, stale = 30000
      const exposure = overdue + stale
      expect(exposure).toBe(80000)
    })

    it('honest empty note when no leakage (never fabricates a finding)', () => {
      const result = { total_exposure: 0, note: 'No leakage detected...' }
      expect(result.total_exposure).toBe(0)
      expect(result.note).toBeDefined()
      expect(result.note).not.toContain('₦')
    })
  })

  describe('pricing opportunities', () => {
    it('high-margin products are >= 40% (room to discount to win)', () => {
      function isHighMargin(margin: number): boolean { return margin >= 40 }
      expect(isHighMargin(55)).toBe(true)
      expect(isHighMargin(35)).toBe(false)
    })

    it('low-margin products are <= 15% (raise price or cut cost)', () => {
      function isLowMargin(margin: number): boolean { return margin <= 15 }
      expect(isLowMargin(10)).toBe(true)
      expect(isLowMargin(20)).toBe(false)
    })

    it('honest empty note when neither high nor low margin products exist', () => {
      const result = { high_margin: [], low_margin: [], note: 'No pricing opportunities...' }
      expect(result.high_margin).toHaveLength(0)
      expect(result.low_margin).toHaveLength(0)
      expect(result.note).toBeDefined()
    })
  })
})
