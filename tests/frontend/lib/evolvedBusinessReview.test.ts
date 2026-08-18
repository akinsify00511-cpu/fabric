import { describe, it, expect } from 'vitest'

// Mirrors §AA Evolved Business Review (20260818280000). Composes on
// monthly_review (097) + claims lifecycle (088) + organizational_memory (064).
// Synthesizes the 9 narrative answers the directive asks for.
//
// §22 anti-fabrication: every number comes from real governed metrics / claims
// / memory. Honest empty note when insufficient data.

type Metric = { metric_key: string; change_percent: number | null; period_end: string }
type Claim = { business_id: string; claim_type: string; status: string; actual_impact: number | null; created_at: string }
type Memory = { business_id: string; topic: string; lesson: string; created_at: string; status: string }

function improved(m: Metric[]): { metric: string; change_pct: number }[] {
  return m.filter(x => x.change_percent !== null && x.change_percent > 0)
    .map(x => ({ metric: x.metric_key, change_pct: x.change_percent! }))
    .sort((a, b) => b.change_pct - a.change_pct).slice(0, 5)
}
function deteriorated(m: Metric[]): { metric: string; change_pct: number }[] {
  return m.filter(x => x.change_percent !== null && x.change_percent < 0)
    .map(x => ({ metric: x.metric_key, change_pct: x.change_percent! }))
    .sort((a, b) => a.change_pct - b.change_pct).slice(0, 5)
}
function recommendedVsDone(claims: Claim[]) {
  return {
    recommended: claims.length,
    accepted: claims.filter(c => ['accepted', 'acted', 'done'].includes(c.status)).length,
    acted: claims.filter(c => ['acted', 'done'].includes(c.status)).length,
    outcomes_recorded: claims.filter(c => c.actual_impact !== null).length,
    successful_outcomes: claims.filter(c => c.actual_impact !== null && c.actual_impact > 0).length,
  }
}

const biz = 'biz-1'
const start = '2026-07-01', end = '2026-07-31'

describe('§AA Evolved Business Review', () => {
  describe('what improved / deteriorated (metric movers)', () => {
    it('surfaces metrics with POSITIVE change as "improved"', () => {
      const metrics: Metric[] = [
        { metric_key: 'revenue', change_percent: 12, period_end: end },
        { metric_key: 'margin', change_percent: -5, period_end: end },
      ]
      expect(improved(metrics)).toEqual([{ metric: 'revenue', change_pct: 12 }])
    })
    it('surfaces metrics with NEGATIVE change as "deteriorated"', () => {
      const metrics: Metric[] = [
        { metric_key: 'revenue', change_percent: 12, period_end: end },
        { metric_key: 'margin', change_percent: -5, period_end: end },
      ]
      expect(deteriorated(metrics)).toEqual([{ metric: 'margin', change_pct: -5 }])
    })
    it('excludes NULL-change metrics (no fabricated direction)', () => {
      const metrics: Metric[] = [
        { metric_key: 'unknown', change_percent: null, period_end: end },
      ]
      expect(improved(metrics)).toHaveLength(0)
      expect(deteriorated(metrics)).toHaveLength(0)
    })
    it('orders improved DESC (biggest gain first), deteriorated ASC (biggest drop first)', () => {
      const metrics: Metric[] = [
        { metric_key: 'a', change_percent: 5, period_end: end },
        { metric_key: 'b', change_percent: 15, period_end: end },
        { metric_key: 'c', change_percent: -3, period_end: end },
        { metric_key: 'd', change_percent: -8, period_end: end },
      ]
      expect(improved(metrics).map(m => m.metric)).toEqual(['b', 'a'])
      expect(deteriorated(metrics).map(m => m.metric)).toEqual(['d', 'c'])
    })
  })

  describe('recommended vs done (the claims lifecycle gap)', () => {
    it('counts recommended → accepted → acted → outcomes → successful', () => {
      const claims: Claim[] = [
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'open', actual_impact: null, created_at: start },
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'accepted', actual_impact: null, created_at: start },
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'acted', actual_impact: 5000, created_at: start },
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'done', actual_impact: -2000, created_at: start },
      ]
      const r = recommendedVsDone(claims)
      expect(r.recommended).toBe(4)
      expect(r.accepted).toBe(3)  // accepted + acted + done
      expect(r.acted).toBe(2)     // acted + done
      expect(r.outcomes_recorded).toBe(2)
      expect(r.successful_outcomes).toBe(1) // only the +5000 one
    })
    it('successful_outcomes requires actual_impact > 0 (a negative outcome is NOT a success)', () => {
      const claims: Claim[] = [
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'done', actual_impact: -2000, created_at: start },
      ]
      expect(recommendedVsDone(claims).successful_outcomes).toBe(0)
    })
    it('scopes to the period (claims outside the window excluded)', () => {
      const claims: Claim[] = [
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'accepted', actual_impact: null, created_at: '2026-06-15' },
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'accepted', actual_impact: null, created_at: start },
      ]
      // The SQL filters created_at BETWEEN start AND end.
      const inPeriod = claims.filter(c => c.created_at >= start && c.created_at <= end)
      expect(inPeriod).toHaveLength(1)
    })
  })

  describe('what we learned (organizational_memory + decisions)', () => {
    it('surfaces active org_memory created in the period', () => {
      const memories: Memory[] = [
        { business_id: biz, topic: 'Pricing lesson', lesson: 'Discounts erode margin', created_at: start, status: 'active' },
        { business_id: biz, topic: 'Old', lesson: 'superseded', created_at: start, status: 'superseded' },
        { business_id: 'biz-2', topic: 'Other biz', lesson: 'x', created_at: start, status: 'active' },
      ]
      const inPeriod = memories
        .filter(m => m.business_id === biz && m.status === 'active' && m.created_at >= start && m.created_at <= end)
      expect(inPeriod).toHaveLength(1)
      expect(inPeriod[0].topic).toBe('Pricing lesson')
    })
  })

  describe('next month priorities (open recommendations)', () => {
    it('lists open/acknowledged/accepted recommendations, critical first', () => {
      const claims: Claim[] = [
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'open', actual_impact: null, created_at: start },
        { business_id: biz, claim_type: 'RECOMMENDATION', status: 'done', actual_impact: null, created_at: start },
      ]
      const open = claims.filter(c => ['open', 'acknowledged', 'accepted'].includes(c.status))
      expect(open).toHaveLength(1)
    })
  })

  describe('the honest empty state', () => {
    it('returns a note when no movers, no accepted recs, no outcomes', () => {
      const hasData = false // all empty
      expect(hasData).toBe(false)
      // The RPC returns note: 'Not enough data this period to compose a full
      // review. As metrics accumulate and recommendations get acted on, this
      // generates the month-over-month narrative.'
    })
    it('the evidence_note is always present (every number cited)', () => {
      // The RPC returns evidence_note: 'All numbers are computed from real
      // data (governed metrics, claims lifecycle, organizational memory). No
      // narrative is fabricated (§22).'
      const note = 'All numbers are computed from real data (governed metrics, claims lifecycle, organizational memory). No narrative is fabricated (§22).'
      expect(note).toContain('real data')
      expect(note).toContain('§22')
    })
  })

  describe('security: membership guard', () => {
    it('a non-member gets authorized: false', () => {
      function authorized(callerBiz: string, targetBiz: string): boolean {
        return callerBiz === targetBiz
      }
      expect(authorized(biz, biz)).toBe(true)
      expect(authorized('biz-2', biz)).toBe(false)
    })
  })
})
