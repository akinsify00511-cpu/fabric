// ============================================
// AUTH SECURITY — rate limiting + security-event logging
// ============================================
// The canonical client for the pre-auth security RPCs
// (zzz_auth_protocol_repair.sql). One module owns this contract so production
// code never scatters raw RPC references.
//
// Protocol:
//   1. Before an auth attempt:  checkAuthRateLimit  (read-only — never counts)
//   2. After a FAILED attempt:  recordAuthFailure    (counts + may lock out)
//   3. After a SUCCESS:         resetAuthRateLimit   (clears past failures)
//   4. Always:                  logSecurityEvent     (best-effort audit)
//
// Availability: these RPCs may be absent on deployments that have not applied
// the migration. Every function FAILS OPEN for the check/reset paths (auth
// must never be blocked because security telemetry is missing) and fails
// silently for logging.
// ============================================

import { supabase } from './supabase'

export interface RateLimitVerdict {
  allowed: boolean
  attempts: number
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  maxAttempts: number
  windowSeconds: number
  lockoutSeconds: number
}

const FAIL_OPEN: RateLimitVerdict = { allowed: true, attempts: 0, retryAfterSeconds: 0 }

// PostgREST returns set-returning (TABLE) RPCs as an ARRAY of rows. Reading
// `.allowed` off the array itself yields undefined — which a naive
// `!rl.allowed` check would treat as "denied", locking out every login. Always
// normalize through this.
export function normalizeRateLimitRows(data: unknown): RateLimitVerdict | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.allowed !== 'boolean') return null
  return {
    allowed: r.allowed,
    attempts: typeof r.attempts === 'number' ? r.attempts : 0,
    retryAfterSeconds: typeof r.retry_after === 'number' ? r.retry_after : 0,
  }
}

function warnUnavailable(name: string, error: unknown) {
  console.warn(`[authSecurity] ${name} unavailable (migration may not be applied):`, error)
}

export async function checkAuthRateLimit(
  identifier: string,
  action: 'login' | 'signup' | 'password_reset',
  opts: RateLimitOptions,
): Promise<RateLimitVerdict> {
  try {
    const { data, error } = await supabase.rpc('check_auth_rate_limit', {
      p_identifier: identifier,
      p_action: action,
      p_max_attempts: opts.maxAttempts,
      p_window_seconds: opts.windowSeconds,
      p_lockout_seconds: opts.lockoutSeconds,
    })
    if (error) {
      warnUnavailable('check_auth_rate_limit', error.message)
      return FAIL_OPEN
    }
    return normalizeRateLimitRows(data) ?? FAIL_OPEN
  } catch (err) {
    warnUnavailable('check_auth_rate_limit', err)
    return FAIL_OPEN
  }
}

export async function recordAuthFailure(
  identifier: string,
  action: 'login' | 'signup' | 'password_reset',
  opts: RateLimitOptions,
): Promise<RateLimitVerdict> {
  try {
    const { data, error } = await supabase.rpc('record_auth_failure', {
      p_identifier: identifier,
      p_action: action,
      p_max_attempts: opts.maxAttempts,
      p_window_seconds: opts.windowSeconds,
      p_lockout_seconds: opts.lockoutSeconds,
    })
    if (error) {
      warnUnavailable('record_auth_failure', error.message)
      return FAIL_OPEN
    }
    return normalizeRateLimitRows(data) ?? FAIL_OPEN
  } catch (err) {
    warnUnavailable('record_auth_failure', err)
    return FAIL_OPEN
  }
}

export async function resetAuthRateLimit(
  identifier: string,
  action: 'login' | 'signup' | 'password_reset',
): Promise<void> {
  try {
    await supabase.rpc('reset_auth_rate_limit', { p_identifier: identifier, p_action: action })
  } catch {
    // best-effort
  }
}

export function logSecurityEvent(
  eventType: string,
  email: string | null,
  success: boolean,
  metadata: Record<string, unknown> = {},
): void {
  supabase
    .rpc('log_security_event', {
      p_event_type: eventType,
      p_email: email,
      p_metadata: metadata,
      p_success: success,
    })
    .then(() => {}, () => {})
}

export function rateLimitMessage(verdict: RateLimitVerdict, noun: string): string {
  const mins = Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60))
  return `Too many ${noun} attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
}
