import { describe, it, expect } from 'vitest'
import {
  buildCheckoutMetadata,
  classifyPaystackEvent,
  constantTimeEqual,
  isAmountSufficient,
  isPaymentTransitionAllowed,
  nextBillingDate,
  verifyPaystackSignature,
  webhookEventId,
  PAYMENT_TRANSITIONS,
} from '../../../supabase/functions/_shared/paymentsCore'

describe('payment state machine', () => {
  it('pending can only go to processing, success or failed', () => {
    expect(isPaymentTransitionAllowed('pending', 'processing')).toBe(true)
    expect(isPaymentTransitionAllowed('pending', 'success')).toBe(true)
    expect(isPaymentTransitionAllowed('pending', 'failed')).toBe(true)
    expect(isPaymentTransitionAllowed('pending', 'refunded')).toBe(false)
  })

  it('success can only go to refunded', () => {
    expect(isPaymentTransitionAllowed('success', 'refunded')).toBe(true)
    expect(isPaymentTransitionAllowed('success', 'pending')).toBe(false)
    expect(isPaymentTransitionAllowed('success', 'failed')).toBe(false)
  })

  it('failed and refunded are terminal', () => {
    expect(PAYMENT_TRANSITIONS.failed).toEqual([])
    expect(PAYMENT_TRANSITIONS.refunded).toEqual([])
    expect(isPaymentTransitionAllowed('failed', 'success')).toBe(false)
    expect(isPaymentTransitionAllowed('refunded', 'success')).toBe(false)
  })

  it('same-status writes are no-ops (idempotent settlement)', () => {
    expect(isPaymentTransitionAllowed('success', 'success')).toBe(true)
    expect(isPaymentTransitionAllowed('pending', 'pending')).toBe(true)
  })
})

describe('webhook idempotency key', () => {
  it('uses event + transaction id (stable across retries)', () => {
    expect(webhookEventId('charge.success', { id: 12345, reference: 'avz_abc' })).toBe('charge.success:12345')
    expect(webhookEventId('charge.success', { id: 12345, reference: 'avz_abc' })).toBe('charge.success:12345')
  })

  it('falls back to the reference when data.id is absent', () => {
    expect(webhookEventId('charge.success', { reference: 'avz_abc' })).toBe('charge.success:avz_abc')
  })

  it('different events on the same transaction are distinct keys', () => {
    expect(webhookEventId('charge.success', { id: 1 })).not.toBe(webhookEventId('charge.failed', { id: 1 }))
  })
})

describe('event classification', () => {
  it('classifies charge.success and charge.failed', () => {
    expect(classifyPaystackEvent('charge.success')).toBe('charge_success')
    expect(classifyPaystackEvent('charge.failed')).toBe('charge_failed')
  })

  it('ignores everything else', () => {
    expect(classifyPaystackEvent('subscription.create')).toBe('ignored')
    expect(classifyPaystackEvent('invoice.update')).toBe('ignored')
    expect(classifyPaystackEvent(undefined)).toBe('ignored')
    expect(classifyPaystackEvent('')).toBe('ignored')
  })
})

describe('amount verification', () => {
  it('settlement requires the provider amount to cover the ledger amount', () => {
    expect(isAmountSufficient(1500000, 1500000)).toBe(true)
    expect(isAmountSufficient(1600000, 1500000)).toBe(true)
    expect(isAmountSufficient(1499999, 1500000)).toBe(false)
  })

  it('never settles without a ledger amount', () => {
    expect(isAmountSufficient(99999999, null)).toBe(false)
  })
})

describe('paystack signature verification', () => {
  async function hmacSha512Hex(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  it('accepts a valid HMAC-SHA512 signature of the raw body', async () => {
    const secret = 'sk_test_example'
    const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } })
    const sig = await hmacSha512Hex(secret, body)
    await expect(verifyPaystackSignature(body, sig, secret)).resolves.toBe(true)
  })

  it('rejects a tampered body', async () => {
    const secret = 'sk_test_example'
    const sig = await hmacSha512Hex(secret, '{"event":"charge.success"}')
    await expect(verifyPaystackSignature('{"event":"charge.failed"}', sig, secret)).resolves.toBe(false)
  })

  it('rejects missing signature or secret', async () => {
    await expect(verifyPaystackSignature('{}', null, 'secret')).resolves.toBe(false)
    await expect(verifyPaystackSignature('{}', 'abc', '')).resolves.toBe(false)
  })

  it('constantTimeEqual compares exactly', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('checkout metadata + billing date', () => {
  it('carries the business + plan the webhook needs to settle', () => {
    const meta = buildCheckoutMetadata('biz-1', 'team', 'yearly')
    expect(meta).toEqual({ business_id: 'biz-1', plan_code: 'team', billing_cycle: 'yearly', kind: 'subscription_checkout' })
  })

  it('computes the next billing date per cycle', () => {
    const monthly = nextBillingDate('2026-08-22T10:00:00.000Z', 'monthly')
    expect(new Date(monthly).getUTCMonth()).toBe(8) // September (0-indexed)
    const yearly = nextBillingDate('2026-08-22T10:00:00.000Z', 'yearly')
    expect(new Date(yearly).getUTCFullYear()).toBe(2027)
  })
})
