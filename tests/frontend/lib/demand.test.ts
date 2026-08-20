import { describe, it, expect } from 'vitest'
import { canOrder, chainSummary, nextStatuses } from '../../../src/lib/demand'
import type { DemandChain, DemandQuote } from '../../../src/lib/demand'

describe('demand chainSummary', () => {
  const empty: DemandChain = { requests: [], quotes: [], orders: [] }
  it('marks steps done only when entities exist', () => {
    expect(chainSummary(empty).every((s) => !s.done)).toBe(true)
    expect(chainSummary({ ...empty, requests: [{} as never] }).map((s) => s.done)).toEqual([true, false, false])
    expect(chainSummary({ requests: [{} as never], quotes: [{} as never], orders: [{} as never] }).map((s) => s.done)).toEqual([true, true, true])
  })
})

describe('canOrder', () => {
  const q = (status: DemandQuote['status']): DemandQuote => ({
    id: '1', lead_id: 'l', request_id: null, title: 't', items: [],
    subtotal: 0, vat_amount: 0, total: 100, valid_until: null, status,
    access_token: 'x', created_at: '',
  })
  it('allows ordering only from an accepted quote', () => {
    expect(canOrder(q('accepted')).ok).toBe(true)
    expect(canOrder(q('draft')).ok).toBe(false)
    expect(canOrder(q('sent')).ok).toBe(false)
    expect(canOrder(q('viewed')).ok).toBe(false)
  })
  it('rejects rejected/expired/converted quotes with a reason', () => {
    expect(canOrder(q('rejected')).reason).toContain('rejected')
    expect(canOrder(q('expired')).reason).toContain('expired')
    expect(canOrder(q('converted')).reason).toContain('converted')
  })
  it('pending quotes give the accepted-first reason', () => {
    expect(canOrder(q('sent')).reason).toBe('Quote must be accepted before ordering')
  })
})

describe('nextStatuses lifecycle', () => {
  it('request lifecycle: reviewing → qualified → quoted → accepted → fulfilled', () => {
    expect(nextStatuses('request', 'new')).toContain('reviewing')
    expect(nextStatuses('request', 'reviewing')).toContain('qualified')
    expect(nextStatuses('request', 'qualified')).toContain('quoted')
    expect(nextStatuses('request', 'accepted')).toContain('fulfilled')
    expect(nextStatuses('request', 'fulfilled')).toEqual([])
  })
  it('rejected and abandoned requests can be revived to reviewing (no lost demand)', () => {
    expect(nextStatuses('request', 'rejected')).toEqual(['reviewing'])
    expect(nextStatuses('request', 'abandoned')).toEqual(['reviewing'])
  })
  it('quote lifecycle includes expiry and revive-to-draft', () => {
    expect(nextStatuses('quote', 'sent')).toEqual(expect.arrayContaining(['accepted', 'rejected', 'expired']))
    expect(nextStatuses('quote', 'expired')).toEqual(['draft'])
    expect(nextStatuses('quote', 'converted')).toEqual([])
    expect(nextStatuses('quote', 'accepted')).toEqual([])
  })
  it('order lifecycle ends at completed/cancelled', () => {
    expect(nextStatuses('order', 'confirmed')).toEqual(['in_fulfilment', 'cancelled'])
    expect(nextStatuses('order', 'fulfilled')).toEqual(['completed'])
    expect(nextStatuses('order', 'completed')).toEqual([])
    expect(nextStatuses('order', 'cancelled')).toEqual([])
  })
  it('unknown states return empty (fail closed)', () => {
    expect(nextStatuses('request', 'bogus')).toEqual([])
  })
})
