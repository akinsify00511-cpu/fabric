/**
 * Meta Pixel — ad conversion tracking (go/no-go item 8).
 *
 * Gated on VITE_META_PIXEL_ID: without a pixel id every function is a
 * synchronous no-op and the fbevents.js script is never injected — production
 * behaves exactly as if the pixel did not exist until marketing configures it.
 *
 * The funnel this feeds:
 *   PageView (public surfaces)
 *     -> ViewContent (pricing)
 *     -> InitiateCheckout (checkout start — intent only)
 *     -> Purchase (ONLY on server-verified payment success via paystack-verify)
 *
 * The Purchase event MUST NEVER fire on a button click or a Paystack redirect
 * return alone — only when the server has verified the payment. A purchase
 * fired on click would fabricate revenue in the ads manager.
 *
 * Privacy boundary: tracking is for the public marketing funnel. Internal
 * /app workspace pages never fire the pixel.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string }
    _fbq?: Window['fbq']
  }
}

interface QueuedCall {
  args: unknown[]
}

let queue: QueuedCall[] = []
let injected = false
let initDone = false

function pixelId(): string | undefined {
  const value = import.meta.env.VITE_META_PIXEL_ID
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** True when a pixel id is configured (tests + call-site gating). */
export function isMetaPixelEnabled(): boolean {
  return pixelId() !== undefined
}

function flush(): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  for (const call of queue) window.fbq(...call.args)
  queue = []
}

function enqueue(args: unknown[]): void {
  queue.push({ args })
  if (queue.length > 50) queue = queue.slice(-50)
}

function inject(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  script.onload = () => flush()
  document.head.appendChild(script)
}

function ensureInit(): boolean {
  const id = pixelId()
  if (!id) return false
  if (initDone) return true
  if (typeof window === 'undefined') return false
  // Standard Meta bootstrap stub: calls queue until fbevents.js loads.
  if (typeof window.fbq !== 'function') {
    const fbq = ((...args: unknown[]) => {
      enqueue(args)
    }) as NonNullable<Window['fbq']>
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = fbq
    window._fbq = fbq
  }
  inject()
  window.fbq('init', id)
  initDone = true
  return true
}

function track(event: string, params?: Record<string, unknown>): void {
  if (!ensureInit()) return
  window.fbq!('track', event, params)
}

/** PageView for public marketing surfaces only. */
export function trackPageView(): void {
  track('PageView')
}

/** Pricing page viewed. */
export function trackViewContent(contentName: string): void {
  track('ViewContent', { content_name: contentName })
}

/** Checkout started (intent — the user is heading to Paystack). */
export function trackInitiateCheckout(value: number, currency: string): void {
  track('InitiateCheckout', { value, currency })
}

/**
 * Purchase — call ONLY with a server-verified successful payment verdict.
 * `dedupeKey` (the Paystack reference) guarantees the event fires once even
 * when the verification poll re-checks the same reference.
 */
export function trackPurchase(value: number, currency: string, dedupeKey: string): void {
  if (typeof window !== 'undefined') {
    try {
      const key = `avz_px_purchase_${dedupeKey}`
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      /* storage unavailable — fire anyway */
    }
  }
  track('Purchase', { value, currency })
}
