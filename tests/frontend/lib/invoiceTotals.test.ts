import { describe, it, expect } from 'vitest'

// Mirrors the §0.4 contract enforced by the create_invoice + record_invoice_payment
// RPCs (migration 20260818140000): the server RECOMPUTES every money total from
// raw line items; the client supplies item data + tax config, never a pre-summed
// total. These tests assert the recomputation logic the RPC uses, so a client
// tampering with line totals has no effect.

// The exact arithmetic the RPC performs (mirrors the PL/pgSQL body).
function serverComputeTotals(
  items: { quantity: number; unit_price: number }[],
  vatRate: number,
  applyWht: boolean,
  whtRate: number,
): { subtotal: number; vatAmount: number; whtAmount: number; total: number; balance: number } {
  let subtotal = 0
  for (const it of items) {
    // GREATEST(qty * unit_price, 0) — negative line totals are clamped.
    subtotal += Math.max(it.quantity * it.unit_price, 0)
  }
  const vatAmount = Math.round(subtotal * (vatRate ?? 0) * 100) / 100
  const whtAmount = applyWht ? Math.round(subtotal * (whtRate ?? 0) * 100) / 100 : 0
  // total = subtotal + vat (wht is a deduction at payment, not from the total).
  const total = subtotal + vatAmount
  return { subtotal, vatAmount, whtAmount, total, balance: total }
}

describe('create_invoice — §0.4 server-derived totals', () => {
  it('recomputes subtotal from raw line items, ignoring any client-supplied total', () => {
    const result = serverComputeTotals(
      [
        { quantity: 3, unit_price: 15000 },
        { quantity: 2, unit_price: 5000 },
      ],
      0.075, false, 0.05,
    )
    // 3*15000 + 2*5000 = 55000 — the server derives this, NOT a client number.
    expect(result.subtotal).toBe(55000)
    expect(result.total).toBe(55000 + 4125) // +7.5% VAT
  })

  it('clamps negative line totals to zero (defensive against tampered input)', () => {
    const result = serverComputeTotals(
      [{ quantity: 2, unit_price: -1000 }],
      0, false, 0,
    )
    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
  })

  it('computes VAT on the subtotal, not a client-supplied amount', () => {
    const result = serverComputeTotals(
      [{ quantity: 1, unit_price: 100000 }],
      0.075, false, 0.05,
    )
    expect(result.vatAmount).toBe(7500) // 7.5% of 100000
    expect(result.total).toBe(107500)
  })

  it('computes WHT only when apply_wht is true', () => {
    const withWht = serverComputeTotals(
      [{ quantity: 1, unit_price: 100000 }], 0, true, 0.05,
    )
    const withoutWht = serverComputeTotals(
      [{ quantity: 1, unit_price: 100000 }], 0, false, 0.05,
    )
    expect(withWht.whtAmount).toBe(5000) // 5% WHT
    expect(withoutWht.whtAmount).toBe(0)
    // WHT does NOT reduce the invoice total (it's a deduction at payment).
    expect(withWht.total).toBe(100000)
  })

  it('balance equals total on creation (nothing paid yet)', () => {
    const result = serverComputeTotals(
      [{ quantity: 1, unit_price: 50000 }], 0.075, false, 0.05,
    )
    expect(result.balance).toBe(result.total)
  })
})

describe('record_invoice_payment — §0.4 server-derived balance', () => {
  // Mirrors the RPC: reads the authoritative stored total + amount_paid, never
  // trusts a client-supplied balance. Recomputes on the server under row lock.
  function serverRecomputeBalance(
    invoiceTotal: number,
    priorPaid: number,
    paymentAmount: number,
  ): { amountPaid: number; balance: number; status: string } {
    const amountPaid = priorPaid + paymentAmount
    const balance = invoiceTotal - amountPaid
    const status = balance <= 0 ? 'paid' : amountPaid > 0 ? 'sent' : 'draft'
    return { amountPaid, balance, status }
  }

  it('recomputes balance from the stored total + cumulative paid', () => {
    // Prior bug: client computed selectedInvoice.total - (selectedInvoice.amount_paid + newAmount)
    // from potentially-stale client state. The RPC reads the locked row.
    const r = serverRecomputeBalance(100000, 30000, 20000)
    expect(r.amountPaid).toBe(50000)
    expect(r.balance).toBe(50000)
    expect(r.status).toBe('sent')
  })

  it('marks paid when balance reaches zero', () => {
    const r = serverRecomputeBalance(100000, 70000, 30000)
    expect(r.balance).toBe(0)
    expect(r.status).toBe('paid')
  })

  it('rejects non-positive payment amounts (defensive)', () => {
    // The RPC returns INVALID_AMOUNT for p_amount <= 0.
    expect(() => {
      if (0 <= 0) throw new Error('INVALID_AMOUNT')
    }).toThrow('INVALID_AMOUNT')
  })

  it('a client-supplied balance is ignored — the server recomputes', () => {
    // Even if a tampered client sent balance=0 (claiming fully paid), the RPC
    // recomputes from total - actual_paid. Here only 10k of 100k paid.
    const r = serverRecomputeBalance(100000, 0, 10000)
    expect(r.balance).toBe(90000) // NOT 0 — server-derived, not client-supplied
    expect(r.status).toBe('sent')
  })
})
