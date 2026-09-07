/**
 * Error classification — the structured runtime-error taxonomy.
 *
 * Avenize distinguishes expected user/validation/network/auth/payment errors
 * from unexpected application crashes. Expected errors are normal application
 * states (a validation message, a failed network call)); unexpected crash errors
 * need engineering attention (uncaught exception, unhandled rejection).
 *
 * This ISO a pure, deterministic helper — no I/O, no DOM. It is used by the
 * global error capture (to enrich the platform-ops ingest with category) and can be
 * used by any error UI. It never throws.
 */

export type ErrorCategory =
  | 'user'
  | 'validation'
  | 'network'
  | 'supabase'
  | 'auth'
  | 'payment'
  | 'expected'
  | 'unexpected'

export interface ClassifiedError {
  category: ErrorCategory
  /** The category is an expected app state (not an engineering bug). */
  expected: boolean
  /** Human-readable rationale for why the error was classified this way. */
  reason: string
}

const USER_PATTERNS: Array<[RegExp, string]> = [
  [/field .* is required/i, 'field validation'],
  [/please (provide|enter|select|fill)/i, 'user input required'],
  [/invalid (email|password|phone|number|amount)/i, 'invalid user input'],
  [/password.{0,40}(mismatch|do not match|too short)/i, 'password validation'],
  [/does not exist/i, 'not-found'],
]
const VALIDATION_PATTERNS: Array<[RegExp, string]> = [
  [/validation/i, 'validation failure'],
  [/constraint violation/i, 'constraint violation'],
  [/check constraint/i, 'check constraint'],
  [/must be (a |an )?\d+/i, 'numeric range validation'],
  [/cannot be (null|empty|blank)/i, 'missing required value'],
]
const NETWORK_PATTERNS: Array<[RegExp, string]> = [
  [/fetch failed/i, 'fetch failure'],
  [/network( error| request)?/i, 'network request'],
  [/failed to fetch/i, 'fetch failure'],
  [/load failed/i, 'load failure'],
  [/timed? ?out/i, 'timeout'],
  [/offline/i, 'offline'],
  [/aborted/i, 'request aborted'],
]
const SUPABASE_PATTERNS: Array<[RegExp, string]> = [
  [/pgrst/i, 'PostgREST error'],
  [/postgrest/i, 'PostgREST error'],
  [/supabase/i, 'supabase client error'],
  [/schema cache/i, 'missing schema object'],
]
const AUTH_PATTERNS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'bad email/password'],
  [/user already registered/i, 'duplicate signup'],
  [/email not confirmed/i, 'unconfirmed email'],
  [/too many (failed )?attempts/i, 'rate limited'],
  [/token (expired|has expired|invalid)/i, 'invalid/expired token'],
  [/session (not found|expired|ended)/i, 'missing/expired session'],
  [/unauthorized/i, 'unauthorized'],
  [/forbidden/i, 'forbidden'],
  [/cannot be used/i, 'auth provider restriction'],
  [/already belongs/i, 'member already onboarded'],
]
const PAYMENT_PATTERNS: Array<[RegExp, string]> = [
  [/payment/i, 'payment error'],
  [/checkout/i, 'checkout error'],
  [/paystack/i, 'paystack error'],
  [/insufficient funds/i, 'insufficient funds'],
]

/** Classify a runtime error message into the Avenize taxonomy. */
export function classifyError(input: unknown): ClassifiedError {
  const message =
    input instanceof Error
      ? `${input.name}: ${input.message}`
      : typeof input === 'string'
        ? input
        : safeStringify(input)
  const body = message.slice(0, 1000)

  const matchOnly = (patterns: Array<[RegExp, string]>): { hit: boolean; reason: string } => {
    for (const [re, reason] of patterns) {
      if (re.test(body)) return { hit: true, reason }
    }
    return { hit: false, reason: '' }
  }

  const auth = matchOnly(AUTH_PATTERNS)
  if (auth.hit) return { category: 'auth', expected: true, reason: auth.reason }

  const payment = matchOnly(PAYMENT_PATTERNS)
  if (payment.hit) return { category: 'payment', expected: true, reason: payment.reason }

  const supabase = matchOnly(SUPABASE_PATTERNS)
  if (supabase.hit) return { category: 'supabase', expected: true, reason: supabase.reason }

  const network = matchOnly(NETWORK_PATTERNS)
  if (network.hit) return { category: 'network', expected: true, reason: network.reason }

  const validation = matchOnly(VALIDATION_PATTERNS)
  if (validation.hit) return { category: 'validation', expected: true, reason: validation.reason }

  const user = matchOnly(USER_PATTERNS)
  if (user.hit) return { category: 'user', expected: true, reason: user.reason }

  // Multi-word expected app messages that are clearly intentional (e.g. "already
  // belongs to a business", "has no matching row", "no data yet"). These ISO
  // surfaced by the product flows, not engineering failures.
  if (/^(already|no|nothing|not yet|empty|none|zero)/i.test(body.trim())) {
    return { category: 'expected', expected: true, reason: 'known expected app state' }
  }

  return { category: 'unexpected', expected: false, reason: 'no matching taxonomy pattern' }
}

function safeStringify(input: unknown): string {
  try {
    const out = JSON.stringify(input)
    return typeof out === 'string' ? out : String(input)
  } catch {
    return String(input)
  }
}