import { describe, it, expect } from 'vitest'
import { parseReceiptText, confidenceLabel } from '../../../src/lib/receiptParser'

const SUPERMARKET = `
SHOPRITE NIGERIA LIMITED
123 Allen Avenue, Ikeja
Tel: 08012345678
RECEIPT NO: RCP-88342
Date: 15/03/2026

Indomie Noodles 70g x5 1,500.00
Peak Milk 400g 2,800.00
Bread 800.00

Subtotal NGN 5,100.00
VAT (7.5%) 382.50
Total NGN 5,482.50
Payment: Card
Thank you for shopping
`

const FUEL = `
TOTAL ENERGIES STATION
Receipt 09221
Date: 2026-03-10
PMS (Petrol) 45.0 Litres 28,575.00
TOTAL ₦28,575.00
Paid by POS
`

const RESTAURANT = `
TANTALIZERS RESTAURANT
Invoice #INV-5521
15 Mar 2026
Jollof Rice + Chicken 3,500.00
Chapman 1,200.00
Grand Total 4,700.00
Cash
`

const GARBAGE = `
asdkjfh !@#$ 0000
??? --- 111
zz
`

describe('parseReceiptText — supermarket receipt', () => {
  const r = parseReceiptText(SUPERMARKET)

  it('extracts vendor from the header', () => {
    expect(r.vendor).toMatch(/SHOPRITE/i)
  })

  it('extracts receipt number with high confidence', () => {
    expect(r.receipt_number).toBe('RCP-88342')
    expect(r.field_confidence.receipt_number).toBe('high')
  })

  it('extracts day-first date', () => {
    expect(r.receipt_date).toBe('2026-03-15')
  })

  it('detects NGN currency', () => {
    expect(r.currency).toBe('NGN')
  })

  it('extracts subtotal, tax, total', () => {
    expect(r.subtotal).toBe(5100.0)
    expect(r.tax).toBe(382.5)
    expect(r.total).toBe(5482.5)
  })

  it('total confidence is high when subtotal+tax reconciles', () => {
    expect(r.field_confidence.total).toBe('high')
  })

  it('extracts line items', () => {
    expect(r.line_items.length).toBeGreaterThanOrEqual(2)
    const milk = r.line_items.find((i) => /peak milk/i.test(i.description))
    expect(milk?.amount).toBe(2800.0)
  })

  it('detects card payment', () => {
    expect(r.payment_method).toBe('card')
  })

  it('guesses a plausible category', () => {
    expect(r.category).toBe('operations')
  })

  it('overall confidence is high for a clean receipt', () => {
    expect(r.overall_confidence).toBeGreaterThan(0.6)
  })
})

describe('parseReceiptText — fuel receipt', () => {
  const r = parseReceiptText(FUEL)

  it('extracts ISO date', () => {
    expect(r.receipt_date).toBe('2026-03-10')
  })

  it('detects POS payment method', () => {
    expect(r.payment_method).toBe('pos')
  })

  it('categorizes as operations', () => {
    expect(r.category).toBe('operations')
  })

  it('extracts the naira total', () => {
    expect(r.total).toBe(28575.0)
  })
})

describe('parseReceiptText — restaurant receipt', () => {
  const r = parseReceiptText(RESTAURANT)

  it('extracts month-name date', () => {
    expect(r.receipt_date).toBe('2026-03-15')
  })

  it('extracts grand total', () => {
    expect(r.total).toBe(4700.0)
  })

  it('detects cash payment', () => {
    expect(r.payment_method).toBe('cash')
  })

  it('categorizes as meals', () => {
    expect(r.category).toBe('meals')
  })
})

describe('anti-fabrication contract', () => {
  const r = parseReceiptText(GARBAGE)

  it('garbage text yields no vendor, no date, no line items', () => {
    expect(r.vendor).toBeNull()
    expect(r.receipt_date).toBeNull()
    expect(r.line_items).toHaveLength(0)
  })

  it('garbage text yields very low overall confidence', () => {
    expect(r.overall_confidence).toBeLessThan(0.35)
  })

  it('category falls back to operations with low confidence (never invents a category)', () => {
    expect(r.category).toBe('operations')
    expect(r.field_confidence.category).toBe('low')
  })
})

describe('confidenceLabel', () => {
  it('labels found and missing fields', () => {
    expect(confidenceLabel('high')).toBe('high')
    expect(confidenceLabel(undefined)).toBe('not found')
  })
})
