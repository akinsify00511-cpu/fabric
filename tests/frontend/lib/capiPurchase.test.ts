import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_KEYS,
  buildCapiPurchaseEvent,
  buildFbcFromFbclid,
  sanitizeAttribution,
  sha256Hex,
} from '../../../supabase/functions/_shared/paymentsCore'

// The server-authoritative revenue signal: the CAPI Purchase event built by
// the paystack-webhook after VERIFIED settlement, plus the click-id extension
// of the attribution allowlist that guards what the client may carry into
// the payment ledger.
describe('attribution allowlist (click ids for Meta matching)', () => {
  it('includes the Meta click ids alongside the UTM provenance', () => {
    for (const key of ['source', 'medium', 'campaign', 'fbclid', 'fbc', 'fbp', 'landingPath']) {
      expect(ATTRIBUTION_KEYS).toContain(key)
    }
  })

  it('carries fbclid/fbc/fbp through the sanitizer and drops unknown keys', () => {
    const out = sanitizeAttribution({
      source: 'facebook',
      fbclid: 'IwAR1',
      fbc: 'fb.1.1.IwAR1',
      fbp: 'fb.1.2.3',
      evil: 'drop-me',
    })
    expect(out).toEqual({ source: 'facebook', fbclid: 'IwAR1', fbc: 'fb.1.1.IwAR1', fbp: 'fb.1.2.3' })
  })

  it('drops non-strings and empties (click ids are strings only)', () => {
    const out = sanitizeAttribution({ fbclid: 42, fbc: '  ', fbp: 'fb.1.2.3' })
    expect(out).toEqual({ fbp: 'fb.1.2.3' })
  })
})

describe('buildFbcFromFbclid', () => {
  it('matches Meta’s fb.1.<ts_ms>.<fbclid> format', () => {
    expect(buildFbcFromFbclid('IwAR999', 1700000000000)).toBe('fb.1.1700000000000.IwAR999')
  })
})

describe('sha256Hex', () => {
  it('hashes to lowercase hex (Meta user_data.em format)', async () => {
    // sha256('user@example.com') — well-known digest
    expect(await sha256Hex('user@example.com')).toBe('b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514')
  })
})

describe('buildCapiPurchaseEvent', () => {
  const base = {
    reference: 'avz_ref123',
    paidAtIso: '2026-08-24T10:00:00.000Z',
    amountCents: 1500000,
    currency: 'NGN',
    planCode: 'starter',
    planName: 'Starter',
  }

  it('uses the payment reference as event_id (browser/server dedupe)', async () => {
    const event = await buildCapiPurchaseEvent(base)
    expect(event.event_name).toBe('Purchase')
    expect(event.event_id).toBe('avz_ref123')
    expect(event.action_source).toBe('website')
    expect(event.event_time).toBe(Math.floor(Date.parse(base.paidAtIso) / 1000))
  })

  it('converts kobo to naira for the value and carries plan identity', async () => {
    const event = await buildCapiPurchaseEvent(base)
    expect(event.custom_data).toMatchObject({
      value: 15000,
      currency: 'NGN',
      content_ids: ['starter'],
      content_name: 'Starter',
      content_type: 'product',
      num_items: 1,
      order_id: 'avz_ref123',
    })
  })

  it('hashes the payer email — the raw email never appears in the payload', async () => {
    const event = await buildCapiPurchaseEvent({ ...base, email: 'Buyer@Example.COM' })
    const em = (event.user_data as any).em as string[]
    expect(em).toHaveLength(1)
    expect(em[0]).toBe(await sha256Hex('buyer@example.com'))
    expect(JSON.stringify(event)).not.toContain('Buyer@Example.COM')
  })

  it('prefers the stored fbc cookie, else computes it from fbclid', async () => {
    const withCookie = await buildCapiPurchaseEvent({ ...base, fbc: 'fb.1.111.cookie' })
    expect((withCookie.user_data as any).fbc).toBe('fb.1.111.cookie')
    const fromClick = await buildCapiPurchaseEvent({ ...base, fbclid: 'clickxyz' })
    expect((fromClick.user_data as any).fbc).toBe(`fb.1.${Date.parse(base.paidAtIso)}.clickxyz`)
    const none = await buildCapiPurchaseEvent(base)
    expect(none.user_data).toEqual({})
  })

  it('includes event_source_url only when provided', async () => {
    const without = await buildCapiPurchaseEvent(base)
    expect(without).not.toHaveProperty('event_source_url')
    const withUrl = await buildCapiPurchaseEvent({ ...base, sourceUrl: 'https://avenize.riverwayse.com/pricing' })
    expect(withUrl.event_source_url).toBe('https://avenize.riverwayse.com/pricing')
  })
})
