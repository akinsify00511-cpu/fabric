import { describe, it, expect, vi, afterEach } from 'vitest'

// Meta Pixel contract (go/no-go item 8):
//  - no VITE_META_PIXEL_ID -> complete no-op (no fbq, no script injection)
//  - with an ID -> standard bootstrap (init + events through window.fbq)
//  - Purchase fires ONCE per Paystack reference (sessionStorage dedupe) and
//    only from the server-verified path (call-site contract)

async function loadModule() {
  vi.resetModules()
  return await import('../../../src/lib/metaPixel')
}

function cleanup() {
  vi.unstubAllEnvs()
  // @ts-expect-error test cleanup
  delete window.fbq
  // @ts-expect-error test cleanup
  delete window._fbq
  window.sessionStorage.clear()
  document.head.querySelectorAll('script[src*="fbevents"]').forEach((s) => s.remove())
}

afterEach(cleanup)

describe('metaPixel gating', () => {
  it('is a complete no-op without VITE_META_PIXEL_ID', async () => {
    vi.stubEnv('VITE_META_PIXEL_ID', '')
    const mod = await loadModule()
    expect(mod.isMetaPixelEnabled()).toBe(false)
    mod.trackPageView()
    mod.trackViewContent('pricing')
    mod.trackInitiateCheckout(15000, 'NGN')
    mod.trackPurchase(15000, 'NGN', 'avz_x')
    expect(window.fbq).toBeUndefined()
    expect(document.head.querySelector('script[src*="fbevents"]')).toBeNull()
  })

  it('bootstraps fbq and fires PageView when a pixel id is configured', async () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'px_123')
    const fbq = vi.fn()
    // @ts-expect-error test stub
    window.fbq = fbq
    const mod = await loadModule()
    expect(mod.isMetaPixelEnabled()).toBe(true)
    mod.trackPageView()
    expect(fbq).toHaveBeenCalledWith('init', 'px_123')
    expect(fbq).toHaveBeenCalledWith('track', 'PageView', undefined)
    expect(document.head.querySelector('script[src*="fbevents"]')).not.toBeNull()
  })

  it('ViewContent and InitiateCheckout carry the funnel payload', async () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'px_123')
    const fbq = vi.fn()
    // @ts-expect-error test stub
    window.fbq = fbq
    const mod = await loadModule()
    mod.trackViewContent('pricing')
    mod.trackInitiateCheckout(15000, 'NGN')
    expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', { content_name: 'pricing' })
    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', { value: 15000, currency: 'NGN' })
  })
})

describe('Purchase dedupe (fires once per verified payment)', () => {
  it('fires once per reference even when verification re-polls', async () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'px_123')
    const fbq = vi.fn()
    // @ts-expect-error test stub
    window.fbq = fbq
    const mod = await loadModule()
    mod.trackPurchase(15000, 'NGN', 'avz_ref_1')
    mod.trackPurchase(15000, 'NGN', 'avz_ref_1')
    mod.trackPurchase(15000, 'NGN', 'avz_ref_1')
    const purchases = fbq.mock.calls.filter((c) => c[1] === 'Purchase')
    expect(purchases).toHaveLength(1)
    expect(purchases[0]).toEqual(['track', 'Purchase', { value: 15000, currency: 'NGN' }])
  })

  it('different references each fire (two real payments are two purchases)', async () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'px_123')
    const fbq = vi.fn()
    // @ts-expect-error test stub
    window.fbq = fbq
    const mod = await loadModule()
    mod.trackPurchase(15000, 'NGN', 'avz_ref_1')
    mod.trackPurchase(48000, 'NGN', 'avz_ref_2')
    expect(fbq.mock.calls.filter((c) => c[1] === 'Purchase')).toHaveLength(2)
  })
})
