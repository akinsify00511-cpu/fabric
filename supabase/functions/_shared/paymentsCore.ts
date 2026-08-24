// Shared payment-domain logic for the Paystack edge functions.
//
// Pure TypeScript, no Deno/Node imports — the same module is unit-tested by
// vitest (tests/frontend/lib/paymentsCore.test.ts) so the tested code IS the
// deployed code (no mirror-copy drift).

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'refunded'

// The explicit payment state machine (mirrors the DB trigger
// enforce_payment_transaction_transition in 20260822150000).
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['processing', 'success', 'failed'],
  processing: ['success', 'failed'],
  success: ['refunded'],
  failed: [],
  refunded: [],
}

export function isPaymentTransitionAllowed(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true
  return (PAYMENT_TRANSITIONS[from] ?? []).includes(to)
}

export type BillingCycle = 'monthly' | 'yearly'

export interface CheckoutMetadata {
  business_id: string
  plan_code: string
  billing_cycle: BillingCycle
  kind: string
}

export function buildCheckoutMetadata(businessId: string, planCode: string, billingCycle: BillingCycle): CheckoutMetadata {
  return { business_id: businessId, plan_code: planCode, billing_cycle: billingCycle, kind: 'subscription_checkout' }
}

// --- Attribution (go/no-go item 9) ---
// The browser-captured UTM/referrer provenance rides along on the checkout so
// the payment_transactions ledger row carries it (metadata.attribution) and
// attribution_revenue can connect campaign -> checkout -> revenue.
// Advisory metadata only: never price- or access-relevant. Sanitized
// server-side (allowlisted keys, string-only, length-capped) because the
// browser is an untrusted source.

export const ATTRIBUTION_KEYS = ['source', 'medium', 'campaign', 'content', 'term', 'fbclid', 'fbc', 'fbp', 'referrer', 'landingPath', 'capturedAt'] as const

export type AttributionMetadata = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>

export function sanitizeAttribution(input: unknown): AttributionMetadata | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: AttributionMetadata = {}
  let found = false
  for (const key of ATTRIBUTION_KEYS) {
    const raw = (input as Record<string, unknown>)[key]
    if (typeof raw !== 'string') continue
    const value = raw.trim().slice(0, 200)
    if (!value) continue
    out[key] = value
    found = true
  }
  return found ? out : null
}

// Paystack webhook payloads carry no dedicated event id; data.id is the
// transaction id and is stable across retries, so the idempotency key is
// `${event}:${data.id}` (falling back to the reference for safety).
export function webhookEventId(event: string, data: { id?: unknown; reference?: unknown } | undefined): string {
  const id = data?.id ?? data?.reference ?? 'unknown'
  return `${event}:${String(id)}`
}

export type PaystackEventClass = 'charge_success' | 'charge_failed' | 'ignored'

export function classifyPaystackEvent(event: unknown): PaystackEventClass {
  if (event === 'charge.success') return 'charge_success'
  if (event === 'charge.failed') return 'charge_failed'
  return 'ignored'
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Paystack signs the RAW request body with HMAC-SHA512 (secret key) and sends
// the hex digest in the x-paystack-signature header.
export async function verifyPaystackSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return constantTimeEqual(toHex(digest), signatureHeader.toLowerCase())
}

// A verified charge only settles when the provider-confirmed amount covers
// the ledger amount (protects against partial/tampered amounts).
export function isAmountSufficient(providerAmountKobo: number, ledgerAmountCents: number | null): boolean {
  if (ledgerAmountCents === null || ledgerAmountCents === undefined) return false
  return providerAmountKobo >= ledgerAmountCents
}

export function nextBillingDate(fromIso: string, cycle: BillingCycle): string {
  const d = new Date(fromIso)
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  starter: 'Starter',
  team: 'Team',
  business: 'Business',
  pro: 'Pro',
  scale: 'Scale',
}

// --- Meta Conversions API (CAPI) — the server-authoritative Purchase signal ---
// The browser pixel is the session-side companion; this event, fired by the
// paystack-webhook after VERIFIED settlement, is the revenue signal Meta can
// trust. Both carry event_id = payment reference so Meta deduplicates them.

// Meta's documented _fbc format when the pixel cookie is unavailable:
// fb.<creation_index>.<timestamp_ms>.<fbclid>.
export function buildFbcFromFbclid(fbclid: string, tsMs: number): string {
  return `fb.1.${tsMs}.${fbclid}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface CapiPurchaseInput {
  reference: string            // event_id — shared with the browser pixel so Meta deduplicates
  paidAtIso: string            // event_time source (seconds since epoch)
  amountCents: number          // ledger amount in the lowest unit (kobo)
  currency: string             // ISO currency (NGN)
  planCode: string
  planName: string
  email?: string | null        // raw payer email — hashed, never sent raw
  fbp?: string | null
  fbc?: string | null
  fbclid?: string | null       // used to compute fbc when the cookie is absent
  sourceUrl?: string | null    // event_source_url (the landing path that started the funnel)
}

/**
 * Build one Meta Conversions API Purchase event. Pure except for the email
 * hash (crypto.subtle). The event_id is the payment reference so a browser
 * pixel Purchase for the same payment is deduplicated by Meta.
 */
export async function buildCapiPurchaseEvent(input: CapiPurchaseInput): Promise<Record<string, unknown>> {
  const userData: Record<string, unknown> = {}
  const email = input.email?.trim().toLowerCase()
  if (email) userData.em = [await sha256Hex(email)]
  if (input.fbp) userData.fbp = input.fbp
  const fbc = input.fbc ?? (input.fbclid ? buildFbcFromFbclid(input.fbclid, Date.parse(input.paidAtIso) || Date.now()) : null)
  if (fbc) userData.fbc = fbc

  return {
    event_name: 'Purchase',
    event_time: Math.floor((Date.parse(input.paidAtIso) || Date.now()) / 1000),
    event_id: input.reference,
    action_source: 'website',
    ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
    user_data: userData,
    custom_data: {
      value: input.amountCents / 100,
      currency: input.currency,
      content_ids: [input.planCode],
      content_name: input.planName,
      content_type: 'product',
      num_items: 1,
      order_id: input.reference,
    },
  }
}
