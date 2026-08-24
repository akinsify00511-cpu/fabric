// B14 attribution capture — the first hop of the discovery → revenue loop.
// A public-surface visit carrying UTM/referrer provenance is captured into
// localStorage; when the visitor later creates a business, the provenance is
// recorded as a discovery_referrals row linked to that business (entity_type
// 'business') so discovery_roi can connect content → signup → subscription.
// Best-effort (§24): never blocks signup/onboarding.
//
// Meta click ids: an fbclid in the URL is persisted and converted to the
// documented `fbc` format (fb.1.<ts_ms>.<fbclid>) at capture time; the live
// `_fbp`/`_fbc` cookies take precedence at read time (the pixel may have set
// them after the initial capture). These ride with the checkout into the
// payment ledger so the server-side Conversions API Purchase event can be
// matched back to the ad click.

import { parseAttribution } from './discoveryIntel'

const KEY = 'avenize_attribution'

export interface StoredAttribution {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  fbclid: string | null
  fbc: string | null
  fbp: string | null
  landingPath: string | null
  referrer: string | null
  capturedAt: string
}

/** Meta's documented _fbc cookie format. */
export function buildFbc(fbclid: string, tsMs: number): string {
  return `fb.1.${tsMs}.${fbclid}`
}

/** Read a cookie by exact name (null when absent/unavailable). */
export function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null
    for (const part of document.cookie.split(';')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
    }
    return null
  } catch {
    return null
  }
}

/** Capture provenance on a public surface (landing/pricing/signup mount). */
export function captureAttribution(): void {
  try {
    if (typeof window === 'undefined') return
    const parsed = parseAttribution(window.location.href, document.referrer || null)
    // Don't overwrite a richer capture with an empty one.
    if (!parsed.source && !parsed.campaign && !parsed.fbclid) return
    const stored: StoredAttribution = {
      ...parsed,
      fbc: parsed.fbclid ? buildFbc(parsed.fbclid, Date.now()) : null,
      fbp: readCookie('_fbp'),
      capturedAt: new Date().toISOString(),
    }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable — attribution is advisory */
  }
}

export function getStoredAttribution(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAttribution>
    // Rows stored before the click-id fields existed still parse — normalize,
    // and prefer the live pixel cookies when present (they postdate capture).
    return {
      content: null,
      term: null,
      fbclid: null,
      ...parsed,
      fbc: readCookie('_fbc') ?? parsed.fbc ?? null,
      fbp: readCookie('_fbp') ?? parsed.fbp ?? null,
    } as StoredAttribution
  } catch {
    return null
  }
}

export function clearStoredAttribution(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
