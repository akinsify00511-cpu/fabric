// B14 attribution capture — the first hop of the discovery → revenue loop.
// A public-surface visit carrying UTM/referrer provenance is captured into
// localStorage; when the visitor later creates a business, the provenance is
// recorded as a discovery_referrals row linked to that business (entity_type
// 'business') so discovery_roi can connect content → signup → subscription.
// Best-effort (§24): never blocks signup/onboarding.

import { parseAttribution } from './discoveryIntel'

const KEY = 'avenize_attribution'

export interface StoredAttribution {
  source: string | null
  medium: string | null
  campaign: string | null
  landingPath: string | null
  referrer: string | null
  capturedAt: string
}

/** Capture provenance on a public surface (landing/pricing/signup mount). */
export function captureAttribution(): void {
  try {
    if (typeof window === 'undefined') return
    const parsed = parseAttribution(window.location.href, document.referrer || null)
    // Don't overwrite a richer capture with an empty one.
    if (!parsed.source && !parsed.campaign) return
    const stored: StoredAttribution = { ...parsed, capturedAt: new Date().toISOString() }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable — attribution is advisory */
  }
}

export function getStoredAttribution(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredAttribution) : null
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
