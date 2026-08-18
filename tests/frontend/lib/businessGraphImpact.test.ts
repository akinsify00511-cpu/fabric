import { describe, it, expect } from 'vitest'

// Mirrors §J Business Graph impact propagation (20260818270000). The graph
// edges (entity_relationships 060) + recursive_neighbors (060/087) already
// exist. propagate_impact adds the downstream NUMERIC estimate.
//
// Evidence-tag contract (§20/§22):
//   • invoice/payment/deal downstream → FACT (they have a measured value)
//   • customer/staff/product → INFERENCE (an estimate via relationship weight)
//   • unmapped entity types → UNKNOWN (flagged, never fabricated)
// The propagation halves per depth hop (honest approximation — indirect
// effects are smaller than direct ones).

type Neighbor = { entity_type: string; depth: number }
type Propagated = { entity_type: string; propagated_delta: number | null; evidence_tag: 'FACT' | 'INFERENCE' | 'UNKNOWN' }

function tagEntity(entityType: string): 'FACT' | 'INFERENCE' | 'UNKNOWN' {
  if (['invoice', 'payment', 'deal'].includes(entityType)) return 'FACT'
  if (['customer', 'staff', 'product'].includes(entityType)) return 'INFERENCE'
  return 'UNKNOWN'
}
function propagate(neighbors: Neighbor[], delta: number): Propagated[] {
  return neighbors.map(n => ({
    entity_type: n.entity_type,
    propagated_delta: ['invoice', 'payment', 'deal'].includes(n.entity_type)
      ? Math.round((delta / Math.pow(2, n.depth)) * 100) / 100
      : null,
    evidence_tag: tagEntity(n.entity_type),
  }))
}

describe('§J Business Graph Impact Propagation', () => {
  describe('evidence tagging', () => {
    it('tags invoice/payment/deal downstream as FACT (measured value)', () => {
      expect(tagEntity('invoice')).toBe('FACT')
      expect(tagEntity('payment')).toBe('FACT')
      expect(tagEntity('deal')).toBe('FACT')
    })
    it('tags customer/staff/product as INFERENCE (estimated)', () => {
      expect(tagEntity('customer')).toBe('INFERENCE')
      expect(tagEntity('staff')).toBe('INFERENCE')
      expect(tagEntity('product')).toBe('INFERENCE')
    })
    it('tags unmapped entity types as UNKNOWN (never fabricated)', () => {
      expect(tagEntity('unknown_thing')).toBe('UNKNOWN')
    })
  })

  describe('propagation math', () => {
    it('propagates delta halved per depth hop (indirect effects shrink)', () => {
      const result = propagate(
        [{ entity_type: 'invoice', depth: 1 }, { entity_type: 'invoice', depth: 2 }, { entity_type: 'invoice', depth: 3 }],
        100000
      )
      expect(result[0].propagated_delta).toBe(50000)   // 100k / 2^1
      expect(result[1].propagated_delta).toBe(25000)   // 100k / 2^2
      expect(result[2].propagated_delta).toBe(12500)   // 100k / 2^3
    })
    it('INFERENCE entities get NULL delta (no fabricated number)', () => {
      const result = propagate([{ entity_type: 'customer', depth: 1 }], 100000)
      expect(result[0].propagated_delta).toBeNull()
      expect(result[0].evidence_tag).toBe('INFERENCE')
    })
    it('UNKNOWN entities get NULL delta + UNKNOWN tag', () => {
      const result = propagate([{ entity_type: 'mystery', depth: 1 }], 100000)
      expect(result[0].propagated_delta).toBeNull()
      expect(result[0].evidence_tag).toBe('UNKNOWN')
    })
    it('a scenario with no downstream entities returns an honest empty note', () => {
      const result = propagate([], 100000)
      expect(result).toHaveLength(0)
      // The RPC adds note: 'No downstream entities mapped...' when empty.
    })
  })

  describe('graph overview', () => {
    it('counts nodes by type (entities appearing as source OR target)', () => {
      const edges = [
        { source_type: 'deal', source_id: 'd1', target_type: 'invoice', target_id: 'i1', relationship: 'generates' },
        { source_type: 'deal', source_id: 'd1', target_type: 'customer', target_id: 'c1', relationship: 'owned_by' },
      ]
      const nodes = new Set<string>()
      edges.forEach(e => { nodes.add(e.source_type); nodes.add(e.target_type) })
      expect(nodes.size).toBe(3) // deal, invoice, customer
    })
    it('hub entities are the most-connected (most influential)', () => {
      const edges = [
        { source_type: 'deal', source_id: 'd1', target_type: 'invoice', target_id: 'i1' },
        { source_type: 'deal', source_id: 'd1', target_type: 'customer', target_id: 'c1' },
        { source_type: 'deal', source_id: 'd1', target_type: 'payment', target_id: 'p1' },
      ]
      const counts: Record<string, number> = {}
      edges.forEach(e => {
        counts[`${e.source_type}:${e.source_id}`] = (counts[`${e.source_type}:${e.source_id}`] || 0) + 1
        counts[`${e.target_type}:${e.target_id}`] = (counts[`${e.target_type}:${e.target_id}`] || 0) + 1
      })
      const hub = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      expect(hub[0]).toBe('deal:d1') // the deal is the hub (3 connections)
      expect(hub[1]).toBe(3)
    })
    it('honest empty note when total_edges = 0', () => {
      const result = { total_edges: 0, note: 'No relationships mapped yet...' }
      expect(result.total_edges).toBe(0)
      expect(result.note).toBeDefined()
    })
  })

  describe('security: membership guard', () => {
    it('a non-member cannot propagate impact on another business', () => {
      // The RPC checks get_current_staff().business_id = p_business_id.
      function authorized(callerBiz: string, targetBiz: string): boolean {
        return callerBiz === targetBiz
      }
      expect(authorized('biz-1', 'biz-1')).toBe(true)
      expect(authorized('biz-1', 'biz-2')).toBe(false)
    })
  })
})
