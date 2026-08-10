import { describe, it, expect } from 'vitest'
import {
  parseIntent, detectEventType, extractMoney, extractPercent,
  extractName, classifyRung,
} from '../../../src/lib/intentParser'

describe('intentParser — money extraction', () => {
  it('extracts Naira with millions unit', () => {
    expect(extractMoney('We closed the deal for ₦45m')).toBe('45000000')
  })
  it('extracts USD with thousands unit', () => {
    expect(extractMoney('paid $50k')).toBe('50000')
  })
  it('extracts plain number with currency symbol', () => {
    expect(extractMoney('received $1,200')).toBe('1200')
  })
  it('extracts billions', () => {
    expect(extractMoney('contract worth ₦1.2bn')).toBe('1200000000')
  })
  it('returns null when no money mentioned', () => {
    expect(extractMoney('the team had a meeting')).toBeNull()
  })
})

describe('intentParser — percent extraction', () => {
  it('extracts percent', () => {
    expect(extractPercent('client will pay 40% upfront')).toBe('40')
  })
  it('handles no space before %', () => {
    expect(extractPercent('40% upfront')).toBe('40')
  })
  it('returns null when no percent', () => {
    expect(extractPercent('no percentages here')).toBeNull()
  })
})

describe('intentParser — name extraction', () => {
  it('extracts owner after "handled by"', () => {
    expect(extractName('deal handled by John Smith', ['handled by'])).toBe('John Smith')
  })
  it('returns null when no name found', () => {
    expect(extractName('a deal happened', ['handled by'])).toBeNull()
  })
})

describe('intentParser — event detection', () => {
  it('detects DealWon', () => {
    const r = detectEventType('We just closed the ABC deal')
    expect(r.event_type).toBe('DealWon')
    expect(r.confidence).toBeGreaterThan(0.8)
  })
  it('detects PaymentReceived', () => {
    expect(detectEventType('payment came in yesterday').event_type).toBe('PaymentReceived')
  })
  it('detects EmployeeJoined', () => {
    expect(detectEventType('we hired a new developer').event_type).toBe('EmployeeJoined')
  })
  it('detects EmployeeExited', () => {
    expect(detectEventType('John resigned last week').event_type).toBe('EmployeeExited')
  })
  it('detects InventoryLow', () => {
    expect(detectEventType('we are running out of cement').event_type).toBe('InventoryLow')
  })
  it('defaults to Note for unstructured input', () => {
    expect(detectEventType('just thinking out loud').event_type).toBe('Note')
  })
})

describe('intentParser — full parse', () => {
  it('parses a deal-close capture end-to-end', () => {
    const r = parseIntent('We just closed the ABC Properties deal for ₦45m, handled by John, and the client will pay 40% upfront.')
    expect(r.event_type).toBe('DealWon')
    expect(r.confidence).toBe(0.85)
    expect(r.needs_confirmation).toBe(true)
    expect(r.entities.find(e => e.field === 'amount')?.value).toBe('45000000')
    expect(r.entities.find(e => e.field === 'upfront_percent')?.value).toBe('40')
    expect(r.entities.find(e => e.field === 'sales_owner')?.value).toBe('John')
    const actions = r.destinations.map(d => d.action)
    expect(actions).toContain('mark_won')
    expect(actions).toContain('draft')
    expect(actions).toContain('calculate')
  })

  it('parses a payment receipt', () => {
    const r = parseIntent('received payment of ₦500k from the client')
    expect(r.event_type).toBe('PaymentReceived')
    expect(r.destinations.map(d => d.action)).toContain('mark_paid')
    expect(r.needs_confirmation).toBe(true)
  })

  it('marks low-stakes notes as not needing confirmation', () => {
    const r = parseIntent('the office needs repainting')
    expect(r.event_type).toBe('Note')
    expect(r.needs_confirmation).toBe(false)
  })

  it('always sets evidence source to user_input', () => {
    const r = parseIntent('anything')
    expect(r.evidence.source).toBe('user_input')
  })
})

describe('intentParser — AI action authority rung classification', () => {
  it('classifies a deal win as execute_with_approval', () => {
    const r = parseIntent('We closed the XYZ deal for ₦10m')
    expect(classifyRung(r)).toBe('execute_with_approval')
  })
  it('classifies a plain note as low_risk_execute (it still writes a record)', () => {
    const r = parseIntent('the weather is nice today')
    expect(classifyRung(r)).toBe('low_risk_execute')
  })
  it('a payment received implies a write rung', () => {
    const r = parseIntent('got paid ₦200k')
    expect(classifyRung(r)).not.toBeNull()
  })
})
