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

export const ATTRIBUTION_KEYS = ['source', 'medium', 'campaign', 'referrer', 'landingPath'] as const

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
